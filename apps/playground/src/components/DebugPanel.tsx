import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Label,
  ScrollArea,
  Separator,
} from '@kibotalk/ui'
import { Activity, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useConfig } from '../config-store'
import {
  VadParamsFields,
  MergeParamsFields,
  RelayNodeSelect,
  VadModelSelect,
  NumberField,
  ThresholdSlider,
} from './ConfigFields'
import { SttProviderSelect, useTranscribeProvider } from '../SttProviderSelect'
import { IoTracer } from '../io-tracer/IoTracer'
import { useIoTracerStore } from '../io-tracer/store'

export type DebugPanelProps = {
  running: boolean
}

export function DebugPanel({ running }: DebugPanelProps) {
  const speakerThreshold = useConfig((s) => s.speakerThreshold)
  const candidateRoundsMax = useConfig((s) => s.candidateRoundsMax)
  const patch = useConfig((s) => s.patch)
  const { providers, provider } = useTranscribeProvider()
  const isRecording = useIoTracerStore((s) => s.isRecording)
  const turnCount = useIoTracerStore((s) => s.turns.length)

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div>
        <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <SlidersHorizontal className="size-3.5" />
          调试
        </h3>
        <p className="text-xs text-muted-foreground">实验室参数 · 实时生效</p>
      </div>
      <ScrollArea className="min-h-0 flex-1 pr-2">
        <div className="space-y-4 pb-6">
          <div className="space-y-3">
            <RelayNodeSelect disabled={running} />
            <VadModelSelect disabled={running} />
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">STT</Label>
              <SttProviderSelect
                providers={providers}
                value={provider}
                onChange={(id) => patch({ transcribeProvider: id })}
                allowOff={false}
                disabled={running}
              />
            </div>
          </div>

          <Separator />

          <div className="grid gap-3">
            <VadParamsFields />
            <ThresholdSlider
              label="说话人阈值"
              hint="与声纹相似度高于此值判为我（默认 0.49）"
              value={speakerThreshold}
              onChange={(v) => patch({ speakerThreshold: v })}
            />
            <MergeParamsFields />
            <NumberField
              label="可见候选轮数 N"
              value={candidateRoundsMax}
              step={1}
              min={1}
              max={6}
              onChange={(v) => patch({ candidateRoundsMax: Math.round(v) })}
            />
            <p className="text-[11px] text-muted-foreground">
              最新轮置顶；超出 N 的旧轮不再显示。文字不会被遮挡。
            </p>
          </div>

          <Button variant="outline" size="sm" onClick={() => useConfig.getState().reset()}>
            <RotateCcw className="size-3.5" />
            恢复默认
          </Button>

          <Separator />

          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-start gap-1.5">
                <Activity className="size-3.5" />
                时间流 · IO 追踪
                <span className="ml-auto text-xs text-muted-foreground">
                  {isRecording ? '录制中' : '已停止'}
                  {turnCount > 0 ? ` · ${turnCount} 轮` : ''}
                </span>
              </Button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-hidden sm:max-w-5xl">
              <DialogHeader>
                <DialogTitle>时间流 · IO 追踪</DialogTitle>
                <DialogDescription>
                  查看会话期间的子系统时序与 IO 跨度；不影响产品主舞台布局。
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-hidden">
                <IoTracer />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </ScrollArea>
    </div>
  )
}
