import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  accountConversationDatabaseName,
  IndexedDbConversationStorage,
  type ConversationStorage,
} from '@kibotalk/conversation'
import { IndexedDbEmbeddingStorage } from '@kibotalk/speaker'
import {
  I18nProvider,
  loadLanguagePrefs,
  persistLanguagePrefs,
  reviewConversationSession,
  syncPreferences,
  useAccount,
  useCloudConversationStorage,
  useI18n,
  type LanguagePrefs,
  type AccountSession,
} from '@kibotalk/app-shared'
import {
  AccountPage,
  EnrollmentPage,
  HistoryPage,
  OnboardingPage,
  SettingsPage,
} from '@kibotalk/pages'
import { Button, WizardScreen } from '@kibotalk/ui'
import type {
  MediaAccessStatus,
  ProductWindowView,
} from '../shared/ipc'

type Gate = 'booting' | 'setup' | 'product'
type SetupStage = 'checking' | 'enrollment' | 'account'

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
        && 'levelByLang' in remotePreferences
      ) {
        onPrefsChange(remotePreferences as LanguagePrefs)
      }
    },
  })
  const storage: ConversationStorage = cloud.storage ?? localStorage

  const refreshSessionState = useCallback(async () => {
    const session = await storage.getActiveSession()
    setSessionActive(!!session && session.status !== 'stopped')
    setActiveSessionId(session?.id)
  }, [storage])

  async function refreshPermissions() {
    const [microphone, screen] = await Promise.all([
      window.kibotalk.permissions.checkMicrophone(),
      window.kibotalk.permissions.checkScreenRecording(),
    ])
    setMicrophonePermission(microphone)
    setScreenPermission(screen)
  }

  useEffect(() => {
    if (!accountState.account) return
    void syncPreferences(prefs, cloud.storage).catch(() => {})
  }, [accountState.account?.user.id, cloud.storage, localStorage, prefs])

  useEffect(() => {
    if (
      gate === 'setup'
      && setupStage === 'account'
      && accountState.account
      && cloud.storage
    ) {
      void window.kibotalk.onboarding.complete()
      setGate('product')
      setView('settings')
    }
  }, [accountState.account, cloud.storage, gate, setupStage])

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
  }, [refreshSessionState])

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
  }, [gate, refreshSessionState])

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
    if (accountState.loading) {
      return (
        <WizardScreen embedded className="text-center">
          <p className="text-sm text-muted-foreground">正在检查账户…</p>
        </WizardScreen>
      )
    }
    if (!accountState.account || view === 'account') {
      return (
        <AccountPage
          account={accountState.account}
          loading={accountState.loading}
          showAdminLink={false}
          onAuthenticated={accountState.setAccount}
          onAccountChange={accountState.setAccount}
          onBack={
            accountState.account
              ? () => setView('settings')
              : undefined
          }
          onDeleteLocalData={async () => {
            await localStorage.clearHistory()
            await localStorage.clearActiveSession()
            await new IndexedDbEmbeddingStorage().clear()
            await window.kibotalk.onboarding.reset()
          }}
        />
      )
    }
    if (view === 'history' && cloud.error) {
      return (
        <HistoryPage
          storage={localStorage}
          activeSessionId={activeSessionId}
          readOnly
          onBack={() => void window.kibotalk.onboarding.close()}
        />
      )
    }
    if (!cloud.storage) {
      return (
        <WizardScreen embedded className="text-center">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {cloud.error ? '无法连接云同步，暂不能开始新会话。' : '正在同步会话历史…'}
            </p>
            {cloud.error ? (
              <div className="flex justify-center gap-2">
                <Button variant="soft" onClick={cloud.retry}>
                  重试连接
                </Button>
                <Button variant="soft" onClick={() => setView('history')}>
                  查看本地历史
                </Button>
              </div>
            ) : null}
          </div>
        </WizardScreen>
      )
    }
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

  if (setupStage === 'account') {
    return (
      <AccountPage
        account={accountState.account}
        loading={accountState.loading}
        embedded
        onAuthenticated={(account: AccountSession) => accountState.setAccount(account)}
        onAccountChange={accountState.setAccount}
      />
    )
  }

  return (
    <EnrollmentPage
      embedded
      conversationLang={prefs.conversationLang}
      enrolled={enrolled}
      onEnrolled={() => setEnrolled(true)}
      onEnterSession={() => {
        if (accountState.account && cloud.storage) {
          void window.kibotalk.onboarding.complete()
          setGate('product')
        } else {
          setSetupStage('account')
        }
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
