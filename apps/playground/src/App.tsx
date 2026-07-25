import { useEffect, useState } from 'react'
import { Moon, Sun, Languages, StickyNote, Fingerprint, AudioLines, Cable, Server, UserRound } from 'lucide-react'
import {
  createCurrentSpeakerEmbeddingStorage,
  useAccount,
} from '@kibotalk/app-shared'
import { AccountPage } from '@kibotalk/pages'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@kibotalk/ui'
import DirectApi from './DirectApi'
import LiveSession from './LiveSession'
import Enrollment from './Enrollment'
import VadPanel from './VadPanel'
import {
  APP_LANGUAGE_OPTIONS,
  LEARNER_LEVEL_OPTIONS,
  useConfig,
} from './config-store'
import { LanguagePrefsFields } from './components/ConfigFields'
import { ProductSurfaceToggle } from './components/ProductSurfaceToggle'

export type PlaygroundTab = 'live' | 'enroll' | 'vad' | 'direct'

const THEME_KEY = 'kibotalk.playground.theme'
declare const __PLAYGROUND_API_ORIGIN__: string

function backendLabel(origin: string): string {
  if (origin === 'http://localhost:8787') return '本地'
  if (origin === 'https://advx.kibotalk.app') return '生产'
  return '自定义'
}

function PlaygroundConnectionStatus() {
  const account = useAccount()
  const [loginOpen, setLoginOpen] = useState(false)

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="paper-sheet gap-2 border-border/50" disabled>
          <Server className="size-4" />
          {backendLabel(__PLAYGROUND_API_ORIGIN__)} · {__PLAYGROUND_API_ORIGIN__}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="paper-sheet gap-2 border-border/50"
          disabled={account.loading}
          onClick={() => {
            if (account.account) void account.refresh()
            else setLoginOpen(true)
          }}
        >
          <UserRound className="size-4" />
          {account.loading ? '检查登录…' : account.account?.user.email ?? '未登录 · 登录'}
        </Button>
      </div>
      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-0 sm:max-w-xl">
          <AccountPage
            account={account.account}
            loading={account.loading}
            embedded
            onAuthenticated={(next) => {
              account.setAccount(next)
              setLoginOpen(false)
            }}
            onAccountChange={account.setAccount}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

function languageSummary(
  conversationLang: string,
  uiLang: string,
  level: string,
): string {
  const conv = APP_LANGUAGE_OPTIONS.find((o) => o.value === conversationLang)?.label ?? conversationLang
  const meaning = APP_LANGUAGE_OPTIONS.find((o) => o.value === uiLang)?.label ?? uiLang
  const lvl = LEARNER_LEVEL_OPTIONS.find((o) => o.value === level)?.label ?? level
  return `${conv} · 释义${meaning} · ${lvl}`
}

function usePaperTheme() {
  const [dark, setDark] = useState(() => {
    if (typeof localStorage === 'undefined') return false
    return localStorage.getItem(THEME_KEY) === 'dark'
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light')
    } catch {
      // ignore
    }
  }, [dark])

  return { dark, toggle: () => setDark((d) => !d) }
}

function ShellHeader({
  dark,
  onToggleTheme,
  languageLocked,
  conversationLang,
  uiLang,
  level,
}: {
  dark: boolean
  onToggleTheme: () => void
  languageLocked?: boolean
  conversationLang: string
  uiLang: string
  level: string
}) {
  const productSurfaceMode = useConfig((s) => s.productSurfaceMode)

  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border/40 pb-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">KiboTalk 试用场</h1>
        <p className="text-sm text-muted-foreground">
          {productSurfaceMode === 'floating'
            ? '悬浮模拟 · 便利贴贴 Island'
            : '窗口模式 · 应用内卡片 · 侧栏留给实验室'}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PlaygroundConnectionStatus />
        <ProductSurfaceToggle />
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="paper-sheet max-w-[min(100%,18rem)] gap-1.5 border-border/50"
              disabled={languageLocked}
            >
              <Languages className="size-3.5 shrink-0" />
              <span className="truncate">
                {languageSummary(conversationLang, uiLang, level)}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-3">
            <div>
              <p className="text-sm font-medium">语言设置</p>
              <p className="text-xs text-muted-foreground">
                新开实时会话时快照生效
                {languageLocked ? ' · 当前会话已锁定' : null}
              </p>
            </div>
            <LanguagePrefsFields disabled={languageLocked} />
          </PopoverContent>
        </Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleTheme}
              aria-label={dark ? '切换亮色纸' : '切换暗色纸'}
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{dark ? '亮色纸' : '暗色纸'}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}

function LanguageOnboarding({
  onConfirm,
  dark,
  onToggleTheme,
}: {
  onConfirm: () => void
  dark: boolean
  onToggleTheme: () => void
}) {
  const conversationLang = useConfig((s) => s.conversationLang)
  const uiLang = useConfig((s) => s.uiLang)
  const level = useConfig((s) => s.level)

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <ShellHeader
          dark={dark}
          onToggleTheme={onToggleTheme}
          conversationLang={conversationLang}
          uiLang={uiLang}
          level={level}
        />
        <Card className="paper-sheet mx-auto max-w-lg border-0">
          <CardHeader>
            <CardTitle>选择语言</CardTitle>
            <CardDescription>
              首次使用请确认对话语言、界面 / 候选释义语言和当前水平。
              进入后仍可在顶部随时修改；进行中的实时会话会锁定，下一场生效。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <LanguagePrefsFields />
            <Button className="w-full" onClick={onConfirm}>
              确认并进入试用场
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState<PlaygroundTab>('enroll')
  const [tabReady, setTabReady] = useState(false)
  const [hasEmbedding, setHasEmbedding] = useState(false)
  const { dark, toggle: toggleTheme } = usePaperTheme()

  const languagesConfirmed = useConfig((s) => s.languagesConfirmed)
  const confirmLanguages = useConfig((s) => s.confirmLanguages)
  const liveSessionRunning = useConfig((s) => s.liveSessionRunning)
  const conversationLang = useConfig((s) => s.conversationLang)
  const uiLang = useConfig((s) => s.uiLang)
  const level = useConfig((s) => s.level)

  async function refreshEmbedding(preferTab?: PlaygroundTab) {
    try {
      const emb = await createCurrentSpeakerEmbeddingStorage().load()
      const enrolled = !!emb
      setHasEmbedding(enrolled)
      if (!tabReady || preferTab) {
        setTab(preferTab ?? (enrolled ? 'live' : 'enroll'))
        setTabReady(true)
      }
    } catch {
      setHasEmbedding(false)
      if (!tabReady) {
        setTab('enroll')
        setTabReady(true)
      }
    }
  }

  useEffect(() => {
    void refreshEmbedding()
  }, [])

  if (!languagesConfirmed) {
    return (
      <LanguageOnboarding
        onConfirm={confirmLanguages}
        dark={dark}
        onToggleTheme={toggleTheme}
      />
    )
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <ShellHeader
          dark={dark}
          onToggleTheme={toggleTheme}
          languageLocked={liveSessionRunning}
          conversationLang={conversationLang}
          uiLang={uiLang}
          level={level}
        />

        {!tabReady ? (
          <div className="paper-sheet px-4 py-10 text-center text-sm text-muted-foreground">
            正在读取本机声纹…
          </div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(v as PlaygroundTab)}>
            <TabsList className="paper-sheet h-auto w-full flex-wrap justify-start gap-1 border-0 p-1">
              <TabsTrigger value="live" className="gap-1.5">
                <StickyNote className="size-3.5" />
                实时会话
              </TabsTrigger>
              <TabsTrigger value="enroll" className="gap-1.5">
                <Fingerprint className="size-3.5" />
                声纹录入
              </TabsTrigger>
              <TabsTrigger value="vad" className="gap-1.5">
                <AudioLines className="size-3.5" />
                VAD 检测
              </TabsTrigger>
              <TabsTrigger value="direct" className="gap-1.5">
                <Cable className="size-3.5" />
                直连 API
              </TabsTrigger>
            </TabsList>
            <TabsContent value="live" className="mt-4">
              <LiveSession
                hasEmbedding={hasEmbedding}
                onGoEnroll={() => setTab('enroll')}
              />
            </TabsContent>
            <TabsContent value="enroll" className="mt-4">
              <Enrollment
                onEnrolled={() => {
                  void refreshEmbedding()
                }}
                onGoLive={() => setTab('live')}
              />
            </TabsContent>
            <TabsContent value="vad" className="mt-4">
              <VadPanel />
            </TabsContent>
            <TabsContent value="direct" className="mt-4">
              <DirectApi />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
