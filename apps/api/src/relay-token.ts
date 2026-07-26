import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto'
import type {
  RelayScope,
  RelaySessionClaims,
} from '@kibotalk/shared'

const TOKEN_VERSION = 1
const TOKEN_ISSUER = 'kibotalk-primary'
const CLOCK_SKEW_SECONDS = 30
const SESSION_SECONDS = 30 * 60
const RENEW_AFTER_SECONDS = 20 * 60
const RELAY_SCOPES = new Set<RelayScope>(['llm', 'stt', 'stt-realtime'])

let developmentKeys: { privateKey: KeyObject; publicKey: KeyObject } | undefined

function decodeKey(value: string): string {
  if (value.includes('BEGIN')) return value.replaceAll('\\n', '\n')
  return Buffer.from(value, 'base64').toString('utf8')
}

function privateKey(env: NodeJS.ProcessEnv): KeyObject {
  const configured = env.RELAY_TOKEN_PRIVATE_KEY
  if (configured) return createPrivateKey(decodeKey(configured))
  if (env.APP_ENV === 'production') {
    throw new Error('RELAY_TOKEN_PRIVATE_KEY is required on the primary server')
  }
  developmentKeys ??= generateKeyPairSync('ed25519')
  return developmentKeys.privateKey
}

function publicKey(env: NodeJS.ProcessEnv): KeyObject {
  const configured = env.RELAY_TOKEN_PUBLIC_KEY
  if (configured) return createPublicKey(decodeKey(configured))
  if (env.APP_ENV === 'production') {
    throw new Error('RELAY_TOKEN_PUBLIC_KEY is required')
  }
  developmentKeys ??= generateKeyPairSync('ed25519')
  return developmentKeys.publicKey
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function parseClaims(value: unknown): RelaySessionClaims | null {
  if (!value || typeof value !== 'object') return null
  const claims = value as Partial<RelaySessionClaims>
  if (
    claims.version !== TOKEN_VERSION
    || claims.issuer !== TOKEN_ISSUER
    || typeof claims.tokenId !== 'string'
    || typeof claims.userId !== 'string'
    || typeof claims.deviceSessionId !== 'string'
    || typeof claims.conversationSessionId !== 'string'
    || typeof claims.nodeId !== 'string'
    || !Array.isArray(claims.scopes)
    || claims.scopes.some((scope) => !RELAY_SCOPES.has(scope))
    || typeof claims.sttProvider !== 'string'
    || typeof claims.sttBatchProvider !== 'string'
    || typeof claims.llmProvider !== 'string'
    || typeof claims.llmModel !== 'string'
    || typeof claims.quotaSeconds !== 'number'
    || !Number.isInteger(claims.quotaSeconds)
    || claims.quotaSeconds < 0
    || typeof claims.issuedAt !== 'number'
    || typeof claims.expiresAt !== 'number'
  ) return null
  return claims as RelaySessionClaims
}

export type RelaySessionTokenInput = Omit<
  RelaySessionClaims,
  'version' | 'issuer' | 'tokenId' | 'issuedAt' | 'expiresAt' | 'scopes'
> & {
  scopes: readonly RelayScope[]
}

export function issueRelaySessionToken(
  input: RelaySessionTokenInput,
  options: {
    env?: NodeJS.ProcessEnv
    now?: Date
  } = {},
): { token: string; claims: RelaySessionClaims; renewAfterSeconds: number } {
  const env = options.env ?? process.env
  const issuedAt = Math.floor((options.now?.getTime() ?? Date.now()) / 1000)
  const claims: RelaySessionClaims = {
    ...input,
    scopes: [...input.scopes],
    version: TOKEN_VERSION,
    issuer: TOKEN_ISSUER,
    tokenId: randomUUID(),
    issuedAt,
    expiresAt: issuedAt + SESSION_SECONDS,
  }
  const payload = encodeJson(claims)
  const signature = sign(null, Buffer.from(payload), privateKey(env)).toString('base64url')
  return {
    token: `${payload}.${signature}`,
    claims,
    renewAfterSeconds: RENEW_AFTER_SECONDS,
  }
}

export function verifyRelaySessionToken(
  token: string,
  options: {
    env?: NodeJS.ProcessEnv
    nodeId: string
    requiredScope?: RelayScope
    now?: Date
  },
): RelaySessionClaims | null {
  const [payload, encodedSignature, extra] = token.split('.')
  if (!payload || !encodedSignature || extra) return null
  let signature: Buffer
  let decoded: unknown
  try {
    signature = Buffer.from(encodedSignature, 'base64url')
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown
  } catch {
    return null
  }
  try {
    if (!verify(
      null,
      Buffer.from(payload),
      publicKey(options.env ?? process.env),
      signature,
    )) return null
  } catch {
    return null
  }
  const claims = parseClaims(decoded)
  if (!claims || claims.nodeId !== options.nodeId) return null
  if (options.requiredScope && !claims.scopes.includes(options.requiredScope)) return null
  const now = Math.floor((options.now?.getTime() ?? Date.now()) / 1000)
  if (claims.issuedAt > now + CLOCK_SKEW_SECONDS) return null
  if (claims.expiresAt <= now - CLOCK_SKEW_SECONDS) return null
  return claims
}
