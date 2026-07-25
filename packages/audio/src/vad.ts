import {
  IOAttributes,
  IOSpanNames,
  IOSubsystems,
  startSpan,
} from '@kibotalk/observability'

/**
 * Voice Activity Detection state machine (spec §2.4; config shape follows AIRI's
 * `createVAD`).
 *
 * The neural-net inference is injected (`infer` returns a speech probability for
 * a PCM chunk), so this module is provider-agnostic and testable in Node without
 * loading a model. The playground wires Silero VAD via
 * `@huggingface/transformers` into `infer`.
 *
 * Emits `speech-start`, `speech-end`, and `speech-ready` (with the segmented PCM
 * buffer + duration). Segments shorter than `minSpeechDurationMs` are dropped.
 * Also emits `prob` (the raw speech probability 0–1) after every inference, for
 * live visualization/tuning (mirrors AIRI's `debug` event).
 *
 * When IO tracing is leased, emits one VAD span per speech-ready segment
 * (startTime = speech-start). Short/skipped segments do not emit a span.
 */
export type VadConfig = {
  sampleRate: number
  /** Probability above this → considered speech (enter speech state). */
  speechThreshold: number
  /** Probability below this → considered silence (count toward exit). */
  exitThreshold: number
  /** Silence duration that ends a speech segment. */
  minSilenceDurationMs: number
  /** Padding kept before (and after) the speech segment. */
  speechPadMs: number
  /** Segments shorter than this are dropped. */
  minSpeechDurationMs: number
  /** Continuous speech is split at this duration so one billable turn stays bounded. */
  maxSpeechDurationMs: number
  /** Size of the chunks fed in (samples per `processAudio` call). */
  newBufferSize: number
}

export const defaultVadConfig: VadConfig = {
  sampleRate: 16000,
  speechThreshold: 0.5,
  exitThreshold: 0.3,
  /** Tight cut so speaker turns with short gaps don't merge into one blob. */
  minSilenceDurationMs: 200,
  speechPadMs: 80,
  minSpeechDurationMs: 200,
  maxSpeechDurationMs: 30000,
  newBufferSize: 512,
}

export type VadSpeechReady = { buffer: Float32Array; duration: number }

export type VadEvents = {
  'speech-start': void
  'speech-end': void
  'speech-ready': VadSpeechReady
  'status': { type: string; message: string }
  'prob': number
}

type EventName = keyof VadEvents
type Listener<K extends EventName> = (payload: VadEvents[K]) => void

export type VadInfer = (chunk: Float32Array) => Promise<number>

export interface VAD {
  /** Feed one PCM chunk; resolves once inference for this chunk has run. */
  processAudio(chunk: Float32Array): Promise<void>
  on<K extends EventName>(event: K, listener: Listener<K>): () => void
  updateConfig(patch: Partial<VadConfig>): void
  getConfig(): VadConfig
}

export function createVAD(infer: VadInfer, userConfig: Partial<VadConfig> = {}): VAD {
  const config: VadConfig = { ...defaultVadConfig, ...userConfig }
  const listeners = new Map<EventName, Set<Function>>()

  function on<K extends EventName>(event: K, listener: Listener<K>): () => void {
    let set = listeners.get(event)
    if (!set) {
      set = new Set()
      listeners.set(event, set)
    }
    set.add(listener as Function)
    return () => set!.delete(listener as Function)
  }
  function emit<K extends EventName>(event: K, payload: VadEvents[K]): void {
    for (const l of listeners.get(event) ?? []) (l as Listener<K>)(payload)
  }

  let inSpeech = false
  let silenceSamples = 0
  // Actual speech samples (excludes trailing silence), for the min-duration check.
  let speechSamples = 0
  // Rolling window of recent chunks, used to left-pad a speech segment.
  let prevBuffers: Float32Array[] = []
  // Chunks accumulated during the current speech segment (incl. trailing silence).
  let recording: Float32Array[] = []
  // Serialize inference so out-of-order chunk arrival can't race the state machine.
  let chain: Promise<void> = Promise.resolve()
  /** Wall-clock start of current speech segment (for IO tracer). */
  let speechStartPerf: number | null = null

  const maxPrevBuffers = () =>
    Math.ceil((config.speechPadMs * (config.sampleRate / 1000)) / config.newBufferSize)

  function concat(chunks: Float32Array[]): Float32Array {
    const total = chunks.reduce((n, c) => n + c.length, 0)
    const out = new Float32Array(total)
    let off = 0
    for (const c of chunks) {
      out.set(c, off)
      off += c.length
    }
    return out
  }

  function finishSpeechSegment(continueSpeech: boolean): void {
    const buffer = concat(recording)
    const completedSpeechSamples = speechSamples
    const speechMs = (completedSpeechSamples / config.sampleRate) * 1000
    const startPerf = speechStartPerf
    recording = []
    silenceSamples = 0
    speechSamples = 0
    speechStartPerf = null
    inSpeech = continueSpeech
    emit('speech-end', undefined)
    if (speechMs >= config.minSpeechDurationMs) {
      const durationSec = buffer.length / config.sampleRate
      if (startPerf != null) {
        const span = startSpan(IOSpanNames.VoiceActivity, {
          startTime: performance.timeOrigin + startPerf,
          attrs: {
            [IOAttributes.Subsystem]: IOSubsystems.VAD,
            [IOAttributes.VadDuration]: durationSec,
            [IOAttributes.VadSpeechSamples]: completedSpeechSamples,
          },
        })
        span.end()
      }
      emit('speech-ready', { buffer, duration: durationSec })
    } else {
      emit('status', { type: 'skip', message: `segment too short (${speechMs.toFixed(0)}ms)` })
    }
    if (continueSpeech) {
      speechStartPerf = performance.now()
      emit('speech-start', undefined)
    }
  }

  async function handleChunk(chunk: Float32Array): Promise<void> {
    // Roll the prev-buffer window (used as left padding on speech start).
    prevBuffers.push(chunk)
    while (prevBuffers.length > maxPrevBuffers()) prevBuffers.shift()

    const prob = await infer(chunk)
    emit('prob', prob)

    if (!inSpeech) {
      if (prob > config.speechThreshold) {
        inSpeech = true
        silenceSamples = 0
        speechSamples = chunk.length
        speechStartPerf = performance.now()
        // Left-pad with the audio immediately preceding the detected speech.
        recording = prevBuffers.length > 0 ? [...prevBuffers] : [chunk]
        emit('speech-start', undefined)
      }
      return
    }

    // In speech: accumulate every chunk (including trailing silence).
    recording.push(chunk)
    if (prob < config.exitThreshold) {
      silenceSamples += chunk.length
      const minSilenceSamples = config.minSilenceDurationMs * (config.sampleRate / 1000)
      if (silenceSamples >= minSilenceSamples) {
        finishSpeechSegment(false)
      }
    } else {
      silenceSamples = 0
      const maxSpeechSamples = config.maxSpeechDurationMs * (config.sampleRate / 1000)
      if (speechSamples + chunk.length > maxSpeechSamples) {
        recording.pop()
        finishSpeechSegment(true)
        recording.push(chunk)
        speechSamples = chunk.length
        return
      }
      speechSamples += chunk.length
    }
  }

  return {
    on,
    processAudio(chunk) {
      chain = chain
        .then(() => handleChunk(chunk))
        .catch((e) => emit('status', { type: 'error', message: String(e) }))
      return chain
    },
    updateConfig(patch) {
      Object.assign(config, patch)
    },
    getConfig() {
      return { ...config }
    },
  }
}
