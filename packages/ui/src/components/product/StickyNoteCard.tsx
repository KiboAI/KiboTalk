import type { ReplyCandidate, ReplySegment } from '@kibotalk/conversation'
import { cn } from '../../lib/utils'
import { Skeleton } from '../ui/skeleton'

function SegmentSpan({ segment }: { segment: ReplySegment }) {
  const className = cn(
    segment.role === 'particle' &&
      'rounded border-b-2 border-sticky-foreground/55 bg-sticky-foreground/20 px-1 font-bold',
    segment.role === 'punct' && 'text-sticky-foreground/68',
  )
  if (segment.reading) {
    return (
      <ruby className={className}>
        {segment.surface}
        <rt className="text-[0.68em] font-semibold text-sticky-foreground/68">{segment.reading}</rt>
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
    <li className="pt-3.5 first:pt-0 [&+li]:border-t [&+li]:border-dashed [&+li]:border-sticky-foreground/25">
      <div className="text-xl font-bold leading-loose">{body}</div>
      {meaning ? (
        <div className="mt-1.5 text-sm font-medium leading-snug text-sticky-foreground/72">{meaning}</div>
      ) : null}
      {!segments?.length && reading ? (
        <div className="mt-1 text-xs text-sticky-foreground/60">{reading}</div>
      ) : null}
    </li>
  )
}

export type StickyNoteCardProps = {
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
 * Used by both apps/web's SessionPage stage and apps/desktop's Island dock.
 */
export function StickyNoteCard({ candidates, roundIndex = 0, className }: StickyNoteCardProps) {
  const place = PLACEMENT[roundIndex % PLACEMENT.length]
  return (
    <div
      className={cn('sticky-note sticky-note-interactive', className)}
      style={{ transform: `translateX(${place.x}px) rotate(${place.rotate}deg)` }}
    >
      <ol className="flex flex-col gap-3.5">
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

export function StickyNoteCardPlaceholder({
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
      <div className="space-y-3">
        <CandidateLineSkeleton />
        <CandidateLineSkeleton />
        <CandidateLineSkeleton />
      </div>
      {label ? <p className="text-sm font-medium text-sticky-foreground/70">{label}</p> : null}
    </div>
  )
}
