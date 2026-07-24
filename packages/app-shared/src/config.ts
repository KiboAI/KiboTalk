import type {
  AppLanguage,
  LearnerLevel,
  LevelByLang,
  SessionAudioSource,
  UiLanguage,
} from '@kibotalk/conversation'
import { defaultVadConfig } from '@kibotalk/audio/vad'
import { SILERO_VARIANTS } from './audio/silero-vad'

/**
 * Product-app defaults — the knobs the playground exposes as sliders/selects
 * for tuning are hardcoded here for `apps/web` and `apps/desktop`, which have
 * no dev-facing settings for them. Values match the playground's tuned
 * defaults (`apps/playground/src/config-store.ts`).
 */
export type AppConfig = {
  vad: {
    speechThreshold: number
    exitThreshold: number
    minSilenceDurationMs: number
    minSpeechDurationMs: number
  }
  vadVariantId: string
  /** ASR-send padding (VAD cuts stay tight; padding applied at ASR send). */
  asrPadMs: { pre: number; post: number }
  /** Segment-aggregator flush triggers (same-speaker accumulation → one turn). */
  aggregator: { pauseMs: number; maxMs: number }
  speakerThreshold: number
}

export const defaultAppConfig: AppConfig = {
  vad: {
    speechThreshold: defaultVadConfig.speechThreshold,
    exitThreshold: defaultVadConfig.exitThreshold,
    minSilenceDurationMs: defaultVadConfig.minSilenceDurationMs,
    minSpeechDurationMs: defaultVadConfig.minSpeechDurationMs,
  },
  vadVariantId: SILERO_VARIANTS[0].id,
  asrPadMs: { pre: 80, post: 80 },
  aggregator: { pauseMs: 500, maxMs: 30000 },
  speakerThreshold: 0.8,
}

export const defaultLevelByLang: LevelByLang = {
  ja: 'beginner',
  en: 'intermediate',
  zh: 'intermediate',
}

export const defaultLanguagePrefs: {
  conversationLang: AppLanguage
  meaningLang: AppLanguage
  levelByLang: LevelByLang
} = {
  conversationLang: 'ja',
  meaningLang: 'zh',
  levelByLang: defaultLevelByLang,
}

export type ProductTheme = 'system' | 'light' | 'dark'

export const defaultProductPrefs: {
  conversationLang: AppLanguage
  levelByLang: LevelByLang
  languagesConfirmed: boolean
  theme: ProductTheme
  launchAtLogin: boolean
  audioSource: SessionAudioSource
  microphoneDeviceId: string
} = {
  conversationLang: 'ja',
  levelByLang: defaultLevelByLang,
  languagesConfirmed: false,
  theme: 'system',
  launchAtLogin: false,
  audioSource: 'microphone',
  microphoneDeviceId: 'default',
}

export function systemUiLanguage(language = globalThis.navigator?.language ?? 'en'): UiLanguage {
  const normalized = language.toLowerCase()
  if (normalized.startsWith('zh')) return 'zh'
  if (normalized.startsWith('ja')) return 'ja'
  return 'en'
}

export const PASSPHRASE_BY_LANG: Record<AppLanguage, string> = {
  ja: 'こんにちは。今日もよろしくお願いします。',
  en: 'Hello. Nice to meet you. Please take care of me today.',
  zh: '你好，今天也请多多关照。',
}

export const APP_LANGUAGE_OPTIONS: Array<{ value: AppLanguage; label: string }> = [
  { value: 'ja', label: '日语' },
  { value: 'en', label: '英语' },
  { value: 'zh', label: '中文' },
]

export const LEARNER_LEVEL_OPTIONS: Array<{ value: LearnerLevel; label: string }> = [
  { value: 'beginner', label: '初级' },
  { value: 'intermediate', label: '中级' },
  { value: 'advanced', label: '高级' },
]
