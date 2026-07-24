export { AudioSource } from './audio/audio-source'
export { createSileroInfer, SILERO_VARIANTS } from './audio/silero-vad'
export type { SileroVariant } from './audio/silero-vad'
export { createWorkerEmbedAudio, configureModelSource } from './audio/speaker-embed'
export { useBundledModels } from './audio/model-source'

export { startModelPreload, useModelPreloadStatus } from './model-preload'
export type { ModelLoadState, ModelPreloadStatus } from './model-preload'

export { parseSseStream } from './sse'
export type { SseMessage } from './sse'
export { extractCandidates, extractCompleteObjects } from './partial-json'
export {
  sttUrl,
  defaultSttProvider,
  defaultRealtimeFirstProvider,
  providerMode,
  fetchSttProviders,
} from './stt-providers'
export type { SttProvider } from './stt-providers'
export { connectRealtimeStt, connectRealtimeSttWithRetry } from './realtime-stt-client'
export type { RealtimeSttClient, RealtimeSttHandlers } from './realtime-stt-client'
export { ProxySttClient, ProxyLlmClient } from './proxy-clients'
export type { SessionLanguageSnapshot } from './proxy-clients'

export {
  defaultAppConfig,
  defaultLanguagePrefs,
  defaultLevelByLang,
  PASSPHRASE_BY_LANG,
  APP_LANGUAGE_OPTIONS,
  LEARNER_LEVEL_OPTIONS,
} from './config'
export type { AppConfig } from './config'

export { loadLanguagePrefs, persistLanguagePrefs } from './language-prefs'
export type { LanguagePrefs } from './language-prefs'

export { useConversationSession } from './session/use-conversation-session'
export type {
  ConversationSessionParams,
  SessionTurn,
  SessionDraft,
  CandidateRound,
} from './session/use-conversation-session'
export { useProductSession } from './session/use-product-session'
export type { ProductSessionParams } from './session/use-product-session'
