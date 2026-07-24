import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export type PillTagProps = {
  children: ReactNode
  className?: string
}

/** Small soft-yellow status pill — "实时转写", session duration, etc. */
export function PillTag({ children, className }: PillTagProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground shadow-tier0',
        className,
      )}
    >
      {children}
    </span>
  )
}
