import { randomUUID } from 'node:crypto'
import { serveStatic } from '@hono/node-server/serve-static'
import type { AppLanguage, ConversationTurn, LearnerLevel } from '@kibotalk/conversation'
import { createLlmClient, llmConfigFromEnv, type LlmUsage } from '@kibotalk/llm'
import { buildReplySuggestionsMessages, buildSessionReviewMessages } from '@kibotalk/prompts'
import { createSttClient, listSttProviders, sttConfigFromEnv } from '@kibotalk/stt'
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

export const app = new Hono()

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

app.get('/health', async (context) => {
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
    .filter((provider) => provider.configured)
    .filter((provider) => process.env.APP_ENV !== 'production' || provider.mode === 'realtime')
  return context.json({ providers })
})

// Batch STT remains available to the local playground. Production product
// traffic is realtime-only by product decision.
app.post('/api/stt', async (context) => {
  const auth = await requireRequestAuth(context)
  if (auth instanceof Response) return auth
  if (process.env.APP_ENV === 'production') {
    return context.json({ error: 'REALTIME_STT_REQUIRED' }, 404)
  }
  const startedAt = Date.now()
  const requestId = randomUUID()
  const wav = await context.req.arrayBuffer()
  const providerOverride = context.req.query('provider') || undefined
  const language = context.req.query('language') || undefined
  let sttClient
  try {
    sttClient = createSttClient(sttConfigFromEnv(process.env, providerOverride))
  } catch (cause) {
    return context.json({ error: (cause as Error).message }, 500)
  }
  try {
    const text = await sttClient.transcribe(wav, {
      signal: context.req.raw.signal,
      language,
    })
    recordTelemetryLater(auth, {
      requestId,
      eventType: 'stt_batch',
      provider: providerOverride ?? process.env.STT_ACTIVE,
      status: 'ok',
      durationMs: Date.now() - startedAt,
    })
    return context.json({ text })
  } catch (cause) {
    recordTelemetryLater(auth, {
      requestId,
      eventType: 'stt_batch',
      provider: providerOverride ?? process.env.STT_ACTIVE,
      status: 'error',
      durationMs: Date.now() - startedAt,
      errorCode: cause instanceof Error ? cause.name : 'UPSTREAM_ERROR',
    })
    return context.json({ error: (cause as Error).message }, 502)
  }
})

app.post('/api/llm', async (context) => {
  const auth = await requireRequestAuth(context)
  if (auth instanceof Response) return auth
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
      : undefined
  let aiAuthorization: AiUseAuthorization
  try {
    aiAuthorization = await authorizeAiUse({
      userId: auth.userId,
      conversationSessionId,
      kind: 'reply',
    })
  } catch {
    return context.json({ error: 'QUOTA_UNAVAILABLE' }, 503)
  }
  if (!aiAuthorization.allowed) {
    return context.json({ error: 'QUOTA_EXHAUSTED' }, 402)
  }
  const requestId = randomUUID()
  const startedAt = Date.now()
  return streamSSE(context, async (stream) => {
    let usage: LlmUsage | undefined
    try {
      const signal = context.req.raw.signal
      const conversationLang = parseAppLanguage(body?.conversationLang, 'ja')
      const meaningLang = parseAppLanguage(body?.meaningLang, 'zh')
      const level = parseLearnerLevel(body?.level, 'beginner')
      const messages = await buildReplySuggestionsMessages({
        context: body?.context ?? [],
        level,
        conversationLang,
        meaningLang,
      })
      const prompt = messages.map((message) => `${message.role.toUpperCase()}:\n${message.content}`).join('\n\n')
      await stream.writeSSE({ event: 'prompt', data: prompt })
      const config = llmConfigFromEnv(process.env)
      const llmClient = createLlmClient(config)
      const tokenStream = llmClient.streamChat({
        messages,
        signal,
        onUsage: (nextUsage) => {
          usage = nextUsage
        },
      })
      for await (const token of tokenStream) {
        await stream.writeSSE({ event: 'token', data: token })
      }
      await recordTelemetry(auth, {
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
      if (aiAuthorization.allowanceConsumed && !context.req.raw.signal.aborted) {
        await refundAiAllowance({
          userId: auth.userId,
          conversationSessionId,
          kind: 'reply',
        }).catch(() => {})
      }
      if (!context.req.raw.signal.aborted) {
        await stream.writeSSE({
          event: 'error',
          data: cause instanceof Error ? cause.message : String(cause),
        }).catch(() => {})
      }
      recordTelemetryLater(auth, {
        requestId,
        eventType: 'reply_suggestions',
        status: context.req.raw.signal.aborted ? 'cancelled' : 'error',
        durationMs: Date.now() - startedAt,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        errorCode: cause instanceof Error ? cause.name : 'UPSTREAM_ERROR',
      })
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
// use the namespaced routes. Production Caddy exposes both, but auth remains
// enforced because aliases re-enter the same handlers.
app.route('/', new Hono()
  .get('/stt/providers', (context) => app.fetch(new Request(new URL('/api/stt/providers', context.req.url), context.req.raw)))
  .post('/stt', (context) => app.fetch(new Request(new URL(`/api/stt${new URL(context.req.url).search}`, context.req.url), context.req.raw)))
  .post('/llm', (context) => app.fetch(new Request(new URL('/api/llm', context.req.url), context.req.raw)))
  .post('/session-review', (context) => app.fetch(new Request(new URL('/api/session-review', context.req.url), context.req.raw))))

app.use('/*', serveStatic({ root: '../web/dist' }))
app.get('*', serveStatic({ root: '../web/dist', path: './index.html' }))
