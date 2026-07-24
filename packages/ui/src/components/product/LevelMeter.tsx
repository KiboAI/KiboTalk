import { cn } from '../../lib/utils'

export type LevelMeterProps = {
  /** Current input level, 0–1 (e.g. mic RMS mapped through a perceptual curve). */
  level: number
  className?: string
}

/** Relative height weights — a fixed "Siri-style" bar shape, not real per-band spectrum data. */
const BAR_WEIGHTS = [0.55, 0.8, 1, 0.8, 0.55]

/** Live mic-level indicator (enrollment recording, etc.) — a handful of bars reacting to one scalar level, not a full waveform history. */
export function LevelMeter({ level, className }: LevelMeterProps) {
  const clamped = Math.max(0, Math.min(1, level))
  return (
    <div className={cn('flex h-8 items-end justify-center gap-1', className)} role="presentation" aria-hidden>
      {BAR_WEIGHTS.map((weight, i) => (
        <span
          key={i}
          className="w-1.5 min-h-1.5 rounded-full bg-primary transition-[height] duration-100 ease-out"
          style={{ height: `${Math.max(0.12, clamped * weight) * 100}%` }}
        />
      ))}
    </div>
  )
}
