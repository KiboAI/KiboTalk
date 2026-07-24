import type { ReplyCandidate, ReplySegment } from '@kibotalk/conversation'
import { Skeleton, cn } from '@kibotalk/ui'

function SegmentSpan({ segment }: { segment: ReplySegment }) {
  const className = cn(
    segment.role === 'particle' && 'rounded-sm bg-black/5 px-0.5 dark:bg-white/10',
    segment.role === 'punct' && 'text-sticky-muted',
  )
  if (segment.reading) {
    return (
      <ruby className={className}>
        {segment.surface}
        <rt className="text-[0.55em] font-normal text-sticky-muted">{segment.reading}</rt>
      </ruby>
    )
  }
  return <span className={className}>{segment.surface}</span>
}

function CandidateBlock({ candidate }: { candidate: ReplyCandidate }) {
  const { meaning, targetText, reading, segments } = candidate
  const body =
    segments && segments.length > 0 ? (
      <span>
        {segments.map((s, i) => (
          <SegmentSpan key={`${i}-${s.surface}`} segment={s} />
        ))}
      </span>
    ) : (
      <span>{targetText}</span>
    )

  return (
    <li className="space-y-1">
      <div className="text-[0.95rem] font-medium leading-relaxed">{body}</div>
      {meaning ? <div className="text-xs leading-snug text-sticky-muted">{meaning}</div> : null}
      {!segments?.length && reading ? (
        <div className="text-[0.7rem] text-sticky-muted/80">{reading}</div>
      ) : null}
    </li>
  )
}

export type StickyNoteProps = {
  /** One round = up to 3 candidates on a single note. */
  candidates: ReplyCandidate[]
  /** Round index in the visible stack — slight placement. */
  roundIndex?: number
  className?: string
}

const PLACEMENT = [
  { rotate: -1.6, x: -4 },
  { rotate: 1.2, x: 6 },
  { rotate: -0.8, x: 0 },
] as const

/**
 * One Post-it per LLM round: all three reply lines live on the same note.
 */
export function StickyNote({ candidates, roundIndex = 0, className }: StickyNoteProps) {
  const place = PLACEMENT[roundIndex % PLACEMENT.length]
  return (
    <div
      className={cn('sticky-note sticky-note-interactive', className)}
      style={{ transform: `translateX(${place.x}px) rotate(${place.rotate}deg)` }}
    >
      <ol className="space-y-3 pr-3">
        {candidates.map((c, i) => (
          <CandidateBlock key={c.id ?? i} candidate={c} />
        ))}
      </ol>
    </div>
  )
}

function CandidateLineSkeleton() {
  return (
    <div className="space-y-1.5">
      <Skeleton className="h-2.5 w-[85%] bg-sticky-foreground/18" />
      <Skeleton className="h-2 w-[55%] bg-sticky-foreground/12" />
    </div>
  )
}

export function StickyNotePlaceholder({
  label,
  roundIndex = 0,
}: {
  label?: string
  roundIndex?: number
}) {
  const place = PLACEMENT[roundIndex % PLACEMENT.length]
  return (
    <div
      className="sticky-note sticky-note-placeholder flex flex-col gap-3"
      style={{ transform: `translateX(${place.x}px) rotate(${place.rotate}deg)` }}
    >
      <div className="space-y-3 pr-3">
        <CandidateLineSkeleton />
        <CandidateLineSkeleton />
        <CandidateLineSkeleton />
      </div>
      {label ? (
        <p className="text-sm font-medium text-sticky-foreground/70">{label}</p>
      ) : null}
    </div>
  )
}
