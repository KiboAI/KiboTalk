export { AudioSource } from './audio/audio-source'
export type { AudioSourceOptions } from './audio/audio-source'
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
  defaultProductPrefs,
  defaultLevelByLang,
  PASSPHRASE_BY_LANG,
  APP_LANGUAGE_OPTIONS,
  LEARNER_LEVEL_OPTIONS,
  systemUiLanguage,
} from './config'
export type { AppConfig, ProductTheme } from './config'

export {
  createSessionSnapshot,
  loadLanguagePrefs,
  persistLanguagePrefs,
  subscribeLanguagePrefs,
} from './language-prefs'
export type { LanguagePrefs } from './language-prefs'
export {
  I18nProvider,
  languageLabel,
  levelLabel,
  localizedSessionFallbackTitle,
  useI18n,
} from './i18n'
export type { MessageKey } from './i18n'

export { useConversationSession } from './session/use-conversation-session'
export type {
  ProductSessionLifecycle,
  ConversationSessionParams,
  SessionTurn,
  SessionDraft,
  CandidateRound,
} from './session/use-conversation-session'
export { useProductSession } from './session/use-product-session'
export type {
  ProductSessionController,
  ProductSessionParams,
} from './session/use-product-session'
export {
  reviewConversationSession,
  resumePendingSessionReviews,
} from './session/review-session'
