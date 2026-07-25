import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadLanguagePrefs } from '../src/language-prefs'

const values = new Map<string, string>()

beforeEach(() => {
  values.clear()
  vi.stubGlobal('navigator', { language: 'zh-CN' })
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  })
})

describe('loadLanguagePrefs', () => {
  it('resets the removed per-language levels and requires confirmation again', () => {
    values.set('kibotalk.languagePrefs', JSON.stringify({
      uiLang: 'ja',
      conversationLang: 'en',
      levelByLang: {
        ja: 'advanced',
        en: 'intermediate',
        zh: 'beginner',
      },
      languagesConfirmed: true,
    }))

    expect(loadLanguagePrefs()).toMatchObject({
      uiLang: 'zh',
      conversationLang: 'ja',
      level: 'beginner',
      languagesConfirmed: false,
    })
  })

  it('loads the single global level', () => {
    values.set('kibotalk.languagePrefs', JSON.stringify({
      uiLang: 'ja',
      conversationLang: 'en',
      level: 'advanced',
      languagesConfirmed: true,
    }))

    expect(loadLanguagePrefs()).toMatchObject({
      uiLang: 'ja',
      conversationLang: 'en',
      level: 'advanced',
      languagesConfirmed: true,
    })
  })
})
