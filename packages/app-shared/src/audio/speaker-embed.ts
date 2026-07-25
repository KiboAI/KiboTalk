import type { EmbedAudio } from '@kibotalk/speaker'

/**
 * Create an `embedAudio` function (for `EmbeddingSpeakerVerifier`) backed by a
 * Web Worker running wavlm-base-plus-sv. Each call posts the PCM chunk to the
 * worker and awaits the returned embedding. The chunk is copied (not
 * transferred) so the same PCM can still be sent to /stt by the pipeline.
 *
 * The worker is a module-level singleton — enrollment, the live session, and
 * `preloadSpeakerModel` all share the one loaded model instead of each
 * spinning up (and re-downloading into) their own.
 */

type ModelSourceConfig = { bundled: boolean; fallbackOrigin?: string }
type OutgoingMessage =
  | { kind: 'embed'; id: number; pcm: Float32Array }
  | { kind: 'preload' }
  | ({ kind: 'configure' } & ModelSourceConfig)
type IncomingMessage =
  | { kind: 'embed'; id: number; embedding?: Float32Array; error?: string }
  | { kind: 'preload-progress'; fraction: number }
  | { kind: 'preload-done' }
  | { kind: 'preload-error'; error: string }

let worker: Worker | null = null
let nextId = 0
const pendingEmbeds = new Map<number, { resolve: (v: Float32Array) => void; reject: (e: Error) => void }>()
const preloadProgressListeners = new Set<(fraction: number) => void>()
let preloadPromise: Promise<void> | null = null
let preloadSettlers: { resolve: () => void; reject: (e: Error) => void } | null = null

/** Set by desktop's `configureModelSource` before the worker is first created — see there. */
let modelSource: ModelSourceConfig | null = null

function getWorker(): Worker {
  if (worker) return worker

  worker = new Worker(new URL('./speaker-worker.ts', import.meta.url), { type: 'module' })
  if (modelSource) {
    worker.postMessage({ kind: 'configure', ...modelSource } satisfies OutgoingMessage)
  }
  worker.onmessage = (e: MessageEvent<IncomingMessage>) => {
    const data = e.data
    switch (data.kind) {
      case 'embed': {
        const pending = pendingEmbeds.get(data.id)
        if (!pending) return
        pendingEmbeds.delete(data.id)
        if (data.error) pending.reject(new Error(data.error))
        else pending.resolve(new Float32Array(data.embedding ?? new Float32Array(0)))
        return
      }
      case 'preload-progress':
        for (const listener of preloadProgressListeners) listener(data.fraction)
        return
      case 'preload-done':
        preloadSettlers?.resolve()
        preloadSettlers = null
        return
      case 'preload-error':
        preloadSettlers?.reject(new Error(data.error))
        preloadSettlers = null
        return
    }
  }
  worker.onerror = (e) => {
    for (const pending of pendingEmbeds.values()) pending.reject(new Error(e.message || 'worker error'))
    pendingEmbeds.clear()
    preloadSettlers?.reject(new Error(e.message || 'worker error'))
    preloadSettlers = null
  }
  return worker
}

const embedAudio: EmbedAudio = async (pcm) => {
  const id = nextId++
  return new Promise<Float32Array>((resolve, reject) => {
    pendingEmbeds.set(id, { resolve, reject })
    getWorker().postMessage({ kind: 'embed', id, pcm } satisfies OutgoingMessage)
  })
}

export function createWorkerEmbedAudio(): EmbedAudio {
  getWorker()
  return embedAudio
}

/**
 * Switches the speaker-embedding worker to desktop's bundled model files
 * (see `model-source.ts`'s `useBundledModels`, which the worker applies to
 * its own realm on receiving the `configure` message this schedules). Call
 * before the first `createWorkerEmbedAudio`/`preloadSpeakerModel` use — a
 * no-op for `apps/web`, which never calls this.
 */
export function configureModelSource(options: ModelSourceConfig): void {
  modelSource = options
  if (worker) {
    worker.postMessage({ kind: 'configure', ...options } satisfies OutgoingMessage)
  }
}

/** Warms the shared worker's model cache ahead of real use — see `packages/app-shared/src/model-preload.ts`. */
export function preloadSpeakerModel(onProgress?: (fraction: number) => void): Promise<void> {
  if (onProgress) preloadProgressListeners.add(onProgress)
  if (preloadPromise) return preloadPromise

  preloadPromise = new Promise<void>((resolve, reject) => {
    preloadSettlers = { resolve, reject }
    getWorker().postMessage({ kind: 'preload' } satisfies OutgoingMessage)
  })
  return preloadPromise
}
