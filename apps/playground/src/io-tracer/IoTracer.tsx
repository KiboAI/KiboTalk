import type { IOSubsystem } from '@kibotalk/observability'
import { useRef, useState } from 'react'
import { IoTracerChart, type IoTracerChartHandle } from './IoTracerChart'
import { IoTracerControls } from './IoTracerControls'
import { IoTracerDetail } from './IoTracerDetail'
import { IoTracerMetrics } from './IoTracerMetrics'
import { IoTracerTurnList } from './IoTracerTurnList'
import { useIoTracerStore } from './store'

/** Full IO timeline panel — intended for Dialog / wide surfaces. */
export function IoTracer() {
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
    <div className="flex h-[min(70dvh,36rem)] min-h-0 w-full flex-col overflow-hidden rounded-lg border border-border bg-card">
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
      <div className="grid min-h-0 flex-1 grid-cols-[14rem_minmax(0,1fr)_18rem] overflow-hidden">
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
  )
}
