/**
 * Thin client ↔ proxy protocol for realtime STT (ADR 0004), plus mapping to
 * DashScope Qwen-ASR-Realtime upstream events. Used by apps/api only.
 */

export type ThinClientMessage =
  | { type: 'session.start'; language?: string }
  | { type: 'append'; audio: string }
  | { type: 'commit' }
  | { type: 'finish' }

export type ThinServerMessage =
  | { type: 'ready' }
  | { type: 'partial'; text: string }
  | { type: 'completed'; text: string }
  | { type: 'error'; message: string }

export type DashscopeRealtimeConfig = {
  wsUrl: string
  apiKey: string
  model: string
  language?: string
}

const DEFAULT_REALTIME_MODEL = 'qwen3-asr-flash-realtime'

/** Env → upstream connect args. Reuses STT_DASHSCOPE_API_KEY with WS_URL. */
export function dashscopeRealtimeConfigFromEnv(
  env: Record<string, string | undefined>,
): DashscopeRealtimeConfig {
  const apiKey = env.STT_DASHSCOPE_API_KEY
  const wsUrl = env.STT_DASHSCOPE_WS_URL
  const model = env.STT_DASHSCOPE_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL
  if (!apiKey || !wsUrl) {
    throw new Error(
      'Missing DashScope realtime config: need STT_DASHSCOPE_API_KEY and STT_DASHSCOPE_WS_URL',
    )
  }
  return { wsUrl, apiKey, model }
}

export function isDashscopeRealtimeConfigured(
  env: Record<string, string | undefined>,
): boolean {
  return Boolean(env.STT_DASHSCOPE_API_KEY && env.STT_DASHSCOPE_WS_URL)
}

export function dashscopeRealtimeModel(
  env: Record<string, string | undefined>,
): string {
  return env.STT_DASHSCOPE_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL
}

/** Build upstream WSS URL with model query param. */
export function dashscopeRealtimeUpstreamUrl(config: DashscopeRealtimeConfig): string {
  const url = new URL(config.wsUrl)
  url.searchParams.set('model', config.model)
  return url.toString()
}

export function dashscopeRealtimeHeaders(apiKey: string): string[] {
  return [`Authorization: Bearer ${apiKey}`, 'OpenAI-Beta: realtime=v1']
}

let eventCounter = 0
function nextEventId(): string {
  eventCounter += 1
  return `evt_${Date.now()}_${eventCounter}`
}

/** Manual-mode session.update (turn_detection null — local TurnGate owns boundaries). */
export function buildSessionUpdateEvent(language?: string): Record<string, unknown> {
  const transcription: Record<string, unknown> = {}
  if (language) transcription.language = language
  return {
    event_id: nextEventId(),
    type: 'session.update',
    session: {
      input_audio_format: 'pcm',
      sample_rate: 16000,
      input_audio_transcription: Object.keys(transcription).length > 0 ? transcription : null,
      turn_detection: null,
    },
  }
}

export function buildAppendEvent(audioBase64: string): Record<string, unknown> {
  return {
    event_id: nextEventId(),
    type: 'input_audio_buffer.append',
    audio: audioBase64,
  }
}

export function buildCommitEvent(): Record<string, unknown> {
  return {
    event_id: nextEventId(),
    type: 'input_audio_buffer.commit',
  }
}

export function buildSessionFinishEvent(): Record<string, unknown> {
  return {
    event_id: nextEventId(),
    type: 'session.finish',
  }
}

/**
 * Map a thin client message to zero or more upstream JSON payloads.
 * `session.start` → session.update; append/commit/finish map 1:1.
 */
export function thinClientToUpstream(
  msg: ThinClientMessage,
): Record<string, unknown>[] {
  switch (msg.type) {
    case 'session.start':
      return [buildSessionUpdateEvent(msg.language)]
    case 'append':
      return [buildAppendEvent(msg.audio)]
    case 'commit':
      return [buildCommitEvent()]
    case 'finish':
      return [buildSessionFinishEvent()]
    default: {
      const _exhaustive: never = msg
      void _exhaustive
      return []
    }
  }
}

/**
 * Map an upstream server event JSON string to a thin server message, or null
 * if the event is ignorable (keepalive, speech_started, etc.).
 */
export function upstreamToThinServer(raw: string): ThinServerMessage | null {
  let data: {
    type?: string
    transcript?: string
    text?: string
    stash?: string
    error?: { message?: string }
  }
  try {
    data = JSON.parse(raw) as typeof data
  } catch {
    return { type: 'error', message: 'Invalid upstream JSON' }
  }

  const type = data.type ?? ''
  switch (type) {
    case 'session.created':
    case 'session.updated':
      return { type: 'ready' }
    case 'conversation.item.input_audio_transcription.text':
    case 'conversation.item.input_audio_transcription.delta': {
      // DashScope `.text` events: display = confirmed `text` + draft `stash`.
      // Early partials often have text:"" and stash:"…"; reading only `text` yields empty UI.
      const fromDelta = data.transcript ?? ''
      const fromTextStash = `${data.text ?? ''}${data.stash ?? ''}`
      const text = fromDelta || fromTextStash
      return { type: 'partial', text }
    }
    case 'conversation.item.input_audio_transcription.completed': {
      const text = data.transcript ?? data.text ?? ''
      return { type: 'completed', text }
    }
    case 'conversation.item.input_audio_transcription.failed':
    case 'error':
      return {
        type: 'error',
        message: data.error?.message ?? data.text ?? type,
      }
    case 'session.finished':
    case 'input_audio_buffer.committed':
    case 'input_audio_buffer.speech_started':
    case 'input_audio_buffer.speech_stopped':
    case 'conversation.item.created':
      return null
    default:
      return null
  }
}

export function parseThinClientMessage(raw: string): ThinClientMessage | { error: string } {
  let data: { type?: string; language?: string; audio?: string }
  try {
    data = JSON.parse(raw) as typeof data
  } catch {
    return { error: 'Invalid JSON' }
  }
  switch (data.type) {
    case 'session.start':
      return { type: 'session.start', language: data.language }
    case 'append':
      if (typeof data.audio !== 'string') return { error: 'append requires audio' }
      return { type: 'append', audio: data.audio }
    case 'commit':
      return { type: 'commit' }
    case 'finish':
      return { type: 'finish' }
    default:
      return { error: `Unknown client message type: ${data.type ?? ''}` }
  }
}
