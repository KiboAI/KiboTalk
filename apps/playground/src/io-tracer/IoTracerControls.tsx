import type { IOSubsystem } from '@kibotalk/observability'
import { Button } from '@kibotalk/ui'
import { Download, Maximize2, Trash2 } from 'lucide-react'
import { SUBSYSTEM_CONFIG_MAP, SUBSYSTEM_CONFIGS } from './types'

export type IoTracerControlsProps = {
  isRecording: boolean
  turnCount: number
  spanCount: number
  hiddenSubsystems: Set<IOSubsystem>
  onToggleRecording: () => void
  onClear: () => void
  onAutoFit: () => void
  onToggleSubsystem: (subsystem: IOSubsystem) => void
  onExportOtlp: () => void
}

export function IoTracerControls({
  isRecording,
  turnCount,
  spanCount,
  hiddenSubsystems,
  onToggleRecording,
  onClear,
  onAutoFit,
  onToggleSubsystem,
  onExportOtlp,
}: IoTracerControlsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
      <Button
        size="sm"
        variant={isRecording ? 'destructive' : 'default'}
        className="gap-1.5"
        onClick={onToggleRecording}
      >
        <span
          className={`size-2.5 rounded-full ${isRecording ? 'animate-pulse bg-red-500' : 'bg-muted-foreground/50'}`}
        />
        {isRecording ? '停止录制' : '录制'}
      </Button>

      <Button size="sm" variant="outline" disabled={turnCount === 0} onClick={onClear}>
        <Trash2 className="size-3.5" />
        清除
      </Button>

      <Button size="sm" variant="outline" disabled={turnCount === 0} onClick={onAutoFit}>
        <Maximize2 className="size-3.5" />
        适配
      </Button>

      <div className="mx-1 h-4 w-px bg-border" />
      <span className="text-[11px] text-muted-foreground">子系统：</span>
      {SUBSYSTEM_CONFIGS.map((item) => {
        const hidden = hiddenSubsystems.has(item.subsystem)
        return (
          <button
            key={item.subsystem}
            type="button"
            className={`rounded px-1.5 py-0.5 text-[11px] border ${
              hidden
                ? 'border-border text-muted-foreground bg-transparent'
                : 'border-transparent text-white'
            }`}
            style={hidden ? undefined : { backgroundColor: SUBSYSTEM_CONFIG_MAP.get(item.subsystem)?.color }}
            onClick={() => onToggleSubsystem(item.subsystem)}
          >
            {item.label}
          </button>
        )
      })}

      <div className="mx-1 h-4 w-px bg-border" />

      <Button size="sm" variant="outline" disabled={spanCount === 0} onClick={onExportOtlp}>
        <Download className="size-3.5" />
        导出 OTLP
      </Button>

      <div className="flex-1" />

      <span className="text-xs text-muted-foreground">
        {turnCount} 轮 · {spanCount} spans
      </span>
    </div>
  )
}
