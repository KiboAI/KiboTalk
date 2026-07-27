import { useEffect, useMemo, useState } from 'react'
import type {
  AppLanguage,
  ConversationStorage,
  LearnerLevel,
  SessionAudioSource,
  UiLanguage,
} from '@kibotalk/conversation'
import {
  clearSpeakerEmbeddingData,
  createCurrentSpeakerEmbeddingStorage,
  defaultProductPrefs,
  languageLabel,
  levelLabel,
  systemUiLanguage,
  useI18n,
  useRelayNodeProbes,
  type LanguagePrefs,
  type ProductTheme,
  type RelayNodePreference,
} from '@kibotalk/app-shared'
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@kibotalk/ui'
import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  Database,
  Fingerprint,
  Info,
  Languages,
  Lock,
  LogOut,
  Mic,
  MonitorUp,
  Palette,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  Trash2,
} from 'lucide-react'

type SettingsSection = 'general' | 'conversation' | 'voiceprint' | 'permissions' | 'data' | 'about'
type ConfirmAction = 'deleteVoiceprint' | 'clearHistory' | 'reset' | null

export type PermissionState = 'granted' | 'not-determined' | 'denied' | 'restricted' | 'unknown'

export type SettingsPageProps = {
  platform: 'web' | 'desktop'
  prefs: LanguagePrefs
  sessionActive: boolean
  storage: ConversationStorage
  onPrefsChange: (prefs: LanguagePrefs) => void
  onBack: () => void
  onManageVoiceprint: () => void
  onQuit?: () => void
  onLaunchAtLoginChange?: (enabled: boolean) => Promise<void>
  microphonePermission?: PermissionState
  screenPermission?: PermissionState
  onRequestMicrophonePermission?: () => Promise<void>
  onRequestScreenPermission?: () => Promise<void>
  onResetPersonalData?: () => Promise<void>
}

const LANGUAGES: AppLanguage[] = ['ja', 'en', 'zh']
const LEVELS: LearnerLevel[] = ['beginner', 'intermediate', 'advanced']
const THEMES: ProductTheme[] = ['system', 'light', 'dark']
const AUDIO_SOURCES: SessionAudioSource[] = ['microphone', 'system', 'both']
const RELAY_NODES: RelayNodePreference[] = ['jp-primary', 'cn-relay']

function SettingRow({
  title,
  description,
  children,
  danger = false,
}: {
  title: string
  description?: string
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <div className="flex min-h-16 flex-col items-start justify-between gap-3 border-b border-border px-4 py-3.5 last:border-b-0 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <div className={`text-sm font-semibold ${danger ? 'text-destructive' : ''}`}>{title}</div>
        {description ? <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</div> : null}
      </div>
      <div className="flex w-full shrink-0 justify-end sm:w-auto">{children}</div>
    </div>
  )
}

function SettingsGroup({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-lg border border-border bg-card/80">{children}</div>
}

function permissionAllowed(state?: PermissionState): boolean {
  return state === 'granted'
}

export function SettingsPage({
  platform,
  prefs,
  sessionActive,
  storage,
  onPrefsChange,
  onBack,
  onManageVoiceprint,
  onQuit,
  onLaunchAtLoginChange,
  microphonePermission,
  screenPermission,
  onRequestMicrophonePermission,
  onRequestScreenPermission,
  onResetPersonalData,
}: SettingsPageProps) {
  const { t, language } = useI18n()
  const [section, setSection] = useState<SettingsSection>('general')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [voiceprintReady, setVoiceprintReady] = useState(false)
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const relayProbes = useRelayNodeProbes()

  useEffect(() => {
    void createCurrentSpeakerEmbeddingStorage()
      .load()
      .then((embedding) => setVoiceprintReady(!!embedding))
  }, [])

  useEffect(() => {
    if (platform !== 'desktop') return
    void navigator.mediaDevices
      .enumerateDevices()
      .then((devices) => setMicrophones(devices.filter((device) => device.kind === 'audioinput')))
      .catch(() => setMicrophones([]))
  }, [microphonePermission, platform])

  const sections = useMemo(
    () =>
      [
        { id: 'general' as const, label: t('general'), icon: Settings },
        { id: 'conversation' as const, label: t('conversationSettings'), icon: Languages },
        { id: 'voiceprint' as const, label: t('voiceprint'), icon: Fingerprint },
        { id: 'permissions' as const, label: t('permissions'), icon: ShieldCheck },
        { id: 'data' as const, label: t('dataPrivacy'), icon: Database },
        { id: 'about' as const, label: t('about'), icon: Info },
      ],
    [t],
  )

  function update(patch: Partial<LanguagePrefs>) {
    onPrefsChange({ ...prefs, ...patch })
  }

  async function requestBrowserMicrophone() {
    if (onRequestMicrophonePermission) {
      await onRequestMicrophonePermission()
      return
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((track) => track.stop())
  }

  async function confirmDestructiveAction() {
    switch (confirmAction) {
      case 'deleteVoiceprint':
        await clearSpeakerEmbeddingData()
        setVoiceprintReady(false)
        break
      case 'clearHistory':
        await storage.clearHistory()
        break
      case 'reset':
        await storage.clearHistory()
        await storage.clearActiveSession()
        await clearSpeakerEmbeddingData()
        onPrefsChange({
          ...defaultProductPrefs,
          uiLang: systemUiLanguage(),
        })
        await onResetPersonalData?.()
        setVoiceprintReady(false)
        break
      case null:
        break
      default: {
        const exhaustive: never = confirmAction
        void exhaustive
      }
    }
    setConfirmAction(null)
  }

  const themeLabels: Record<ProductTheme, string> = {
    system: t('system'),
    light: t('light'),
    dark: t('dark'),
  }
  const audioLabels: Record<SessionAudioSource, string> = {
    microphone: t('microphone'),
    system: t('systemAudio'),
    both: t('bothAudio'),
  }
  const activeLock = sessionActive ? (
    <div className="flex max-w-sm items-start gap-2 rounded-md bg-accent px-3 py-2 text-xs leading-relaxed text-accent-foreground">
      <Lock className="mt-0.5 size-3.5 shrink-0" />
      {t('lockedWhileActive')}
    </div>
  ) : null

  return (
    <div className="min-h-dvh bg-background p-2 sm:p-5">
      <div className="paper-sheet mx-auto grid min-h-[calc(100dvh-1rem)] max-w-6xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:min-h-[calc(100dvh-2.5rem)] sm:grid-cols-[14rem_minmax(0,1fr)] sm:grid-rows-none">
        <aside className="border-b border-border bg-muted/50 p-3 sm:border-b-0 sm:border-r">
          <div className="mb-3 flex items-center gap-2 px-1 sm:mb-6">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label={t('back')}>
              <ArrowLeft className="size-4" />
            </Button>
            <strong>KiboTalk</strong>
          </div>
          <nav className="flex gap-1 overflow-x-auto pb-1 sm:grid sm:overflow-visible">
            {sections.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-colors sm:w-full ${
                    section === item.id
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-foreground/5'
                  }`}
                >
                  <Icon className="size-4" />
                  <span>{item.label}</span>
                </button>
              )
            })}
          </nav>
        </aside>

        <main className="min-w-0 p-4 sm:p-8">
          <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h1 className="text-xl font-bold">{sections.find((item) => item.id === section)?.label}</h1>
              <p className="mt-1 text-xs text-muted-foreground">{t('settings')}</p>
            </div>
            {activeLock}
          </div>

          {section === 'general' ? (
            <SettingsGroup>
              <SettingRow title={t('uiLanguage')} description={t('uiLanguageDescription')}>
                <Select
                  value={prefs.uiLang}
                  disabled={sessionActive}
                  onValueChange={(value) => update({ uiLang: value as UiLanguage })}
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh">中文</SelectItem>
                    <SelectItem value="ja">日本語</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
              <SettingRow title={t('theme')}>
                <Select value={prefs.theme} onValueChange={(value) => update({ theme: value as ProductTheme })}>
                  <SelectTrigger className="w-full sm:w-44">
                    <Palette className="size-4" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {THEMES.map((theme) => (
                      <SelectItem key={theme} value={theme}>
                        {themeLabels[theme]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingRow>
              {platform === 'desktop' ? (
                <SettingRow title={t('launchAtLogin')}>
                  <Switch
                    checked={prefs.launchAtLogin}
                    onCheckedChange={(enabled) => {
                      update({ launchAtLogin: enabled })
                      void onLaunchAtLoginChange?.(enabled)
                    }}
                  />
                </SettingRow>
              ) : null}
            </SettingsGroup>
          ) : null}

          {section === 'conversation' ? (
            <div className="space-y-4">
              <SettingsGroup>
                <SettingRow title={t('conversationLanguage')}>
                  <Select
                    value={prefs.conversationLang}
                    disabled={sessionActive}
                    onValueChange={(value) => update({ conversationLang: value as AppLanguage })}
                  >
                    <SelectTrigger className="w-full sm:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {languageLabel(item, language)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>
                <SettingRow title={t('level')}>
                  <Select
                    value={prefs.level}
                    disabled={sessionActive}
                    onValueChange={(value) => update({ level: value as LearnerLevel })}
                  >
                    <SelectTrigger className="w-full sm:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LEVELS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {levelLabel(item, language)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingRow>
                <SettingRow
                  title={t('defaultNetworkNode')}
                  description={t('defaultNetworkNodeDescription')}
                >
                  <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                    <Select
                      value={prefs.relayNodeId}
                      disabled={
                        sessionActive
                        || relayProbes.loading
                        || relayProbes.results.length === 0
                      }
                      onValueChange={(value) =>
                        update({ relayNodeId: value as RelayNodePreference })}
                    >
                      <SelectTrigger className="w-full sm:w-56">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RELAY_NODES.map((nodeId) => {
                          const result = relayProbes.results.find(
                            ({ node }) => node.id === nodeId,
                          )
                          let latencyLabel = t('checkingLatency')
                          if (result?.latencyMs === null) {
                            latencyLabel = t('nodeUnreachable')
                          } else if (result) {
                            latencyLabel = `${Math.round(result.latencyMs)} ms`
                          }
                          return (
                            <SelectItem
                              key={nodeId}
                              value={nodeId}
                              disabled={result?.latencyMs === null}
                            >
                              {nodeId === 'jp-primary' ? t('japanNode') : t('chinaNode')}
                              {' · '}
                              {latencyLabel}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="soft"
                      size="icon"
                      disabled={relayProbes.loading}
                      onClick={() => void relayProbes.refresh()}
                      aria-label={t('refreshLatency')}
                    >
                      <RefreshCw className={`size-4 ${relayProbes.loading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </SettingRow>
                {prefs.relayNodeId === 'cn-relay' ? (
                  <div className="flex items-start gap-2 bg-destructive/10 px-4 py-3 text-xs leading-relaxed text-destructive">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    {t('insecureRelayWarning')}
                  </div>
                ) : null}
                {relayProbes.error ? (
                  <div className="px-4 py-3 text-xs text-destructive">
                    {t('nodeProbeFailed')}
                  </div>
                ) : null}
              </SettingsGroup>

              {platform === 'desktop' ? (
                <SettingsGroup>
                  <SettingRow title={t('audioSource')} description={t('headphonesHint')}>
                    <Select
                      value={prefs.audioSource}
                      disabled={sessionActive}
                      onValueChange={(value) => update({ audioSource: value as SessionAudioSource })}
                    >
                      <SelectTrigger className="w-full sm:w-56">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AUDIO_SOURCES.map((item) => (
                          <SelectItem key={item} value={item}>
                            {audioLabels[item]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SettingRow>
                  <SettingRow title={t('microphoneDevice')}>
                    <Select
                      value={prefs.microphoneDeviceId}
                      disabled={sessionActive}
                      onValueChange={(microphoneDeviceId) => update({ microphoneDeviceId })}
                    >
                      <SelectTrigger className="w-full sm:w-56">
                        <Mic className="size-4" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">{t('systemDefault')}</SelectItem>
                        {microphones
                          .filter((device) => device.deviceId && device.deviceId !== 'default')
                          .map((device, index) => (
                            <SelectItem key={device.deviceId} value={device.deviceId}>
                              {device.label || `${t('microphone')} ${index + 1}`}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </SettingRow>
                </SettingsGroup>
              ) : null}
            </div>
          ) : null}

          {section === 'voiceprint' ? (
            <SettingsGroup>
              <SettingRow title={t('voiceprint')}>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                    voiceprintReady
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-muted-foreground'
                  }`}
                >
                  {voiceprintReady ? (
                    <CircleCheck className="size-4" />
                  ) : (
                    <Fingerprint className="size-4" />
                  )}
                  {voiceprintReady ? t('voiceprintReady') : t('voiceprintMissing')}
                </span>
              </SettingRow>
              <SettingRow title={voiceprintReady ? t('rerecordVoiceprint') : t('recordVoiceTitle')}>
                <Button variant="soft" disabled={sessionActive} onClick={onManageVoiceprint}>
                  {voiceprintReady ? (
                    <RotateCcw className="size-4" />
                  ) : (
                    <Mic className="size-4" />
                  )}
                  {voiceprintReady ? t('rerecordVoiceprint') : t('recordVoiceTitle')}
                </Button>
              </SettingRow>
              <SettingRow title={t('deleteVoiceprint')} danger>
                <Button
                  variant="destructive"
                  disabled={sessionActive || !voiceprintReady}
                  onClick={() => setConfirmAction('deleteVoiceprint')}
                >
                  <Trash2 className="size-4" />
                  {t('deleteVoiceprint')}
                </Button>
              </SettingRow>
            </SettingsGroup>
          ) : null}

          {section === 'permissions' ? (
            <SettingsGroup>
              <SettingRow title={t('microphonePermission')}>
                {permissionAllowed(microphonePermission) ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <CircleCheck className="size-4" />
                    {t('granted')}
                  </span>
                ) : (
                  <Button variant="soft" onClick={() => void requestBrowserMicrophone()}>
                    <Mic className="size-4" />
                    {t('requestPermission')}
                  </Button>
                )}
              </SettingRow>
              {platform === 'desktop' ? (
                <SettingRow title={t('screenPermission')}>
                  {permissionAllowed(screenPermission) ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      <CircleCheck className="size-4" />
                      {t('granted')}
                    </span>
                  ) : (
                    <Button variant="soft" onClick={() => void onRequestScreenPermission?.()}>
                      <MonitorUp className="size-4" />
                      {t('openSystemSettings')}
                    </Button>
                  )}
                </SettingRow>
              ) : null}
            </SettingsGroup>
          ) : null}

          {section === 'data' ? (
            <SettingsGroup>
              <SettingRow title={t('clearHistory')} danger>
                <Button
                  variant="destructive"
                  disabled={sessionActive}
                  onClick={() => setConfirmAction('clearHistory')}
                >
                  <Trash2 className="size-4" />
                  {t('clearHistory')}
                </Button>
              </SettingRow>
              <SettingRow title={t('resetPersonalData')} danger>
                <Button
                  variant="destructive"
                  disabled={sessionActive}
                  onClick={() => setConfirmAction('reset')}
                >
                  <RotateCcw className="size-4" />
                  {t('resetPersonalData')}
                </Button>
              </SettingRow>
            </SettingsGroup>
          ) : null}

          {section === 'about' ? (
            <SettingsGroup>
              <SettingRow title={t('version')}>
                <span className="text-xs text-muted-foreground">0.1.0</span>
              </SettingRow>
              {platform === 'desktop' && onQuit ? (
                <SettingRow title={t('quit')} danger>
                  <Button variant="destructive" onClick={onQuit}>
                    <LogOut className="size-4" />
                    {t('quit')}
                  </Button>
                </SettingRow>
              ) : null}
            </SettingsGroup>
          ) : null}
        </main>
      </div>

      <Dialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction === 'deleteVoiceprint'
                ? t('deleteVoiceprintTitle')
                : confirmAction === 'clearHistory'
                  ? t('clearHistoryTitle')
                  : t('resetTitle')}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === 'deleteVoiceprint'
                ? t('deleteVoiceprintDescription')
                : confirmAction === 'clearHistory'
                  ? t('clearHistoryDescription')
                  : t('resetDescription')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="soft">{t('cancel')}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => void confirmDestructiveAction()}>
              {t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
