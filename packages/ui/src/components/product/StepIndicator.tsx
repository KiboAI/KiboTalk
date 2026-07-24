import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'

export type Step = {
  label: string
}

export type StepIndicatorProps = {
  steps: Step[]
  /** 0-based index of the current step. */
  current: number
  className?: string
}

/**
 * Enrollment-wizard step dots — done (ink check), active (surface-active),
 * upcoming (track tint) — connected by thin lines.
 */
export function StepIndicator({ steps, current, className }: StepIndicatorProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {steps.map((step, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={step.label} className="flex flex-1 items-center gap-2 last:flex-none">
            <span
              aria-current={active}
              aria-label={step.label}
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                done && 'bg-foreground text-background',
                active && 'bg-surface-active text-primary-foreground shadow-tier1',
                !done && !active && 'bg-foreground/6 text-foreground/40',
              )}
            >
              {done ? <Check className="size-3" /> : i + 1}
            </span>
            {i < steps.length - 1 ? <span className="h-0.5 flex-1 bg-foreground/6" /> : null}
          </div>
        )
      })}
    </div>
  )
}
