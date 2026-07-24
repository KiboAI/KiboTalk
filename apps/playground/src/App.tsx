import { useState } from 'react'
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@kibotalk/ui'
import PipelineSimulator from './PipelineSimulator'
import DirectApi from './DirectApi'
import LiveSession from './LiveSession'
import Enrollment from './Enrollment'
import VadPanel from './VadPanel'
import { useConfig } from './config-store'
import { LanguagePrefsFields } from './components/ConfigFields'

type Tab = 'vad' | 'pipeline' | 'direct' | 'live' | 'enroll'

function LanguageOnboarding({ onConfirm }: { onConfirm: () => void }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-lg px-6 py-16">
        <Card>
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
  const [tab, setTab] = useState<Tab>('vad')
  const languagesConfirmed = useConfig((s) => s.languagesConfirmed)
  const confirmLanguages = useConfig((s) => s.confirmLanguages)
  const liveSessionRunning = useConfig((s) => s.liveSessionRunning)

  if (!languagesConfirmed) {
    return <LanguageOnboarding onConfirm={confirmLanguages} />
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">KiboTalk 试用场</h1>
          <p className="text-sm text-muted-foreground">
            实时回复教练各能力模块的功能验证入口——不是 UI 组件库。
          </p>
        </header>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">语言设置</CardTitle>
            <CardDescription>
              随时可改；新开实时会话时快照生效。
              {liveSessionRunning ? ' 当前会话进行中，已锁定。' : null}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LanguagePrefsFields disabled={liveSessionRunning} />
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            <TabsTrigger value="vad">VAD 检测</TabsTrigger>
            <TabsTrigger value="pipeline">管线模拟器</TabsTrigger>
            <TabsTrigger value="direct">直连 API</TabsTrigger>
            <TabsTrigger value="live">实时会话</TabsTrigger>
            <TabsTrigger value="enroll">声纹录入</TabsTrigger>
          </TabsList>
          <TabsContent value="vad">
            <VadPanel />
          </TabsContent>
          <TabsContent value="pipeline">
            <PipelineSimulator />
          </TabsContent>
          <TabsContent value="direct">
            <DirectApi />
          </TabsContent>
          <TabsContent value="live">
            <LiveSession />
          </TabsContent>
          <TabsContent value="enroll">
            <Enrollment />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
