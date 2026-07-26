import type {
  RelayScope,
  RelaySessionClaims,
} from '@kibotalk/shared'
import type { Context } from 'hono'
import type { RequestAuth } from './auth'
import { isTestAuthBypass } from './auth'
import { relayNodeId } from './server-role'
import { syncRelaySessionState } from './relay-session-state'
import { verifyRelaySessionToken } from './relay-token'
import { pendingRelayUsageSeconds } from './relay-usage-outbox'

export type RelayRequestAuth = {
  claims: RelaySessionClaims
  requestAuth: RequestAuth
}

function bearerToken(context: Context): string | null {
  const header = context.req.header('authorization')
  return header?.startsWith('Bearer ') ? header.slice(7).trim() : null
}

function developmentClaims(scope: RelayScope): RelaySessionClaims {
  const now = Math.floor(Date.now() / 1000)
  return {
    version: 1,
    issuer: 'kibotalk-primary',
    tokenId: 'development',
    userId: '00000000-0000-0000-0000-000000000001',
    deviceSessionId: '00000000-0000-0000-0000-000000000002',
    conversationSessionId: 'development',
    nodeId: relayNodeId(),
    scopes: [scope],
    sttProvider: process.env.STT_ACTIVE ?? 'dashscope-realtime',
    sttBatchProvider: process.env.STT_BATCH_ACTIVE ?? process.env.STT_ACTIVE ?? 'openrouter',
    llmProvider: process.env.LLM_ACTIVE ?? 'openrouter',
    llmModel: process.env.LLM_OPENROUTER_MODEL ?? 'development',
    quotaSeconds: 30 * 60,
    issuedAt: now,
    expiresAt: now + 30 * 60,
  }
}

export function authenticateRelayRequest(
  context: Context,
  requiredScope: RelayScope,
): RelayRequestAuth | null {
  const token = bearerToken(context)
  const claims = token
    ? verifyRelaySessionToken(token, {
        nodeId: relayNodeId(),
        requiredScope,
      })
    : isTestAuthBypass()
      ? developmentClaims(requiredScope)
      : null
  if (!claims) return null
  syncRelaySessionState(
    claims,
    pendingRelayUsageSeconds(claims.userId, claims.conversationSessionId),
  )
  return {
    claims,
    requestAuth: {
      userId: claims.userId,
      email: '',
      deviceSessionId: claims.deviceSessionId,
      platform: 'web',
      clientVersion: context.req.header('x-kibotalk-client-version') ?? 'unknown',
      isAdmin: false,
    },
  }
}

export function requireRelayRequestAuth(
  context: Context,
  requiredScope: RelayScope,
): RelayRequestAuth | Response {
  return authenticateRelayRequest(context, requiredScope)
    ?? context.json({ error: 'INVALID_RELAY_TOKEN' }, 401)
}
