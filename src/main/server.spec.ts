import { spawnSync } from 'child_process'
import path from 'path'

test('startup exits with an error when the initial MongoDB connection fails', () => {
  const result = spawnSync(process.execPath, ['-r', 'sucrase/register', path.join(__dirname, 'server.ts')], {
    env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'a sufficiently long test secret for startup', MONGO_URL: 'invalid-mongodb-uri' },
    encoding: 'utf8',
    timeout: 15000
  })
  expect(result.error).toBeUndefined()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toMatch(/Mongo|connection string/i)
  expect(result.stdout).not.toMatch(/Server running/)
})
