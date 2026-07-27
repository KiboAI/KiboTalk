import { useEffect, useMemo, useState } from 'react'
import {
  accountConversationDatabaseName,
  IndexedDbConversationStorage,
  type ConversationStorage,
} from '@kibotalk/conversation'
import {
  clearSpeakerEmbeddingData,
  createCurrentSpeakerEmbeddingStorage,
  createSessionSnapshot,
  I18nProvider,
  loadLanguagePrefs,
  localizedSessionFallbackTitle,
  persistLanguagePrefs,
  reviewConversationSession,
  resumePendingSessionReviews,
  startModelPreload,
  syncPreferences,
  useAccount,
  useCloudConversationStorage,
  useI18n,
  useModelPreloadStatus,
  useProductSession,
  type LanguagePrefs,
  type AccountSession,
} from '@kibotalk/app-shared'
import {
  AccountPage,
  EnrollmentPage,
  HistoryPage,
  OnboardingPage,
  SessionPage,
  SettingsPage,
  SyncPendingNotice,
} from '@kibotalk/pages'
import { Button, ModelPreloadBadge } from '@kibotalk/ui'

type SetupStage = 'checking' | 'enrollment' | 'product'
type ProductView = 'session' | 'settings' | 'history' | 'voiceprint' | 'account'

function WebProductShell({
  prefs,
  storage,
  onPrefsChange,
  account,
  onAccountChange,
  onDeleteLocalData,
}: {
  prefs: LanguagePrefs
  storage: ConversationStorage
  onPrefsChange: (prefs: LanguagePrefs) => void
  account: AccountSession
  onAccountChange: (account: AccountSession | null) => void
  onDeleteLocalData: () => Promise<void>
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
    preferredRelayNodeId: prefs.relayNodeId,
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

  if (view === 'account') {
    return (
      <AccountPage
        account={account}
        showAdminLink
        onAuthenticated={onAccountChange}
        onAccountChange={onAccountChange}
        onBack={() => setView('session')}
        onDeleteLocalData={onDeleteLocalData}
      />
    )
  }

  return (
    <SessionPage
      controller={controller}
      onGoSettings={() => setView('settings')}
      onGoHistory={() => setView('history')}
      onGoAccount={() => setView('account')}
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
  const [historyOnly, setHistoryOnly] = useState(false)
  const models = useModelPreloadStatus()
  const { t } = useI18n()
  const accountState = useAccount()
  const localStorage = useMemo(
    () => new IndexedDbConversationStorage(
      accountState.account
        ? accountConversationDatabaseName(accountState.account.user.id)
        : undefined,
    ),
    [accountState.account?.user.id],
  )
  const cloud = useCloudConversationStorage({
    local: localStorage,
    userId: accountState.account?.user.id ?? null,
    onPreferences: (remotePreferences) => {
      if (
        remotePreferences
        && typeof remotePreferences === 'object'
        && 'conversationLang' in remotePreferences
        && 'level' in remotePreferences
      ) {
        onPrefsChange(remotePreferences as LanguagePrefs)
      }
    },
  })

  useEffect(() => {
    startModelPreload()
  }, [])

  useEffect(() => {
    setHistoryOnly(false)
  }, [accountState.account?.user.id])

  useEffect(() => {
    if (!prefs.languagesConfirmed) return
    let cancelled = false
    void createCurrentSpeakerEmbeddingStorage()
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

  useEffect(() => {
    if (!accountState.account) return
    void syncPreferences(prefs, cloud.storage).catch(() => {})
  }, [accountState.account?.user.id, cloud.storage, localStorage, prefs])

  const modelsBadge = (
    <ModelPreloadBadge
      progress={models.progress}
      done={models.speaker !== 'loading' && models.vad !== 'loading'}
      error={models.speaker === 'error' || models.vad === 'error'}
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
          level={prefs.level}
          onUiLangChange={(uiLang) => onPrefsChange({ ...prefs, uiLang })}
          onConversationLangChange={(conversationLang) =>
            onPrefsChange({ ...prefs, conversationLang })
          }
          onLevelChange={(level) => onPrefsChange({ ...prefs, level })}
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
          recordReady={models.speaker === 'ready'}
        />
      </>
    )
  }

  if (historyOnly && accountState.account) {
    return (
      <HistoryPage
        storage={cloud.storage ?? localStorage}
        readOnly={!cloud.storage}
        onBack={() => setHistoryOnly(false)}
      />
    )
  }

  const modelsReady = models.vad === 'ready' && models.speaker === 'ready'
  const modelsFailed = models.vad === 'error' || models.speaker === 'error'
  if (!modelsReady) {
    return (
      <>
        {modelsBadge}
        <div className="flex min-h-dvh items-center justify-center">
          <div className="space-y-3 text-center">
            <p className="text-sm text-muted-foreground">
              {modelsFailed ? t('preparationFailed') : t('preparing')}
            </p>
            {modelsFailed && accountState.account ? (
              <Button variant="soft" onClick={() => setHistoryOnly(true)}>
                查看本地历史
              </Button>
            ) : null}
          </div>
        </div>
      </>
    )
  }

  if (!accountState.account) {
    return (
      <>
        {modelsBadge}
        <AccountPage
          account={null}
          loading={accountState.loading}
          onAuthenticated={accountState.setAccount}
          onAccountChange={accountState.setAccount}
        />
      </>
    )
  }

  if (!cloud.storage) {
    return (
      <>
        {modelsBadge}
        <div className="flex min-h-dvh items-center justify-center">
          <p className="text-sm text-muted-foreground">正在打开本地会话…</p>
        </div>
      </>
    )
  }

  return (
    <>
      {modelsBadge}
      <WebProductShell
        prefs={prefs}
        storage={cloud.storage}
        onPrefsChange={onPrefsChange}
        account={accountState.account}
        onAccountChange={accountState.setAccount}
        onDeleteLocalData={async () => {
          await localStorage.clearHistory()
          await localStorage.clearActiveSession()
          await clearSpeakerEmbeddingData()
        }}
      />
      <SyncPendingNotice pending={Boolean(cloud.error)} onRetry={cloud.retry} />
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
