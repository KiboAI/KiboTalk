import {
  IOAttributes,
  IOSpanNames,
  IOSubsystems,
  startSpan,
} from '@kibotalk/observability'

/**
 * Segment aggregator (TurnGate) — sits between VAD (+ speaker verification) and
 * the pipeline / realtime STT. Accumulates same-speaker VAD speech segments and
 * flushes when:
 *   - silence since the last segment exceeds `pauseMs`, or
 *   - accumulated **speech** length exceeds `maxMs`, or
 *   - the speaker changes (pending utterance flushes, a new one starts).
 *
 * Constituent PCM is concatenated directly (no silence-gap reconstruction).
 * Spec §2.4 / ADR 0004. Pipeline contract: one flushed segment = one turn.
 *
 * When IO tracing is leased, each flush emits one Aggregator span covering
 * startedAt→endedAt of the merged utterance.
 */
export type AggregatorConfig = {
  sampleRate: number
  /** Pause (ms) after the last segment that flushes the utterance (both speakers). */
  pauseMs: number
  /** Force-flush when accumulated speech reaches this length (ms). Gaps not counted. */
  maxMs: number
}

export type FedSegment = {
  buffer: Float32Array
  speaker: 'user' | 'other'
  startedAt: number
  endedAt: number
}

export type AggregatedSegment = {
  pcm: Float32Array
  speaker: 'user' | 'other'
  startedAt: number
  endedAt: number
  /** Constituent VAD segments, in order (for UI nesting / playback). */
  segments: FedSegment[]
}

export type SegmentAggregator = {
  feed(segment: FedSegment): void
  flush(): void
  onFlush(handler: (seg: AggregatedSegment) => void): () => void
  updateConfig(patch: Partial<AggregatorConfig>): void
  dispose(): void
}

function concatPcm(parts: FedSegment[]): Float32Array {
  let total = 0
  for (const part of parts) total += part.buffer.length
  const out = new Float32Array(total)
  let off = 0
  for (const part of parts) {
    out.set(part.buffer, off)
    off += part.buffer.length
  }
  return out
}

export function createSegmentAggregator(config: AggregatorConfig): SegmentAggregator {
  let cfg = config
  const handlers = new Set<(seg: AggregatedSegment) => void>()
  let current: FedSegment[] | null = null
  let currentSpeaker: 'user' | 'other' | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function emit(seg: AggregatedSegment): void {
    for (const h of handlers) h(seg)
  }

  function flush(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (!current || current.length === 0) {
      current = null
      currentSpeaker = null
      return
    }
    const parts = current
    const seg: AggregatedSegment = {
      pcm: concatPcm(parts),
      speaker: currentSpeaker!,
      startedAt: parts[0].startedAt,
      endedAt: parts[parts.length - 1].endedAt,
      segments: [...parts],
    }
    current = null
    currentSpeaker = null

    const totalMs = (seg.pcm.length / cfg.sampleRate) * 1000
    const span = startSpan(IOSpanNames.SegmentAggregate, {
      startTime: seg.startedAt,
      attrs: {
        [IOAttributes.Subsystem]: IOSubsystems.Aggregator,
        [IOAttributes.AggregatorSegments]: parts.length,
        [IOAttributes.AggregatorTotalMs]: totalMs,
      },
    })
    span.end(seg.endedAt)

    emit(seg)
  }

  function armTimer(): void {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      flush()
    }, cfg.pauseMs)
  }

  return {
    feed(segment) {
      if (currentSpeaker !== null && currentSpeaker !== segment.speaker) {
        flush()
      }
      if (current === null) {
        current = []
        currentSpeaker = segment.speaker
      }
      current.push(segment)

      const totalMs = (current.reduce((n, s) => n + s.buffer.length, 0) / cfg.sampleRate) * 1000
      if (totalMs >= cfg.maxMs) {
        flush()
        return
      }
      armTimer()
    },
    flush,
    onFlush(handler) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
    updateConfig(patch) {
      cfg = { ...cfg, ...patch }
    },
    dispose() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      handlers.clear()
      current = null
      currentSpeaker = null
    },
  }
}
