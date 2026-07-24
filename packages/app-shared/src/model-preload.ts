import { useSyncExternalStore } from 'react'
import { preloadSileroModel, SILERO_VARIANTS } from './audio/silero-vad'
import { preloadSpeakerModel } from './audio/speaker-embed'
import { defaultAppConfig } from './config'

export type ModelLoadState = 'idle' | 'loading' | 'ready' | 'error'

export type ModelPreloadStatus = {
  wavlm: ModelLoadState
  vad: ModelLoadState
  /** Combined download progress across both models' files, 0–1, meaningful while either is `loading`. */
  progress: number
}

type Listener = (status: ModelPreloadStatus) => void

let status: ModelPreloadStatus = { wavlm: 'idle', vad: 'idle', progress: 0 }
let started = false
const listeners = new Set<Listener>()
const fractionByModel = new Map<'wavlm' | 'vad', number>()

function emit(): void {
  for (const listener of listeners) listener(status)
}

function patch(next: Partial<ModelPreloadStatus>): void {
  status = { ...status, ...next }
  emit()
}

function trackFraction(modelKey: 'wavlm' | 'vad', fraction: number): void {
  fractionByModel.set(modelKey, fraction)
  const fractions = [...fractionByModel.values()]
  patch({ progress: fractions.reduce((sum, f) => sum + f, 0) / fractions.length })
}

/**
 * Warms the browser's model cache for both product on-device models — WavLM
 * speaker embedding and the default Silero VAD variant — as early as
 * possible, so enrollment's and the live session's actual model calls
 * resolve from cache instead of the network. Idempotent: call it from every
 * page that could be shown first (onboarding for a fresh install, straight
 * to the session for a returning user with prefs already confirmed).
 */
export function startModelPreload(): void {
  if (started) return
  started = true

  patch({ wavlm: 'loading' })
  trackFraction('wavlm', 0)
  preloadSpeakerModel((fraction) => trackFraction('wavlm', fraction))
    .then(() => patch({ wavlm: 'ready' }))
    .catch(() => patch({ wavlm: 'error' }))

  const vadVariant = SILERO_VARIANTS.find((v) => v.id === defaultAppConfig.vadVariantId) ?? SILERO_VARIANTS[0]
  patch({ vad: 'loading' })
  trackFraction('vad', 0)
  preloadSileroModel(vadVariant, (fraction) => trackFraction('vad', fraction))
    .then(() => patch({ vad: 'ready' }))
    .catch(() => patch({ vad: 'error' }))
}

function getStatus(): ModelPreloadStatus {
  return status
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Live-subscribes to `startModelPreload`'s progress — for the onboarding/enrollment gating UI. */
export function useModelPreloadStatus(): ModelPreloadStatus {
  return useSyncExternalStore(subscribe, getStatus)
}
