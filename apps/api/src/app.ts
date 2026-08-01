import { randomUUID } from 'node:crypto'
import { serveStatic } from '@hono/node-server/serve-static'
import type { AppLanguage, ConversationTurn, LearnerLevel } from '@kibotalk/conversation'
import { createLlmClient, llmConfigFromEnv, type LlmUsage } from '@kibotalk/llm'
import { buildReplySuggestionsMessages, buildSessionReviewMessages } from '@kibotalk/prompts'
import { listSttProviders } from '@kibotalk/stt'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { streamSSE } from 'hono/streaming'
import {
  adminCreateVoucher,
  adminDashboard,
  adminGrant,
  adminLedger,
  adminListUsers,
  adminListVouchers,
  adminRevokeDevice,
  adminSetUserStatus,
  adminUpdateVoucher,
  adminUserDetails,
} from './admin'
import {
  authorizeAiUse,
  refundAiAllowance,
  type AiUseAuthorization,
} from './ai-allowance'
import {
  authMe,
  deleteAccount,
  issueWebsocketTicket,
  listDevices,
  logout,
  requestOtp,
  requireRequestAuth,
  revokeDevice,
  verifyOtp,
} from './auth'
import { databaseConfigured, getDatabase } from './db'
import { quotaSummary } from './quota'
import {
  clearSyncedHistory,
  deleteSyncedSession,
  listSyncChanges,
  putSyncedPreferences,
  putSyncedSession,
} from './sync'
import { recordTelemetry, recordTelemetryLater } from './telemetry'
import { redeemVoucher } from './vouchers'
import { requireRelayRequestAuth } from './relay-request-auth'
import { registerRelayRoutes } from './relay-routes'
import {
  acquireRelayLlmSlot,
  authorizeRelayLlm,
  releaseRelayLlm,
} from './relay-session-state'
import { providerHealthy } from './provider-health'
import { relayNodeId, serverRole } from './server-role'

export const app = new Hono()
const role = serverRole()

const APP_LANGUAGES = new Set<AppLanguage>(['ja', 'en', 'zh'])
const LEARNER_LEVELS = new Set<LearnerLevel>(['beginner', 'intermediate', 'advanced'])

function parseAppLanguage(value: unknown, fallback: AppLanguage): AppLanguage {
  return typeof value === 'string' && APP_LANGUAGES.has(value as AppLanguage)
    ? (value as AppLanguage)
    : fallback
}

function parseLearnerLevel(value: unknown, fallback: LearnerLevel): LearnerLevel {
  return typeof value === 'string' && LEARNER_LEVELS.has(value as LearnerLevel)
    ? (value as LearnerLevel)
    : fallback
}

function allowedOrigin(origin: string): string | null {
  if (!origin) return null
  if (
    origin === 'https://app.kibotalk.app'
    || origin === 'https://advx.kibotalk.app'
    || origin === 'null'
  ) return origin
  if (/^https?:\/\/localhost(?::\d+)?$/.test(origin)) return origin
  if (/^https?:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin)) return origin
  return null
}

app.use(
  '/api/*',
  cors({
    origin: allowedOrigin,
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'X-KiboTalk-Client-Version',
      'X-KiboTalk-User-Id',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    maxAge: 86400,
  }),
)
app.use(
  '/api/*',
  bodyLimit({
    maxSize: 2 * 1024 * 1024,
    onError: (context) => context.json({ error: 'PAYLOAD_TOO_LARGE' }, 413),
  }),
)

const RELAY_DATA_PATHS = new Set([
  '/health',
  '/api/latency',
  '/api/relay/handshake',
  '/api/relay/ws-ticket',
  '/api/stt/direct/session',
  '/api/stt/direct/complete',
  '/api/stt/direct/cancel',
  '/api/llm',
  '/llm',
])

app.use('*', async (context, next) => {
  if (
    role === 'relay'
    && context.req.method !== 'OPTIONS'
    && !RELAY_DATA_PATHS.has(new URL(context.req.url).pathname)
  ) return context.json({ error: 'NOT_FOUND' }, 404)
  await next()
})

registerRelayRoutes(app, role)

app.get('/health', async (context) => {
  if (role === 'relay') {
    return context.json({
      ok: providerHealthy(),
      role,
      nodeId: relayNodeId(),
      providers: providerHealthy() ? 'ok' : 'error',
      version: process.env.APP_VERSION ?? 'development',
    }, providerHealthy() ? 200 : 503)
  }
  if (!databaseConfigured()) {
    return context.json({
      ok: process.env.APP_ENV !== 'production',
      database: 'not-configured',
      version: process.env.APP_VERSION ?? 'development',
    }, process.env.APP_ENV === 'production' ? 503 : 200)
  }
  try {
    const sql = getDatabase()
    await sql`SELECT 1`
    return context.json({
      ok: true,
      database: 'ok',
      version: process.env.APP_VERSION ?? 'development',
    })
  } catch {
    return context.json({ ok: false, database: 'error' }, 503)
  }
})

app.get('/app-version', (context) =>
  context.json({
    version: process.env.APP_VERSION ?? '0.1.0',
    platform: 'darwin-arm64',
    minimumSystemVersion: '13.0.0',
    downloadUrl:
      process.env.APP_DMG_URL
      ?? 'https://github.com/KiboAI/KiboTalk/releases',
    releaseNotesUrl:
      process.env.APP_RELEASE_NOTES_URL
      ?? 'https://github.com/KiboAI/KiboTalk/releases',
    publishedAt: process.env.APP_PUBLISHED_AT ?? null,
  }),
)

app.post('/api/auth/request-code', requestOtp)
app.post('/api/auth/verify', verifyOtp)
app.get('/api/auth/me', authMe)
app.post('/api/auth/logout', logout)
app.get('/api/auth/devices', listDevices)
app.delete('/api/auth/devices/:deviceId', revokeDevice)
app.post('/api/auth/ws-ticket', issueWebsocketTicket)

app.get('/api/account/quota', async (context) => {
  const auth = await requireRequestAuth(context)
  if (auth instanceof Response) return auth
  return context.json({
    quota: await quotaSummary(auth.userId),
    plans: {
      subscription: { priceCny: 30, durationDays: 30, minutes: 600 },
      topups: [
        { priceCny: 10, minutes: 120, available: false },
        { priceCny: 30, minutes: 400, available: false },
        { priceCny: 50, minutes: 800, available: false },
      ],
    },
  })
})
app.post('/api/account/redeem', redeemVoucher)
app.delete('/api/account', deleteAccount)

app.get('/api/sync', listSyncChanges)
app.put('/api/sync/sessions/:sessionId', putSyncedSession)
app.delete('/api/sync/sessions/:sessionId', deleteSyncedSession)
app.delete('/api/sync/history', clearSyncedHistory)
app.put('/api/sync/preferences', putSyncedPreferences)

app.get('/api/admin/dashboard', adminDashboard)
app.get('/api/admin/users', adminListUsers)
app.get('/api/admin/users/:userId', adminUserDetails)
app.patch('/api/admin/users/:userId/status', adminSetUserStatus)
app.post('/api/admin/users/:userId/grants', adminGrant)
app.delete('/api/admin/users/:userId/devices/:deviceId', adminRevokeDevice)
app.get('/api/admin/vouchers', adminListVouchers)
app.post('/api/admin/vouchers', adminCreateVoucher)
app.patch('/api/admin/vouchers/:voucherId', adminUpdateVoucher)
app.get('/api/admin/ledger', adminLedger)

app.get('/api/stt/providers', async (context) => {
  const auth = await requireRequestAuth(context)
  if (auth instanceof Response) return auth
  const providers = listSttProviders(process.env)
    .filter((provider) =>
      provider.configured
      && provider.mode === 'realtime'
      && (process.env.APP_ENV !== 'production' || provider.active))
  return context.json({ providers })
})

app.post('/api/llm', async (context) => {
  const relayAuth = requireRelayRequestAuth(context, 'llm')
  if (relayAuth instanceof Response) return relayAuth
  const body = (await context.req.json().catch(() => null)) as {
    context?: ConversationTurn[]
    level?: string
    conversationLang?: string
    meaningLang?: string
    sessionId?: unknown
  } | null
  const conversationSessionId =
    typeof body?.sessionId === 'string' && body.sessionId.length <= 200
      ? body.sessionId
      : relayAuth.claims.conversationSessionId
  if (conversationSessionId !== relayAuth.claims.conversationSessionId) {
    return context.json({ error: 'RELAY_SESSION_MISMATCH' }, 409)
  }
  let aiAuthorization: AiUseAuthorization
  let relayLlmAuthorization:
    | ReturnType<typeof authorizeRelayLlm>
    | undefined
  if (role === 'relay') {
    relayLlmAuthorization = authorizeRelayLlm(relayAuth.claims)
    aiAuthorization = {
      allowed: relayLlmAuthorization.allowed,
      allowanceConsumed: relayLlmAuthorization.finalAllowanceConsumed,
    }
  } else {
    if (!acquireRelayLlmSlot(relayAuth.claims)) {
      return context.json({ error: 'LLM_IN_FLIGHT' }, 409)
    }
    try {
      aiAuthorization = await authorizeAiUse({
        userId: relayAuth.requestAuth.userId,
        conversationSessionId,
        kind: 'reply',
      })
    } catch {
      releaseRelayLlm(relayAuth.claims)
      return context.json({ error: 'QUOTA_UNAVAILABLE' }, 503)
    }
  }
  if (!aiAuthorization.allowed) {
    if (role === 'primary') releaseRelayLlm(relayAuth.claims)
    const error = relayLlmAuthorization?.error ?? 'QUOTA_EXHAUSTED'
    return context.json(
      { error },
      error === 'LLM_IN_FLIGHT' ? 409 : 402,
    )
  }
  const requestId = randomUUID()
  const startedAt = Date.now()
  return streamSSE(context, async (stream) => {
    let usage: LlmUsage | undefined
    let refundLocalAllowance = false
    try {
      const conversationLang = parseAppLanguage(body?.conversationLang, 'ja')
      const meaningLang = parseAppLanguage(body?.meaningLang, 'zh')
      const level = parseLearnerLevel(body?.level, 'beginner')
      const messages = await buildReplySuggestionsMessages({
        context: body?.context ?? [],
        level,
        conversationLang,
        meaningLang,
      })
      let prompt = ''
      for (const message of messages) {
        if (prompt) prompt += '\n\n'
        prompt += `${message.role.toUpperCase()}:\n${message.content}`
      }
      await stream.writeSSE({ event: 'prompt', data: prompt })
      const config = llmConfigFromEnv(process.env)
      if (
        process.env.APP_ENV === 'production'
        && (
          config.provider !== relayAuth.claims.llmProvider
          || config.model !== relayAuth.claims.llmModel
        )
      ) throw new Error('RELAY_CAPABILITY_MISMATCH')
      const llmClient = createLlmClient(config)
      const tokenStream = llmClient.streamChat({
        messages,
        signal: context.req.raw.signal,
        onUsage: (nextUsage) => {
          usage = nextUsage
        },
      })
      for await (const token of tokenStream) {
        await stream.writeSSE({ event: 'token', data: token })
      }
      await recordTelemetry(relayAuth.requestAuth, {
        requestId,
        eventType: 'reply_suggestions',
        provider: config.provider,
        model: config.model,
        status: 'ok',
        durationMs: Date.now() - startedAt,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
      })
    } catch (cause) {
      refundLocalAllowance =
        role === 'relay'
        && aiAuthorization.allowanceConsumed
        && !context.req.raw.signal.aborted
      if (aiAuthorization.allowanceConsumed && !context.req.raw.signal.aborted) {
        if (role === 'primary') {
          await refundAiAllowance({
            userId: relayAuth.requestAuth.userId,
            conversationSessionId,
            kind: 'reply',
          }).catch(() => {})
        }
      }
      if (!context.req.raw.signal.aborted) {
        await stream.writeSSE({
          event: 'error',
          data: cause instanceof Error ? cause.message : String(cause),
        }).catch(() => {})
      }
      recordTelemetryLater(relayAuth.requestAuth, {
        requestId,
        eventType: 'reply_suggestions',
        status: context.req.raw.signal.aborted ? 'cancelled' : 'error',
        durationMs: Date.now() - startedAt,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        errorCode: cause instanceof Error ? cause.name : 'UPSTREAM_ERROR',
      })
    } finally {
      releaseRelayLlm(
        relayAuth.claims,
        role === 'relay' && refundLocalAllowance,
      )
    }
  })
})

app.post('/api/session-review', async (context) => {
  const auth = await requireRequestAuth(context)
  if (auth instanceof Response) return auth
  const requestId = randomUUID()
  const startedAt = Date.now()
  const body = (await context.req.json().catch(() => null)) as {
    turns?: ConversationTurn[]
    conversationLang?: string
    uiLang?: string
    sessionId?: unknown
  } | null
  const conversationSessionId =
    typeof body?.sessionId === 'string' && body.sessionId.length <= 200
      ? body.sessionId
      : undefined
  let aiAuthorization: AiUseAuthorization
  try {
    aiAuthorization = await authorizeAiUse({
      userId: auth.userId,
      conversationSessionId,
      kind: 'review',
    })
  } catch {
    return context.json({ error: 'QUOTA_UNAVAILABLE' }, 503)
  }
  if (!aiAuthorization.allowed) {
    return context.json({ error: 'QUOTA_EXHAUSTED' }, 402)
  }
  const conversationLang = parseAppLanguage(body?.conversationLang, 'ja')
  const uiLang = parseAppLanguage(body?.uiLang, 'en')
  let usage: LlmUsage | undefined
  try {
    const config = llmConfigFromEnv(process.env)
    const client = createLlmClient(config)
    const messages = await buildSessionReviewMessages({
      turns: body?.turns ?? [],
      conversationLang,
      uiLang,
    })
    const raw = await client.generateChat({
      messages,
      signal: context.req.raw.signal,
      onUsage: (nextUsage) => {
        usage = nextUsage
      },
    })
    const parsed = JSON.parse(raw) as { title?: unknown; summary?: unknown }
    if (typeof parsed.title !== 'string' || typeof parsed.summary !== 'string') {
      throw new Error('invalid session review response')
    }
    const title = parsed.title.trim()
    const summary = parsed.summary.trim()
    if (!title || !summary) throw new Error('empty session review response')
    recordTelemetryLater(auth, {
      requestId,
      eventType: 'session_review',
      provider: config.provider,
      model: config.model,
      status: 'ok',
      durationMs: Date.now() - startedAt,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
    })
    return context.json({ title, summary })
  } catch (cause) {
    if (aiAuthorization.allowanceConsumed && !context.req.raw.signal.aborted) {
      await refundAiAllowance({
        userId: auth.userId,
        conversationSessionId,
        kind: 'review',
      }).catch(() => {})
    }
    recordTelemetryLater(auth, {
      requestId,
      eventType: 'session_review',
      status: 'error',
      durationMs: Date.now() - startedAt,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
      errorCode: cause instanceof Error ? cause.name : 'UPSTREAM_ERROR',
    })
    return context.json({ error: cause instanceof Error ? cause.message : String(cause) }, 502)
  }
})

// Legacy aliases keep the local playground/tests working while product clients
// use the namespaced routes. Auth remains enforced because aliases re-enter
// the same handlers.
app.route('/', new Hono()
  .get('/stt/providers', (context) => app.fetch(new Request(new URL('/api/stt/providers', context.req.url), context.req.raw)))
  .post('/llm', (context) => app.fetch(new Request(new URL('/api/llm', context.req.url), context.req.raw)))
  .post('/session-review', (context) => app.fetch(new Request(new URL('/api/session-review', context.req.url), context.req.raw))))

if (role === 'primary') {
  app.use('/*', serveStatic({ root: '../web/dist' }))
  app.get('*', serveStatic({ root: '../web/dist', path: './index.html' }))
}
