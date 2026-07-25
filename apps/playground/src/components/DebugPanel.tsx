import {
  Button,
  Label,
  ScrollArea,
  Separator,
} from '@kibotalk/ui'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useConfig } from '../config-store'
import {
  VadParamsFields,
  AsrPadFields,
  MergeParamsFields,
  VadModelSelect,
  TranscribeModeSelect,
  NumberField,
  ThresholdSlider,
} from './ConfigFields'
import { SttProviderSelect, useTranscribeProvider, providerMode } from '../SttProviderSelect'
import { IoTracer } from '../io-tracer/IoTracer'

export type DebugPanelProps = {
  running: boolean
}

export function DebugPanel({ running }: DebugPanelProps) {
  const speakerThreshold = useConfig((s) => s.speakerThreshold)
  const candidateRoundsMax = useConfig((s) => s.candidateRoundsMax)
  const transcribeMode = useConfig((s) => s.transcribeMode)
  const mergeEnabled = transcribeMode === 'aggregated'
  const patch = useConfig((s) => s.patch)
  const { providers, provider } = useTranscribeProvider()
  const sttIsRealtime = providerMode(providers, provider) === 'realtime'

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
            <VadModelSelect disabled={running} />
            {!sttIsRealtime && <TranscribeModeSelect disabled={running} />}
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
            <AsrPadFields />
            <ThresholdSlider
              label="说话人阈值"
              hint="与声纹相似度高于此值判为我（默认 0.49）"
              value={speakerThreshold}
              onChange={(v) => patch({ speakerThreshold: v })}
            />
            <MergeParamsFields disabled={!mergeEnabled && !sttIsRealtime} />
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

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">时间流 · IO 追踪</p>
            <IoTracer />
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
