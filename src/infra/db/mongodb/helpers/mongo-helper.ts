import { MongoClient, Collection } from "mongodb"

export const MongoHelper = {
  client: null as MongoClient,
  uri: null as string,

  async connect(uri: string): Promise<void> {
    this.uri = uri
    const client = await MongoClient.connect(uri)
    try {
      await client.db().collection('surveyResponses').createIndex({ surveyId: 1, accountId: 1 }, { unique: true })
      this.client = client
    } catch (error) {
      await client.close()
      throw error
    }
  },

  async disconnect(): Promise<void> {
    await this.client.close()
    this.client = null
  },

  async getCollection(name: string): Promise<Collection> {
    if (!this.client) {
      await this.connect(this.uri)
    }
    return this.client.db().collection(name)
  },

  map: (collection: any): any => {
    const { _id, ...collectionWithouId } = collection
    return Object.assign({}, collectionWithouId, { id: _id })
  }
}