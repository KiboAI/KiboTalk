import type {
  AppLanguage,
  ConversationSessionSnapshot,
  LearnerLevel,
  SessionAudioSource,
  UiLanguage,
} from '@kibotalk/conversation'
import {
  defaultProductPrefs,
  isLearnerLevel,
  systemUiLanguage,
  type ProductTheme,
  type RelayNodePreference,
} from './config'

const LANGUAGE_PREFS_KEY = 'kibotalk.languagePrefs'
const LANGUAGE_PREFS_EVENT = 'kibotalk:language-prefs'

export type LanguagePrefs = {
  uiLang: UiLanguage
  conversationLang: AppLanguage
  level: LearnerLevel
  languagesConfirmed: boolean
  theme: ProductTheme
  launchAtLogin: boolean
  audioSource: SessionAudioSource
  microphoneDeviceId: string
  relayNodeId: RelayNodePreference
}

/**
 * Onboarding's language/level choices, persisted to `localStorage` — shared
 * by every product shell's onboarding flow (`apps/web`'s `App.tsx`,
 * `apps/desktop`'s onboarding window) so the load/persist logic isn't
 * duplicated per app.
 */
export function loadLanguagePrefs(): LanguagePrefs {
  const fallback: LanguagePrefs = {
    ...defaultProductPrefs,
    uiLang: systemUiLanguage(),
  }
  try {
    const raw = localStorage.getItem(LANGUAGE_PREFS_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<LanguagePrefs>
    if (!isLearnerLevel(parsed.level)) return fallback
    return {
      uiLang: parsed.uiLang ?? fallback.uiLang,
      conversationLang: parsed.conversationLang ?? fallback.conversationLang,
      level: parsed.level,
      languagesConfirmed: parsed.languagesConfirmed === true,
      theme: parsed.theme ?? fallback.theme,
      launchAtLogin: parsed.launchAtLogin === true,
      audioSource: parsed.audioSource ?? fallback.audioSource,
      microphoneDeviceId: parsed.microphoneDeviceId ?? fallback.microphoneDeviceId,
      relayNodeId:
        parsed.relayNodeId === 'cn-relay'
          ? 'cn-relay'
          : fallback.relayNodeId,
    }
  } catch {
    return fallback
  }
}

export function persistLanguagePrefs(prefs: LanguagePrefs): void {
  try {
    localStorage.setItem(LANGUAGE_PREFS_KEY, JSON.stringify(prefs))
    window.dispatchEvent(new CustomEvent<LanguagePrefs>(LANGUAGE_PREFS_EVENT, { detail: prefs }))
  } catch {
    // Ignore quota / private mode.
  }
}

export function subscribeLanguagePrefs(listener: (prefs: LanguagePrefs) => void): () => void {
  const onLocalChange = (event: Event) => {
    const detail = (event as CustomEvent<LanguagePrefs>).detail
    listener(detail ?? loadLanguagePrefs())
  }
  const onStorage = (event: StorageEvent) => {
    if (event.key === LANGUAGE_PREFS_KEY) listener(loadLanguagePrefs())
  }
  window.addEventListener(LANGUAGE_PREFS_EVENT, onLocalChange)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(LANGUAGE_PREFS_EVENT, onLocalChange)
    window.removeEventListener('storage', onStorage)
  }
}

export function createSessionSnapshot(prefs: LanguagePrefs): ConversationSessionSnapshot {
  return {
    conversationLang: prefs.conversationLang,
    meaningLang: prefs.uiLang,
    uiLang: prefs.uiLang,
    level: prefs.level,
    audioSource: prefs.audioSource,
    microphoneDeviceId: prefs.microphoneDeviceId,
  }
}
