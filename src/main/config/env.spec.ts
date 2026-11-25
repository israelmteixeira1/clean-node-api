describe('JWT secret configuration', () => {
  test('rejects missing JWT_SECRET outside tests', () => {
    const oldSecret = process.env.JWT_SECRET
    const oldNodeEnv = process.env.NODE_ENV
    delete process.env.JWT_SECRET
    process.env.NODE_ENV = 'production'
    try {
      jest.isolateModules(() => {
        expect(() => require('./env')).toThrow('JWT_SECRET')
      })
    } finally {
      if (oldSecret === undefined) delete process.env.JWT_SECRET
      else process.env.JWT_SECRET = oldSecret
      process.env.NODE_ENV = oldNodeEnv
    }
  })
})
