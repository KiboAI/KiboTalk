import { cn } from '../../lib/utils'
import { CircleAlert, LoaderCircle } from 'lucide-react'

export type ModelPreloadBadgeProps = {
  /** Combined download progress, 0–1. */
  progress: number
  /** Hides the badge once true (nothing left to show once every model has settled). */
  done: boolean
  /** Shows an error tone/copy instead of the progress ring. */
  error?: boolean
  label?: string
  errorLabel?: string
  className?: string
}

/**
 * Fixed top-right corner readout for `startModelPreload`'s progress — shown
 * on onboarding/enrollment while the on-device VAD + speaker models are
 * still downloading, gone once they're ready.
 */
export function ModelPreloadBadge({
  progress,
  done,
  error,
  label = '正在准备语音能力',
  errorLabel = '语音能力准备失败',
  className,
}: ModelPreloadBadgeProps) {
  if (done && !error) return null

  const clamped = Math.max(0, Math.min(1, progress))

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed top-4 right-4 z-50 flex items-center gap-2 rounded-full bg-card/95 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-tier1 backdrop-blur-sm',
        className,
      )}
    >
      {error ? (
        <CircleAlert className="size-[18px] text-destructive" aria-hidden />
      ) : (
        <LoaderCircle className="size-[18px] animate-spin text-primary" aria-hidden />
      )}
      <span>{error ? errorLabel : `${label} ${Math.round(clamped * 100)}%`}</span>
    </div>
  )
}
