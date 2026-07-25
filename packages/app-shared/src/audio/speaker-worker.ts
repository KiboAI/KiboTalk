/// <reference lib="webworker" />
import { AutoProcessor, AutoModel } from '@huggingface/transformers'
import { speakerEmbeddingFromModelOutput } from '@kibotalk/speaker'
import { createProgressAggregator } from './model-progress'
import {
  useBundledModels,
  useHuggingFaceModels,
  loadModelWithFallback,
  SPEAKER_MODEL_DTYPE,
  SPEAKER_MODEL_ID,
  SPEAKER_MODEL_REVISION,
} from './model-source'

/**
 * Speaker-embedding Web Worker. Loads the production WeSpeaker model (ONNX,
 * via Transformers.js) on first request and returns a speaker embedding for
 * each 16kHz mono PCM chunk posted to it. Runs off the main thread so embedding
 * inference never blocks the UI or the VAD/audio pipeline.
 *
 * Three message kinds share this one channel: `configure` (desktop only —
 * see `speaker-embed.ts`'s `configureModelSource`), `embed` (the real work),
 * and `preload` (warms the model cache ahead of time — see
 * `speaker-embed.ts`'s `preloadSpeakerModel`).
 */

type WorkerScope = DedicatedWorkerGlobalScope
const ctx: WorkerScope = self as unknown as WorkerScope

type IncomingMessage =
  | { kind: 'embed'; id: number; pcm: Float32Array }
  | { kind: 'preload' }
  | { kind: 'configure'; bundled: boolean; fallbackOrigin?: string }

let processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null
let model: Awaited<ReturnType<typeof AutoModel.from_pretrained>> | null = null
let loading: Promise<void> | null = null

async function ensureLoaded(onProgress?: (fraction: number) => void): Promise<void> {
  if (model && processor) return
  if (!loading) {
    const track = onProgress ? createProgressAggregator(onProgress) : undefined
    loading = loadModelWithFallback(async () => {
      processor = await AutoProcessor.from_pretrained(SPEAKER_MODEL_ID, {
        revision: SPEAKER_MODEL_REVISION,
        progress_callback: track,
      })
      model = await AutoModel.from_pretrained(SPEAKER_MODEL_ID, {
        dtype: SPEAKER_MODEL_DTYPE,
        revision: SPEAKER_MODEL_REVISION,
        progress_callback: track,
      })
    })
  }
  return loading
}

ctx.onmessage = async (event: MessageEvent<IncomingMessage>) => {
  const data = event.data

  if (data.kind === 'configure') {
    if (data.bundled) useBundledModels()
    else useHuggingFaceModels(data.fallbackOrigin)
    return
  }

  if (data.kind === 'preload') {
    try {
      await ensureLoaded((fraction) => ctx.postMessage({ kind: 'preload-progress', fraction }))
      ctx.postMessage({ kind: 'preload-done' })
    } catch (err) {
      ctx.postMessage({ kind: 'preload-error', error: err instanceof Error ? err.message : String(err) })
    }
    return
  }

  const { id, pcm } = data
  try {
    await ensureLoaded()
    const inputs = await processor!(pcm)
    const result = await model!(inputs)
    const embedding = speakerEmbeddingFromModelOutput(result)
    ctx.postMessage({ kind: 'embed', id, embedding })
  } catch (err) {
    ctx.postMessage({ kind: 'embed', id, error: err instanceof Error ? err.message : String(err) })
  }
}
