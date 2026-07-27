import type { QuotaSummary } from './account'

export type RealtimeSttHandlers = {
  onPartial?: (text: string) => void
  onCompleted?: (text: string) => void
  onError?: (message: string) => void
  onReady?: () => void
  onClose?: () => void
  onQuotaExhausted?: (quota?: QuotaSummary) => void
}

export type RealtimeSttClient = {
  append(pcm: Float32Array): void
  commit(): void
  finish(): void
  close(): void
  /** Resolves with the next completed transcript (or rejects on error/close). */
  waitCompleted(timeoutMs?: number): Promise<string>
}

export class RealtimeSttError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'RealtimeSttError'
  }
}

export function isTranscriptionFailed(
  error: unknown,
): error is RealtimeSttError & { code: 'TRANSCRIPTION_FAILED' } {
  return error instanceof RealtimeSttError && error.code === 'TRANSCRIPTION_FAILED'
}
