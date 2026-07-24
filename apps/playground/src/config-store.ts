import { create } from 'zustand'
import type { AppLanguage, LearnerLevel, LevelByLang } from '@kibotalk/conversation'
import { defaultVadConfig } from '@kibotalk/audio/vad'
import { SILERO_VARIANTS } from './audio/silero-vad'
import type { SttProvider } from './stt-providers'
import { defaultSttProvider } from './stt-providers'

export type TranscribeMode = 'perSegment' | 'aggregated'

/** Product preview surface: window app vs simulated floating Island+stickies. */
export type ProductSurfaceMode = 'window' | 'floating'

const LANGUAGE_PREFS_KEY = 'kibotalk.playground.languagePrefs'

export type LanguagePrefs = {
  conversationLang: AppLanguage
  meaningLang: AppLanguage
  levelByLang: LevelByLang
  languagesConfirmed: boolean
}

const defaultLanguagePrefs: LanguagePrefs = {
  conversationLang: 'ja',
  meaningLang: 'zh',
  levelByLang: {
    ja: 'beginner',
    en: 'intermediate',
    zh: 'intermediate',
  },
  languagesConfirmed: false,
}

function loadLanguagePrefs(): LanguagePrefs {
  if (typeof localStorage === 'undefined') {
    return { ...defaultLanguagePrefs, levelByLang: { ...defaultLanguagePrefs.levelByLang } }
  }
  try {
    const raw = localStorage.getItem(LANGUAGE_PREFS_KEY)
    if (!raw) return { ...defaultLanguagePrefs, levelByLang: { ...defaultLanguagePrefs.levelByLang } }
    const parsed = JSON.parse(raw) as Partial<LanguagePrefs>
    return {
      conversationLang: parsed.conversationLang ?? defaultLanguagePrefs.conversationLang,
      meaningLang: parsed.meaningLang ?? defaultLanguagePrefs.meaningLang,
      levelByLang: {
        ...defaultLanguagePrefs.levelByLang,
        ...parsed.levelByLang,
      },
      languagesConfirmed: parsed.languagesConfirmed === true,
    }
  } catch {
    return { ...defaultLanguagePrefs, levelByLang: { ...defaultLanguagePrefs.levelByLang } }
  }
}

function persistLanguagePrefs(prefs: LanguagePrefs): void {
  try {
    localStorage.setItem(LANGUAGE_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Shared playground config — the React analog of a Pinia store. Consumed via
 * `useConfig(s => s.field)` so each component only re-renders on its own field.
 *
 * One store, two consumers (VAD panel + live session): change a knob on one
 * tab and it is already aligned on the other. Fields are grouped by pipeline
 * stage: VAD cut → ASR padding → merge/scheduling → selectors → speaker → language.
 * Language prefs are the only fields persisted to localStorage.
 */
type ConfigState = {
  // VAD cut stage
  speechThreshold: number
  exitThreshold: number
  minSilenceDurationMs: number
  minSpeechDurationMs: number
  // ASR-send padding (VAD cuts stay tight; padding applied at ASR send)
  prePadMs: number
  postPadMs: number
  // Merge / scheduling (segment aggregator flush triggers)
  pauseMs: number
  mergeMaxMs: number
  // Selectors
  vadVariantId: string
  transcribeProvider: string | null
  transcribeMode: TranscribeMode
  // Speaker verification (live session only, but shared for consistency)
  speakerThreshold: number
  /** Max candidate rounds visible in Live sticky stack (playground debug). */
  candidateRoundsMax: number
  /** Island: speech-to-text on/off (live session honors this). */
  islandSttEnabled: boolean
  /** Island: reply-suggestion LLM on/off. */
  islandReplyEnabled: boolean
  /**
   * Playground product surface: `window` = in-app cards (no stickies);
   * `floating` = simulated Island + sticky notes.
   */
  productSurfaceMode: ProductSurfaceMode
  // Language prefs (persisted)
  conversationLang: AppLanguage
  meaningLang: AppLanguage
  levelByLang: LevelByLang
  languagesConfirmed: boolean
  /** True while a live session is running — language prefs UI locks (F1). */
  liveSessionRunning: boolean
  // Bootstrap guard so the provider defaults to the active one once, then the
  // user can freely switch (including to "off" / null) without re-defaulting.
  providerBootstrapped: boolean
  // Actions
  patch: (partial: Partial<ConfigState>) => void
  setConversationLang: (lang: AppLanguage) => void
  setMeaningLang: (lang: AppLanguage) => void
  setCurrentLevel: (level: LearnerLevel) => void
  confirmLanguages: () => void
  setLiveSessionRunning: (running: boolean) => void
  reset: () => void
  bootstrapProvider: (providers: SttProvider[]) => void
}

const audioDefaults = {
  speechThreshold: defaultVadConfig.speechThreshold,
  exitThreshold: defaultVadConfig.exitThreshold,
  minSilenceDurationMs: defaultVadConfig.minSilenceDurationMs,
  minSpeechDurationMs: defaultVadConfig.minSpeechDurationMs,
  prePadMs: 80,
  postPadMs: 80,
  pauseMs: 500,
  mergeMaxMs: 30000,
  vadVariantId: SILERO_VARIANTS[0].id,
  transcribeProvider: null as string | null,
  transcribeMode: 'aggregated' as TranscribeMode,
  speakerThreshold: 0.8,
  candidateRoundsMax: 2,
  islandSttEnabled: true,
  islandReplyEnabled: true,
  productSurfaceMode: 'window' as ProductSurfaceMode,
  liveSessionRunning: false,
  providerBootstrapped: false,
}

function languageSlice(prefs: LanguagePrefs) {
  return {
    conversationLang: prefs.conversationLang,
    meaningLang: prefs.meaningLang,
    levelByLang: prefs.levelByLang,
    languagesConfirmed: prefs.languagesConfirmed,
  }
}

function persistFromState(s: ConfigState): void {
  persistLanguagePrefs({
    conversationLang: s.conversationLang,
    meaningLang: s.meaningLang,
    levelByLang: s.levelByLang,
    languagesConfirmed: s.languagesConfirmed,
  })
}

const initialLang = loadLanguagePrefs()

export const useConfig = create<ConfigState>((set, get) => ({
  ...audioDefaults,
  ...languageSlice(initialLang),
  patch: (partial) => {
    set(partial)
    if (
      partial.conversationLang !== undefined
      || partial.meaningLang !== undefined
      || partial.levelByLang !== undefined
      || partial.languagesConfirmed !== undefined
    ) {
      persistFromState(get())
    }
  },
  setConversationLang: (lang) => {
    set({ conversationLang: lang })
    persistFromState(get())
  },
  setMeaningLang: (lang) => {
    set({ meaningLang: lang })
    persistFromState(get())
  },
  setCurrentLevel: (level) => {
    const { conversationLang, levelByLang } = get()
    set({ levelByLang: { ...levelByLang, [conversationLang]: level } })
    persistFromState(get())
  },
  confirmLanguages: () => {
    set({ languagesConfirmed: true })
    persistFromState(get())
  },
  setLiveSessionRunning: (running) => {
    set({ liveSessionRunning: running })
  },
  reset: () => {
    const lang = loadLanguagePrefs()
    set({
      ...audioDefaults,
      ...languageSlice(lang),
      providerBootstrapped: true,
      liveSessionRunning: false,
    })
  },
  bootstrapProvider: (providers) =>
    set((s) =>
      s.providerBootstrapped
        ? s
        : { transcribeProvider: defaultSttProvider(providers), providerBootstrapped: true },
    ),
}))

/** Session snapshot of language prefs (frozen at session start). */
export type SessionLanguageSnapshot = {
  conversationLang: AppLanguage
  meaningLang: AppLanguage
  level: LearnerLevel
}

export function readLanguageSnapshot(): SessionLanguageSnapshot {
  const s = useConfig.getState()
  return {
    conversationLang: s.conversationLang,
    meaningLang: s.meaningLang,
    level: s.levelByLang[s.conversationLang],
  }
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

export const PASSPHRASE_BY_LANG: Record<AppLanguage, string> = {
  ja: 'こんにちは。今日もよろしくお願いします。',
  en: 'Hello. Nice to meet you. Please take care of me today.',
  zh: '你好，今天也请多多关照。',
}
