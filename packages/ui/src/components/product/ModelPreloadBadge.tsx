import { cn } from '../../lib/utils'

export type ModelPreloadBadgeProps = {
  /** Combined download progress, 0–1. */
  progress: number
  /** Hides the badge once true (nothing left to show once every model has settled). */
  done: boolean
  /** Shows an error tone/copy instead of the progress ring. */
  error?: boolean
  className?: string
}

const RADIUS = 8
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Fixed top-right corner readout for `startModelPreload`'s progress — shown
 * on onboarding/enrollment while the on-device VAD + speaker models are
 * still downloading, gone once they're ready.
 */
export function ModelPreloadBadge({ progress, done, error, className }: ModelPreloadBadgeProps) {
  if (done && !error) return null

  const clamped = Math.max(0, Math.min(1, progress))
  const offset = CIRCUMFERENCE * (1 - clamped)

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full bg-card/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-tier1 backdrop-blur-sm',
        className,
      )}
    >
      <svg width="18" height="18" viewBox="0 0 18 18" className={error ? 'text-destructive' : 'text-primary'} aria-hidden>
        <circle cx="9" cy="9" r={RADIUS} fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2" />
        {error ? null : (
          <circle
            cx="9"
            cy="9"
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            transform="rotate(-90 9 9)"
          />
        )}
      </svg>
      <span>{error ? '本机模型加载失败' : `本机模型准备中 ${Math.round(clamped * 100)}%`}</span>
    </div>
  )
}
