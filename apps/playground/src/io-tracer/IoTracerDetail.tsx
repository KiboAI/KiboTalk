import type { IOSpan, IOTurn } from '@kibotalk/observability'
import { useMemo } from 'react'
import { X } from 'lucide-react'
import { SUBSYSTEM_CONFIG_MAP, fmtMs } from './types'

export type IoTracerDetailProps = {
  span: IOSpan | undefined
  turn: IOTurn | undefined
  onClose: () => void
  onSelectSpan: (spanId: string) => void
}

export function IoTracerDetail({ span, turn, onClose, onSelectSpan }: IoTracerDetailProps) {
  const duration = span?.endTs != null && span ? span.endTs - span.startTs : null
  const relativeStart = span && turn ? span.startTs - turn.startTs : 0
  const relativeEnd = span?.endTs != null && turn ? span.endTs - turn.startTs : null

  const timingBar = useMemo(() => {
    if (!turn || !span) return null
    const turnDur = (turn.endTs ?? performance.now()) - turn.startTs
    if (turnDur <= 0) return null
    const start = (span.startTs - turn.startTs) / turnDur
    const end = ((span.endTs ?? performance.now()) - turn.startTs) / turnDur
    return {
      startPct: `${(start * 100).toFixed(1)}%`,
      widthPct: `${((end - start) * 100).toFixed(1)}%`,
    }
  }, [span, turn])

  const relatedSpans = useMemo(() => {
    if (!turn || !span) return []
    return turn.spans
      .filter((s) => s.id !== span.id)
      .slice(0, 10)
      .map((s) => ({
        id: s.id,
        name: s.name,
        label: SUBSYSTEM_CONFIG_MAP.get(s.subsystem)?.label ?? s.subsystem,
        color: SUBSYSTEM_CONFIG_MAP.get(s.subsystem)?.color ?? '#888',
        duration: s.endTs ? fmtMs(s.endTs - s.startTs) : 'live',
      }))
  }, [span, turn])

  const metaEntries = useMemo(() => {
    if (!span) return []
    const skip = new Set(['endTs'])
    return Object.entries(span.meta)
      .filter(([k]) => !skip.has(k))
      .map(([key, value]) => ({
        key,
        value: typeof value === 'object' ? JSON.stringify(value) : String(value),
        isLong: typeof value === 'string' && value.length > 60,
      }))
  }, [span])

  const eventEntries = useMemo(() => {
    if (!span) return []
    return (span.events ?? []).map((event) => ({
      name: event.name,
      relativeTime: fmtMs(event.timeTs - span.startTs),
      meta: Object.entries(event.meta).map(([key, value]) => ({
        key: key.includes('.') ? key.split('.').at(-1)! : key,
        value: typeof value === 'object' ? JSON.stringify(value) : String(value),
      })),
    }))
  }, [span])

  function copyValue(value: string) {
    void navigator.clipboard.writeText(value)
  }

  if (!span || !turn) {
    return (
      <div className="flex min-h-0 min-w-0 flex-col items-center justify-center border-l border-border/60 bg-background text-muted-foreground">
        <span className="text-xs">点击 span 查看详情</span>
      </div>
    )
  }

  const color = SUBSYSTEM_CONFIG_MAP.get(span.subsystem)?.color

  return (
    <div className="min-h-0 min-w-0 overflow-y-auto border-l border-border/60 bg-background">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="size-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: color }} />
          <span className="truncate text-sm font-medium">
            {SUBSYSTEM_CONFIG_MAP.get(span.subsystem)?.label}
          </span>
          <span className="text-xs text-muted-foreground">{span.name}</span>
        </div>
        <button
          type="button"
          className="flex-shrink-0 p-1 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label="关闭"
        >
          <X className="size-4" />
        </button>
      </div>

      {timingBar ? (
        <div className="border-b border-border/40 px-3 py-2">
          <div className="mb-1 text-[11px] text-muted-foreground">在本轮中的位置</div>
          <div className="relative h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="absolute h-full rounded-full opacity-80"
              style={{
                left: timingBar.startPct,
                width: timingBar.widthPct,
                backgroundColor: color,
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 px-3 py-2 text-xs">
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Timing
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {duration !== null ? (
              <>
                <span className="text-muted-foreground">Duration</span>
                <span className="font-mono font-medium">{fmtMs(duration)}</span>
              </>
            ) : (
              <>
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium text-amber-500">进行中</span>
              </>
            )}
            <span className="text-muted-foreground">Start</span>
            <span className="font-mono">+{fmtMs(relativeStart)}</span>
            {relativeEnd !== null ? (
              <>
                <span className="text-muted-foreground">End</span>
                <span className="font-mono">+{fmtMs(relativeEnd)}</span>
              </>
            ) : null}
            {span.meta.ttftMs ? (
              <>
                <span className="text-purple-500">TTFT</span>
                <span className="font-mono font-medium text-purple-500">
                  {fmtMs(span.meta.ttftMs)}
                </span>
              </>
            ) : null}
          </div>
        </div>

        {span.meta.text ? (
          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Text
            </div>
            <div className="group relative max-h-32 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-2 font-mono text-[11px]">
              {span.meta.text}
              <button
                type="button"
                className="absolute right-1 top-1 rounded bg-muted p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                title="复制"
                onClick={() => copyValue(String(span.meta.text))}
              >
                复制
              </button>
            </div>
          </div>
        ) : null}

        {eventEntries.length > 0 ? (
          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Events
            </div>
            <div className="flex flex-col gap-1.5">
              {eventEntries.map((entry) => (
                <div
                  key={`${entry.name}:${entry.relativeTime}`}
                  className="rounded border border-border/40 bg-muted/40 p-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px]">{entry.name}</span>
                    <span className="flex-shrink-0 font-mono text-[11px] text-muted-foreground">
                      +{entry.relativeTime}
                    </span>
                  </div>
                  {entry.meta.length > 0 ? (
                    <div className="mt-1 flex flex-col gap-0.5">
                      {entry.meta.map((item) => (
                        <div key={item.key} className="grid grid-cols-[auto_1fr] gap-x-2">
                          <span className="text-[11px] text-muted-foreground">{item.key}</span>
                          <span className="truncate font-mono text-[11px]">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {metaEntries.length > 0 ? (
          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Attributes
            </div>
            <div className="flex flex-col gap-1">
              {metaEntries.map((entry) => (
                <div key={entry.key} className="group grid grid-cols-[auto_1fr] items-start gap-x-2">
                  <span className="text-[11px] text-muted-foreground">{entry.key}</span>
                  <div className="flex items-start gap-1">
                    <span
                      className={`font-mono text-[11px] ${entry.isLong ? 'break-all' : 'truncate'}`}
                    >
                      {entry.value}
                    </span>
                    <button
                      type="button"
                      className="flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      title="复制"
                      onClick={() => copyValue(entry.value)}
                    >
                      复制
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {relatedSpans.length > 0 ? (
          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              同轮相关 spans
            </div>
            <div className="flex flex-col gap-0.5">
              {relatedSpans.map((rs) => (
                <button
                  key={rs.id}
                  type="button"
                  className="flex items-center gap-1.5 rounded px-1.5 py-1 text-left transition-colors hover:bg-muted/50"
                  onClick={() => onSelectSpan(rs.id)}
                >
                  <div
                    className="size-1.5 flex-shrink-0 rounded-sm"
                    style={{ backgroundColor: rs.color }}
                  />
                  <span className="flex-shrink-0 text-[11px] text-muted-foreground">{rs.label}</span>
                  <span className="truncate text-[11px]">{rs.name}</span>
                  <span className="ml-auto flex-shrink-0 font-mono text-[11px] text-muted-foreground">
                    {rs.duration}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Identity
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <span className="text-[11px] text-muted-foreground">Trace</span>
            <span className="font-mono text-[11px]">{span.traceId.slice(0, 16)}…</span>
            <span className="text-[11px] text-muted-foreground">Span</span>
            <span className="font-mono text-[11px]">{span.id.slice(0, 16)}</span>
            {span.parentSpanId ? (
              <>
                <span className="text-[11px] text-muted-foreground">Parent</span>
                <span className="font-mono text-[11px]">{span.parentSpanId.slice(0, 16)}</span>
              </>
            ) : null}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Turn
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <span className="text-[11px] text-muted-foreground">Spans</span>
            <span className="text-[11px]">{turn.spans.length}</span>
            {turn.endTs ? (
              <>
                <span className="text-[11px] text-muted-foreground">Total</span>
                <span className="font-mono text-[11px]">{fmtMs(turn.endTs - turn.startTs)}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
