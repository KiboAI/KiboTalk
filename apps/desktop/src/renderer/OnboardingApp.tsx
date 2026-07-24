import { useEffect, useState } from 'react'
import { IndexedDbConversationStorage } from '@kibotalk/conversation'
import { IndexedDbEmbeddingStorage } from '@kibotalk/speaker'
import {
  I18nProvider,
  loadLanguagePrefs,
  persistLanguagePrefs,
  reviewConversationSession,
  useI18n,
  type LanguagePrefs,
} from '@kibotalk/app-shared'
import {
  EnrollmentPage,
  HistoryPage,
  OnboardingPage,
  SettingsPage,
} from '@kibotalk/pages'
import { WizardScreen } from '@kibotalk/ui'
import type {
  MediaAccessStatus,
  ProductWindowView,
} from '../shared/ipc'

type Gate = 'booting' | 'setup' | 'product'
type SetupStage = 'checking' | 'enrollment'

const storage = new IndexedDbConversationStorage()

function DesktopWindowContent({
  prefs,
  onPrefsChange,
}: {
  prefs: LanguagePrefs
  onPrefsChange: (prefs: LanguagePrefs) => void
}) {
  const { t } = useI18n()
  const [gate, setGate] = useState<Gate>('booting')
  const [setupStage, setSetupStage] = useState<SetupStage>('checking')
  const [view, setView] = useState<ProductWindowView>('settings')
  const [enrolled, setEnrolled] = useState(false)
  const [sessionActive, setSessionActive] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string>()
  const [microphonePermission, setMicrophonePermission] =
    useState<MediaAccessStatus>('unknown')
  const [screenPermission, setScreenPermission] = useState<MediaAccessStatus>('unknown')

  async function refreshSessionState() {
    const session = await storage.getActiveSession()
    setSessionActive(!!session && session.status !== 'stopped')
    setActiveSessionId(session?.id)
  }

  async function refreshPermissions() {
    const [microphone, screen] = await Promise.all([
      window.kibotalk.permissions.checkMicrophone(),
      window.kibotalk.permissions.checkScreenRecording(),
    ])
    setMicrophonePermission(microphone)
    setScreenPermission(screen)
  }

  useEffect(() => {
    let cancelled = false
    void window.kibotalk.onboarding.getStatus().then((status) => {
      if (cancelled) return
      setView(status.view)
      setGate(status.completed ? 'product' : 'setup')
      if (status.completed) {
        void refreshSessionState()
        void refreshPermissions()
      }
    })
    const unsubscribe = window.kibotalk.onboarding.onViewRequested((next) => {
      setView(next)
      void refreshSessionState()
      void refreshPermissions()
    })
    return () => {
      cancelled = true
      unsubscribe()
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

  useEffect(() => {
    if (gate === 'product' && !prefs.languagesConfirmed) {
      setGate('setup')
      setSetupStage('checking')
    }
  }, [gate, prefs.languagesConfirmed])

  useEffect(() => {
    if (gate !== 'product') return
    const timer = window.setInterval(() => void refreshSessionState(), 1000)
    const refreshOnFocus = () => void refreshPermissions()
    window.addEventListener('focus', refreshOnFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [gate])

  useEffect(() => {
    if (gate === 'product') {
      void window.kibotalk.onboarding.resize({ width: 1040, height: 720 })
      return
    }
    const root = document.getElementById('root')
    if (!root) return
    let lastKey = ''
    const report = () => {
      const wizard = root.firstElementChild as HTMLElement | null
      if (!wizard) return
      const rect = wizard.getBoundingClientRect()
      const size = { width: Math.ceil(rect.width), height: Math.ceil(rect.height) }
      const key = `${size.width}x${size.height}`
      if (size.width < 1 || size.height < 1 || key === lastKey) return
      lastKey = key
      void window.kibotalk.onboarding.resize(size)
    }
    const observer = new ResizeObserver(report)
    const wizard = root.firstElementChild
    if (wizard) observer.observe(wizard)
    report()
    return () => observer.disconnect()
  }, [gate, prefs.languagesConfirmed, setupStage])

  if (gate === 'booting') {
    return (
      <WizardScreen embedded className="text-center">
        <p className="text-sm text-muted-foreground">{t('preparing')}</p>
      </WizardScreen>
    )
  }

  if (gate === 'product') {
    if (view === 'history') {
      return (
        <HistoryPage
          storage={storage}
          activeSessionId={activeSessionId}
          onBack={() => void window.kibotalk.onboarding.close()}
          onRetryReview={async (sessionId) => {
            const session = await storage.loadSession(sessionId)
            if (session) await reviewConversationSession(storage, session)
          }}
        />
      )
    }
    if (view === 'voiceprint') {
      return (
        <EnrollmentPage
          conversationLang={prefs.conversationLang}
          enrolled={enrolled}
          initialStep="intro"
          embedded
          onEnrolled={() => setEnrolled(true)}
          onEnterSession={() => setView('settings')}
        />
      )
    }
    return (
      <SettingsPage
        platform="desktop"
        prefs={prefs}
        sessionActive={sessionActive}
        storage={storage}
        onPrefsChange={onPrefsChange}
        onBack={() => void window.kibotalk.onboarding.close()}
        onManageVoiceprint={() => setView('voiceprint')}
        onQuit={() => void window.kibotalk.app.requestQuit()}
        onLaunchAtLoginChange={(enabled) => window.kibotalk.app.setLaunchAtLogin(enabled)}
        microphonePermission={microphonePermission}
        screenPermission={screenPermission}
        onRequestMicrophonePermission={async () => {
          await window.kibotalk.permissions.requestMicrophone()
          await refreshPermissions()
        }}
        onRequestScreenPermission={async () => {
          await window.kibotalk.permissions.requestScreenRecording()
          await refreshPermissions()
        }}
        onResetPersonalData={() => window.kibotalk.onboarding.reset()}
      />
    )
  }

  if (!prefs.languagesConfirmed) {
    return (
      <OnboardingPage
        embedded
        uiLang={prefs.uiLang}
        conversationLang={prefs.conversationLang}
        level={prefs.levelByLang[prefs.conversationLang]}
        onUiLangChange={(uiLang) => onPrefsChange({ ...prefs, uiLang })}
        onConversationLangChange={(conversationLang) =>
          onPrefsChange({ ...prefs, conversationLang })
        }
        onLevelChange={(level) =>
          onPrefsChange({
            ...prefs,
            levelByLang: { ...prefs.levelByLang, [prefs.conversationLang]: level },
          })
        }
        onRequestPermissions={async () => {
          await window.kibotalk.permissions.requestMicrophone()
          await window.kibotalk.permissions.requestScreenRecording()
        }}
        onConfirm={() => onPrefsChange({ ...prefs, languagesConfirmed: true })}
      />
    )
  }

  if (setupStage === 'checking') {
    return (
      <WizardScreen embedded className="text-center">
        <p className="text-sm text-muted-foreground">{t('preparing')}</p>
      </WizardScreen>
    )
  }

  return (
    <EnrollmentPage
      embedded
      conversationLang={prefs.conversationLang}
      enrolled={enrolled}
      onEnrolled={() => setEnrolled(true)}
      onEnterSession={() => {
        void window.kibotalk.onboarding.complete()
        setGate('product')
      }}
    />
  )
}

export default function OnboardingApp() {
  const [prefs, setPrefs] = useState<LanguagePrefs>(loadLanguagePrefs)

  function persist(next: LanguagePrefs) {
    setPrefs(next)
    persistLanguagePrefs(next)
  }

  return (
    <I18nProvider value={prefs} onChange={setPrefs}>
      <DesktopWindowContent prefs={prefs} onPrefsChange={persist} />
    </I18nProvider>
  )
}
