import { env } from '@huggingface/transformers'

export const WAVLM_MODEL_ID = 'Xenova/wavlm-base-plus-sv'
export const WAVLM_MODEL_REVISION = 'e61029603001bd11295c36d878698708bf59190f'
let fallbackOrigin: string | undefined
let activeSource: 'bundled' | 'huggingface' | 'vps' = 'huggingface'

/**
 * Scheme `apps/desktop` registers in its main process (see
 * `apps/desktop/src/main/model-protocol.ts`) to serve model files that were
 * downloaded ahead of time by `apps/desktop/scripts/download-models.ts` and
 * bundled into the installer via `extraResources`.
 */
export const BUNDLED_MODELS_HOST = 'kibotalk-model://app/'

/**
 * Points this JS realm's transformers.js instance at desktop's bundled model
 * files instead of the real Hugging Face Hub, so `from_pretrained` never
 * touches the network. Every realm that loads a model directly has its own
 * `env` (Silero VAD runs on the main thread; the speaker-embedding model
 * runs in a Web Worker — see `configureModelSource` for the worker side), so
 * each must call this itself. `apps/web` instead calls
 * `useHuggingFaceModels` and caches the revision-pinned Q8 files from the
 * public Hugging Face Hub.
 */
export function useBundledModels(): void {
  fallbackOrigin = undefined
  activeSource = 'bundled'
  env.allowRemoteModels = true
  env.remoteHost = BUNDLED_MODELS_HOST
  env.remotePathTemplate = '{model}/'
  env.useBrowserCache = false
}

function useVpsModels(origin: string): void {
  activeSource = 'vps'
  env.allowLocalModels = false
  env.allowRemoteModels = true
  env.remoteHost = `${origin.replace(/\/$/, '')}/models/`
  env.remotePathTemplate = '{model}/'
  env.useBrowserCache = true
}

/**
 * Uses immutable Hugging Face revisions first. Web callers provide their
 * production origin so a failed Hub load can retry against the VPS mirror.
 */
export function useHuggingFaceModels(vpsFallbackOrigin?: string): void {
  fallbackOrigin = vpsFallbackOrigin
  activeSource = 'huggingface'
  env.allowLocalModels = false
  env.allowRemoteModels = true
  env.remoteHost = 'https://huggingface.co/'
  env.remotePathTemplate = '{model}/resolve/{revision}/'
  env.useBrowserCache = true
}

/** Retries one failed Hugging Face model load against the same-origin VPS mirror. */
export async function loadModelWithFallback<T>(load: () => Promise<T>): Promise<T> {
  const startedOnHuggingFace = activeSource === 'huggingface'
  try {
    return await load()
  } catch (huggingFaceError) {
    if (!startedOnHuggingFace || !fallbackOrigin) throw huggingFaceError
    useVpsModels(fallbackOrigin)
    try {
      return await load()
    } catch (vpsError) {
      throw new AggregateError(
        [huggingFaceError, vpsError],
        'Model loading failed from Hugging Face and the VPS mirror',
      )
    }
  }
}
