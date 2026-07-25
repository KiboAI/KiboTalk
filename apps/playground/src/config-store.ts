import { create } from 'zustand'
import type { AppLanguage, LearnerLevel } from '@kibotalk/conversation'
import { defaultVadConfig } from '@kibotalk/audio/vad'
import {
  SILERO_VARIANTS,
  defaultAppConfig,
  defaultSttProvider,
  defaultProductPrefs,
  isLearnerLevel,
  systemUiLanguage,
  APP_LANGUAGE_OPTIONS,
  LEARNER_LEVEL_OPTIONS,
} from '@kibotalk/app-shared'
import type { SttProvider } from '@kibotalk/app-shared'

export { APP_LANGUAGE_OPTIONS, LEARNER_LEVEL_OPTIONS }

export type TranscribeMode = 'perSegment' | 'aggregated'

/** Product preview surface: window app vs simulated floating Island+stickies. */
export type ProductSurfaceMode = 'window' | 'floating'

const LANGUAGE_PREFS_KEY = 'kibotalk.playground.languagePrefs'

export type LanguagePrefs = {
  conversationLang: AppLanguage
  uiLang: AppLanguage
  level: LearnerLevel
  languagesConfirmed: boolean
}

const defaultLanguagePrefs: LanguagePrefs = {
  conversationLang: defaultProductPrefs.conversationLang,
  uiLang: systemUiLanguage(),
  level: defaultProductPrefs.level,
  languagesConfirmed: defaultProductPrefs.languagesConfirmed,
}

function loadLanguagePrefs(): LanguagePrefs {
  if (typeof localStorage === 'undefined') {
    return { ...defaultLanguagePrefs }
  }
  try {
    const raw = localStorage.getItem(LANGUAGE_PREFS_KEY)
    if (!raw) return { ...defaultLanguagePrefs }
    const parsed = JSON.parse(raw) as Partial<LanguagePrefs>
    if (!isLearnerLevel(parsed.level)) return { ...defaultLanguagePrefs }
    return {
      conversationLang: parsed.conversationLang ?? defaultLanguagePrefs.conversationLang,
      uiLang: parsed.uiLang ?? defaultLanguagePrefs.uiLang,
      level: parsed.level,
      languagesConfirmed: parsed.languagesConfirmed === true,
    }
  } catch {
    return { ...defaultLanguagePrefs }
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
  uiLang: AppLanguage
  level: LearnerLevel
  languagesConfirmed: boolean
  /** True while a live session is running — language prefs UI locks (F1). */
  liveSessionRunning: boolean
  // Bootstrap guard so the provider defaults to the active one once, then the
  // user can freely switch (including to "off" / null) without re-defaulting.
  providerBootstrapped: boolean
  // Actions
  patch: (partial: Partial<ConfigState>) => void
  setConversationLang: (lang: AppLanguage) => void
  setUiLang: (lang: AppLanguage) => void
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
  speakerThreshold: defaultAppConfig.speakerThreshold,
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
    uiLang: prefs.uiLang,
    level: prefs.level,
    languagesConfirmed: prefs.languagesConfirmed,
  }
}

function persistFromState(s: ConfigState): void {
  persistLanguagePrefs({
    conversationLang: s.conversationLang,
    uiLang: s.uiLang,
    level: s.level,
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
      || partial.uiLang !== undefined
      || partial.level !== undefined
      || partial.languagesConfirmed !== undefined
    ) {
      persistFromState(get())
    }
  },
  setConversationLang: (lang) => {
    set({ conversationLang: lang })
    persistFromState(get())
  },
  setUiLang: (lang) => {
    set({ uiLang: lang })
    persistFromState(get())
  },
  setCurrentLevel: (level) => {
    set({ level })
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
    meaningLang: s.uiLang,
    level: s.level,
  }
}
