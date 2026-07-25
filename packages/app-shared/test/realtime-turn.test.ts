import { describe, expect, it } from 'vitest'
import { finalizedTurnFromRealtimeSegments } from '../src/session/realtime-turn'
import type { TranscribedAudioSegment } from '../src/session/realtime-turn'

function merged(segments: TranscribedAudioSegment[]) {
  return {
    pcm: new Float32Array(segments.reduce((total, segment) => total + segment.buffer.length, 0)),
    speaker: segments[0]?.speaker ?? ('other' as const),
    startedAt: segments[0]?.startedAt ?? 0,
    endedAt: segments.at(-1)?.endedAt ?? 0,
    segments,
  }
}

function segment(text: string, startedAt: number, sttFailed = false): TranscribedAudioSegment {
  return {
    buffer: new Float32Array(1600),
    speaker: 'other',
    startedAt,
    endedAt: startedAt + 100,
    text,
    sttFailed,
  }
}

describe('finalized realtime turn', () => {
  it('combines short Japanese fragments into one formal turn', () => {
    expect(
      finalizedTurnFromRealtimeSegments(
        merged([segment('今日は', 0), segment('暑いですね', 300)]),
        'ja',
      ),
    ).toMatchObject({ text: '今日は暑いですね', startedAt: 0, endedAt: 400 })
  })

  it('keeps word separation for English fragments', () => {
    expect(
      finalizedTurnFromRealtimeSegments(
        merged([segment('how are', 0), segment('you', 300)]),
        'en',
      )?.text,
    ).toBe('how are you')
  })

  it('drops empty successful transcripts caused by false VAD activations', () => {
    expect(finalizedTurnFromRealtimeSegments(merged([segment('', 0)]), 'ja')).toBeNull()
  })

  it('preserves an explicit transcription failure as one failed turn', () => {
    expect(
      finalizedTurnFromRealtimeSegments(merged([segment('', 0, true)]), 'ja'),
    ).toMatchObject({ text: '', sttFailed: true })
  })
})
