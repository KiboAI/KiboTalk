import { describe, expect, it } from 'vitest'
import {
  EnrollmentAudioError,
  prepareEnrollmentAudio,
  trimSpeakerAudio,
} from '../src/audio-quality'

const sampleRate = 16000

describe('speaker audio preparation', () => {
  it('removes leading and trailing silence while retaining speech margins', () => {
    const silence = new Float32Array(sampleRate)
    const speech = new Float32Array(sampleRate * 3).fill(0.1)
    const pcm = new Float32Array(silence.length + speech.length + silence.length)
    pcm.set(speech, silence.length)

    const trimmed = trimSpeakerAudio(pcm)

    expect(trimmed.length).toBeGreaterThan(speech.length)
    expect(trimmed.length).toBeLessThan(pcm.length)
  })

  it('rejects an enrollment dominated by silence', () => {
    expect(() =>
      prepareEnrollmentAudio(new Float32Array(sampleRate * 5)),
    ).toThrow(new EnrollmentAudioError('too-quiet'))
  })

  it('rejects an enrollment that is too short for a stable voiceprint', () => {
    expect(() =>
      prepareEnrollmentAudio(new Float32Array(sampleRate).fill(0.1)),
    ).toThrow(new EnrollmentAudioError('too-short'))
  })

  it('accepts a clear multi-second enrollment', () => {
    const prepared = prepareEnrollmentAudio(
      new Float32Array(sampleRate * 4).fill(0.1),
    )
    expect(prepared.length).toBe(sampleRate * 4)
  })
})
