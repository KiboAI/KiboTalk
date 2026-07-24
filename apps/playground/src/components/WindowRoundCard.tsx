import type { ReplyCandidate, ReplySegment } from '@kibotalk/conversation'
import { Skeleton, cn } from '@kibotalk/ui'

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
    <li className="space-y-1 border-b border-border/50 pb-3 last:border-0 last:pb-0">
      <div className="text-[0.95rem] font-medium leading-relaxed text-foreground">{body}</div>
      {meaning ? <div className="text-xs leading-snug text-muted-foreground">{meaning}</div> : null}
      {!segments?.length && reading ? (
        <div className="text-[0.7rem] text-muted-foreground/80">{reading}</div>
      ) : null}
    </li>
  )
}

export type WindowRoundCardProps = {
  candidates: ReplyCandidate[]
  className?: string
  label?: string
}

/**
 * In-window reply round — paper card, not sticky yellow.
 */
export function WindowRoundCard({ candidates, className, label }: WindowRoundCardProps) {
  return (
    <div className={cn('paper-sheet w-full max-w-lg space-y-3 p-4', className)}>
      {label ? <p className="text-xs font-medium text-muted-foreground">{label}</p> : null}
      <ol className="space-y-3">
        {candidates.map((c, i) => (
          <CandidateBlock key={c.id ?? i} candidate={c} />
        ))}
      </ol>
    </div>
  )
}

export function WindowRoundPlaceholder({ label }: { label?: string }) {
  return (
    <div className="paper-sheet flex w-full max-w-lg flex-col gap-3 p-4">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Skeleton className="h-2.5 w-[85%]" />
          <Skeleton className="h-2 w-[55%]" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-2.5 w-[80%]" />
          <Skeleton className="h-2 w-[50%]" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-2.5 w-[88%]" />
          <Skeleton className="h-2 w-[48%]" />
        </div>
      </div>
      {label ? <p className="text-sm text-muted-foreground">{label}</p> : null}
    </div>
  )
}
