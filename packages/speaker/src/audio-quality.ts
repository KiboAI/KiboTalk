const SAMPLE_RATE = 16000
const FRAME_SAMPLES = 320
const SPEECH_RMS_THRESHOLD = 0.004
const TRIM_MARGIN_SAMPLES = SAMPLE_RATE * 0.16
const MIN_ENROLLMENT_SAMPLES = SAMPLE_RATE * 2.5
const MIN_ENROLLMENT_RMS = 0.008

export type EnrollmentAudioErrorCode = 'too-quiet' | 'too-short'

export class EnrollmentAudioError extends Error {
  constructor(readonly code: EnrollmentAudioErrorCode) {
    super(code)
    this.name = 'EnrollmentAudioError'
  }
}

function frameRms(pcm: Float32Array, start: number): number {
  const end = Math.min(pcm.length, start + FRAME_SAMPLES)
  let sumSquares = 0
  for (let index = start; index < end; index++) {
    sumSquares += pcm[index] * pcm[index]
  }
  return Math.sqrt(sumSquares / Math.max(1, end - start))
}

function rms(pcm: Float32Array): number {
  let sumSquares = 0
  for (const sample of pcm) sumSquares += sample * sample
  return Math.sqrt(sumSquares / Math.max(1, pcm.length))
}

/** Removes silence outside the spoken region while retaining a small context margin. */
export function trimSpeakerAudio(pcm: Float32Array): Float32Array {
  let firstActive = -1
  let lastActiveEnd = -1
  for (let start = 0; start < pcm.length; start += FRAME_SAMPLES) {
    if (frameRms(pcm, start) < SPEECH_RMS_THRESHOLD) continue
    if (firstActive < 0) firstActive = start
    lastActiveEnd = Math.min(pcm.length, start + FRAME_SAMPLES)
  }
  if (firstActive < 0) return new Float32Array(0)
  const start = Math.max(0, firstActive - TRIM_MARGIN_SAMPLES)
  const end = Math.min(pcm.length, lastActiveEnd + TRIM_MARGIN_SAMPLES)
  return pcm.slice(start, end)
}

/**
 * Produces a stable enrollment utterance or rejects a recording whose
 * duration/level would create an unreliable voiceprint.
 */
export function prepareEnrollmentAudio(pcm: Float32Array): Float32Array {
  const trimmed = trimSpeakerAudio(pcm)
  if (trimmed.length === 0 || rms(trimmed) < MIN_ENROLLMENT_RMS) {
    throw new EnrollmentAudioError('too-quiet')
  }
  if (trimmed.length < MIN_ENROLLMENT_SAMPLES) {
    throw new EnrollmentAudioError('too-short')
  }
  return trimmed
}
