import type {
  RelayActiveSessionHeartbeat,
  RelayUsageEvent,
} from '@kibotalk/shared'
import { Hono } from 'hono'
import { grantFinalAiAllowance } from './ai-allowance'
import {
  confirmRelaySession,
  grantRelaySession,
  refreshRelayedActiveSessions,
  relayNodeErrorStatus,
  relaySessionMatches,
  releaseRelaySession,
} from './relay-control'
import { requireRelayNodeAuth } from './relay-node-auth'
import {
  availableRelayNodeList,
  configuredRelayNodes,
  recordRelayNodeHeartbeat,
} from './relay-nodes'
import { requireRelayRequestAuth } from './relay-request-auth'
import {
  issueRelayWebsocketTicket,
  touchRelaySession,
} from './relay-session-state'
import { providerHealthy } from './provider-health'
import {
  cancelIflytekDirectSession,
  completeIflytekDirectSession,
  issueIflytekDirectSession,
} from './iflytek-direct'
import { deductCompletedTurn, quotaSummary } from './quota'
import { requireRequestAuth, type RequestAuth } from './auth'
import { recordTelemetry, recordTelemetryLater } from './telemetry'
import type { ServerRole } from './server-role'
import { relayNodeId } from './server-role'

function validId(value: unknown, maxLength = 200): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

function usageEvent(value: unknown): RelayUsageEvent | null {
  if (!value || typeof value !== 'object') return null
  const event = value as Partial<RelayUsageEvent>
  if (
    !validId(event.requestId)
    || !validId(event.nodeId)
    || !validId(event.userId)
    || !validId(event.deviceSessionId)
    || !validId(event.conversationSessionId)
    || typeof event.audioSeconds !== 'number'
    || !Number.isFinite(event.audioSeconds)
    || event.audioSeconds <= 0
    || event.audioSeconds > 30
    || !validId(event.provider)
    || !validId(event.model)
    || typeof event.durationMs !== 'number'
    || !Number.isFinite(event.durationMs)
    || !validId(event.createdAt)
  ) return null
  return event as RelayUsageEvent
}

function heartbeatSessions(value: unknown): RelayActiveSessionHeartbeat[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((session): session is RelayActiveSessionHeartbeat => {
      if (!session || typeof session !== 'object') return false
      const candidate = session as Partial<RelayActiveSessionHeartbeat>
      return (
        validId(candidate.userId)
        && validId(candidate.deviceSessionId)
        && validId(candidate.conversationSessionId)
      )
    })
    .slice(0, 1_000)
}

function registerCommonRelayRoutes(app: Hono): void {
  // Reachability / RTT only — must not 503 when upstreams are degraded
  // (ADR 0006: latency excludes node→provider time).
  app.get('/api/latency', (context) =>
    context.json(
      {
        ok: true,
        providersOk: providerHealthy(),
        nodeId: relayNodeId(),
        timestamp: Date.now(),
      },
      200,
      {
        'cache-control': 'no-store',
        'server-timing': 'relay;dur=0',
      },
    ))

  app.post('/api/relay/handshake', (context) => {
    const auth = requireRelayRequestAuth(context, 'llm')
    if (auth instanceof Response) return auth
    touchRelaySession(auth.claims)
    return context.json({
      ok: true,
      nodeId: auth.claims.nodeId,
      expiresAt: auth.claims.expiresAt,
    })
  })

  app.post('/api/relay/ws-ticket', (context) => {
    const auth = requireRelayRequestAuth(context, 'stt-realtime')
    if (auth instanceof Response) return auth
    touchRelaySession(auth.claims)
    return context.json(issueRelayWebsocketTicket(auth.claims))
  })

  app.post('/api/stt/direct/session', issueIflytekDirectSession)
  app.post('/api/stt/direct/complete', completeIflytekDirectSession)
  app.post('/api/stt/direct/cancel', cancelIflytekDirectSession)
}

function registerPrimaryRelayRoutes(app: Hono): void {
  app.get('/api/relay/nodes', async (context) => {
    const auth = await requireRequestAuth(context)
    if (auth instanceof Response) return auth
    return context.json(await availableRelayNodeList())
  })

  app.post('/api/relay/sessions', async (context) => {
    const auth = await requireRequestAuth(context)
    if (auth instanceof Response) return auth
    const body = (await context.req.json().catch(() => null)) as {
      conversationSessionId?: unknown
      nodeId?: unknown
    } | null
    if (!validId(body?.conversationSessionId) || !validId(body?.nodeId)) {
      return context.json({ error: 'INVALID_RELAY_SESSION_REQUEST' }, 400)
    }
    try {
      return context.json(await grantRelaySession({
        auth,
        conversationSessionId: body.conversationSessionId,
        requestedNodeId: body.nodeId,
      }))
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : 'RELAY_SESSION_UNAVAILABLE'
      return context.json({ error }, relayNodeErrorStatus(error))
    }
  })

  app.post('/api/relay/sessions/:sessionId/confirm', async (context) => {
    const auth = await requireRequestAuth(context)
    if (auth instanceof Response) return auth
    const body = (await context.req.json().catch(() => null)) as {
      nodeId?: unknown
    } | null
    const conversationSessionId = context.req.param('sessionId')
    if (!validId(conversationSessionId) || !validId(body?.nodeId)) {
      return context.json({ error: 'INVALID_RELAY_SESSION_REQUEST' }, 400)
    }
    const confirmed = await confirmRelaySession({
      auth,
      conversationSessionId,
      nodeId: body.nodeId,
    })
    return confirmed
      ? context.json({ ok: true })
      : context.json({ error: 'RELAY_SESSION_NOT_FOUND' }, 404)
  })

  app.post('/api/relay/sessions/:sessionId/release', async (context) => {
    const auth = await requireRequestAuth(context)
    if (auth instanceof Response) return auth
    const conversationSessionId = context.req.param('sessionId')
    const body = (await context.req.json().catch(() => null)) as {
      final?: unknown
    } | null
    if (!validId(conversationSessionId) || typeof body?.final !== 'boolean') {
      return context.json({ error: 'INVALID_RELAY_SESSION_REQUEST' }, 400)
    }
    await releaseRelaySession({
      auth,
      conversationSessionId,
      final: body.final,
    })
    return context.json({ ok: true })
  })

  app.post('/api/relay/selection-telemetry', async (context) => {
    const auth = await requireRequestAuth(context)
    if (auth instanceof Response) return auth
    const body = (await context.req.json().catch(() => null)) as {
      conversationSessionId?: unknown
      selectedNodeId?: unknown
      results?: unknown
    } | null
    if (
      !validId(body?.conversationSessionId)
      || !validId(body?.selectedNodeId)
      || !Array.isArray(body?.results)
    ) return context.json({ error: 'INVALID_RELAY_TELEMETRY' }, 400)
    const results = body.results
      .slice(0, 10)
      .map((result) => {
        const value = result && typeof result === 'object'
          ? result as Record<string, unknown>
          : {}
        return {
          nodeId: validId(value.nodeId, 100) ? value.nodeId : 'invalid',
          latencyMs:
            typeof value.latencyMs === 'number' && Number.isFinite(value.latencyMs)
              ? Math.max(0, Math.round(value.latencyMs))
              : null,
          successfulAttempts:
            typeof value.successfulAttempts === 'number'
              ? Math.max(0, Math.round(value.successfulAttempts))
              : 0,
        }
      })
    recordTelemetryLater(auth, {
      eventType: 'relay_selection',
      status: 'ok',
      metadata: {
        conversationSessionId: body.conversationSessionId,
        selectedNodeId: body.selectedNodeId,
        results: JSON.stringify(results),
      },
    })
    return context.json({ ok: true })
  })

  app.post('/api/internal/relay/heartbeat', async (context) => {
    const unauthorized = requireRelayNodeAuth(context)
    if (unauthorized) return unauthorized
    const body = (await context.req.json().catch(() => null)) as {
      nodeId?: unknown
      acceptingNewSessions?: unknown
      providerHealthy?: unknown
      version?: unknown
      activeSessions?: unknown
    } | null
    if (
      !validId(body?.nodeId, 100)
      || typeof body?.acceptingNewSessions !== 'boolean'
      || typeof body?.providerHealthy !== 'boolean'
      || (body?.version !== undefined && !validId(body.version, 100))
      || !configuredRelayNodes().some((node) => node.id === body.nodeId && node.role === 'relay')
    ) return context.json({ error: 'INVALID_RELAY_HEARTBEAT' }, 400)
    await Promise.all([
      recordRelayNodeHeartbeat({
        nodeId: body.nodeId,
        acceptingNewSessions: body.acceptingNewSessions,
        providerHealthy: body.providerHealthy,
        version: typeof body.version === 'string' ? body.version : undefined,
      }),
      refreshRelayedActiveSessions(heartbeatSessions(body.activeSessions)),
    ])
    return context.json({ ok: true })
  })

  app.post('/api/internal/relay/usage', async (context) => {
    const unauthorized = requireRelayNodeAuth(context)
    if (unauthorized) return unauthorized
    const event = usageEvent(await context.req.json().catch(() => null))
    if (!event) return context.json({ error: 'INVALID_RELAY_USAGE' }, 400)
    if (!await relaySessionMatches(event)) {
      return context.json({ error: 'RELAY_SESSION_MISMATCH' }, 409)
    }
    const deduction = await deductCompletedTurn({
      userId: event.userId,
      audioSeconds: event.audioSeconds,
      requestId: event.requestId,
      conversationSessionId: event.conversationSessionId,
    })
    if (deduction.exhausted) {
      await grantFinalAiAllowance(event.userId, event.conversationSessionId)
    }
    const requestAuth: RequestAuth = {
      userId: event.userId,
      deviceSessionId: event.deviceSessionId,
      email: '',
      platform: 'web',
      clientVersion: 'relay',
      isAdmin: false,
    }
    await recordTelemetry(requestAuth, {
      requestId: event.requestId,
      eventType: 'stt_realtime_turn',
      provider: event.provider,
      model: event.model,
      status: 'ok',
      durationMs: event.durationMs,
      billedAudioSeconds: deduction.billedSeconds,
      metadata: {
        nodeId: event.nodeId,
        deductedSeconds: deduction.deductedSeconds,
        overdrawSeconds: deduction.overdrawSeconds,
      },
    })
    return context.json({
      deduction,
      quota: await quotaSummary(event.userId),
    })
  })
}

export function registerRelayRoutes(app: Hono, role: ServerRole): void {
  registerCommonRelayRoutes(app)
  if (role === 'primary') registerPrimaryRelayRoutes(app)
}
