import type { IOTurn } from '@kibotalk/observability'
import { IOSubsystems } from '@kibotalk/observability'
import { SUBSYSTEM_CONFIGS, fmtMs } from './types'

export type IoTracerTurnListProps = {
  turns: IOTurn[]
  selectedTurnId: string | null
  onSelectTurn: (turnId: string | null) => void
}

function turnDuration(turn: IOTurn): string {
  if (!turn.endTs) return 'live'
  return fmtMs(turn.endTs - turn.startTs)
}

function spanCountBySubsystem(turn: IOTurn) {
  const counts = new Map<string, number>()
  for (const span of turn.spans) {
    counts.set(span.subsystem, (counts.get(span.subsystem) ?? 0) + 1)
  }
  return SUBSYSTEM_CONFIGS.filter((c) => counts.has(c.subsystem)).map((c) => ({
    subsystem: c.label,
    count: counts.get(c.subsystem)!,
    color: c.color,
  }))
}

function getTtft(turn: IOTurn): number | undefined {
  for (const span of turn.spans) {
    if (span.subsystem === IOSubsystems.LLM && span.meta.ttftMs) return span.meta.ttftMs
  }
  return undefined
}

export function IoTracerTurnList({
  turns,
  selectedTurnId,
  onSelectTurn,
}: IoTracerTurnListProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-y-auto border-r border-border/60">
      <div className="border-b border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground">
        轮次
      </div>

      {selectedTurnId ? (
        <button
          type="button"
          className="border-b border-border/40 px-3 py-1.5 text-left text-xs text-blue-500 transition-colors hover:bg-blue-50 dark:hover:bg-blue-950"
          onClick={() => onSelectTurn(null)}
        >
          显示全部
        </button>
      ) : null}

      {turns.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-muted-foreground">
          尚无录制轮次
        </div>
      ) : null}

      {[...turns].reverse().map((turn) => {
        const ttft = getTtft(turn)
        return (
          <div
            key={turn.id}
            role="button"
            tabIndex={0}
            className={`cursor-pointer border-b border-border/40 px-3 py-2 transition-colors ${
              turn.id === selectedTurnId
                ? 'bg-blue-50 dark:bg-blue-950/50'
                : 'hover:bg-muted/50'
            }`}
            onClick={() => onSelectTurn(turn.id === selectedTurnId ? null : turn.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelectTurn(turn.id === selectedTurnId ? null : turn.id)
              }
            }}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-xs font-medium">#{turn.id.slice(0, 6)}</span>
              <span
                className={`rounded px-1 py-0.5 font-mono text-[11px] ${
                  turn.endTs
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-amber-100 text-amber-600 dark:bg-amber-900/30'
                }`}
              >
                {turnDuration(turn)}
              </span>
            </div>

            {turn.inputText ? (
              <div className="mb-1 truncate text-[11px] text-muted-foreground">
                {turn.inputText.slice(0, 50)}
                {turn.inputText.length > 50 ? '…' : ''}
              </div>
            ) : null}

            {ttft != null ? (
              <div className="mb-1 text-[11px] text-purple-500">TTFT: {fmtMs(ttft)}</div>
            ) : null}

            <div className="flex flex-wrap gap-1">
              {spanCountBySubsystem(turn).map((item) => (
                <span
                  key={item.subsystem}
                  className="rounded px-1 py-0.5 text-[11px]"
                  style={{ backgroundColor: `${item.color}15`, color: item.color }}
                >
                  {item.subsystem} {item.count}
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
