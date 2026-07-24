import type { IOSubsystem, IOTurn } from '@kibotalk/observability'
import { useMemo } from 'react'
import { SUBSYSTEM_CONFIG_MAP, fmtMs } from './types'

export type IoTracerMetricsProps = {
  turns: IOTurn[]
}

type SubsystemMetric = {
  subsystem: IOSubsystem
  label: string
  color: string
  totalMs: number
  count: number
}

export function IoTracerMetrics({ turns }: IoTracerMetricsProps) {
  const metrics = useMemo(() => {
    if (turns.length === 0) return null

    let e2eTotal = 0
    let e2eCount = 0
    let ttftTotal = 0
    let ttftCount = 0
    const subsystemAccum = new Map<IOSubsystem, { totalMs: number; count: number }>()

    for (const turn of turns) {
      if (turn.endTs) {
        e2eTotal += turn.endTs - turn.startTs
        e2eCount++
      }
      for (const span of turn.spans) {
        if (span.meta.ttftMs) {
          ttftTotal += span.meta.ttftMs
          ttftCount++
        }
        if (span.endTs) {
          const acc = subsystemAccum.get(span.subsystem) ?? { totalMs: 0, count: 0 }
          acc.totalMs += span.endTs - span.startTs
          acc.count++
          subsystemAccum.set(span.subsystem, acc)
        }
      }
    }

    const subsystems: SubsystemMetric[] = []
    for (const [subsystem, acc] of subsystemAccum) {
      const config = SUBSYSTEM_CONFIG_MAP.get(subsystem)
      if (config) {
        subsystems.push({
          subsystem,
          label: config.label,
          color: config.color,
          totalMs: acc.totalMs / acc.count,
          count: acc.count,
        })
      }
    }

    const bottleneckSubsystem = subsystems.reduce<SubsystemMetric | null>(
      (max, l) => (!max || l.totalMs > max.totalMs ? l : max),
      null,
    )

    return {
      e2eAvg: e2eCount > 0 ? e2eTotal / e2eCount : null,
      ttftAvg: ttftCount > 0 ? ttftTotal / ttftCount : null,
      subsystems,
      bottleneckSubsystem: bottleneckSubsystem?.subsystem ?? null,
    }
  }, [turns])

  if (!metrics) return null

  return (
    <div className="flex flex-shrink-0 items-center gap-4 overflow-x-auto border-b border-border/60 bg-muted/30 px-3 py-1.5 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">E2E</span>
        <span className="font-mono font-medium">
          {metrics.e2eAvg !== null ? fmtMs(metrics.e2eAvg) : '—'}
        </span>
      </div>

      {metrics.ttftAvg !== null ? (
        <div className="flex items-center gap-1.5">
          <span className="text-purple-500">TTFT</span>
          <span className="font-mono font-medium text-purple-600 dark:text-purple-400">
            {fmtMs(metrics.ttftAvg)}
          </span>
        </div>
      ) : null}

      <div className="h-4 w-px bg-border" />

      {metrics.subsystems.map((ss) => (
        <div key={ss.subsystem} className="flex items-center gap-1">
          <div className="size-2 rounded-sm" style={{ backgroundColor: ss.color }} />
          <span className="text-muted-foreground">{ss.label}</span>
          <span
            className={`font-mono ${
              ss.subsystem === metrics.bottleneckSubsystem ? 'font-medium text-red-500' : ''
            }`}
          >
            {fmtMs(ss.totalMs)}
          </span>
          {ss.subsystem === metrics.bottleneckSubsystem ? (
            <span className="text-[11px] text-red-400">bottleneck</span>
          ) : null}
        </div>
      ))}
    </div>
  )
}
