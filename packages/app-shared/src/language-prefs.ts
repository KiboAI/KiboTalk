import type { AppLanguage, LevelByLang } from '@kibotalk/conversation'
import { defaultLanguagePrefs } from './config'

const LANGUAGE_PREFS_KEY = 'kibotalk.languagePrefs'

export type LanguagePrefs = {
  conversationLang: AppLanguage
  meaningLang: AppLanguage
  levelByLang: LevelByLang
  languagesConfirmed: boolean
}

/**
 * Onboarding's language/level choices, persisted to `localStorage` — shared
 * by every product shell's onboarding flow (`apps/web`'s `App.tsx`,
 * `apps/desktop`'s onboarding window) so the load/persist logic isn't
 * duplicated per app.
 */
export function loadLanguagePrefs(): LanguagePrefs {
  const fallback: LanguagePrefs = { ...defaultLanguagePrefs, languagesConfirmed: false }
  try {
    const raw = localStorage.getItem(LANGUAGE_PREFS_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<LanguagePrefs>
    return {
      conversationLang: parsed.conversationLang ?? fallback.conversationLang,
      meaningLang: parsed.meaningLang ?? fallback.meaningLang,
      levelByLang: { ...fallback.levelByLang, ...parsed.levelByLang },
      languagesConfirmed: parsed.languagesConfirmed === true,
    }
  } catch {
    return fallback
  }
}

export function persistLanguagePrefs(prefs: LanguagePrefs): void {
  try {
    localStorage.setItem(LANGUAGE_PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Ignore quota / private mode.
  }
}
