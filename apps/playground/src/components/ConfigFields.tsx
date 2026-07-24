import { Input, Label } from '@kibotalk/ui'
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

/** VAD cut stage: thresholds, silence, min speech. */
export function VadParamsFields() {
  const speechThreshold = useConfig((s) => s.speechThreshold)
  const exitThreshold = useConfig((s) => s.exitThreshold)
  const minSilenceDurationMs = useConfig((s) => s.minSilenceDurationMs)
  const minSpeechDurationMs = useConfig((s) => s.minSpeechDurationMs)
  const patch = useConfig((s) => s.patch)
  return (
    <>
      <NumberField label="进入阈值（0.5）" value={speechThreshold} step={0.01} min={0} max={1}
        onChange={(v) => patch({ speechThreshold: v })} />
      <NumberField label="退出阈值（0.3）" value={exitThreshold} step={0.01} min={0} max={1}
        onChange={(v) => patch({ exitThreshold: v })} />
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
    <span className="flex items-center gap-2 text-sm">
      <span className="font-medium">VAD 模型：</span>
      <select
        value={vadVariantId}
        onChange={(e) => patch({ vadVariantId: e.target.value })}
        disabled={disabled}
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm disabled:opacity-50"
      >
        {SILERO_VARIANTS.map((v) => (
          <option key={v.id} value={v.id}>{v.label}</option>
        ))}
      </select>
    </span>
  )
}

/** Transcribe mode: aggregate (merge) vs per-segment. */
export function TranscribeModeSelect({ disabled }: { disabled?: boolean }) {
  const transcribeMode = useConfig((s) => s.transcribeMode)
  const patch = useConfig((s) => s.patch)
  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="font-medium">转写模式：</span>
      <select
        value={transcribeMode}
        onChange={(e) => patch({ transcribeMode: e.target.value as TranscribeMode })}
        disabled={disabled}
        className="h-9 rounded-md border border-input bg-transparent px-2 text-sm disabled:opacity-50"
      >
        <option value="aggregated">聚合（合并多段，保留中间静音）</option>
        <option value="perSegment">逐段（每个 VAD 片段单独转写）</option>
      </select>
    </span>
  )
}

/** STT provider selector wired to the shared store (auto-bootstraps to active). */
export function TranscribeProviderSelect({
  allowOff = true,
  /** When set, only providers of this mode are listed (VAD/DirectApi = batch). */
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
  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="font-medium">自动转写：</span>
      <SttProviderSelect
        providers={filtered}
        value={value}
        onChange={(p) => patch({ transcribeProvider: p })}
        allowOff={allowOff}
      />
      {modeFilter === 'batch' && provider && (providers.find((p) => p.id === provider)?.mode === 'realtime') && (
        <span className="text-xs text-amber-700">
          当前为实时 provider，本页仅 batch；请另选 batch，或到「实时会话」使用
        </span>
      )}
    </span>
  )
}

const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm disabled:opacity-50'

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
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <Label htmlFor="conversation-lang" className="text-xs text-muted-foreground whitespace-nowrap">
          对话语言
        </Label>
        <select
          id="conversation-lang"
          value={conversationLang}
          disabled={disabled}
          onChange={(e) => setConversationLang(e.target.value as AppLanguage)}
          className={selectClass}
        >
          {APP_LANGUAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="meaning-lang" className="text-xs text-muted-foreground whitespace-nowrap">
          翻译语言
        </Label>
        <select
          id="meaning-lang"
          value={meaningLang}
          disabled={disabled}
          onChange={(e) => setMeaningLang(e.target.value as AppLanguage)}
          className={selectClass}
        >
          {APP_LANGUAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="learner-level" className="text-xs text-muted-foreground whitespace-nowrap">
          水平
        </Label>
        <select
          id="learner-level"
          value={level}
          disabled={disabled}
          onChange={(e) => setCurrentLevel(e.target.value as LearnerLevel)}
          className={selectClass}
        >
          {LEARNER_LEVEL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
