import { Router } from 'express'
import { ObjectId } from 'mongodb'
import { MongoHelper } from '../../infra/db/mongodb/helpers/mongo-helper'
import { adaptMiddleware } from '../adapters/express/express-middleware-adapter'
import { adaptRoute } from '../adapters/express/express-route-adapter'
import { makeAddSurveyController } from '../factories/controllers/add-survey/add-survey-controller-factory'
import { makeAuthMiddleware } from '../factories/middlewares/auth-middleware-factory'

export default (router: Router): void => {
  const adminAuth = adaptMiddleware(makeAuthMiddleware('admin'))
  const auth = adaptMiddleware(makeAuthMiddleware())
  router.post('/surveys', adminAuth, (req, res, next) => {
    const { question, answers } = req.body || {}
    if (typeof question !== 'string' || !question.trim() || !Array.isArray(answers) || answers.length < 2 ||
        answers.some(item => !item || typeof item.answer !== 'string' || !item.answer.trim() || (item.image !== undefined && typeof item.image !== 'string')) ||
        new Set(answers.map(item => item.answer)).size !== answers.length) {
      res.status(400).json({ error: 'Invalid survey' }); return
    }
    next()
  }, adaptRoute(makeAddSurveyController()))
  router.get('/surveys', auth, async (req, res, next) => {
    try {
      const pageText = req.query.page ?? '1'
      const limitText = req.query.limit ?? '20'
      if (typeof pageText !== 'string' || typeof limitText !== 'string' || !/^[1-9]\d*$/.test(pageText) || !/^[1-9]\d*$/.test(limitText)) {
        res.status(400).json({ error: 'Invalid pagination' }); return
      }
      const page = Number(pageText)
      const limit = Number(limitText)
      const skip = (page - 1) * limit
      if (!Number.isSafeInteger(skip) || limit > 100) { res.status(400).json({ error: 'Invalid pagination' }); return }
      const surveys = await (await MongoHelper.getCollection('surveys')).find().sort({ _id: 1 }).skip(skip).limit(limit).toArray()
      res.json(surveys.map(MongoHelper.map))
    } catch (error) { next(error) }
  })
  const result = async (req, res, next): Promise<void> => {
    try {
      if (!ObjectId.isValid(req.params.id)) { res.status(400).json({ error: 'Invalid survey id' }); return }
      const survey = await (await MongoHelper.getCollection('surveys')).findOne({ _id: new ObjectId(req.params.id) })
      if (!survey) { res.status(404).json({ error: 'Survey not found' }); return }
      if (new Set(survey.answers.map(item => item.answer)).size !== survey.answers.length) {
        res.status(409).json({ error: 'Survey has duplicate answers' }); return
      }
      const responses = await MongoHelper.getCollection('surveyResponses')
      if (req.method === 'PUT') {
        if (typeof req.body?.answer !== 'string' || !survey.answers.some(item => item.answer === req.body.answer)) {
          res.status(400).json({ error: 'Invalid answer' }); return
        }
        const filter = { surveyId: survey._id.toString(), accountId: String(req.accountId) }
        const update = { $set: { answer: req.body.answer } }
        try {
          await responses.updateOne(filter, update, { upsert: true })
        } catch (error) {
          if (error.code !== 11000 || error.keyPattern?.surveyId !== 1 || error.keyPattern?.accountId !== 1) throw error
          await responses.updateOne(filter, update)
        }
      }
      const counts = await responses.aggregate([
        { $match: { surveyId: survey._id.toString() } },
        { $group: { _id: '$answer', count: { $sum: 1 } } }
      ]).toArray()
      const byAnswer = new Map(counts.map(item => [item._id, item.count]))
      res.json({ surveyId: survey._id.toString(), total: counts.reduce((total, item) => total + item.count, 0),
        answers: survey.answers.map(item => ({ answer: item.answer, count: byAnswer.get(item.answer) || 0 })) })
    } catch (error) { next(error) }
  }
  router.put('/surveys/:id/result', auth, result)
  router.get('/surveys/:id/result', auth, result)
}
