const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'test' ? 'test-only-jwt-secret-not-for-production' : '')
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must contain at least 32 characters')
}

export default {
  mongoUrl: process.env.MONGO_URL || 'mongodb://mongo:27017/clean-node-api',
  port: process.env.PORT || 5050,
  jwtSecret
}