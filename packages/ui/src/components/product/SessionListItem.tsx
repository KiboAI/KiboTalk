import { ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'

export type SessionListItemProps = {
  title: string
  /** e.g. "进行中" or "昨天 09:05 · 7 分钟" — deliberately light on info. */
  subtitle: string
  /** The in-session sidebar's own active session — soft-tint, not clickable. */
  current?: boolean
  onClick?: () => void
  className?: string
}

/**
 * One row for a past (or current) session — shared by the History list page
 * and the in-session history sidebar, so there is one card style, not two.
 */
export function SessionListItem({ title, subtitle, current, onClick, className }: SessionListItemProps) {
  return (
    <div
      role={current ? undefined : 'button'}
      tabIndex={current ? undefined : 0}
      onClick={current ? undefined : onClick}
      className={cn(
        'mb-1 flex items-center gap-2.5 rounded-md px-3.5 py-3',
        current ? 'bg-accent' : 'cursor-pointer hover:bg-foreground/3',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold">{title}</div>
        <div className="mt-0.5 text-xs text-foreground/40">{subtitle}</div>
      </div>
      {!current ? <ChevronRight className="size-4 shrink-0 text-foreground/40" /> : null}
    </div>
  )
}
