import { Collection } from 'mongodb'
import request from 'supertest'
import { sign } from 'jsonwebtoken'
import { MongoHelper } from '../../infra/db/mongodb/helpers/mongo-helper'
import app from '../config/app'
import env from '../config/env'

describe('survey journey', () => {
  let token: string
  beforeAll(async () => { await MongoHelper.connect(process.env.MONGO_URL!) })
  afterAll(async () => { await MongoHelper.disconnect() })
  beforeEach(async () => {
    const accounts = await MongoHelper.getCollection('accounts')
    await accounts.deleteMany({})
    await (await MongoHelper.getCollection('surveys')).deleteMany({})
    await (await MongoHelper.getCollection('surveyResponses')).deleteMany({})
    const account = await accounts.insertOne({ name: 'Admin', email: 'admin@test.com', password: 'hash', role: 'admin' })
    token = sign({ id: account.insertedId }, env.jwtSecret, { expiresIn: '1h' })
    await accounts.updateOne({ _id: account.insertedId }, { $set: { accessToken: token } })
  })
  test('enforces one response per account under concurrent votes', async () => {
    const surveys = await MongoHelper.getCollection('surveys')
    const id = (await surveys.insertOne({ question: 'Q', answers: [{ answer: 'A' }, { answer: 'B' }] })).insertedId.toString()
    const responses = await MongoHelper.getCollection('surveyResponses')
    await responses.insertOne({ surveyId: 'other', accountId: 'other', answer: 'A' })
    const indexes = await responses.indexes()
    expect(indexes).toEqual(expect.arrayContaining([expect.objectContaining({ key: { surveyId: 1, accountId: 1 }, unique: true })]))
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      request(app).put(`/api/surveys/${id}/result`).set('x-access-token', token).send({ answer: i % 2 ? 'A' : 'B' })))
    expect(results.map(result => result.status)).toEqual(Array(20).fill(200))
    expect(await responses.countDocuments({ surveyId: id })).toBe(1)
  })
  test('retries a duplicate-key upsert race without creating another vote', async () => {
    const id = (await (await MongoHelper.getCollection('surveys')).insertOne({ question: 'Q', answers: [{ answer: 'A' }, { answer: 'B' }] })).insertedId.toString()
    const responses = await MongoHelper.getCollection('surveyResponses')
    const account = await (await MongoHelper.getCollection('accounts')).findOne({ email: 'admin@test.com' })
    await responses.insertOne({ surveyId: id, accountId: account._id.toString(), answer: 'A' })
    const originalUpdate = Collection.prototype.updateOne
    let injected = false
    const spy = jest.spyOn(Collection.prototype, 'updateOne').mockImplementation(function (this: Collection, ...args: any[]): any {
      if (this.collectionName === 'surveyResponses' && !injected) {
        injected = true
        return Promise.reject(Object.assign(new Error('duplicate'), { code: 11000, keyPattern: { surveyId: 1, accountId: 1 } }))
      }
      return originalUpdate.apply(this, args as any)
    } as any)
    try {
      const result = await request(app).put(`/api/surveys/${id}/result`).set('x-access-token', token).send({ answer: 'B' }).expect(200)
      expect(injected).toBe(true)
      expect(result.body).toMatchObject({ total: 1, answers: [{ answer: 'A', count: 0 }, { answer: 'B', count: 1 }] })
    } finally { spy.mockRestore() }
  })
  test('rejects legacy duplicate alternatives before reading or changing votes', async () => {
    const id = (await (await MongoHelper.getCollection('surveys')).insertOne({ question: 'Q', answers: [{ answer: 'A' }, { answer: 'A' }] })).insertedId.toString()
    const responses = await MongoHelper.getCollection('surveyResponses')
    await responses.insertOne({ surveyId: id, accountId: 'other', answer: 'A' })
    const get = await request(app).get(`/api/surveys/${id}/result`).set('x-access-token', token).expect(409)
    expect(get.body.error).toBe('Survey has duplicate answers')
    const put = await request(app).put(`/api/surveys/${id}/result`).set('x-access-token', token).send({ answer: 'A' }).expect(409)
    expect(put.body.error).toBe('Survey has duplicate answers')
    expect(await responses.countDocuments({ surveyId: id })).toBe(1)
  })
  test('paginates surveys with a bounded limit and rejects invalid parameters', async () => {
    const surveys = await MongoHelper.getCollection('surveys')
    await surveys.insertMany(Array.from({ length: 105 }, (_, i) => ({ question: `Q${i}`, answers: [{ answer: 'A' }, { answer: 'B' }] })))
    const first = await request(app).get('/api/surveys?limit=2&page=1').set('x-access-token', token).expect(200)
    const second = await request(app).get('/api/surveys?limit=2&page=2').set('x-access-token', token).expect(200)
    expect(first.body).toHaveLength(2)
    expect(second.body).toHaveLength(2)
    expect(first.body.map(item => item.id)).not.toContain(second.body[0].id)
    expect((await request(app).get('/api/surveys').set('x-access-token', token).expect(200)).body.length).toBeLessThanOrEqual(100)
    for (const query of ['limit=101', 'limit=0', 'page=-1', 'page=1.5']) {
      await request(app).get(`/api/surveys?${query}`).set('x-access-token', token).expect(400)
    }
  })
  test('counts votes in MongoDB without fetching individual responses', async () => {
    const id = (await (await MongoHelper.getCollection('surveys')).insertOne({ question: 'Q', answers: [{ answer: 'A' }, { answer: 'B' }] })).insertedId.toString()
    await (await MongoHelper.getCollection('surveyResponses')).insertMany([
      { surveyId: id, accountId: '1', answer: 'A' }, { surveyId: id, accountId: '2', answer: 'A' },
      { surveyId: id, accountId: '3', answer: 'B' }
    ])
    const originalFind = Collection.prototype.find
    const findSpy = jest.spyOn(Collection.prototype, 'find').mockImplementation(function (this: Collection, ...args: any[]): any {
      if (this.collectionName === 'surveyResponses') throw new Error('Individual responses must not be fetched')
      return originalFind.apply(this, args as any)
    } as any)
    try {
      const result = await request(app).get(`/api/surveys/${id}/result`).set('x-access-token', token).expect(200)
      expect(result.body).toMatchObject({ total: 3, answers: [{ answer: 'A', count: 2 }, { answer: 'B', count: 1 }] })
    } finally { findSpy.mockRestore() }
  })
  test('rejects non-string login fields with 400', async () => {
    await request(app).post('/api/login').send({ email: { $ne: null }, password: 'x' }).expect(400)
    await request(app).post('/api/login').send({ email: 'admin@test.com', password: { $ne: null } }).expect(400)
  })
  test('rejects invalid survey content and invalid tokens', async () => {
    await request(app).post('/api/surveys').set('x-access-token', token)
      .send({ question: ' ', answers: [] }).expect(400)
    await request(app).get('/api/surveys').set('x-access-token', 'invalid').expect(403)
  })
  test('creates, lists, answers and retrieves a survey result', async () => {
    await request(app).post('/api/surveys').set('x-access-token', token)
      .send({ question: 'Favorite?', answers: [{ answer: 'A' }, { answer: 'B' }] }).expect(204)
    const list = await request(app).get('/api/surveys').set('x-access-token', token).expect(200)
    expect(list.body).toHaveLength(1)
    const id = list.body[0].id
    await request(app).put(`/api/surveys/${id}/result`).set('x-access-token', token).send({ answer: 'A' }).expect(200)
    const result = await request(app).get(`/api/surveys/${id}/result`).set('x-access-token', token).expect(200)
    expect(result.body).toMatchObject({ surveyId: id, total: 1, answers: [{ answer: 'A', count: 1 }, { answer: 'B', count: 0 }] })
    await request(app).put(`/api/surveys/${id}/result`).set('x-access-token', token).send({ answer: 'C' }).expect(400)
    const updated = await request(app).put(`/api/surveys/${id}/result`).set('x-access-token', token).send({ answer: 'B' }).expect(200)
    expect(updated.body).toMatchObject({ total: 1, answers: [{ answer: 'A', count: 0 }, { answer: 'B', count: 1 }] })
  })
})
