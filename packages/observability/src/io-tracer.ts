import type { Span, SpanContext, SpanStatusCode, TimeInput } from '@opentelemetry/api'
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import { context, trace } from '@opentelemetry/api'
import { hrTimeToMilliseconds, hrTimeToNanoseconds } from '@opentelemetry/core'
import { BasicTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { defaultPerfTracer } from './perf-tracer'

export type { ReadableSpan } from '@opentelemetry/sdk-trace-base'
export type { Span } from '@opentelemetry/api'

const TRACER_NAME = 'ai.kibotalk.io-tracer'
const BROADCAST_CHANNEL = 'kibotalk-io-tracer-channel'

export interface SerializedSpan {
  traceId: string
  spanId: string
  parentSpanId: string
  name: string
  kind: number
  startTimeNano: string
  endTimeNano: string
  attributes: Record<string, unknown>
  events: { name: string; timeNano: string; attributes: Record<string, unknown> }[]
  status: { code: number; message: string }
  ended: boolean
}

type TimedEventLike = {
  name: string
  time: [number, number]
  attributes?: Record<string, unknown>
}

function serializeSpan(span: ReadableSpan): SerializedSpan {
  const ctx = span.spanContext()
  const parentCtx = span.parentSpanContext
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: parentCtx?.spanId ?? '',
    name: span.name,
    kind: span.kind,
    startTimeNano: String(hrTimeToNanoseconds(span.startTime)),
    endTimeNano: span.ended ? String(hrTimeToNanoseconds(span.endTime)) : '0',
    attributes: { ...span.attributes },
    events: span.events.map((e: TimedEventLike) => ({
      name: e.name,
      timeNano: String(hrTimeToNanoseconds(e.time)),
      attributes: { ...(e.attributes ?? {}) },
    })),
    status: { code: span.status.code, message: span.status.message ?? '' },
    ended: span.ended,
  }
}

export function deserializeSpan(s: SerializedSpan): ReadableSpan {
  const nanoToHr = (nano: string): [number, number] => {
    const n = Number(nano)
    return [Math.floor(n / 1e9), n % 1e9]
  }
  const spanCtx: SpanContext = {
    traceId: s.traceId,
    spanId: s.spanId,
    traceFlags: 1,
    isRemote: false,
  }
  const parentCtx: SpanContext | undefined = s.parentSpanId
    ? { traceId: s.traceId, spanId: s.parentSpanId, traceFlags: 1, isRemote: false }
    : undefined

  return {
    name: s.name,
    kind: s.kind,
    spanContext: () => spanCtx,
    parentSpanContext: parentCtx,
    startTime: nanoToHr(s.startTimeNano),
    endTime: nanoToHr(s.endTimeNano),
    status: { code: s.status.code as SpanStatusCode, message: s.status.message },
    attributes: s.attributes as Record<string, string | number | boolean>,
    links: [],
    events: s.events.map((e) => ({
      name: e.name,
      time: nanoToHr(e.timeNano),
      attributes: e.attributes as Record<string, string | number | boolean>,
      droppedAttributesCount: 0,
    })),
    duration: nanoToHr(String(Number(s.endTimeNano) - Number(s.startTimeNano))),
    ended: s.ended,
    resource: { attributes: {}, merge: () => ({ attributes: {} }) } as any,
    instrumentationScope: { name: TRACER_NAME },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  }
}

type SpanCallback = (span: ReadableSpan) => void

let provider: BasicTracerProvider | undefined
let spanCallback: SpanCallback | undefined
let broadcastChannel: BroadcastChannel | undefined
let activeTurnSpan: Span | undefined

const noopSpan: Span = {
  spanContext: () => ({ traceId: '0', spanId: '0', traceFlags: 0 }),
  setAttribute: () => noopSpan,
  setAttributes: () => noopSpan,
  addEvent: () => noopSpan,
  addLink: () => noopSpan,
  addLinks: () => noopSpan,
  setStatus: () => noopSpan,
  updateName: () => noopSpan,
  end: () => {},
  isRecording: () => false,
  recordException: () => {},
}

export function createCallbackSpanExporter(): SpanExporter {
  return {
    export: (spans, resultCallback) => {
      for (const span of spans) {
        spanCallback?.(span)
        broadcastChannel?.postMessage({
          type: 'span',
          span: serializeSpan(span),
        })
      }
      resultCallback({ code: 0 /* SUCCESS */ })
    },
    shutdown: () => Promise.resolve(),
    forceFlush: () => Promise.resolve(),
  }
}

export function initIOTracer() {
  if (typeof BroadcastChannel !== 'undefined' && !broadcastChannel) {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL)
  }

  if (provider) return

  provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(createCallbackSpanExporter())],
  })
  trace.setGlobalTracerProvider(provider)
}

export function getIOTracer() {
  if (provider) return provider.getTracer(TRACER_NAME)
  return trace.getTracer(TRACER_NAME)
}

export function onIOSpan(cb: SpanCallback | undefined) {
  spanCallback = cb
}

export function onRemoteIOSpan(cb: SpanCallback): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {}
  const channel = new BroadcastChannel(BROADCAST_CHANNEL)
  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'span') {
      cb(deserializeSpan(event.data.span))
    }
  }
  channel.addEventListener('message', handler)
  return () => {
    channel.removeEventListener('message', handler)
    channel.close()
  }
}

export type StartSpanOptions = {
  parent?: Span
  attrs?: Record<string, string | number | boolean>
  startTime?: TimeInput
}

/**
 * Start an OTel span when recording is leased; otherwise return a no-op span
 * so hot paths never pay for tracing when the playground recorder is off.
 */
export function startSpan(name: string, options?: StartSpanOptions): Span {
  if (!defaultPerfTracer.isEnabled()) return noopSpan

  initIOTracer()
  const tracer = getIOTracer()
  const ctx = options?.parent ? trace.setSpan(context.active(), options.parent) : undefined
  return tracer.startSpan(
    name,
    {
      attributes: options?.attrs,
      startTime: options?.startTime,
    },
    ctx,
  )
}

export function getActiveTurnSpan(): Span | undefined {
  return activeTurnSpan
}

export function setActiveTurnSpan(span: Span | undefined) {
  activeTurnSpan = span
}

export function spanStartMs(span: ReadableSpan): number {
  return hrTimeToMilliseconds(span.startTime)
}

export function spanEndMs(span: ReadableSpan): number | undefined {
  return span.ended ? hrTimeToMilliseconds(span.endTime) : undefined
}

export function hrTimeToMs(time: [number, number]): number {
  return hrTimeToMilliseconds(time)
}

function formatOtlpValue(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value }
  }
  if (typeof value === 'boolean') return { boolValue: value }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((v) => formatOtlpValue(v)) } }
  }
  return { stringValue: String(value) }
}

/** Build an OTLP JSON payload from collected ReadableSpans (for local download). */
export function buildOtlpExport(
  rawSpans: ReadableSpan[],
  serviceName = 'kibotalk-io',
): object {
  const spans = rawSpans.map((span) => {
    const ctx = span.spanContext()
    const parentCtx = span.parentSpanContext
    return {
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      parentSpanId: parentCtx?.spanId ?? '',
      name: span.name,
      kind: span.kind,
      startTimeUnixNano: String(hrTimeToNanoseconds(span.startTime)),
      endTimeUnixNano: span.ended ? String(hrTimeToNanoseconds(span.endTime)) : '0',
      attributes: Object.entries(span.attributes).map(([key, value]) => ({
        key,
        value: formatOtlpValue(value),
      })),
      events: span.events.map((event) => ({
        timeUnixNano: String(hrTimeToNanoseconds(event.time)),
        name: event.name,
        attributes: Object.entries(event.attributes ?? {}).map(([key, value]) => ({
          key,
          value: formatOtlpValue(value),
        })),
      })),
      status: {
        code: span.status.code,
        message: span.status.message ?? '',
      },
    }
  })

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: serviceName } }],
        },
        scopeSpans: [
          {
            scope: { name: 'io' },
            spans,
          },
        ],
      },
    ],
  }
}

export { serializeSpan }
