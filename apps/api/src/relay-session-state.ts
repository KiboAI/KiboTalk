import { randomBytes } from 'node:crypto'
import type { RelaySessionClaims } from '@kibotalk/shared'

type RelaySessionState = {
  claims: RelaySessionClaims
  remainingSeconds: number
  finalReplyRemaining: number
  llmInFlight: boolean
  activeWebsockets: number
  lastSeenAt: number
}

type RelayTicket = {
  claims: RelaySessionClaims
  expiresAt: number
}

const sessions = new Map<string, RelaySessionState>()
const tickets = new Map<string, RelayTicket>()
const MAX_WEBSOCKETS_PER_SESSION = 2

function sessionKey(claims: RelaySessionClaims): string {
  return `${claims.userId}:${claims.deviceSessionId}:${claims.conversationSessionId}`
}

export function syncRelaySessionState(
  claims: RelaySessionClaims,
  pendingUsageSeconds = 0,
): RelaySessionState {
  const key = sessionKey(claims)
  const current = sessions.get(key)
  const state: RelaySessionState = current
    ? {
        ...current,
        claims,
        remainingSeconds: Math.min(current.remainingSeconds, claims.quotaSeconds),
        lastSeenAt: Date.now(),
      }
    : {
        claims,
        remainingSeconds: Math.max(0, claims.quotaSeconds - pendingUsageSeconds),
        finalReplyRemaining: claims.quotaSeconds - pendingUsageSeconds <= 0 ? 1 : 0,
        llmInFlight: false,
        activeWebsockets: 0,
        lastSeenAt: Date.now(),
      }
  sessions.set(key, state)
  return state
}

export function relayRemainingSeconds(
  claims: RelaySessionClaims,
): number {
  return syncRelaySessionState(claims).remainingSeconds
}

export function touchRelaySession(claims: RelaySessionClaims): void {
  syncRelaySessionState(claims).lastSeenAt = Date.now()
}

export function deductRelaySessionSeconds(
  claims: RelaySessionClaims,
  audioSeconds: number,
): {
  billedSeconds: number
  deductedSeconds: number
  overdrawSeconds: number
  exhausted: boolean
  remainingSeconds: number
} {
  const state = syncRelaySessionState(claims)
  const billedSeconds = Math.max(1, Math.ceil(audioSeconds))
  const deductedSeconds = Math.min(state.remainingSeconds, billedSeconds)
  state.remainingSeconds -= deductedSeconds
  const exhausted = state.remainingSeconds <= 0
  if (exhausted) state.finalReplyRemaining = Math.max(1, state.finalReplyRemaining)
  return {
    billedSeconds,
    deductedSeconds,
    overdrawSeconds: billedSeconds - deductedSeconds,
    exhausted,
    remainingSeconds: state.remainingSeconds,
  }
}

export function authorizeRelayLlm(
  claims: RelaySessionClaims,
): {
  allowed: boolean
  finalAllowanceConsumed: boolean
  error?: 'QUOTA_EXHAUSTED' | 'LLM_IN_FLIGHT'
} {
  const state = syncRelaySessionState(claims)
  if (state.llmInFlight) {
    return {
      allowed: false,
      finalAllowanceConsumed: false,
      error: 'LLM_IN_FLIGHT',
    }
  }
  state.llmInFlight = true
  if (state.remainingSeconds <= 0 && state.finalReplyRemaining <= 0) {
    state.llmInFlight = false
    return {
      allowed: false,
      finalAllowanceConsumed: false,
      error: 'QUOTA_EXHAUSTED',
    }
  }
  const finalAllowanceConsumed = state.remainingSeconds <= 0
  if (finalAllowanceConsumed) state.finalReplyRemaining -= 1
  return { allowed: true, finalAllowanceConsumed }
}

export function acquireRelayLlmSlot(claims: RelaySessionClaims): boolean {
  const state = syncRelaySessionState(claims)
  if (state.llmInFlight) return false
  state.llmInFlight = true
  return true
}

export function releaseRelayLlm(
  claims: RelaySessionClaims,
  refundFinalAllowance = false,
): void {
  const state = syncRelaySessionState(claims)
  state.llmInFlight = false
  if (refundFinalAllowance) {
    state.finalReplyRemaining = Math.min(1, state.finalReplyRemaining + 1)
  }
}

export function acquireRelayWebsocket(claims: RelaySessionClaims): boolean {
  const state = syncRelaySessionState(claims)
  if (state.remainingSeconds <= 0) return false
  if (state.activeWebsockets >= MAX_WEBSOCKETS_PER_SESSION) return false
  state.activeWebsockets += 1
  return true
}

export function releaseRelayWebsocket(claims: RelaySessionClaims): void {
  const state = syncRelaySessionState(claims)
  state.activeWebsockets = Math.max(0, state.activeWebsockets - 1)
}

export function issueRelayWebsocketTicket(
  claims: RelaySessionClaims,
  now = Date.now(),
): { ticket: string; expiresInSeconds: number } {
  const ticket = randomBytes(24).toString('base64url')
  tickets.set(ticket, { claims, expiresAt: now + 60_000 })
  return { ticket, expiresInSeconds: 60 }
}

export function consumeRelayWebsocketTicket(
  ticket: string,
  now = Date.now(),
): RelaySessionClaims | null {
  const record = tickets.get(ticket)
  tickets.delete(ticket)
  if (!record || record.expiresAt <= now) return null
  return record.claims
}

export function activeRelaySessions(
  now = Date.now(),
): Array<Pick<
  RelaySessionClaims,
  'userId' | 'deviceSessionId' | 'conversationSessionId'
>> {
  const activeAfter = now - 90_000
  return [...sessions.values()]
    .filter((state) => state.lastSeenAt >= activeAfter)
    .map(({ claims }) => ({
      userId: claims.userId,
      deviceSessionId: claims.deviceSessionId,
      conversationSessionId: claims.conversationSessionId,
    }))
}

export function resetRelaySessionStateForTests(): void {
  sessions.clear()
  tickets.clear()
}
