/**
 * Browser client for thin-protocol realtime STT (WS /stt-realtime).
 * Speaks only the thin JSON protocol — never DashScope upstream events.
 */
import type { QuotaSummary } from './account'
import { websocketApiUrl } from './api-runtime'

export type RealtimeSttHandlers = {
  onPartial?: (text: string) => void
  onCompleted?: (text: string) => void
  onError?: (message: string) => void
  onReady?: () => void
  onClose?: () => void
  onQuotaExhausted?: (quota?: QuotaSummary) => void
}

export type RealtimeSttClient = {
  append(pcm: Float32Array): void
  commit(): void
  finish(): void
  close(): void
  /** Resolves with the next completed transcript (or rejects on error/close). */
  waitCompleted(timeoutMs?: number): Promise<string>
}

function floatToPcm16Base64(pcm: Float32Array): string {
  const bytes = new Uint8Array(pcm.length * 2)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]))
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length))
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary)
}

/** Max PCM samples per append (~100 ms @ 16 kHz). Upstream WS max frame is 256 KiB. */
const APPEND_MAX_SAMPLES = 1600

async function sttRealtimeUrl(
  provider: string,
  language?: string,
  sessionId?: string,
): Promise<string> {
  const params = new URLSearchParams({ provider })
  if (language) params.set('language', language)
  if (sessionId) params.set('sessionId', sessionId)
  return websocketApiUrl('/api/stt-realtime', params)
}

export function connectRealtimeStt(opts: {
  provider: string
  language?: string
  sessionId?: string
  handlers?: RealtimeSttHandlers
}): Promise<RealtimeSttClient> {
  const { provider, language, sessionId, handlers = {} } = opts

  return sttRealtimeUrl(provider, language, sessionId).then((url) => new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    let settled = false
    let completedWaiters: Array<{
      resolve: (text: string) => void
      reject: (err: Error) => void
    }> = []

    const failWaiters = (err: Error) => {
      const waiters = completedWaiters
      completedWaiters = []
      for (const w of waiters) w.reject(err)
    }

    const send = (msg: unknown) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
    }

    ws.onopen = () => {
      send({ type: 'session.start', language })
    }

    ws.onmessage = (ev) => {
      let data: { type?: string; text?: string; message?: string; quota?: QuotaSummary }
      try {
        data = JSON.parse(String(ev.data)) as typeof data
      } catch {
        handlers.onError?.('Invalid server JSON')
        return
      }
      switch (data.type) {
        case 'ready':
          handlers.onReady?.()
          if (!settled) {
            settled = true
            resolve(client)
          }
          break
        case 'partial':
          handlers.onPartial?.(data.text ?? '')
          break
        case 'completed': {
          const text = data.text ?? ''
          handlers.onCompleted?.(text)
          const waiters = completedWaiters
          completedWaiters = []
          for (const w of waiters) w.resolve(text)
          break
        }
        case 'error':
          handlers.onError?.(data.message ?? 'realtime error')
          failWaiters(new Error(data.message ?? 'realtime error'))
          break
        case 'quota_exhausted':
          handlers.onQuotaExhausted?.(data.quota)
          break
        default:
          break
      }
    }

    ws.onerror = () => {
      const err = new Error('WebSocket error')
      handlers.onError?.(err.message)
      failWaiters(err)
      if (!settled) {
        settled = true
        reject(err)
      }
    }

    ws.onclose = () => {
      handlers.onClose?.()
      failWaiters(new Error('WebSocket closed'))
      if (!settled) {
        settled = true
        reject(new Error('WebSocket closed before ready'))
      }
    }

    const client: RealtimeSttClient = {
      append(pcm) {
        for (let off = 0; off < pcm.length; off += APPEND_MAX_SAMPLES) {
          const slice = pcm.subarray(off, Math.min(off + APPEND_MAX_SAMPLES, pcm.length))
          send({ type: 'append', audio: floatToPcm16Base64(slice) })
        }
      },
      commit() {
        send({ type: 'commit' })
      },
      finish() {
        send({ type: 'finish' })
      },
      close() {
        try {
          if (ws.readyState === WebSocket.OPEN) send({ type: 'finish' })
        } catch {
          /* ignore */
        }
        ws.close()
      },
      waitCompleted(timeoutMs = 15000) {
        return new Promise((res, rej) => {
          const timer = setTimeout(() => {
            completedWaiters = completedWaiters.filter((w) => w.resolve !== res)
            rej(new Error('waitCompleted timeout'))
          }, timeoutMs)
          completedWaiters.push({
            resolve: (text) => {
              clearTimeout(timer)
              res(text)
            },
            reject: (err) => {
              clearTimeout(timer)
              rej(err)
            },
          })
        })
      },
    }

    // Only resolve on server `ready` (session.created/updated). Reject if too slow.
    setTimeout(() => {
      if (!settled) {
        settled = true
        reject(new Error('realtime ready timeout'))
      }
    }, 15000)
  }))
}

/** Try connect with short reconnect budget (R4). */
export async function connectRealtimeSttWithRetry(opts: {
  provider: string
  language?: string
  sessionId?: string
  handlers?: RealtimeSttHandlers
  attempts?: number
}): Promise<RealtimeSttClient> {
  const attempts = opts.attempts ?? 3
  let lastErr: Error | null = null
  for (let i = 0; i < attempts; i++) {
    try {
      return await connectRealtimeStt(opts)
    } catch (e) {
      lastErr = e as Error
      await new Promise((r) => setTimeout(r, 400 * (i + 1)))
    }
  }
  throw lastErr ?? new Error('realtime connect failed')
}
