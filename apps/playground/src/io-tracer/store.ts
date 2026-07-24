import type {
  IOSpan,
  IOSubsystem,
  IOTurn,
  ReadableSpan,
} from '@kibotalk/observability'
import {
  IOAttributes,
  IOEvents,
  IOSpanNames,
  IOSubsystems,
  buildOtlpExport,
  defaultPerfTracer,
  hrTimeToMs,
  initIOTracer,
  onIOSpan,
  onRemoteIOSpan,
  spanEndMs,
  spanStartMs,
} from '@kibotalk/observability'
import { create } from 'zustand'

const MAX_TURNS = 50
/** Pre-turn spans waiting to attach to the next InteractionTurn. */
const PRE_TURN_SUBSYSTEMS = new Set<IOSubsystem>([
  IOSubsystems.VAD,
  IOSubsystems.Aggregator,
  IOSubsystems.SpeakerVerify,
])

function isPreTurnSpan(subsystem: IOSubsystem, hasParent: boolean): boolean {
  if (PRE_TURN_SUBSYSTEMS.has(subsystem)) return true
  // Realtime STT spans are created outside the pipeline (no parent yet).
  if (subsystem === IOSubsystems.STT && !hasParent) return true
  return false
}

function attrsToMeta(attrs: Record<string, unknown>): Record<string, any> {
  const meta: Record<string, any> = {}
  for (const [key, value] of Object.entries(attrs)) {
    const shortKey =
      key === IOAttributes.TooltipKeys
        ? 'tooltipKeys'
        : key.includes('.')
          ? key.split('.').at(-1)!
          : key
    meta[shortKey] = value
  }
  return meta
}

type IoTracerState = {
  turns: IOTurn[]
  isRecording: boolean
  selectedSpanId: string | null
  recordingStartTs: number
  rawSpanCount: number
  selectedSpan: { span: IOSpan; turn: IOTurn } | undefined
  startRecording: () => void
  stopRecording: () => void
  clear: () => void
  selectSpan: (spanId: string | null) => void
  exportOTLP: () => void
}

type MutableStore = {
  turnsByTraceId: Map<string, IOTurn>
  pendingPreTurn: IOSpan[]
  rawSpans: ReadableSpan[]
  unsubscribeRemote: (() => void) | undefined
  releaseLease: (() => void) | undefined
}

const mutable: MutableStore = {
  turnsByTraceId: new Map(),
  pendingPreTurn: [],
  rawSpans: [],
  unsubscribeRemote: undefined,
  releaseLease: undefined,
}

function findSelected(
  turns: IOTurn[],
  selectedSpanId: string | null,
): { span: IOSpan; turn: IOTurn } | undefined {
  if (!selectedSpanId) return undefined
  for (const turn of turns) {
    const span = turn.spans.find((s) => s.id === selectedSpanId)
    if (span) return { span, turn }
  }
  return undefined
}

export const useIoTracerStore = create<IoTracerState>((set, get) => {
  function notifyTurns(nextTurns: IOTurn[]) {
    set({
      turns: nextTurns,
      selectedSpan: findSelected(nextTurns, get().selectedSpanId),
    })
  }

  function handleSpan(readable: ReadableSpan) {
    mutable.rawSpans.push(readable)
    set({ rawSpanCount: mutable.rawSpans.length })

    const spanCtx = readable.spanContext()
    const traceId = spanCtx.traceId
    const spanId = spanCtx.spanId
    const startMs = spanStartMs(readable)
    const endMs = spanEndMs(readable)

    function getOrCreateTurn(id = traceId): IOTurn {
      let turn = mutable.turnsByTraceId.get(id)
      if (!turn) {
        turn = {
          id,
          startTs: startMs,
          spans: [],
        }
        mutable.turnsByTraceId.set(id, turn)
        const next = [...get().turns, turn]
        while (next.length > MAX_TURNS) {
          const evicted = next.shift()
          if (evicted) mutable.turnsByTraceId.delete(evicted.id)
        }
        notifyTurns(next)
      }
      return turn
    }

    if (readable.name === IOSpanNames.InteractionTurn) {
      const turn = getOrCreateTurn()
      if (endMs) turn.endTs = endMs
      const text = readable.attributes[IOAttributes.ASRText]
      if (typeof text === 'string') turn.inputText = text

      // Attach pending VAD / Aggregator / Speaker / realtime STT spans.
      if (mutable.pendingPreTurn.length > 0) {
        const pending = mutable.pendingPreTurn.splice(0)
        for (const pre of pending) {
          turn.spans.push({
            ...pre,
            traceId: turn.id,
          })
          turn.startTs = Math.min(turn.startTs, pre.startTs)
          if (
            pre.subsystem === IOSubsystems.STT
            && typeof pre.meta.text === 'string'
            && !turn.inputText
          ) {
            turn.inputText = pre.meta.text
          }
        }
      }

      notifyTurns([...get().turns])
      return
    }

    const subsystem = readable.attributes[IOAttributes.Subsystem] as IOSubsystem | undefined
    if (!subsystem) {
      notifyTurns([...get().turns])
      return
    }

    const meta = attrsToMeta(readable.attributes as Record<string, unknown>)
    const events = readable.events.map((event) => ({
      name: event.name,
      timeTs: hrTimeToMs(event.time),
      meta: attrsToMeta((event.attributes ?? {}) as Record<string, unknown>),
    }))

    for (const event of readable.events) {
      const eventAttrs = event.attributes ?? {}
      for (const [key, value] of Object.entries(eventAttrs)) {
        const shortKey = key.includes('.') ? key.split('.').at(-1)! : key
        meta[shortKey] = value
      }
      if (event.name === IOEvents.LLMFirstToken) {
        meta.firstTokenTs = hrTimeToMs(event.time)
        const ttft = eventAttrs[IOAttributes.LLM_TTFT]
        if (typeof ttft === 'number') meta.ttftMs = ttft
        else if (typeof meta.time_to_first_token === 'number') {
          meta.ttftMs = meta.time_to_first_token
        }
      }
    }

    if (typeof meta.time_to_first_token === 'number' && meta.ttftMs == null) {
      meta.ttftMs = meta.time_to_first_token
    }

    const correlationId = readable.attributes[IOAttributes.CorrelationId]
    const ioSpan: IOSpan = {
      id: spanId,
      traceId,
      parentSpanId: readable.parentSpanContext?.spanId,
      correlationId: typeof correlationId === 'string' ? correlationId : undefined,
      subsystem,
      name: readable.name,
      startTs: startMs,
      endTs: endMs,
      meta,
      events,
    }

    if (isPreTurnSpan(subsystem, !!readable.parentSpanContext?.spanId)) {
      // Prefer attaching to the currently open turn; otherwise queue.
      const turns = get().turns
      const open = [...turns].reverse().find((t) => t.endTs == null)
      if (open) {
        open.spans.push(ioSpan)
        open.startTs = Math.min(open.startTs, ioSpan.startTs)
        if (
          subsystem === IOSubsystems.STT
          && typeof readable.attributes[IOAttributes.ASRText] === 'string'
        ) {
          open.inputText = readable.attributes[IOAttributes.ASRText] as string
        }
        notifyTurns([...turns])
      } else {
        mutable.pendingPreTurn.push(ioSpan)
      }
      return
    }

    if (
      subsystem === IOSubsystems.STT
      && typeof readable.attributes[IOAttributes.ASRText] === 'string'
    ) {
      const turn = getOrCreateTurn()
      turn.inputText = readable.attributes[IOAttributes.ASRText] as string
    }
    if (subsystem === IOSubsystems.LLM && typeof meta.text_length === 'number') {
      const turn = getOrCreateTurn()
      turn.outputText = `(${meta.text_length} candidates)`
    }

    const turn = getOrCreateTurn()
    turn.spans.push(ioSpan)
    notifyTurns([...get().turns])
  }

  return {
    turns: [],
    isRecording: false,
    selectedSpanId: null,
    recordingStartTs: 0,
    rawSpanCount: 0,
    selectedSpan: undefined,

    startRecording() {
      if (get().isRecording) return
      initIOTracer()
      mutable.releaseLease = defaultPerfTracer.acquire('playground-io-tracer')
      onIOSpan(handleSpan)
      mutable.unsubscribeRemote = onRemoteIOSpan(handleSpan)
      set({
        isRecording: true,
        recordingStartTs: performance.timeOrigin + performance.now(),
      })
    },

    stopRecording() {
      if (!get().isRecording) return
      onIOSpan(undefined)
      mutable.unsubscribeRemote?.()
      mutable.unsubscribeRemote = undefined
      mutable.releaseLease?.()
      mutable.releaseLease = undefined
      set({ isRecording: false })
    },

    clear() {
      mutable.turnsByTraceId.clear()
      mutable.pendingPreTurn.length = 0
      mutable.rawSpans.length = 0
      set({
        turns: [],
        rawSpanCount: 0,
        selectedSpanId: null,
        selectedSpan: undefined,
        recordingStartTs: performance.timeOrigin + performance.now(),
      })
    },

    selectSpan(spanId) {
      set({
        selectedSpanId: spanId,
        selectedSpan: findSelected(get().turns, spanId),
      })
    },

    exportOTLP() {
      if (mutable.rawSpans.length === 0) return
      const otlpPayload = buildOtlpExport(mutable.rawSpans)
      const json = JSON.stringify(otlpPayload, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `trace_${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    },
  }
})
