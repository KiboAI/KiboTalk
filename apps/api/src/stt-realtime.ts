/**
 * Authenticated WebSocket relay: product client thin protocol ↔ DashScope
 * Qwen realtime upstream. Audio is counted in memory and never persisted.
 */
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import {
  dashscopeRealtimeConfigFromEnv,
  dashscopeRealtimeHeaders,
  dashscopeRealtimeUpstreamUrl,
  parseThinClientMessage,
  thinClientToUpstream,
  upstreamToThinServer,
} from '@kibotalk/stt'
import { WebSocket, WebSocketServer } from 'ws'
import {
  claimActiveAiSession,
  refreshActiveAiSession,
  releaseActiveAiSession,
} from './active-session'
import { grantFinalAiAllowance } from './ai-allowance'
import { consumeWebsocketTicket, type RequestAuth } from './auth'
import { databaseConfigured } from './db'
import { deductCompletedTurn, MAX_TURN_OVERDRAW_SECONDS, quotaSummary } from './quota'
import { recordTelemetryLater } from './telemetry'

const PATHS = new Set(['/api/stt-realtime', '/stt-realtime'])
const SAMPLE_RATE = 16000
const MAX_WEBSOCKET_MESSAGE_BYTES = 2 * 1024 * 1024
const activeConnectionCounts = new Map<string, number>()

function connectionKey(auth: RequestAuth, conversationSessionId: string): string {
  return `${auth.userId}:${auth.deviceSessionId}:${conversationSessionId}`
}

function addActiveConnection(key: string): void {
  activeConnectionCounts.set(key, (activeConnectionCounts.get(key) ?? 0) + 1)
}

function removeActiveConnection(key: string): number {
  const remaining = Math.max(0, (activeConnectionCounts.get(key) ?? 1) - 1)
  if (remaining === 0) activeConnectionCounts.delete(key)
  else activeConnectionCounts.set(key, remaining)
  return remaining
}

export function attachSttRealtimeUpgrade(server: Server): WebSocketServer {
  const websocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_WEBSOCKET_MESSAGE_BYTES,
  })

  server.on('upgrade', (request, socket, head) => {
    const host = request.headers.host ?? 'localhost'
    const url = new URL(request.url ?? '/', `http://${host}`)
    if (!PATHS.has(url.pathname)) {
      socket.destroy()
      return
    }
    websocketServer.handleUpgrade(request, socket as Duplex, head, (websocket) => {
      websocketServer.emit('connection', websocket, request)
    })
  })

  websocketServer.on('connection', (clientWebsocket, request) => {
    void handleConnection(clientWebsocket, request)
  })

  return websocketServer
}

async function handleConnection(
  clientWebsocket: WebSocket,
  request: IncomingMessage,
): Promise<void> {
  const host = request.headers.host ?? 'localhost'
  const url = new URL(request.url ?? '/', `http://${host}`)
  const provider = url.searchParams.get('provider') ?? 'dashscope-realtime'
  const language = url.searchParams.get('language') ?? undefined
  const ticket = url.searchParams.get('ticket')
  const conversationSessionId = url.searchParams.get('sessionId') ?? `development-${randomUUID()}`

  const send = (message: unknown) => {
    if (clientWebsocket.readyState === WebSocket.OPEN) {
      clientWebsocket.send(JSON.stringify(message))
    }
  }

  if (provider !== 'dashscope-realtime') {
    send({ type: 'error', code: 'UNSUPPORTED_PROVIDER', message: '生产环境仅支持 Qwen3 ASR 实时模型' })
    clientWebsocket.close()
    return
  }
  if (!ticket) {
    send({ type: 'error', code: 'AUTH_REQUIRED', message: '登录已失效，请重新登录' })
    clientWebsocket.close()
    return
  }
  const ticketAuth = await consumeWebsocketTicket(ticket).catch(() => null)
  if (!ticketAuth) {
    send({ type: 'error', code: 'INVALID_WS_TICKET', message: '连接票据无效或已过期' })
    clientWebsocket.close()
    return
  }
  const auth: RequestAuth = {
    ...ticketAuth,
    email: '',
    isAdmin: false,
  }
  if (databaseConfigured()) {
    const quota = await quotaSummary(auth.userId)
    if (quota.totalSeconds <= 0) {
      send({ type: 'quota_exhausted', quota })
      clientWebsocket.close()
      return
    }
    const claimed = await claimActiveAiSession({
      userId: auth.userId,
      deviceSessionId: auth.deviceSessionId,
      conversationSessionId,
    })
    if (!claimed) {
      send({
        type: 'error',
        code: 'ACTIVE_SESSION_CONFLICT',
        message: '该账号已在另一台设备进行 AI 会话',
      })
      clientWebsocket.close()
      return
    }
  }

  const activeKey = connectionKey(auth, conversationSessionId)
  addActiveConnection(activeKey)
  let activeReleased = false
  const releaseLease = () => {
    if (activeReleased) return
    activeReleased = true
    if (removeActiveConnection(activeKey) === 0 && databaseConfigured()) {
      void releaseActiveAiSession({
        userId: auth.userId,
        deviceSessionId: auth.deviceSessionId,
        conversationSessionId,
      }).catch(() => {})
    }
  }

  let config
  try {
    config = dashscopeRealtimeConfigFromEnv(process.env)
  } catch (cause) {
    send({ type: 'error', code: 'STT_NOT_CONFIGURED', message: (cause as Error).message })
    releaseLease()
    clientWebsocket.close()
    return
  }

  let upstream: WebSocket
  try {
    upstream = new WebSocket(dashscopeRealtimeUpstreamUrl(config), {
      headers: Object.fromEntries(
        dashscopeRealtimeHeaders(config.apiKey).map((header) => {
          const separator = header.indexOf(':')
          return [header.slice(0, separator).trim(), header.slice(separator + 1).trim()] as const
        }),
      ),
    })
  } catch (cause) {
    send({ type: 'error', code: 'UPSTREAM_CONNECT_FAILED', message: (cause as Error).message })
    releaseLease()
    clientWebsocket.close()
    return
  }

  let closed = false
  let upstreamOpen = false
  let currentTurnSamples = 0
  let lastLeaseRefreshAt = 0
  const pendingClient: ReturnType<typeof parseThinClientMessage>[] = []
  const pendingBilling: Array<{
    requestId: string
    samples: number
    startedAt: number
  }> = []

  const forwardToUpstream = (
    message: Exclude<ReturnType<typeof parseThinClientMessage>, { error: string }>,
  ) => {
    for (const event of thinClientToUpstream(message)) {
      upstream.send(JSON.stringify(event))
    }
  }

  const closeBoth = () => {
    if (closed) return
    closed = true
    releaseLease()
    try {
      if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
        upstream.close()
      }
    } catch {
      // Closing is best-effort.
    }
    try {
      if (clientWebsocket.readyState === WebSocket.OPEN) clientWebsocket.close()
    } catch {
      // Closing is best-effort.
    }
  }

  upstream.on('open', () => {
    upstreamOpen = true
    for (const item of pendingClient) {
      if ('error' in item) continue
      forwardToUpstream(item)
    }
    pendingClient.length = 0
  })

  upstream.on('message', (data) => {
    const raw = typeof data === 'string' ? data : data.toString('utf8')
    const thin = upstreamToThinServer(raw)
    if (!thin) return
    if (thin.type === 'error') {
      send(thin)
      if (thin.code === 'TRANSCRIPTION_FAILED') {
        const failed = pendingBilling.shift()
        if (failed) {
          recordTelemetryLater(auth, {
            requestId: failed.requestId,
            eventType: 'stt_realtime_turn',
            provider: 'dashscope',
            model: config.model,
            status: 'error',
            durationMs: Date.now() - failed.startedAt,
            errorCode: thin.code,
          })
        }
        return
      }
      for (const billing of pendingBilling) {
        recordTelemetryLater(auth, {
          requestId: billing.requestId,
          eventType: 'stt_realtime_turn',
          provider: 'dashscope',
          model: config.model,
          status: 'error',
          durationMs: Date.now() - billing.startedAt,
          errorCode: thin.code ?? 'UPSTREAM_ERROR',
        })
      }
      pendingBilling.length = 0
      closeBoth()
      return
    }
    if (thin.type !== 'completed') {
      send(thin)
      return
    }
    const billing = pendingBilling.shift()
    if (!billing || !databaseConfigured()) {
      send(thin)
      return
    }
    void (async () => {
      try {
        const deduction = await deductCompletedTurn({
          userId: auth.userId,
          audioSeconds: billing.samples / SAMPLE_RATE,
          requestId: billing.requestId,
          conversationSessionId,
        })
        send(thin)
        recordTelemetryLater(auth, {
          requestId: billing.requestId,
          eventType: 'stt_realtime_turn',
          provider: 'dashscope',
          model: config.model,
          status: 'ok',
          durationMs: Date.now() - billing.startedAt,
          billedAudioSeconds: deduction.billedSeconds,
          metadata: {
            deductedSeconds: deduction.deductedSeconds,
            overdrawSeconds: deduction.overdrawSeconds,
          },
        })
        if (deduction.exhausted) {
          await grantFinalAiAllowance(auth.userId, conversationSessionId)
          send({ type: 'quota_exhausted', quota: await quotaSummary(auth.userId) })
        }
      } catch (cause) {
        // Transcript is still delivered so the client can finish this turn and
        // produce its final suggestions; the socket then closes fail-safe.
        send(thin)
        send({ type: 'error', code: 'BILLING_UNAVAILABLE', message: '额度服务暂时不可用' })
        recordTelemetryLater(auth, {
          requestId: billing.requestId,
          eventType: 'stt_realtime_turn',
          provider: 'dashscope',
          model: config.model,
          status: 'error',
          durationMs: Date.now() - billing.startedAt,
          errorCode: cause instanceof Error ? cause.name : 'BILLING_ERROR',
        })
        closeBoth()
      }
    })()
  })

  upstream.on('error', (error) => {
    send({ type: 'error', code: 'UPSTREAM_ERROR', message: error.message })
    for (const billing of pendingBilling) {
      recordTelemetryLater(auth, {
        requestId: billing.requestId,
        eventType: 'stt_realtime_turn',
        provider: 'dashscope',
        model: config.model,
        status: 'error',
        durationMs: Date.now() - billing.startedAt,
        errorCode: 'UPSTREAM_ERROR',
      })
    }
    pendingBilling.length = 0
    closeBoth()
  })

  upstream.on('close', () => {
    for (const billing of pendingBilling) {
      recordTelemetryLater(auth, {
        requestId: billing.requestId,
        eventType: 'stt_realtime_turn',
        provider: 'dashscope',
        model: config.model,
        status: 'error',
        durationMs: Date.now() - billing.startedAt,
        errorCode: 'UPSTREAM_CLOSED',
      })
    }
    pendingBilling.length = 0
    closeBoth()
  })

  clientWebsocket.on('message', (data) => {
    const raw = typeof data === 'string' ? data : data.toString('utf8')
    const parsed = parseThinClientMessage(raw)
    if ('error' in parsed) {
      send({ type: 'error', code: 'INVALID_CLIENT_MESSAGE', message: parsed.error })
      return
    }
    const message =
      parsed.type === 'session.start' && !parsed.language && language
        ? { ...parsed, language }
        : parsed
    if (message.type === 'append') {
      const audioBytes = Buffer.from(message.audio, 'base64').byteLength
      const samples = audioBytes / 2
      if (
        audioBytes === 0
        || !Number.isInteger(samples)
        || currentTurnSamples + samples > SAMPLE_RATE * MAX_TURN_OVERDRAW_SECONDS
      ) {
        send({
          type: 'error',
          code: 'TURN_AUDIO_LIMIT',
          message: `单轮音频不能超过 ${MAX_TURN_OVERDRAW_SECONDS} 秒`,
        })
        closeBoth()
        return
      }
      currentTurnSamples += samples
      if (databaseConfigured() && Date.now() - lastLeaseRefreshAt > 20_000) {
        lastLeaseRefreshAt = Date.now()
        void refreshActiveAiSession({
          userId: auth.userId,
          deviceSessionId: auth.deviceSessionId,
          conversationSessionId,
        }).catch(() => {})
      }
    } else if (message.type === 'commit') {
      if (currentTurnSamples > 0) {
        pendingBilling.push({
          requestId: randomUUID(),
          samples: currentTurnSamples,
          startedAt: Date.now(),
        })
      }
      currentTurnSamples = 0
    }
    if (!upstreamOpen) {
      pendingClient.push(message)
      return
    }
    forwardToUpstream(message)
  })

  clientWebsocket.on('close', () => {
    if (upstream.readyState === WebSocket.OPEN) {
      try {
        for (const event of thinClientToUpstream({ type: 'finish' })) {
          upstream.send(JSON.stringify(event))
        }
      } catch {
        // Upstream may already be gone.
      }
    }
    setTimeout(closeBoth, 500)
  })

  clientWebsocket.on('error', closeBoth)
}
