import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSegmentAggregator } from '../src/aggregator'
import type { AggregatedSegment } from '../src/aggregator'

const SR = 16000

function seg(buffer: Float32Array, speaker: 'user' | 'other', startedAt: number, endedAt: number) {
  return { buffer, speaker, startedAt, endedAt }
}

function samples(ms: number): number {
  return Math.round((ms / 1000) * SR)
}

describe('createSegmentAggregator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('flushes after pauseMs elapses with no new segment', () => {
    const flushed: AggregatedSegment[] = []
    const agg = createSegmentAggregator({ sampleRate: SR, pauseMs: 1000, maxMs: 10000 })
    agg.onFlush((s) => flushed.push(s))

    agg.feed(seg(new Float32Array(samples(500)), 'other', 0, 500))
    expect(flushed).toHaveLength(0)

    vi.advanceTimersByTime(999)
    expect(flushed).toHaveLength(0)
    vi.advanceTimersByTime(2)
    expect(flushed).toHaveLength(1)
    expect(flushed[0].speaker).toBe('other')
    expect(flushed[0].pcm.length).toBe(samples(500))
    expect(flushed[0].segments).toHaveLength(1)
    agg.dispose()
  })

  it('accumulates same-speaker segments with direct PCM concat (no gap fill)', () => {
    const flushed: AggregatedSegment[] = []
    const agg = createSegmentAggregator({ sampleRate: SR, pauseMs: 1000, maxMs: 10000 })
    agg.onFlush((s) => flushed.push(s))

    agg.feed(seg(new Float32Array(samples(300)), 'other', 0, 300))
    // Next segment 200ms later — restarts the pause timer, no flush yet.
    agg.feed(seg(new Float32Array(samples(400)), 'other', 500, 900))
    vi.advanceTimersByTime(1000)
    expect(flushed).toHaveLength(1)
    // Direct concat: no reconstructed silence between segments.
    expect(flushed[0].pcm.length).toBe(samples(300) + samples(400))
    expect(flushed[0].segments).toHaveLength(2)
    agg.dispose()
  })

  it('flushes immediately on speaker change', () => {
    const flushed: AggregatedSegment[] = []
    const agg = createSegmentAggregator({ sampleRate: SR, pauseMs: 1000, maxMs: 10000 })
    agg.onFlush((s) => flushed.push(s))

    agg.feed(seg(new Float32Array(samples(300)), 'other', 0, 300))
    agg.feed(seg(new Float32Array(samples(200)), 'user', 400, 600))
    expect(flushed).toHaveLength(1)
    expect(flushed[0].speaker).toBe('other')
    vi.advanceTimersByTime(1000)
    expect(flushed).toHaveLength(2)
    expect(flushed[1].speaker).toBe('user')
    agg.dispose()
  })

  it('force-flushes when accumulated speech exceeds maxMs', () => {
    const flushed: AggregatedSegment[] = []
    const agg = createSegmentAggregator({ sampleRate: SR, pauseMs: 10000, maxMs: 1000 })
    agg.onFlush((s) => flushed.push(s))

    agg.feed(seg(new Float32Array(samples(600)), 'other', 0, 600))
    expect(flushed).toHaveLength(0)
    agg.feed(seg(new Float32Array(samples(600)), 'other', 700, 1300))
    expect(flushed).toHaveLength(1)
    expect(flushed[0].pcm.length).toBe(samples(600) + samples(600))
    agg.dispose()
  })

  it('updateConfig changes the pause threshold live', () => {
    const flushed: AggregatedSegment[] = []
    const agg = createSegmentAggregator({ sampleRate: SR, pauseMs: 1000, maxMs: 10000 })
    agg.onFlush((s) => flushed.push(s))

    agg.updateConfig({ pauseMs: 2000 })
    agg.feed(seg(new Float32Array(samples(300)), 'other', 0, 300))
    vi.advanceTimersByTime(1000)
    expect(flushed).toHaveLength(0)
    vi.advanceTimersByTime(1001)
    expect(flushed).toHaveLength(1)
    agg.dispose()
  })

  it('flush() is a no-op when nothing is pending', () => {
    const flushed: AggregatedSegment[] = []
    const agg = createSegmentAggregator({ sampleRate: SR, pauseMs: 1000, maxMs: 10000 })
    agg.onFlush((s) => flushed.push(s))
    agg.flush()
    expect(flushed).toHaveLength(0)
    agg.dispose()
  })
})
