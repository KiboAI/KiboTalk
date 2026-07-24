import { useEffect, useRef, useState } from 'react'
import { IndexedDbConversationStorage } from '@kibotalk/conversation'
import { IndexedDbEmbeddingStorage } from '@kibotalk/speaker'
import {
  createSessionSnapshot,
  I18nProvider,
  loadLanguagePrefs,
  localizedSessionFallbackTitle,
  persistLanguagePrefs,
  reviewConversationSession,
  resumePendingSessionReviews,
  startModelPreload,
  useI18n,
  useModelPreloadStatus,
  useProductSession,
  type LanguagePrefs,
} from '@kibotalk/app-shared'
import {
  EnrollmentPage,
  HistoryPage,
  OnboardingPage,
  SessionPage,
  SettingsPage,
} from '@kibotalk/pages'
import { ModelPreloadBadge } from '@kibotalk/ui'

type SetupStage = 'checking' | 'enrollment' | 'product'
type ProductView = 'session' | 'settings' | 'history' | 'voiceprint'

function WebProductShell({
  prefs,
  storage,
  onPrefsChange,
}: {
  prefs: LanguagePrefs
  storage: IndexedDbConversationStorage
  onPrefsChange: (prefs: LanguagePrefs) => void
}) {
  const { language } = useI18n()
  const [view, setView] = useState<ProductView>('session')
  const [enrolled, setEnrolled] = useState(true)
  const [microphonePermission, setMicrophonePermission] =
    useState<'granted' | 'not-determined' | 'denied' | 'unknown'>('unknown')
  const snapshot = createSessionSnapshot(prefs)
  const controller = useProductSession({
    languageSnapshot: snapshot,
    sessionSnapshot: snapshot,
    sessionTitle: localizedSessionFallbackTitle(Date.now(), snapshot.conversationLang, language),
    storage,
    candidateRoundsMax: 3,
  })

  useEffect(() => {
    void resumePendingSessionReviews(storage)
  }, [storage])

  useEffect(() => {
    const stopped = controller.session.activeSession
    if (controller.session.lifecycle !== 'stopped' || !stopped || stopped.reviewStatus !== 'pending') return
    void reviewConversationSession(storage, stopped)
  }, [controller.session.activeSession, controller.session.lifecycle, storage])

  useEffect(() => {
    let cancelled = false
    const permissions = navigator.permissions
    if (!permissions?.query) return
    void permissions
      .query({ name: 'microphone' as PermissionName })
      .then((status) => {
        if (cancelled) return
        setMicrophonePermission(status.state === 'prompt' ? 'not-determined' : status.state)
        status.onchange = () => {
          setMicrophonePermission(status.state === 'prompt' ? 'not-determined' : status.state)
        }
      })
      .catch(() => {
        if (!cancelled) setMicrophonePermission('unknown')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (view === 'settings') {
    return (
      <SettingsPage
        platform="web"
        prefs={prefs}
        sessionActive={controller.session.lifecycle !== 'stopped'}
        storage={storage}
        onPrefsChange={onPrefsChange}
        onBack={() => setView('session')}
        onManageVoiceprint={() => setView('voiceprint')}
        microphonePermission={microphonePermission}
        onRequestMicrophonePermission={async () => {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          stream.getTracks().forEach((track) => track.stop())
          setMicrophonePermission('granted')
        }}
      />
    )
  }

  if (view === 'history') {
    return (
      <HistoryPage
        storage={storage}
        activeSessionId={controller.session.activeSession?.id}
        onBack={() => setView('session')}
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
        recordReady
        onEnrolled={() => setEnrolled(true)}
        onEnterSession={() => setView('settings')}
      />
    )
  }

  return (
    <SessionPage
      controller={controller}
      onGoSettings={() => setView('settings')}
      onGoHistory={() => setView('history')}
    />
  )
}

function AppContent({
  prefs,
  onPrefsChange,
}: {
  prefs: LanguagePrefs
  onPrefsChange: (prefs: LanguagePrefs) => void
}) {
  const [stage, setStage] = useState<SetupStage>('checking')
  const [enrolled, setEnrolled] = useState(false)
  const storageRef = useRef(new IndexedDbConversationStorage())
  const models = useModelPreloadStatus()
  const { t } = useI18n()

  useEffect(() => {
    startModelPreload()
  }, [])

  useEffect(() => {
    if (!prefs.languagesConfirmed) return
    let cancelled = false
    void new IndexedDbEmbeddingStorage()
      .load()
      .then((embedding) => {
        if (cancelled) return
        setEnrolled(!!embedding)
        setStage(embedding ? 'product' : 'enrollment')
      })
      .catch(() => {
        if (!cancelled) setStage('enrollment')
      })
    return () => {
      cancelled = true
    }
  }, [prefs.languagesConfirmed])

  const modelsBadge = (
    <ModelPreloadBadge
      progress={models.progress}
      done={models.wavlm !== 'loading' && models.vad !== 'loading'}
      error={models.wavlm === 'error' || models.vad === 'error'}
      label={t('preparing')}
      errorLabel={t('preparationFailed')}
    />
  )

  if (!prefs.languagesConfirmed) {
    return (
      <>
        {modelsBadge}
        <OnboardingPage
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
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            stream.getTracks().forEach((track) => track.stop())
          }}
          onConfirm={() => onPrefsChange({ ...prefs, languagesConfirmed: true })}
        />
      </>
    )
  }

  if (stage === 'checking') {
    return (
      <>
        {modelsBadge}
        <div className="flex min-h-dvh items-center justify-center">
          <p className="text-sm text-muted-foreground">{t('preparing')}</p>
        </div>
      </>
    )
  }

  if (stage === 'enrollment') {
    return (
      <>
        {modelsBadge}
        <EnrollmentPage
          conversationLang={prefs.conversationLang}
          enrolled={enrolled}
          onEnrolled={() => setEnrolled(true)}
          onEnterSession={() => setStage('product')}
          recordReady={models.wavlm === 'ready'}
        />
      </>
    )
  }

  const modelsReady = models.vad === 'ready' && models.wavlm === 'ready'
  const modelsFailed = models.vad === 'error' || models.wavlm === 'error'
  if (!modelsReady) {
    return (
      <>
        {modelsBadge}
        <div className="flex min-h-dvh items-center justify-center">
          <p className="text-sm text-muted-foreground">
            {modelsFailed ? t('preparationFailed') : t('preparing')}
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      {modelsBadge}
      <WebProductShell
        prefs={prefs}
        storage={storageRef.current}
        onPrefsChange={onPrefsChange}
      />
    </>
  )
}

export default function App() {
  const [prefs, setPrefs] = useState<LanguagePrefs>(loadLanguagePrefs)

  function persist(next: LanguagePrefs) {
    setPrefs(next)
    persistLanguagePrefs(next)
  }

  return (
    <I18nProvider value={prefs} onChange={setPrefs}>
      <AppContent prefs={prefs} onPrefsChange={persist} />
    </I18nProvider>
  )
}
