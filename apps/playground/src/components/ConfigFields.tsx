import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Slider,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@kibotalk/ui'
import type { AppLanguage, LearnerLevel } from '@kibotalk/conversation'
import {
  APP_LANGUAGE_OPTIONS,
  LEARNER_LEVEL_OPTIONS,
  useConfig,
} from '../config-store'
import { SILERO_VARIANTS } from '../audio/silero-vad'
import { SttProviderSelect } from '../SttProviderSelect'
import { useTranscribeProvider } from '../SttProviderSelect'
import type { TranscribeMode } from '../config-store'

/** Shared numeric field. Reads/writes nothing itself — fully controlled. */
export function NumberField({
  label,
  value,
  step,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string
  value: number
  step: number
  min?: number
  max?: number
  disabled?: boolean
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        value={value}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(v)
        }}
        className="h-8"
      />
    </div>
  )
}

/** 0–1 threshold with Slider + numeric readout. */
export function ThresholdSlider({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string
  hint?: string
  value: number
  disabled?: boolean
  onChange: (v: number) => void
}) {
  const readout = value.toFixed(2)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {hint ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Label className="cursor-help text-xs text-muted-foreground">{label}</Label>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              {hint}
            </TooltipContent>
          </Tooltip>
        ) : (
          <Label className="text-xs text-muted-foreground">{label}</Label>
        )}
        <span className="text-xs tabular-nums text-foreground">{readout}</span>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={1}
        step={0.01}
        disabled={disabled}
        onValueChange={([v]) => {
          if (typeof v === 'number' && Number.isFinite(v)) onChange(v)
        }}
      />
    </div>
  )
}

/** VAD cut stage: thresholds, silence, min speech. */
export function VadParamsFields() {
  const speechThreshold = useConfig((s) => s.speechThreshold)
  const exitThreshold = useConfig((s) => s.exitThreshold)
  const minSilenceDurationMs = useConfig((s) => s.minSilenceDurationMs)
  const minSpeechDurationMs = useConfig((s) => s.minSpeechDurationMs)
  const patch = useConfig((s) => s.patch)
  return (
    <>
      <ThresholdSlider
        label="进入阈值"
        hint="语音概率超过此值视为开始说话（默认 0.5）"
        value={speechThreshold}
        onChange={(v) => patch({ speechThreshold: v })}
      />
      <ThresholdSlider
        label="退出阈值"
        hint="语音概率低于此值并持续静音后结束本段（默认 0.3）"
        value={exitThreshold}
        onChange={(v) => patch({ exitThreshold: v })}
      />
      <NumberField label="静音结束 ms（200）" value={minSilenceDurationMs} step={50} min={0}
        onChange={(v) => patch({ minSilenceDurationMs: v })} />
      <NumberField label="最短语音 ms（200）" value={minSpeechDurationMs} step={50} min={0}
        onChange={(v) => patch({ minSpeechDurationMs: v })} />
    </>
  )
}

/** ASR-send padding (applied at ASR send; VAD cuts stay tight). */
export function AsrPadFields() {
  const prePadMs = useConfig((s) => s.prePadMs)
  const postPadMs = useConfig((s) => s.postPadMs)
  const patch = useConfig((s) => s.patch)
  return (
    <>
      <NumberField label="前填充 ms（80）·ASR" value={prePadMs} step={10} min={0}
        onChange={(v) => patch({ prePadMs: v })} />
      <NumberField label="后填充 ms（80）·ASR" value={postPadMs} step={10} min={0}
        onChange={(v) => patch({ postPadMs: v })} />
    </>
  )
}

/** Merge / scheduling: single pause + max speech length (TurnGate). */
export function MergeParamsFields({ disabled }: { disabled?: boolean }) {
  const pauseMs = useConfig((s) => s.pauseMs)
  const mergeMaxMs = useConfig((s) => s.mergeMaxMs)
  const patch = useConfig((s) => s.patch)
  return (
    <>
      <NumberField label="暂停 ms（500）·成句" value={pauseMs} step={100} min={0} disabled={disabled}
        onChange={(v) => patch({ pauseMs: v })} />
      <NumberField label="合并上限 ms（30000）·语音" value={mergeMaxMs} step={1000} min={0} disabled={disabled}
        onChange={(v) => patch({ mergeMaxMs: v })} />
    </>
  )
}

/** VAD model selector (Silero v5 / v6.2). */
export function VadModelSelect({ disabled }: { disabled?: boolean }) {
  const vadVariantId = useConfig((s) => s.vadVariantId)
  const patch = useConfig((s) => s.patch)
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">VAD 模型</Label>
      <Select
        value={vadVariantId}
        onValueChange={(v) => patch({ vadVariantId: v })}
        disabled={disabled}
      >
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SILERO_VARIANTS.map((v) => (
            <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Transcribe mode: aggregate (merge) vs per-segment. */
export function TranscribeModeSelect({ disabled }: { disabled?: boolean }) {
  const transcribeMode = useConfig((s) => s.transcribeMode)
  const patch = useConfig((s) => s.patch)
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">转写模式</Label>
      <Select
        value={transcribeMode}
        onValueChange={(v) => patch({ transcribeMode: v as TranscribeMode })}
        disabled={disabled}
      >
        <SelectTrigger className="h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="aggregated">聚合（合并多段）</SelectItem>
          <SelectItem value="perSegment">逐段</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

/** STT provider selector wired to the shared store (auto-bootstraps to active). */
export function TranscribeProviderSelect({
  allowOff = true,
  modeFilter,
}: {
  allowOff?: boolean
  modeFilter?: 'batch' | 'realtime'
}) {
  const { providers, provider } = useTranscribeProvider()
  const patch = useConfig((s) => s.patch)
  const filtered = modeFilter
    ? providers.filter((p) => (p.mode ?? 'batch') === modeFilter)
    : providers
  const value =
    provider && filtered.some((p) => p.id === provider) ? provider : null
  const warnRealtimeOnBatchPage =
    modeFilter === 'batch'
    && provider
    && providers.find((p) => p.id === provider)?.mode === 'realtime'

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">自动转写</Label>
      <SttProviderSelect
        providers={filtered}
        value={value}
        onChange={(p) => patch({ transcribeProvider: p })}
        allowOff={allowOff}
      />
      {warnRealtimeOnBatchPage ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          当前为实时 provider，本页仅 batch；请另选 batch，或到「实时会话」使用
        </p>
      ) : null}
    </div>
  )
}

/** Conversation / meaning language + current conversation-lang level. */
export function LanguagePrefsFields({ disabled }: { disabled?: boolean }) {
  const conversationLang = useConfig((s) => s.conversationLang)
  const meaningLang = useConfig((s) => s.meaningLang)
  const levelByLang = useConfig((s) => s.levelByLang)
  const setConversationLang = useConfig((s) => s.setConversationLang)
  const setMeaningLang = useConfig((s) => s.setMeaningLang)
  const setCurrentLevel = useConfig((s) => s.setCurrentLevel)
  const level = levelByLang[conversationLang]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">对话语言</Label>
        <Select
          value={conversationLang}
          onValueChange={(v) => setConversationLang(v as AppLanguage)}
          disabled={disabled}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {APP_LANGUAGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">翻译语言</Label>
        <Select
          value={meaningLang}
          onValueChange={(v) => setMeaningLang(v as AppLanguage)}
          disabled={disabled}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {APP_LANGUAGE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">水平</Label>
        <Select
          value={level}
          onValueChange={(v) => setCurrentLevel(v as LearnerLevel)}
          disabled={disabled}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LEARNER_LEVEL_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
