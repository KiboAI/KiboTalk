import { useEffect, useState } from 'react'
import { IndexedDbEmbeddingStorage } from '@kibotalk/speaker'
import { loadLanguagePrefs, persistLanguagePrefs, type LanguagePrefs } from '@kibotalk/app-shared'
import { OnboardingPage, EnrollmentPage } from '@kibotalk/pages'
import { WizardScreen } from '@kibotalk/ui'

type Gate = 'booting' | 'setup' | 'settings'
type SetupStage = 'checking' | 'enrollment'
type SettingsPanel = 'language' | 'voiceprint'

/**
 * Desktop onboarding / settings window.
 *
 * First run (`setup`): language → voiceprint → `onboarding.complete()`.
 * Later opens from Island「设置」(`settings`): language prefs + optional
 * voiceprint re-record — not the first-run "声纹已保存 / 进入会话" screen.
 */
export default function OnboardingApp() {
  const [prefs, setPrefs] = useState<LanguagePrefs>(loadLanguagePrefs)
  const [gate, setGate] = useState<Gate>('booting')
  const [setupStage, setSetupStage] = useState<SetupStage>('checking')
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel>('language')
  const [enrolled, setEnrolled] = useState(false)

  // Size the BrowserWindow to the wizard root (no min-h-screen).
  useEffect(() => {
    const root = document.getElementById('root')
    if (!root) return

    let lastKey = ''
    const report = () => {
      const wizard = root.firstElementChild as HTMLElement | null
      if (!wizard) return
      const rect = wizard.getBoundingClientRect()
      const width = Math.ceil(rect.width)
      const height = Math.ceil(rect.height)
      if (width < 1 || height < 1) return
      const key = `${width}x${height}`
      if (key === lastKey) return
      lastKey = key
      const resize = window.kibotalk?.onboarding?.resize
      if (typeof resize === 'function') void resize({ width, height })
    }

    const observer = new ResizeObserver(() => report())
    const attach = () => {
      observer.disconnect()
      const wizard = root.firstElementChild
      if (wizard) observer.observe(wizard)
      report()
    }
    const mutations = new MutationObserver(attach)
    mutations.observe(root, { childList: true })
    attach()
    return () => {
      observer.disconnect()
      mutations.disconnect()
    }
  }, [gate, setupStage, settingsPanel, prefs.languagesConfirmed, enrolled])

  useEffect(() => {
    let cancelled = false
    void window.kibotalk.onboarding.getStatus().then((status) => {
      if (cancelled) return
      if (status.completed) {
        setGate('settings')
        setSettingsPanel('language')
        return
      }
      setGate('setup')
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (gate !== 'setup' || !prefs.languagesConfirmed) return
    let cancelled = false
    void new IndexedDbEmbeddingStorage()
      .load()
      .then((embedding) => {
        if (cancelled) return
        setEnrolled(!!embedding)
        setSetupStage('enrollment')
      })
      .catch(() => {
        if (!cancelled) setSetupStage('enrollment')
      })
    return () => {
      cancelled = true
    }
  }, [gate, prefs.languagesConfirmed])

  function persist(next: LanguagePrefs) {
    setPrefs(next)
    persistLanguagePrefs(next)
  }

  function languageFields(variant: 'setup' | 'settings', onConfirm: () => void, onManageVoiceprint?: () => void) {
    return (
      <OnboardingPage
        embedded
        variant={variant}
        conversationLang={prefs.conversationLang}
        meaningLang={prefs.meaningLang}
        level={prefs.levelByLang[prefs.conversationLang]}
        onConversationLangChange={(lang) => persist({ ...prefs, conversationLang: lang })}
        onMeaningLangChange={(lang) => persist({ ...prefs, meaningLang: lang })}
        onLevelChange={(level) =>
          persist({ ...prefs, levelByLang: { ...prefs.levelByLang, [prefs.conversationLang]: level } })
        }
        onConfirm={onConfirm}
        onManageVoiceprint={onManageVoiceprint}
      />
    )
  }

  if (gate === 'booting') {
    return (
      <WizardScreen embedded className="text-center">
        <p className="text-sm text-muted-foreground">正在打开设置…</p>
      </WizardScreen>
    )
  }

  if (gate === 'settings') {
    if (settingsPanel === 'voiceprint') {
      return (
        <EnrollmentPage
          embedded
          conversationLang={prefs.conversationLang}
          enrolled={enrolled}
          initialStep="intro"
          enterSessionLabel="返回设置"
          onEnrolled={() => setEnrolled(true)}
          onEnterSession={() => setSettingsPanel('language')}
        />
      )
    }
    return languageFields('settings', () => void window.kibotalk.onboarding.close(), () =>
      setSettingsPanel('voiceprint'),
    )
  }

  if (!prefs.languagesConfirmed) {
    return languageFields('setup', () => persist({ ...prefs, languagesConfirmed: true }))
  }

  if (setupStage === 'checking') {
    return (
      <WizardScreen embedded className="text-center">
        <p className="text-sm text-muted-foreground">正在读取本机声纹…</p>
      </WizardScreen>
    )
  }

  return (
    <EnrollmentPage
      embedded
      conversationLang={prefs.conversationLang}
      enrolled={enrolled}
      onEnrolled={() => setEnrolled(true)}
      onEnterSession={() => void window.kibotalk.onboarding.complete()}
    />
  )
}
