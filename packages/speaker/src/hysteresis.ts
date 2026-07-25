import type { Speaker } from '@kibotalk/conversation'

/**
 * Keeps an ambiguous score on the current speaker. A speaker change requires
 * crossing the threshold by the configured margin, so one noisy fragment does
 * not immediately split the formal turn.
 */
export function stabilizeSpeaker(
  similarity: number,
  current: Speaker,
  threshold: number,
  margin = 0.05,
): Speaker {
  if (current === 'other') {
    return similarity >= threshold + margin ? 'user' : 'other'
  }
  return similarity <= threshold - margin ? 'other' : 'user'
}
