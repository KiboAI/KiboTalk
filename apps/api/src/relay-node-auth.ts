import { timingSafeEqual } from 'node:crypto'
import type { Context } from 'hono'

function secretsEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

export function requireRelayNodeAuth(
  context: Context,
  env: NodeJS.ProcessEnv = process.env,
): Response | null {
  const expected = env.RELAY_NODE_SECRET
  if (!expected) {
    if (env.APP_ENV !== 'production') return null
    return context.json({ error: 'NODE_AUTH_NOT_CONFIGURED' }, 503)
  }
  const header = context.req.header('authorization')
  const actual = header?.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!actual || !secretsEqual(actual, expected)) {
    return context.json({ error: 'INVALID_NODE_CREDENTIAL' }, 401)
  }
  return null
}
