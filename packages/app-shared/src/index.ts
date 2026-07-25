export { AudioSource } from './audio/audio-source'
export type { AudioSourceOptions } from './audio/audio-source'
export { createSileroInfer, SILERO_VARIANTS } from './audio/silero-vad'
export type { SileroVariant } from './audio/silero-vad'
export { createWorkerEmbedAudio, configureModelSource } from './audio/speaker-embed'
export {
  useBundledModels,
  useHuggingFaceModels,
  WAVLM_MODEL_ID,
  WAVLM_MODEL_REVISION,
} from './audio/model-source'

export { startModelPreload, useModelPreloadStatus } from './model-preload'
export type { ModelLoadState, ModelPreloadStatus } from './model-preload'
export { shouldShowSessionError } from './session/session-presentation'

export { parseSseStream } from './sse'
export type { SseMessage } from './sse'
export {
  apiUrl,
  authorizedFetch,
  clearAccountCache,
  clearAccessToken,
  isDesktopRuntime,
  readAccountCache,
  runtimeClientVersion,
  runtimeDeviceName,
  runtimePlatform,
  saveAccountCache,
  saveAccessToken,
  websocketApiUrl,
} from './api-runtime'
export {
  deleteCloudAccount,
  fetchAccountDevices,
  fetchCurrentAccount,
  logoutAccount,
  redeemCode,
  requestLoginCode,
  revokeAccountDevice,
  useAccount,
  verifyLoginCode,
} from './account'
export type { AccountDevice, AccountSession, QuotaSummary } from './account'
export {
  CloudConversationStorage,
  syncPreferences,
  useCloudConversationStorage,
  type CloudConversationStorageState,
} from './cloud-conversation-storage'
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
  PASSPHRASE_BY_LANG,
  APP_LANGUAGE_OPTIONS,
  isLearnerLevel,
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
