import { env } from '@huggingface/transformers'

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
 * each must call this itself. `apps/web` never calls this and keeps talking
 * to the real Hub through the browser cache.
 */
export function useBundledModels(): void {
  env.allowRemoteModels = true
  env.remoteHost = BUNDLED_MODELS_HOST
  env.remotePathTemplate = '{model}/'
  env.useBrowserCache = false
}
