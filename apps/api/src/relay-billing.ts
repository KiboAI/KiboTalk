import { grantFinalAiAllowance } from './ai-allowance'
import { databaseConfigured } from './db'
import { deductCompletedTurn, quotaSummary } from './quota'
import type { RelayRequestAuth } from './relay-request-auth'
import { deductRelaySessionSeconds } from './relay-session-state'
import { enqueueRelayUsage, flushRelayUsageOutbox } from './relay-usage-outbox'
import type { ServerRole } from './server-role'

export type RelayDeduction = {
  billedSeconds: number
  deductedSeconds: number
  overdrawSeconds: number
  exhausted: boolean
  remainingSeconds: number
}

export async function billCompletedRelayTurn(args: {
  role: ServerRole
  auth: RelayRequestAuth
  requestId: string
  audioSeconds: number
  provider: string
  model: string
  durationMs: number
}): Promise<RelayDeduction> {
  if (args.role === 'primary' && databaseConfigured()) {
    const deduction = await deductCompletedTurn({
      userId: args.auth.claims.userId,
      audioSeconds: args.audioSeconds,
      requestId: args.requestId,
      conversationSessionId: args.auth.claims.conversationSessionId,
    })
    if (deduction.exhausted) {
      await grantFinalAiAllowance(
        args.auth.claims.userId,
        args.auth.claims.conversationSessionId,
      )
    }
    return {
      ...deduction,
      remainingSeconds: (await quotaSummary(args.auth.claims.userId)).totalSeconds,
    }
  }

  const deduction = deductRelaySessionSeconds(
    args.auth.claims,
    args.audioSeconds,
  )
  if (args.role === 'relay') {
    await enqueueRelayUsage({
      requestId: args.requestId,
      nodeId: args.auth.claims.nodeId,
      userId: args.auth.claims.userId,
      deviceSessionId: args.auth.claims.deviceSessionId,
      conversationSessionId: args.auth.claims.conversationSessionId,
      audioSeconds: args.audioSeconds,
      provider: args.provider,
      model: args.model,
      durationMs: args.durationMs,
      createdAt: new Date().toISOString(),
    })
    void flushRelayUsageOutbox()
  }
  return deduction
}
