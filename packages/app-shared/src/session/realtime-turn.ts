import type { AppLanguage } from '@kibotalk/conversation'
import type {
  AggregatedSegment,
  FedSegment,
} from '@kibotalk/audio/aggregator'
import type { FinalizedTurnInput } from '@kibotalk/pipeline'

export type TranscribedAudioSegment = FedSegment & {
  text: string
  sttFailed?: boolean
}

function joinTranscript(
  segments: TranscribedAudioSegment[],
  language: AppLanguage,
): string {
  const texts = segments.map((segment) => segment.text.trim()).filter(Boolean)
  return language === 'en' ? texts.join(' ') : texts.join('')
}

/**
 * Converts realtime per-VAD transcripts into the same formal turn shape used
 * by batch STT. Empty successful transcripts are treated as VAD/STT no-ops;
 * explicit provider failures remain visible as one failed turn.
 */
export function finalizedTurnFromRealtimeSegments(
  merged: AggregatedSegment<TranscribedAudioSegment>,
  language: AppLanguage,
): FinalizedTurnInput | null {
  const text = joinTranscript(merged.segments, language)
  const sttFailed =
    text.length === 0 && merged.segments.some((segment) => segment.sttFailed === true)
  if (!text && !sttFailed) return null
  return {
    speaker: merged.speaker,
    text,
    startedAt: merged.startedAt,
    endedAt: merged.endedAt,
    ...(sttFailed ? { sttFailed: true } : {}),
  }
}
