import { createHmac, randomUUID } from 'node:crypto'
import type { Context } from 'hono'
import { MAX_TURN_OVERDRAW_SECONDS } from './quota'
import { billCompletedRelayTurn } from './relay-billing'
import { requireRelayRequestAuth } from './relay-request-auth'
import { relayRemainingSeconds, touchRelaySession } from './relay-session-state'
import { serverRole } from './server-role'
import { recordTelemetryLater } from './telemetry'

const DEFAULT_WS_URL =
  'wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1'
const MODEL = 'iflytek-rtasr-llm'
const SAMPLE_RATE = 16_000
const DIRECT_SESSION_TTL_MS = 10 * 60 * 1_000
const MAX_OUTSTANDING_SESSIONS = 2

type IflytekConfig = {
  appId: string
  apiKey: string
  apiSecret: string
  wsUrl: string
}

type IssuedDirectSession = {
  userId: string
  conversationSessionId: string
  issuedAt: number
}

const issuedSessions = new Map<string, IssuedDirectSession>()

function configFromEnv(env: NodeJS.ProcessEnv = process.env): IflytekConfig {
  const appId = env.STT_IFLYTEK_APP_ID
  const apiKey = env.STT_IFLYTEK_API_KEY
  const apiSecret = env.STT_IFLYTEK_API_SECRET
  if (!appId || !apiKey || !apiSecret) {
    throw new Error(
      'Missing iFlytek realtime config: need STT_IFLYTEK_APP_ID, STT_IFLYTEK_API_KEY and STT_IFLYTEK_API_SECRET',
    )
  }
  return {
    appId,
    apiKey,
    apiSecret,
    wsUrl: env.STT_IFLYTEK_WS_URL ?? DEFAULT_WS_URL,
  }
}

function utcAtChinaStandardTime(now: Date): string {
  const chinaTime = new Date(now.getTime() + 8 * 60 * 60 * 1_000)
  return `${chinaTime.toISOString().slice(0, 19)}+0800`
}

function encodedParameters(parameters: Record<string, string>): string {
  return Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
}

function languageParameters(language: string | undefined): Record<string, string> {
  if (language === 'ja') {
    return {
      lang: 'autominor',
      recognized_language: 'ja',
    }
  }
  return { lang: 'autodialect' }
}

export function createIflytekSignedUrl(args: {
  config: IflytekConfig
  language?: string
  now?: Date
  uuid?: string
}): string {
  const parameters = {
    accessKeyId: args.config.apiKey,
    appId: args.config.appId,
    uuid: args.uuid ?? randomUUID().replaceAll('-', ''),
    utc: utcAtChinaStandardTime(args.now ?? new Date()),
    audio_encode: 'pcm_s16le',
    samplerate: String(SAMPLE_RATE),
    ...languageParameters(args.language),
  }
  const signature = createHmac('sha1', args.config.apiSecret)
    .update(encodedParameters(parameters))
    .digest('base64')
  const url = new URL(args.config.wsUrl)
  for (const [key, value] of Object.entries({ ...parameters, signature })) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

function pruneIssuedSessions(now = Date.now()): void {
  for (const [requestId, session] of issuedSessions) {
    if (now - session.issuedAt > DIRECT_SESSION_TTL_MS) issuedSessions.delete(requestId)
  }
}

export function issueIflytekDirectSession(context: Context): Response {
  const auth = requireRelayRequestAuth(context, 'stt-realtime')
  if (auth instanceof Response) return auth
  if (
    process.env.STT_ACTIVE !== 'iflytek-realtime'
    || auth.claims.sttProvider !== 'iflytek-realtime'
  ) return context.json({ error: 'STT_PROVIDER_NOT_ACTIVE' }, 409)
  if (relayRemainingSeconds(auth.claims) <= 0) {
    return context.json({ error: 'QUOTA_EXHAUSTED' }, 402)
  }
  const languageQuery = context.req.query('language')
  const language =
    languageQuery === 'ja' || languageQuery === 'en' || languageQuery === 'zh'
      ? languageQuery
      : undefined
  let config: IflytekConfig
  try {
    config = configFromEnv()
  } catch (cause) {
    return context.json({
      error: 'STT_NOT_CONFIGURED',
      message: cause instanceof Error ? cause.message : String(cause),
    }, 503)
  }
  pruneIssuedSessions()
  const outstanding = [...issuedSessions.values()].filter(
    (session) =>
      session.userId === auth.claims.userId
      && session.conversationSessionId === auth.claims.conversationSessionId,
  )
  if (outstanding.length >= MAX_OUTSTANDING_SESSIONS) {
    return context.json({ error: 'DIRECT_STT_SESSION_LIMIT' }, 429)
  }
  const requestId = randomUUID()
  issuedSessions.set(requestId, {
    userId: auth.claims.userId,
    conversationSessionId: auth.claims.conversationSessionId,
    issuedAt: Date.now(),
  })
  touchRelaySession(auth.claims)
  return context.json({
    requestId,
    url: createIflytekSignedUrl({ config, language }),
    provider: 'iflytek',
    model: MODEL,
    sampleRate: SAMPLE_RATE,
    frameBytes: 1_280,
    frameIntervalMs: 40,
  })
}

export async function completeIflytekDirectSession(context: Context): Promise<Response> {
  const auth = requireRelayRequestAuth(context, 'stt-realtime')
  if (auth instanceof Response) return auth
  const body = (await context.req.json().catch(() => null)) as {
    requestId?: unknown
    samples?: unknown
    durationMs?: unknown
  } | null
  const requestId = typeof body?.requestId === 'string' ? body.requestId : ''
  const samples = Number(body?.samples)
  const durationMs = Number(body?.durationMs)
  const issued = issuedSessions.get(requestId)
  if (
    !issued
    || issued.userId !== auth.claims.userId
    || issued.conversationSessionId !== auth.claims.conversationSessionId
  ) return context.json({ error: 'DIRECT_STT_SESSION_NOT_FOUND' }, 404)
  if (
    !Number.isInteger(samples)
    || samples <= 0
    || samples > SAMPLE_RATE * MAX_TURN_OVERDRAW_SECONDS
    || !Number.isFinite(durationMs)
    || durationMs < 0
  ) return context.json({ error: 'INVALID_DIRECT_STT_USAGE' }, 400)
  issuedSessions.delete(requestId)
  try {
    const deduction = await billCompletedRelayTurn({
      role: serverRole(),
      auth,
      requestId,
      audioSeconds: samples / SAMPLE_RATE,
      provider: 'iflytek',
      model: MODEL,
      durationMs,
    })
    recordTelemetryLater(auth.requestAuth, {
      requestId,
      eventType: 'stt_realtime_turn',
      provider: 'iflytek',
      model: MODEL,
      status: 'ok',
      durationMs,
      billedAudioSeconds: deduction.billedSeconds,
      metadata: {
        transport: 'direct-websocket',
        deductedSeconds: deduction.deductedSeconds,
        overdrawSeconds: deduction.overdrawSeconds,
      },
    })
    return context.json({
      ok: true,
      exhausted: deduction.exhausted,
      remainingSeconds: deduction.remainingSeconds,
    })
  } catch (cause) {
    recordTelemetryLater(auth.requestAuth, {
      requestId,
      eventType: 'stt_realtime_turn',
      provider: 'iflytek',
      model: MODEL,
      status: 'error',
      durationMs,
      errorCode: cause instanceof Error ? cause.name : 'BILLING_ERROR',
      metadata: { transport: 'direct-websocket' },
    })
    return context.json({ error: 'BILLING_UNAVAILABLE' }, 503)
  }
}

export async function cancelIflytekDirectSession(context: Context): Promise<Response> {
  const auth = requireRelayRequestAuth(context, 'stt-realtime')
  if (auth instanceof Response) return auth
  const body = (await context.req.json().catch(() => null)) as {
    requestId?: unknown
  } | null
  const requestId = typeof body?.requestId === 'string' ? body.requestId : ''
  const issued = issuedSessions.get(requestId)
  if (
    issued
    && issued.userId === auth.claims.userId
    && issued.conversationSessionId === auth.claims.conversationSessionId
  ) issuedSessions.delete(requestId)
  return context.json({ ok: true })
}
