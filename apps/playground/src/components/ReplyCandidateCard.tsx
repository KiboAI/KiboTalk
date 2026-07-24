import type { ReplyCandidate, ReplySegment } from '@kibotalk/conversation'
import { cn, StickyNoteCard } from '@kibotalk/ui'

function SegmentSpan({ segment }: { segment: ReplySegment }) {
  const className = cn(
    segment.role === 'particle' && 'rounded-sm bg-muted px-0.5',
    segment.role === 'punct' && 'text-muted-foreground',
  )
  if (segment.reading) {
    return (
      <ruby className={className}>
        {segment.surface}
        <rt className="text-[0.55em] font-normal text-muted-foreground">{segment.reading}</rt>
      </ruby>
    )
  }
  return <span className={className}>{segment.surface}</span>
}

export type ReplyCandidateCardProps = {
  candidate: ReplyCandidate
  compact?: boolean
  /** When rendering a full round as one sticky. */
  roundCandidates?: ReplyCandidate[]
  className?: string
}

/**
 * Compact one-liner for transcript; sticky mode takes a whole round.
 */
export function ReplyCandidateCard({
  candidate,
  compact = false,
  roundCandidates,
  className,
}: ReplyCandidateCardProps) {
  const { meaning, targetText, reading, segments } = candidate
  const jp =
    segments && segments.length > 0 ? (
      <span className="leading-relaxed">
        {segments.map((s, i) => (
          <SegmentSpan key={`${i}-${s.surface}`} segment={s} />
        ))}
      </span>
    ) : (
      <span>{targetText}</span>
    )

  if (compact) {
    return (
      <li className={cn('text-xs text-muted-foreground', className)}>
        <span className="text-foreground">{jp}</span>
        {meaning ? <span className="ml-1">（{meaning}）</span> : null}
        {!segments?.length && reading ? <span className="ml-1">[{reading}]</span> : null}
      </li>
    )
  }

  return (
    <StickyNoteCard
      candidates={roundCandidates ?? [candidate]}
      className={className}
    />
  )
}
