import { relayFetch } from './api-runtime'
import {
  RealtimeSttError,
  type RealtimeSttClient,
  type RealtimeSttHandlers,
} from './realtime-stt-types'

const FRAME_BYTES = 1_280
const FRAME_INTERVAL_MS = 40
const KEEPALIVE_INTERVAL_MS = 10_000

type DirectSession = {
  requestId: string
  url: string
  frameBytes: number
  frameIntervalMs: number
}

type IflytekResultData = {
  seg_id?: number
  ls?: boolean
  normal?: boolean
  desc?: string
  sessionId?: string
  cn?: {
    st?: {
      type?: string
      rt?: Array<{
        ws?: Array<{
          cw?: Array<{ w?: string }>
        }>
      }>
    }
  }
}

export type IflytekServerEvent =
  | { type: 'ready'; sessionId: string }
  | {
      type: 'transcript'
      segmentId: number
      text: string
      final: boolean
      last: boolean
    }
  | { type: 'error'; code?: string; message: string }
  | { type: 'ignored' }

function resultData(value: unknown): IflytekResultData {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as IflytekResultData
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' ? value as IflytekResultData : {}
}

function transcriptText(data: IflytekResultData): string {
  return (data.cn?.st?.rt ?? [])
    .flatMap((item) => item.ws ?? [])
    .map((word) => word.cw?.[0]?.w ?? '')
    .join('')
}

export function parseIflytekServerEvent(raw: string): IflytekServerEvent {
  let message: {
    action?: string
    code?: string | number
    desc?: string
    msg_type?: string
    res_type?: string
    data?: unknown
  }
  try {
    message = JSON.parse(raw) as typeof message
  } catch {
    return { type: 'error', code: 'INVALID_UPSTREAM_JSON', message: '讯飞返回了无效数据' }
  }
  const data = resultData(message.data)
  if (
    message.action === 'error'
    || message.msg_type === 'error'
    || (message.code !== undefined && String(message.code) !== '0')
    || (message.res_type === 'frc' && data.normal === false)
  ) {
    return {
      type: 'error',
      code: message.code === undefined ? undefined : String(message.code),
      message: message.desc ?? data.desc ?? '讯飞实时转写失败',
    }
  }
  if (message.action === 'started' || message.msg_type === 'action') {
    return data.sessionId
      ? { type: 'ready', sessionId: data.sessionId }
      : { type: 'ignored' }
  }
  if (message.action === 'result' || (message.msg_type === 'result' && message.res_type === 'asr')) {
    return {
      type: 'transcript',
      segmentId: Number(data.seg_id ?? 0),
      text: transcriptText(data),
      final: data.cn?.st?.type === '0',
      last: data.ls === true,
    }
  }
  return { type: 'ignored' }
}

function floatToPcm16Bytes(pcm: Float32Array): Uint8Array {
  const bytes = new Uint8Array(pcm.length * 2)
  const view = new DataView(bytes.buffer)
  for (let index = 0; index < pcm.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, pcm[index]))
    view.setInt16(
      index * 2,
      sample < 0 ? sample * 0x8000 : sample * 0x7fff,
      true,
    )
  }
  return bytes
}

async function requestDirectSession(language?: string): Promise<DirectSession> {
  const path = language
    ? `/api/stt/direct/session?language=${encodeURIComponent(language)}`
    : '/api/stt/direct/session'
  const response = await relayFetch(path, { method: 'POST' })
  const body = (await response.json().catch(() => ({}))) as Partial<DirectSession> & {
    error?: string
    message?: string
  }
  if (
    !response.ok
    || typeof body.requestId !== 'string'
    || typeof body.url !== 'string'
  ) {
    throw new RealtimeSttError(
      body.message ?? body.error ?? `Direct STT session HTTP ${response.status}`,
      body.error,
    )
  }
  return {
    requestId: body.requestId,
    url: body.url,
    frameBytes: body.frameBytes ?? FRAME_BYTES,
    frameIntervalMs: body.frameIntervalMs ?? FRAME_INTERVAL_MS,
  }
}

async function reportDirectCompletion(
  requestId: string,
  samples: number,
  durationMs: number,
): Promise<{ exhausted: boolean }> {
  const response = await relayFetch('/api/stt/direct/complete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId, samples, durationMs }),
  })
  const body = (await response.json().catch(() => ({}))) as {
    exhausted?: boolean
    error?: string
  }
  if (!response.ok) {
    throw new RealtimeSttError(
      body.error ?? `Direct STT completion HTTP ${response.status}`,
      body.error,
    )
  }
  return { exhausted: body.exhausted === true }
}

async function cancelDirectSession(requestId: string): Promise<void> {
  await relayFetch('/api/stt/direct/cancel', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestId }),
  }).catch(() => undefined)
}

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: Error) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

type IflytekTurn = {
  readyPromise: Promise<void>
  completion: Promise<string>
  append: (pcm: Float32Array) => void
  commit: () => Promise<string>
  close: () => void
}

function createIflytekTurn(options: {
  previous: Promise<unknown>
  language?: string
  handlers: RealtimeSttHandlers
  eager: boolean
}): IflytekTurn {
  const readyDeferred = createDeferred<void>()
  const completionDeferred = createDeferred<string>()
  const chunks: Uint8Array[] = []
  const finalSegments = new Map<number, string>()
  let websocket: WebSocket | null = null
  let sessionId = ''
  let requestId = ''
  let queuedBytes = 0
  let frameBytes = FRAME_BYTES
  let frameIntervalMs = FRAME_INTERVAL_MS
  let sendTimer: ReturnType<typeof setTimeout> | null = null
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null
  let ready = false
  let openStarted = false
  let ending = false
  let settled = false
  let samples = 0
  let startedAt = Date.now()

  function clearTimers(): void {
    if (sendTimer) clearTimeout(sendTimer)
    if (keepaliveTimer) clearInterval(keepaliveTimer)
    sendTimer = null
    keepaliveTimer = null
  }

  function fail(cause: unknown): void {
    if (settled) return
    settled = true
    clearTimers()
    websocket?.close()
    const error = cause instanceof Error ? cause : new Error(String(cause))
    if (requestId) void cancelDirectSession(requestId)
    if (!ready) readyDeferred.reject(error)
    completionDeferred.reject(error)
  }

  async function complete(text: string): Promise<void> {
    if (settled) return
    settled = true
    clearTimers()
    websocket?.close()
    try {
      const usage = await reportDirectCompletion(
        requestId,
        samples,
        Date.now() - startedAt,
      )
      options.handlers.onCompleted?.(text)
      if (usage.exhausted) options.handlers.onQuotaExhausted?.()
      completionDeferred.resolve(text)
    } catch (cause) {
      completionDeferred.reject(
        cause instanceof Error ? cause : new Error(String(cause)),
      )
    }
  }

  function scheduleSend(delayMs: number): void {
    if (!ready || sendTimer || settled) return
    sendTimer = setTimeout(() => {
      sendTimer = null
      sendNextFrame()
    }, delayMs)
  }

  function takeQueuedFrame(targetBytes: number): Uint8Array {
    const frame = new Uint8Array(targetBytes)
    let offset = 0
    while (offset < targetBytes) {
      const chunk = chunks[0]!
      const size = Math.min(chunk.byteLength, targetBytes - offset)
      frame.set(chunk.subarray(0, size), offset)
      offset += size
      queuedBytes -= size
      if (size === chunk.byteLength) chunks.shift()
      else chunks[0] = chunk.subarray(size)
    }
    return frame
  }

  function sendNextFrame(): void {
    if (!ready || !websocket || websocket.readyState !== WebSocket.OPEN) return
    let targetBytes = 0
    if (queuedBytes >= frameBytes) targetBytes = frameBytes
    else if (ending) targetBytes = queuedBytes

    if (targetBytes > 0) {
      websocket.send(takeQueuedFrame(targetBytes))
      scheduleSend(frameIntervalMs)
      return
    }
    if (!ending) return
    websocket.send(JSON.stringify({
      end: true,
      ...(sessionId ? { sessionId } : {}),
    }))
    clearTimers()
  }

  function handleProviderMessage(message: MessageEvent): void {
    const event = parseIflytekServerEvent(String(message.data))
    switch (event.type) {
      case 'ready':
        sessionId = event.sessionId
        ready = true
        readyDeferred.resolve()
        keepaliveTimer = setInterval(() => {
          if (
            !ending
            && ready
            && websocket?.readyState === WebSocket.OPEN
            && queuedBytes === 0
          ) websocket.send(new Uint8Array(frameBytes))
        }, KEEPALIVE_INTERVAL_MS)
        scheduleSend(0)
        break
      case 'transcript': {
        if (event.final) finalSegments.set(event.segmentId, event.text)
        const stable = [...finalSegments.entries()]
          .sort(([left], [right]) => left - right)
          .map(([, text]) => text)
          .join('')
        options.handlers.onPartial?.(event.final ? stable : `${stable}${event.text}`)
        if (event.last) void complete(stable || event.text)
        break
      }
      case 'error':
        fail(new RealtimeSttError(event.message, event.code ?? 'TRANSCRIPTION_FAILED'))
        break
      case 'ignored':
        break
      default: {
        const exhaustive: never = event
        void exhaustive
      }
    }
  }

  async function open(): Promise<void> {
    if (settled) return
    let directSession: DirectSession
    try {
      directSession = await requestDirectSession(options.language)
    } catch (cause) {
      fail(cause)
      return
    }
    if (settled) return
    requestId = directSession.requestId
    frameBytes = directSession.frameBytes
    frameIntervalMs = directSession.frameIntervalMs
    startedAt = Date.now()
    websocket = new WebSocket(directSession.url)
    websocket.binaryType = 'arraybuffer'
    websocket.onmessage = handleProviderMessage
    websocket.onerror = () => fail(new RealtimeSttError('讯飞 WebSocket 连接失败'))
    websocket.onclose = () => {
      if (!settled) fail(new RealtimeSttError('讯飞 WebSocket 提前关闭'))
    }
  }

  function startOpen(): void {
    if (openStarted || settled) return
    openStarted = true
    void options.previous.catch(() => undefined).then(open)
  }

  function append(pcm: Float32Array): void {
    if (ending || settled) return
    startOpen()
    const bytes = floatToPcm16Bytes(pcm)
    samples += pcm.length
    chunks.push(bytes)
    queuedBytes += bytes.byteLength
    scheduleSend(0)
  }

  function commit(): Promise<string> {
    ending = true
    startOpen()
    scheduleSend(0)
    return completionDeferred.promise
  }

  function close(): void {
    if (settled) return
    settled = true
    clearTimers()
    websocket?.close()
    if (requestId) void cancelDirectSession(requestId)
    const error = new RealtimeSttError('WebSocket closed')
    if (!ready) readyDeferred.reject(error)
    completionDeferred.reject(error)
  }

  if (options.eager) startOpen()
  return {
    readyPromise: readyDeferred.promise,
    completion: completionDeferred.promise,
    append,
    commit,
    close,
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('waitCompleted timeout')), timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (cause) => {
        clearTimeout(timeout)
        reject(cause)
      },
    )
  })
}

export function connectIflytekRealtimeStt(options: {
  language?: string
  handlers?: RealtimeSttHandlers
}): Promise<RealtimeSttClient> {
  const handlers = options.handlers ?? {}
  const turns = new Set<IflytekTurn>()
  const completed: Promise<string>[] = []
  let previous: Promise<unknown> = Promise.resolve()
  let isFirstTurn = true
  let current = createTurn()
  let closed = false

  function createTurn(): IflytekTurn {
    const turn = createIflytekTurn({
      previous,
      language: options.language,
      handlers,
      eager: isFirstTurn,
    })
    isFirstTurn = false
    turns.add(turn)
    void turn.readyPromise.catch(() => undefined)
    void turn.completion.finally(() => turns.delete(turn)).catch(() => undefined)
    return turn
  }

  const client: RealtimeSttClient = {
    append(pcm) {
      if (!closed) current.append(pcm)
    },
    commit() {
      if (closed) return
      const completion = current.commit()
      completed.push(completion)
      previous = completion
      current = createTurn()
    },
    finish() {
      current.close()
    },
    close() {
      if (closed) return
      closed = true
      for (const turn of turns) turn.close()
      handlers.onClose?.()
    },
    waitCompleted(timeoutMs = 15_000) {
      const completion = completed.shift()
      return completion
        ? withTimeout(completion, timeoutMs)
        : Promise.reject(new Error('No committed realtime turn'))
    },
  }

  return current.readyPromise.then(() => {
    handlers.onReady?.()
    return client
  })
}
