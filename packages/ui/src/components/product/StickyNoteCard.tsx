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
  /** Older desktop rounds keep all target lines but omit meanings to fit without overlap. */
  older?: boolean
  className?: string
}

/**
 * One Post-it per LLM round: all three reply lines live on the same note.
 * Used by both apps/web's SessionPage stage and apps/desktop's Island dock.
 */
export function StickyNoteCard({ candidates, older = false, className }: StickyNoteCardProps) {
  return (
    <div className={cn('sticky-note', older && 'sticky-note-older', className)}>
      <ol className="flex flex-col gap-3.5">
        {candidates.map((candidate, index) =>
          older ? (
            <li
              key={candidate.id ?? index}
              className="py-1 text-sm font-bold leading-relaxed first:pt-0 [&+li]:border-t [&+li]:border-dashed [&+li]:border-sticky-foreground/25"
            >
              {candidate.segments?.length ? (
                candidate.segments.map((segment, segmentIndex) => (
                  <SegmentSpan key={`${segmentIndex}-${segment.surface}`} segment={segment} />
                ))
              ) : (
                candidate.targetText
              )}
            </li>
          ) : (
            <CandidateBlock key={candidate.id ?? index} candidate={candidate} />
          ),
        )}
      </ol>
    </div>
  )
}

function CandidateLineSkeleton() {
  return (
    <li className="pt-3.5 first:pt-0 [&+li]:border-t [&+li]:border-dashed [&+li]:border-sticky-foreground/25">
      <div className="flex min-h-11 items-center">
        <Skeleton className="h-4 w-[85%] bg-sticky-foreground/18" />
      </div>
      <Skeleton className="mt-1.5 h-3 w-[55%] bg-sticky-foreground/12" />
    </li>
  )
}

export function StickyNoteCardPlaceholder({
  label,
}: {
  label?: string
}) {
  return (
    <div className="sticky-note sticky-note-placeholder flex flex-col gap-3">
      <ol className="flex flex-col gap-3.5">
        <CandidateLineSkeleton />
        <CandidateLineSkeleton />
        <CandidateLineSkeleton />
      </ol>
      {label ? <p className="text-sm font-medium text-sticky-foreground/70">{label}</p> : null}
    </div>
  )
}
