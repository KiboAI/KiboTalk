import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  issueRelaySessionToken,
  verifyRelaySessionToken,
} from '../src/relay-token'

function testEnv() {
  const pair = generateKeyPairSync('ed25519')
  return {
    APP_ENV: 'production',
    RELAY_TOKEN_PRIVATE_KEY: pair.privateKey
      .export({ format: 'pem', type: 'pkcs8' })
      .toString(),
    RELAY_TOKEN_PUBLIC_KEY: pair.publicKey
      .export({ format: 'pem', type: 'spki' })
      .toString(),
  }
}

const input = {
  userId: 'user-1',
  deviceSessionId: 'device-1',
  conversationSessionId: 'conversation-1',
  nodeId: 'sg-relay',
  scopes: ['llm'] as const,
  sttProvider: 'dashscope-realtime',
  llmProvider: 'openai',
  llmModel: 'deepseek-v4-flash',
  quotaSeconds: 120,
}

describe('relay session token', () => {
  it('round-trips signed, node-bound claims', () => {
    const env = testEnv()
    const now = new Date('2026-07-26T00:00:00Z')
    const issued = issueRelaySessionToken(input, { env, now })
    const claims = verifyRelaySessionToken(issued.token, {
      env,
      nodeId: 'sg-relay',
      requiredScope: 'llm',
      now,
    })

    expect(claims).toMatchObject(input)
    expect(claims?.expiresAt).toBe(claims!.issuedAt + 30 * 60)
    expect(issued.renewAfterSeconds).toBe(20 * 60)
  })

  it('rejects a token on a different node or outside its scope', () => {
    const env = testEnv()
    const now = new Date('2026-07-26T00:00:00Z')
    const { token } = issueRelaySessionToken(input, { env, now })

    expect(verifyRelaySessionToken(token, {
      env,
      nodeId: 'jp-primary',
      now,
    })).toBeNull()
    expect(verifyRelaySessionToken(token, {
      env,
      nodeId: 'sg-relay',
      requiredScope: 'stt-realtime',
      now,
    })).toBeNull()
  })

  it('rejects tampering and expiry', () => {
    const env = testEnv()
    const now = new Date('2026-07-26T00:00:00Z')
    const { token } = issueRelaySessionToken(input, { env, now })
    const [payload, signature] = token.split('.')
    const decoded = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as {
      quotaSeconds: number
    }
    decoded.quotaSeconds = 999_999
    const tampered = `${Buffer.from(JSON.stringify(decoded)).toString('base64url')}.${signature}`

    expect(verifyRelaySessionToken(tampered, {
      env,
      nodeId: 'sg-relay',
      now,
    })).toBeNull()
    expect(verifyRelaySessionToken(token, {
      env,
      nodeId: 'sg-relay',
      now: new Date(now.getTime() + 31 * 60 * 1000),
    })).toBeNull()
  })
})
