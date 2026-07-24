import { useEffect, useState } from 'react'
import { Moon, Sun, Languages, StickyNote, Fingerprint, AudioLines, Cable } from 'lucide-react'
import { IndexedDbEmbeddingStorage } from '@kibotalk/speaker'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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

function languageSummary(
  conversationLang: string,
  meaningLang: string,
  level: string,
): string {
  const conv = APP_LANGUAGE_OPTIONS.find((o) => o.value === conversationLang)?.label ?? conversationLang
  const meaning = APP_LANGUAGE_OPTIONS.find((o) => o.value === meaningLang)?.label ?? meaningLang
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
  meaningLang,
  level,
}: {
  dark: boolean
  onToggleTheme: () => void
  languageLocked?: boolean
  conversationLang: string
  meaningLang: string
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
                {languageSummary(conversationLang, meaningLang, level)}
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
  const meaningLang = useConfig((s) => s.meaningLang)
  const levelByLang = useConfig((s) => s.levelByLang)
  const level = levelByLang[conversationLang]

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <ShellHeader
          dark={dark}
          onToggleTheme={onToggleTheme}
          conversationLang={conversationLang}
          meaningLang={meaningLang}
          level={level}
        />
        <Card className="paper-sheet mx-auto max-w-lg border-0">
          <CardHeader>
            <CardTitle>选择语言</CardTitle>
            <CardDescription>
              首次使用请确认对话语言（双方说的语言）、翻译语言（候选释义）和当前水平。
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
  const meaningLang = useConfig((s) => s.meaningLang)
  const levelByLang = useConfig((s) => s.levelByLang)
  const level = levelByLang[conversationLang]

  async function refreshEmbedding(preferTab?: PlaygroundTab) {
    try {
      const emb = await new IndexedDbEmbeddingStorage().load()
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
          meaningLang={meaningLang}
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
