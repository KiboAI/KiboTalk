import type {
  AppLanguage,
  LearnerLevel,
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
  speakerThreshold: 0.49,
}

export const defaultLanguagePrefs: {
  conversationLang: AppLanguage
  meaningLang: AppLanguage
  level: LearnerLevel
} = {
  conversationLang: 'ja',
  meaningLang: 'zh',
  level: 'beginner',
}

export type ProductTheme = 'system' | 'light' | 'dark'

export const defaultProductPrefs: {
  conversationLang: AppLanguage
  level: LearnerLevel
  languagesConfirmed: boolean
  theme: ProductTheme
  launchAtLogin: boolean
  audioSource: SessionAudioSource
  microphoneDeviceId: string
} = {
  conversationLang: 'ja',
  level: 'beginner',
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
  ja: 'こんにちは。今日もよろしくお願いします。最近は外国語の会話を練習しています。ゆっくり、はっきり、自分らしく話します。',
  en: 'Hello, it is nice to meet you. I am practicing conversations in another language. I will speak clearly, naturally, and at a comfortable pace.',
  zh: '你好，今天也请多多关照。我最近正在练习外语对话，会用自然、清楚、舒服的语速认真说话。',
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

export function isLearnerLevel(value: unknown): value is LearnerLevel {
  return LEARNER_LEVEL_OPTIONS.some((option) => option.value === value)
}
