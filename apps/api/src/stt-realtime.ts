/**
 * WebSocket relay: browser thin protocol ↔ DashScope Qwen realtime upstream.
 * Attached via HTTP upgrade in index.ts (not a Hono route — node-server 1.x
 * has no upgradeWebSocket helper).
 */
import { WebSocket, WebSocketServer } from 'ws'
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

const PATH = '/stt-realtime'

export function attachSttRealtimeUpgrade(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req, socket, head) => {
    const host = req.headers.host ?? 'localhost'
    const url = new URL(req.url ?? '/', `http://${host}`)
    if (url.pathname !== PATH) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket as Duplex, head, (ws) => {
      wss.emit('connection', ws, req)
    })
  })

  wss.on('connection', (clientWs, req) => {
    void handleConnection(clientWs, req)
  })

  return wss
}

async function handleConnection(clientWs: WebSocket, req: IncomingMessage): Promise<void> {
  const host = req.headers.host ?? 'localhost'
  const url = new URL(req.url ?? '/', `http://${host}`)
  const provider = url.searchParams.get('provider') ?? 'dashscope-realtime'
  const language = url.searchParams.get('language') ?? undefined

  const send = (msg: unknown) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(msg))
    }
  }

  if (provider !== 'dashscope-realtime') {
    send({ type: 'error', message: `Unsupported realtime provider: ${provider}` })
    clientWs.close()
    return
  }

  let config
  try {
    config = dashscopeRealtimeConfigFromEnv(process.env)
  } catch (e) {
    send({ type: 'error', message: (e as Error).message })
    clientWs.close()
    return
  }

  const upstreamUrl = dashscopeRealtimeUpstreamUrl(config)
  let upstream: WebSocket
  try {
    upstream = new WebSocket(upstreamUrl, {
      headers: Object.fromEntries(
        dashscopeRealtimeHeaders(config.apiKey).map((h) => {
          const i = h.indexOf(':')
          return [h.slice(0, i).trim(), h.slice(i + 1).trim()] as const
        }),
      ),
    })
  } catch (e) {
    send({ type: 'error', message: (e as Error).message })
    clientWs.close()
    return
  }

  let closed = false
  let upstreamOpen = false
  const pendingClient: ReturnType<typeof parseThinClientMessage>[] = []

  const forwardToUpstream = (msg: Exclude<ReturnType<typeof parseThinClientMessage>, { error: string }>) => {
    for (const ev of thinClientToUpstream(msg)) {
      upstream.send(JSON.stringify(ev))
    }
  }

  const closeBoth = () => {
    if (closed) return
    closed = true
    try {
      if (upstream.readyState === WebSocket.OPEN || upstream.readyState === WebSocket.CONNECTING) {
        upstream.close()
      }
    } catch {
      /* ignore */
    }
    try {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close()
    } catch {
      /* ignore */
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
    if (thin) send(thin)
  })

  upstream.on('error', (err) => {
    send({ type: 'error', message: err.message })
    closeBoth()
  })

  upstream.on('close', () => {
    closeBoth()
  })

  clientWs.on('message', (data) => {
    const raw = typeof data === 'string' ? data : data.toString('utf8')
    const parsed = parseThinClientMessage(raw)
    if ('error' in parsed) {
      send({ type: 'error', message: parsed.error })
      return
    }
    const msg =
      parsed.type === 'session.start' && !parsed.language && language
        ? { ...parsed, language }
        : parsed
    if (!upstreamOpen) {
      pendingClient.push(msg)
      return
    }
    forwardToUpstream(msg)
  })

  clientWs.on('close', () => {
    if (upstream.readyState === WebSocket.OPEN) {
      try {
        for (const ev of thinClientToUpstream({ type: 'finish' })) {
          upstream.send(JSON.stringify(ev))
        }
      } catch {
        /* ignore */
      }
    }
    // Give upstream a moment to finish, then force-close.
    setTimeout(closeBoth, 500)
  })

  clientWs.on('error', () => {
    closeBoth()
  })
}
