import jwt from 'jsonwebtoken'
import { JwtAdapter } from './jwt-adapter'

test('tokens for the same account in the same second have distinct random identifiers', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2024-01-01T00:00:00Z'))
  try {
    const adapter = new JwtAdapter('a sufficiently long test secret')
    const first = await adapter.encrypt('account-id')
    const second = await adapter.encrypt('account-id')
    const firstClaims = jwt.decode(first) as jwt.JwtPayload
    const secondClaims = jwt.decode(second) as jwt.JwtPayload
    expect(firstClaims.iat).toBe(secondClaims.iat)
    expect(firstClaims.jti).toBeTruthy()
    expect(firstClaims.jti).not.toBe(secondClaims.jti)
    expect(first).not.toBe(second)
  } finally {
    jest.useRealTimers()
  }
})

test('issued JWT expires and rejects expired tokens', async () => {
  const adapter = new JwtAdapter('a sufficiently long test secret')
  const token = await adapter.encrypt('account-id')
  const claims = jwt.decode(token) as jwt.JwtPayload
  expect(claims.exp).toBeGreaterThan(claims.iat!)
  const expired = jwt.sign({ id: 'account-id' }, 'a sufficiently long test secret', { expiresIn: -1 })
  await expect(adapter.decrypt(expired)).rejects.toThrow()
})
