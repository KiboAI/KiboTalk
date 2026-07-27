import type { IOSpan, IOSubsystem, IOTurn } from '@kibotalk/observability'
import { IOSubsystems } from '@kibotalk/observability'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useElementSize } from './use-element-size'
import {
  GAP_WARN_THRESHOLD_MS,
  LABEL_COL_WIDTH,
  MINIMAP_HEIGHT,
  ROW_HEIGHT,
  ROW_PADDING,
  SUBSYSTEM_CONFIG_MAP,
  TIME_AXIS_HEIGHT,
  fmtMs,
} from './types'

export type IoTracerChartHandle = {
  autoFit: () => void
}

export type IoTracerChartProps = {
  turns: IOTurn[]
  selectedSpanId: string | null
  timeOrigin: number
  hiddenSubsystems: Set<IOSubsystem>
  onSelectSpan: (spanId: string | null) => void
}

type TurnSeparator = { type: 'turn-separator'; y: number }
type SpanRow = {
  type: 'span'
  span: IOSpan
  turn: IOTurn
  subsystem: IOSubsystem
  y: number
}
type LayoutRow = TurnSeparator | SpanRow

type GapAnnotation = {
  startTs: number
  endTs: number
  durationMs: number
  y: number
}

export const IoTracerChart = forwardRef<IoTracerChartHandle, IoTracerChartProps>(
  function IoTracerChart(
    { turns: turnsProp, selectedSpanId, timeOrigin, hiddenSubsystems, onSelectSpan },
    ref,
  ) {
    const { ref: containerRef, width: containerWidth, left: containerLeft } =
      useElementSize<HTMLDivElement>()
    const { ref: minimapRef, left: minimapLeft } = useElementSize<HTMLDivElement>()
    const scrollAreaRef = useRef<HTMLDivElement>(null)

    const [hoveredSpan, setHoveredSpan] = useState<{
      span: IOSpan
      turn: IOTurn
      x: number
      y: number
    } | null>(null)
    const [hoveredTurnId, setHoveredTurnId] = useState<string | null>(null)
    const [viewStart, setViewStart] = useState(0)
    const [viewEnd, setViewEnd] = useState(1000)
    const [isDragging, setIsDragging] = useState(false)
    const [minimapCursor, setMinimapCursor] = useState('crosshair')
    const hasUserInteracted = useRef(false)

    const turns = useMemo(
      () => [...turnsProp].sort((a, b) => a.startTs - b.startTs),
      [turnsProp],
    )

    const visibleSpans = useMemo(() => {
      const result: { span: IOSpan; turn: IOTurn }[] = []
      for (const turn of turns) {
        for (const span of turn.spans) {
          if (!hiddenSubsystems.has(span.subsystem)) result.push({ span, turn })
        }
      }
      return result
    }, [turns, hiddenSubsystems])

    const globalRange = useMemo(() => {
      if (visibleSpans.length === 0) {
        return { min: timeOrigin, max: timeOrigin + 1000 }
      }
      let min = Infinity
      let max = -Infinity
      for (const { span } of visibleSpans) {
        min = Math.min(min, span.startTs)
        max = Math.max(max, span.endTs ?? performance.now())
      }
      if (min === Infinity) return { min: timeOrigin, max: timeOrigin + 1000 }
      const pad = (max - min) * 0.05 || 50
      return { min: min - pad, max: max + pad }
    }, [visibleSpans, timeOrigin])

    const labelColWidth = visibleSpans.length > 0 ? LABEL_COL_WIDTH : 0
    const chartWidth = Math.max(1, containerWidth - labelColWidth)
    const minViewDuration = globalRange.max - globalRange.min
    const maxViewDuration = Math.max(minViewDuration, 10)
    const minZoomDuration = 1

    const clampViewport = useCallback(
      (start: number, end: number) => {
        let dur = end - start
        if (dur > maxViewDuration) dur = maxViewDuration
        if (dur < minZoomDuration) dur = minZoomDuration
        const range = globalRange
        if (start < range.min) {
          start = range.min
          end = start + dur
        }
        if (end > range.max) {
          end = range.max
          start = end - dur
        }
        if (start < range.min) start = range.min
        return { start, end }
      },
      [globalRange, maxViewDuration],
    )

    const setViewport = useCallback(
      (start: number, end: number) => {
        const clamped = clampViewport(start, end)
        setViewStart(clamped.start)
        setViewEnd(clamped.end)
      },
      [clampViewport],
    )

    const autoFit = useCallback(() => {
      setViewport(globalRange.min, globalRange.max)
      hasUserInteracted.current = false
    }, [globalRange, setViewport])

    useImperativeHandle(ref, () => ({ autoFit }), [autoFit])

    useEffect(() => {
      if (visibleSpans.length === 0) {
        hasUserInteracted.current = false
        setViewport(globalRange.min, globalRange.max)
        return
      }
      if (!hasUserInteracted.current) {
        setViewport(globalRange.min, globalRange.max)
      }
    }, [visibleSpans.length, globalRange, setViewport])

    const layout = useMemo(() => {
      const rows: LayoutRow[] = []
      const gapAnnotations: GapAnnotation[] = []
      let y = 0
      let isFirstTurn = true
      const subsystemOrder: IOSubsystem[] = [
        IOSubsystems.VAD,
        IOSubsystems.SpeakerVerify,
        IOSubsystems.Aggregator,
        IOSubsystems.STT,
        IOSubsystems.LLM,
      ]

      for (const turn of turns) {
        const turnSpans = turn.spans
          .filter((s) => !hiddenSubsystems.has(s.subsystem))
          .sort(
            (a, b) =>
              a.startTs - b.startTs ||
              subsystemOrder.indexOf(a.subsystem) - subsystemOrder.indexOf(b.subsystem),
          )
        if (turnSpans.length === 0) continue

        if (!isFirstTurn) {
          rows.push({ type: 'turn-separator', y })
          y += 1
        }
        isFirstTurn = false

        let prevEnd: number | null = null
        for (const span of turnSpans) {
          if (prevEnd != null && span.startTs - prevEnd > GAP_WARN_THRESHOLD_MS) {
            gapAnnotations.push({
              startTs: prevEnd,
              endTs: span.startTs,
              durationMs: span.startTs - prevEnd,
              y,
            })
          }
          rows.push({ type: 'span', span, turn, subsystem: span.subsystem, y })
          y += ROW_HEIGHT
          if (span.endTs != null) prevEnd = Math.max(prevEnd ?? 0, span.endTs)
        }
      }

      return { rows, totalHeight: y, gapAnnotations }
    }, [turns, hiddenSubsystems])

    function timeToX(ts: number): number {
      const duration = viewEnd - viewStart
      if (duration <= 0) return 0
      return ((ts - viewStart) / duration) * chartWidth
    }

    function xToTime(x: number): number {
      const duration = viewEnd - viewStart
      return viewStart + (x / chartWidth) * duration
    }

    function spanBarX(span: IOSpan): number {
      return timeToX(span.startTs)
    }

    function spanBarWidth(span: IOSpan): number {
      const end = span.endTs ?? performance.now()
      return Math.max(timeToX(end) - timeToX(span.startTs), 3)
    }

    function isClippedLeft(span: IOSpan): boolean {
      return timeToX(span.startTs) < 0 && spanBarX(span) + spanBarWidth(span) > 0
    }

    function isClippedRight(span: IOSpan): boolean {
      const end = span.endTs ?? performance.now()
      return timeToX(end) > chartWidth && timeToX(span.startTs) < chartWidth
    }

    const edgeIndicators = useMemo(() => {
      const indicators: {
        subsystem: IOSubsystem
        side: 'left' | 'right'
        y: number
        spanId: string
      }[] = []
      for (const row of layout.rows) {
        if (row.type !== 'span') continue
        const span = row.span
        const spanEnd = span.endTs ?? performance.now()
        if (spanEnd < viewStart) {
          indicators.push({
            subsystem: span.subsystem,
            side: 'left',
            y: row.y,
            spanId: span.id,
          })
        } else if (span.startTs > viewEnd) {
          indicators.push({
            subsystem: span.subsystem,
            side: 'right',
            y: row.y,
            spanId: span.id,
          })
        }
      }
      return indicators
    }, [layout.rows, viewStart, viewEnd])

    const ticks = useMemo(() => {
      if (chartWidth <= 0) return []
      const duration = viewEnd - viewStart
      if (duration <= 0) return []
      const targetCount = Math.max(4, Math.floor(chartWidth / 120))
      let interval = duration / targetCount
      const mag = 10 ** Math.floor(Math.log10(interval))
      const norm = interval / mag
      if (norm < 1.5) interval = mag
      else if (norm < 3.5) interval = 2 * mag
      else if (norm < 7.5) interval = 5 * mag
      else interval = 10 * mag

      const result: { x: number; label: string }[] = []
      const start = Math.ceil(viewStart / interval) * interval
      for (let ts = start; ts <= viewEnd; ts += interval) {
        result.push({ x: timeToX(ts), label: fmtMs(ts - timeOrigin) })
      }
      return result
      // timeToX closes over viewStart/viewEnd/chartWidth — intentional
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chartWidth, viewStart, viewEnd, timeOrigin])

    function minimapSpanX(span: IOSpan): number {
      const dur = globalRange.max - globalRange.min
      if (dur <= 0) return 0
      return ((span.startTs - globalRange.min) / dur) * chartWidth
    }

    function minimapSpanW(span: IOSpan): number {
      const dur = globalRange.max - globalRange.min
      if (dur <= 0) return 0
      const end = span.endTs ?? performance.now()
      return Math.max(((end - span.startTs) / dur) * chartWidth, 1)
    }

    const minimapViewportX =
      globalRange.max - globalRange.min <= 0
        ? 0
        : ((viewStart - globalRange.min) / (globalRange.max - globalRange.min)) * chartWidth
    const minimapViewportW =
      globalRange.max - globalRange.min <= 0
        ? chartWidth
        : ((viewEnd - viewStart) / (globalRange.max - globalRange.min)) * chartWidth

    const dragRef = useRef({
      startX: 0,
      startY: 0,
      scrollTop: 0,
      viewStart: 0,
      viewEnd: 0,
    })

    function onChartMouseDown(e: React.MouseEvent) {
      hasUserInteracted.current = true
      setIsDragging(true)
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        scrollTop: scrollAreaRef.current?.scrollTop ?? 0,
        viewStart,
        viewEnd,
      }
      e.preventDefault()

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - dragRef.current.startX
        const timeDelta =
          -(dx / chartWidth) * (dragRef.current.viewEnd - dragRef.current.viewStart)
        setViewport(
          dragRef.current.viewStart + timeDelta,
          dragRef.current.viewEnd + timeDelta,
        )
        const dy = ev.clientY - dragRef.current.startY
        if (scrollAreaRef.current) {
          scrollAreaRef.current.scrollTop = dragRef.current.scrollTop - dy
        }
      }
      const onUp = () => {
        setIsDragging(false)
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }

    function onChartWheel(e: React.WheelEvent) {
      e.preventDefault()
      hasUserInteracted.current = true
      const absDx = Math.abs(e.deltaX)
      const absDy = Math.abs(e.deltaY)

      if (absDx > absDy && absDx > 1) {
        const viewDur = viewEnd - viewStart
        const timeDelta = (e.deltaX / chartWidth) * viewDur
        setViewport(viewStart + timeDelta, viewEnd + timeDelta)
        return
      }

      if (absDy > 1) {
        const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15
        const mouseX = e.clientX - containerLeft - LABEL_COL_WIDTH
        const pivot = xToTime(mouseX)
        setViewport(
          pivot - (pivot - viewStart) * factor,
          pivot + (viewEnd - pivot) * factor,
        )
      }
    }

    const HANDLE_HIT_WIDTH = 8
    type MinimapDragMode = 'left-handle' | 'right-handle' | 'area-select' | null

    function minimapHitTest(offsetX: number): Exclude<MinimapDragMode, null> {
      const leftEdge = minimapViewportX
      const rightEdge = minimapViewportX + minimapViewportW
      if (Math.abs(offsetX - leftEdge) <= HANDLE_HIT_WIDTH) return 'left-handle'
      if (Math.abs(offsetX - rightEdge) <= HANDLE_HIT_WIDTH) return 'right-handle'
      return 'area-select'
    }

    function onMinimapMouseDown(e: React.MouseEvent<HTMLDivElement>) {
      hasUserInteracted.current = true
      let mode: MinimapDragMode = minimapHitTest(e.nativeEvent.offsetX)
      const dragStartX = e.nativeEvent.offsetX
      const dragStartViewStart = viewStart
      const dragStartViewEnd = viewEnd

      if (mode === 'area-select') {
        const range = globalRange
        const dur = range.max - range.min
        const t = range.min + (e.nativeEvent.offsetX / chartWidth) * dur
        setViewStart(t)
        setViewEnd(t)
      }
      e.preventDefault()

      const onMove = (ev: MouseEvent) => {
        if (!mode) return
        const x = Math.max(0, Math.min(ev.clientX - minimapLeft, chartWidth))
        const range = globalRange
        const dur = range.max - range.min
        const t = range.min + (x / chartWidth) * dur

        if (mode === 'left-handle') {
          setViewport(Math.min(t, dragStartViewEnd - minZoomDuration), dragStartViewEnd)
        } else if (mode === 'right-handle') {
          setViewport(dragStartViewStart, Math.max(t, dragStartViewStart + minZoomDuration))
        } else {
          const t1 = range.min + (dragStartX / chartWidth) * dur
          setViewport(Math.min(t1, t), Math.max(t1, t))
        }
      }
      const onUp = () => {
        if (mode === 'area-select' && viewEnd - viewStart < 1) autoFit()
        mode = null
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }

    function onMinimapHover(e: React.MouseEvent<HTMLDivElement>) {
      const hit = minimapHitTest(e.nativeEvent.offsetX)
      setMinimapCursor(hit === 'left-handle' || hit === 'right-handle' ? 'ew-resize' : 'crosshair')
    }

    function spanDuration(span: IOSpan): string {
      if (!span.endTs) return 'live'
      return fmtMs(span.endTs - span.startTs)
    }

    function spanLabel(span: IOSpan): string {
      const subsystemLabel = SUBSYSTEM_CONFIG_MAP.get(span.subsystem)?.label ?? ''
      return `${subsystemLabel} / ${span.name}`
    }

    function formatMetaValue(value: unknown): string {
      if (value == null) return ''
      if (typeof value === 'object') return JSON.stringify(value)
      return String(value)
    }

    function tooltipMetaEntries(span: IOSpan) {
      const tooltipKeys = Array.isArray(span.meta.tooltipKeys)
        ? span.meta.tooltipKeys.filter((key: unknown): key is string => typeof key === 'string')
        : []
      return tooltipKeys
        .map((key) => [key, span.meta[key]] as const)
        .filter(([, value]) => value !== undefined && value !== '')
        .map(([key, value]) => ({
          label: key,
          value: formatMetaValue(value),
        }))
    }

    const tooltipStyle = hoveredSpan
      ? {
          left: `${Math.min(hoveredSpan.x + 12, (typeof window !== 'undefined' ? window.innerWidth : 1920) - 300)}px`,
          top: `${Math.min(hoveredSpan.y - 8, (typeof window !== 'undefined' ? window.innerHeight : 1080) - 120)}px`,
        }
      : undefined

    return (
      <div ref={containerRef} className="flex min-h-0 min-w-0 flex-col overflow-hidden select-none">
        {/* Minimap */}
        <div
          ref={minimapRef}
          className="relative flex-shrink-0 border-b border-border/60 bg-muted/30"
          style={{
            height: MINIMAP_HEIGHT,
            marginLeft: labelColWidth,
            cursor: minimapCursor,
          }}
          onMouseDown={onMinimapMouseDown}
          onMouseMove={onMinimapHover}
        >
          {visibleSpans.map(({ span }) => (
            <div
              key={`mm-${span.id}`}
              className="pointer-events-none absolute rounded-sm"
              style={{
                left: minimapSpanX(span),
                width: minimapSpanW(span),
                top: 4,
                height: MINIMAP_HEIGHT - 8,
                backgroundColor: SUBSYSTEM_CONFIG_MAP.get(span.subsystem)?.color ?? '#888',
                opacity: 0.6,
              }}
            />
          ))}
          {visibleSpans.length > 0 ? (
            <>
              <div
                className="pointer-events-none absolute top-0 bottom-0 bg-blue-400/10"
                style={{ left: minimapViewportX, width: Math.max(minimapViewportW, 2) }}
              />
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-1 bg-blue-400"
                style={{ left: minimapViewportX }}
              >
                <div className="absolute top-1/2 -left-0.5 h-4 w-2 -translate-y-1/2 rounded-sm bg-blue-400" />
              </div>
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-1 bg-blue-400"
                style={{ left: minimapViewportX + Math.max(minimapViewportW, 2) }}
              >
                <div className="absolute top-1/2 -left-0.5 h-4 w-2 -translate-y-1/2 rounded-sm bg-blue-400" />
              </div>
              {viewStart !== globalRange.min || viewEnd !== globalRange.max ? (
                <button
                  type="button"
                  className="absolute right-1 top-1 z-10 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted/80"
                  onClick={(e) => {
                    e.stopPropagation()
                    autoFit()
                  }}
                >
                  重置缩放
                </button>
              ) : null}
            </>
          ) : null}
        </div>

        {/* Time axis */}
        <div
          className="relative flex-shrink-0 border-b border-border/60"
          style={{ height: TIME_AXIS_HEIGHT, marginLeft: labelColWidth }}
        >
          {ticks.map((tick, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 flex items-end pb-1"
              style={{ left: tick.x }}
            >
              <span className="-translate-x-1/2 whitespace-nowrap text-[11px] text-muted-foreground">
                {tick.label}
              </span>
            </div>
          ))}
        </div>

        {/* Main waterfall */}
        <div
          ref={scrollAreaRef}
          className={`relative flex-1 overflow-y-auto ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onMouseDown={onChartMouseDown}
          onWheel={onChartWheel}
        >
          <div style={{ height: layout.totalHeight, position: 'relative' }}>
            {layout.rows.map((row, ri) => {
              if (row.type === 'turn-separator') {
                return (
                  <div
                    key={`row-${ri}`}
                    className="absolute right-0 left-0 bg-border"
                    style={{ top: row.y, height: 1 }}
                  />
                )
              }

              const color = SUBSYSTEM_CONFIG_MAP.get(row.subsystem)?.color ?? '#888'
              const selected = row.span.id === selectedSpanId
              return (
                <div
                  key={row.span.id}
                  className={`absolute right-0 left-0 flex items-center border-b border-border/30 ${
                    selected
                      ? 'bg-blue-50 dark:bg-blue-950/30'
                      : hoveredTurnId === row.turn.id
                        ? 'bg-muted/40'
                        : ''
                  }`}
                  style={{ top: row.y, height: ROW_HEIGHT }}
                  onMouseEnter={() => setHoveredTurnId(row.turn.id)}
                  onMouseLeave={() => setHoveredTurnId(null)}
                >
                  <div
                    className="flex flex-shrink-0 items-center gap-1 truncate px-3 text-[11px] text-muted-foreground"
                    style={{ width: LABEL_COL_WIDTH }}
                  >
                    <div
                      className="size-1.5 flex-shrink-0 rounded-sm"
                      style={{ backgroundColor: color }}
                    />
                    <span className="truncate">{spanLabel(row.span)}</span>
                  </div>

                  <div className="relative h-full flex-1 overflow-hidden">
                    {ticks.map((tick, ti) => (
                      <div
                        key={ti}
                        className="absolute top-0 bottom-0 w-px bg-border/40"
                        style={{ left: tick.x }}
                      />
                    ))}

                    <div
                      className={`absolute cursor-pointer rounded-sm ${
                        selected ? 'ring-2 ring-offset-1 ring-white dark:ring-neutral-900' : ''
                      }`}
                      style={{
                        left: spanBarX(row.span),
                        width: spanBarWidth(row.span),
                        top: ROW_PADDING,
                        height: ROW_HEIGHT - ROW_PADDING * 2,
                        backgroundColor: color,
                        opacity: row.span.endTs ? 0.85 : 0.5,
                      }}
                      onMouseEnter={(e) =>
                        setHoveredSpan({
                          span: row.span,
                          turn: row.turn,
                          x: e.clientX,
                          y: e.clientY,
                        })
                      }
                      onMouseLeave={() => setHoveredSpan(null)}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectSpan(row.span.id === selectedSpanId ? null : row.span.id)
                      }}
                    >
                      {row.span.meta.firstTokenTs ? (
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-white/60"
                          style={{
                            left: timeToX(row.span.meta.firstTokenTs) - spanBarX(row.span),
                          }}
                        />
                      ) : null}
                      {spanBarWidth(row.span) > 44 ? (
                        <span className="pointer-events-none absolute inset-0 flex items-center truncate px-1.5 text-[11px] font-medium text-white">
                          {spanDuration(row.span)}
                        </span>
                      ) : null}
                      {isClippedLeft(row.span) ? (
                        <div
                          className="pointer-events-none absolute top-0 bottom-0 left-0 w-4"
                          style={{
                            background: `linear-gradient(to right, ${color}, transparent)`,
                          }}
                        />
                      ) : null}
                      {isClippedRight(row.span) ? (
                        <div
                          className="pointer-events-none absolute top-0 right-0 bottom-0 w-4"
                          style={{
                            background: `linear-gradient(to left, ${color}, transparent)`,
                          }}
                        />
                      ) : null}
                    </div>

                    {spanBarWidth(row.span) <= 44 && row.span.endTs ? (
                      <span
                        className="pointer-events-none absolute whitespace-nowrap text-[11px] text-muted-foreground"
                        style={{
                          left: spanBarX(row.span) + spanBarWidth(row.span) + 4,
                          top: ROW_PADDING,
                          lineHeight: `${ROW_HEIGHT - ROW_PADDING * 2}px`,
                        }}
                      >
                        {spanDuration(row.span)}
                      </span>
                    ) : null}

                    {!row.span.endTs ? (
                      <div
                        className="absolute animate-pulse rounded-sm"
                        style={{
                          left: spanBarX(row.span) + spanBarWidth(row.span) - 4,
                          width: 8,
                          top: ROW_PADDING,
                          height: ROW_HEIGHT - ROW_PADDING * 2,
                          backgroundColor: color,
                          opacity: 0.3,
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              )
            })}

            {edgeIndicators.map((ind) => (
              <div
                key={`edge-${ind.spanId}`}
                className="pointer-events-none absolute"
                style={
                  ind.side === 'left'
                    ? {
                        left: LABEL_COL_WIDTH,
                        top: ind.y + ROW_PADDING,
                        height: ROW_HEIGHT - ROW_PADDING * 2,
                      }
                    : {
                        right: 0,
                        top: ind.y + ROW_PADDING,
                        height: ROW_HEIGHT - ROW_PADDING * 2,
                      }
                }
              >
                <div
                  className="h-0 w-0"
                  style={
                    ind.side === 'left'
                      ? {
                          borderTop: `${(ROW_HEIGHT - ROW_PADDING * 2) / 2}px solid transparent`,
                          borderBottom: `${(ROW_HEIGHT - ROW_PADDING * 2) / 2}px solid transparent`,
                          borderRight: `6px solid ${SUBSYSTEM_CONFIG_MAP.get(ind.subsystem)?.color ?? '#888'}`,
                          opacity: 0.5,
                        }
                      : {
                          borderTop: `${(ROW_HEIGHT - ROW_PADDING * 2) / 2}px solid transparent`,
                          borderBottom: `${(ROW_HEIGHT - ROW_PADDING * 2) / 2}px solid transparent`,
                          borderLeft: `6px solid ${SUBSYSTEM_CONFIG_MAP.get(ind.subsystem)?.color ?? '#888'}`,
                          opacity: 0.5,
                        }
                  }
                />
              </div>
            ))}

            {layout.gapAnnotations.map((gap, gi) => (
              <div
                key={`gap-${gi}`}
                className="pointer-events-none absolute flex items-center"
                style={{
                  left: LABEL_COL_WIDTH + timeToX(gap.startTs),
                  width: Math.max(timeToX(gap.endTs) - timeToX(gap.startTs), 20),
                  top: gap.y,
                  height: ROW_HEIGHT,
                }}
              >
                <span
                  className={`mx-auto whitespace-nowrap rounded px-1 py-0.5 text-[11px] ${
                    gap.durationMs > GAP_WARN_THRESHOLD_MS
                      ? 'bg-red-100 font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  +{fmtMs(gap.durationMs)}
                </span>
              </div>
            ))}
          </div>

          {visibleSpans.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-sm text-muted-foreground">
              <span className="font-medium">暂无 trace 数据</span>
              <span className="mt-1 text-xs text-muted-foreground/70">
                开始录制并触发一轮语音对话
              </span>
            </div>
          ) : null}
        </div>

        {hoveredSpan && tooltipStyle
          ? createPortal(
              <div
                className="pointer-events-none fixed z-[9999] max-w-72 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white shadow-xl dark:bg-neutral-950"
                style={tooltipStyle}
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <div
                    className="size-2 rounded-sm"
                    style={{
                      backgroundColor: SUBSYSTEM_CONFIG_MAP.get(hoveredSpan.span.subsystem)
                        ?.color,
                    }}
                  />
                  <span className="font-medium">
                    {SUBSYSTEM_CONFIG_MAP.get(hoveredSpan.span.subsystem)?.label}
                  </span>
                  <span className="text-neutral-400">{hoveredSpan.span.name}</span>
                </div>
                <div className="flex items-center gap-2 text-neutral-300">
                  {hoveredSpan.span.endTs ? (
                    <span>{fmtMs(hoveredSpan.span.endTs - hoveredSpan.span.startTs)}</span>
                  ) : (
                    <span className="text-amber-400">进行中…</span>
                  )}
                  {hoveredSpan.span.meta.ttftMs ? (
                    <span className="text-purple-300">
                      TTFT {fmtMs(hoveredSpan.span.meta.ttftMs)}
                    </span>
                  ) : null}
                </div>
                {hoveredSpan.span.meta.text ? (
                  <div className="mt-1 break-words text-neutral-400">
                    {String(hoveredSpan.span.meta.text).length > 80
                      ? `${String(hoveredSpan.span.meta.text).slice(0, 80)}…`
                      : hoveredSpan.span.meta.text}
                  </div>
                ) : null}
                {tooltipMetaEntries(hoveredSpan.span).length > 0 ? (
                  <div className="mt-1.5 flex flex-col gap-0.5 border-t border-neutral-700/80 pt-1.5">
                    {tooltipMetaEntries(hoveredSpan.span).map((entry) => (
                      <div
                        key={entry.label}
                        className="grid grid-cols-[auto_1fr] gap-x-2 text-neutral-300"
                      >
                        <span className="text-neutral-500">{entry.label}</span>
                        <span className="truncate font-mono text-neutral-100">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>,
              document.body,
            )
          : null}
      </div>
    )
  },
)
