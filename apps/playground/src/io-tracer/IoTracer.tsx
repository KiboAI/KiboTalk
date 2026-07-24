import type { IOSubsystem } from '@kibotalk/observability'
import { Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@kibotalk/ui'
import { ChevronDown, Activity } from 'lucide-react'
import { useRef, useState } from 'react'
import { IoTracerChart, type IoTracerChartHandle } from './IoTracerChart'
import { IoTracerControls } from './IoTracerControls'
import { IoTracerDetail } from './IoTracerDetail'
import { IoTracerMetrics } from './IoTracerMetrics'
import { IoTracerTurnList } from './IoTracerTurnList'
import { useIoTracerStore } from './store'

export type IoTracerProps = {
  /** When true, panel starts expanded. Default collapsed. */
  defaultOpen?: boolean
}

export function IoTracer({ defaultOpen = false }: IoTracerProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [hiddenSubsystems, setHiddenSubsystems] = useState(() => new Set<IOSubsystem>())
  const [selectedTurnId, setSelectedTurnId] = useState<string | null>(null)
  const chartRef = useRef<IoTracerChartHandle>(null)

  const turns = useIoTracerStore((s) => s.turns)
  const isRecording = useIoTracerStore((s) => s.isRecording)
  const selectedSpanId = useIoTracerStore((s) => s.selectedSpanId)
  const selectedSpan = useIoTracerStore((s) => s.selectedSpan)
  const recordingStartTs = useIoTracerStore((s) => s.recordingStartTs)
  const rawSpanCount = useIoTracerStore((s) => s.rawSpanCount)
  const startRecording = useIoTracerStore((s) => s.startRecording)
  const stopRecording = useIoTracerStore((s) => s.stopRecording)
  const clear = useIoTracerStore((s) => s.clear)
  const selectSpan = useIoTracerStore((s) => s.selectSpan)
  const exportOTLP = useIoTracerStore((s) => s.exportOTLP)

  const filteredTurns = selectedTurnId
    ? turns.filter((t) => t.id === selectedTurnId)
    : turns

  function toggleSubsystem(subsystem: IOSubsystem) {
    setHiddenSubsystems((prev) => {
      const next = new Set(prev)
      if (next.has(subsystem)) next.delete(subsystem)
      else next.add(subsystem)
      return next
    })
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="paper-sheet">
        <div className="flex items-center gap-2 px-3 py-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1.5">
              <Activity className="size-3.5" />
              时间流
              <ChevronDown
                className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
              />
            </Button>
          </CollapsibleTrigger>
          <span className="text-xs text-muted-foreground">
            {isRecording ? '录制中' : '已停止'}
            {turns.length > 0 ? ` · ${turns.length} 轮` : ''}
          </span>
        </div>

        <CollapsibleContent>
          <div className="flex h-[28rem] flex-col border-t border-border/40">
            <IoTracerControls
              isRecording={isRecording}
              turnCount={turns.length}
              spanCount={rawSpanCount}
              hiddenSubsystems={hiddenSubsystems}
              onToggleRecording={() => {
                if (isRecording) stopRecording()
                else startRecording()
              }}
              onClear={clear}
              onAutoFit={() => chartRef.current?.autoFit()}
              onToggleSubsystem={toggleSubsystem}
              onExportOtlp={exportOTLP}
            />
            <IoTracerMetrics turns={turns} />
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <IoTracerTurnList
                turns={turns}
                selectedTurnId={selectedTurnId}
                onSelectTurn={setSelectedTurnId}
              />
              <IoTracerChart
                ref={chartRef}
                turns={filteredTurns}
                selectedSpanId={selectedSpanId}
                timeOrigin={recordingStartTs}
                hiddenSubsystems={hiddenSubsystems}
                onSelectSpan={selectSpan}
              />
              <IoTracerDetail
                span={selectedSpan?.span}
                turn={selectedSpan?.turn}
                onClose={() => selectSpan(null)}
                onSelectSpan={selectSpan}
              />
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
