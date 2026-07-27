import * as React from 'react'
import { Move } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

export type IslandBarProps = React.HTMLAttributes<HTMLDivElement>

/**
 * Desktop Island / playground floating-sim dock chrome: dark glass bar
 * holding a status readout, state toggles, and one-shot nav buttons.
 *
 * The bar itself is not draggable: movement is intentionally limited to the
 * explicit four-way-arrow handle (`IslandDragHandle`).
 */
export function IslandBar({ className, children, ...props }: IslandBarProps) {
  return (
    <div
      role="toolbar"
      aria-label="悬浮岛"
      className={cn('island-bar flex items-center gap-2 px-2.5 py-2 [-webkit-app-region:no-drag]', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function IslandStatus({
  label,
  pulse,
  toneClassName = 'bg-emerald-500',
  onClick,
}: {
  label: string
  pulse?: boolean
  /** Tailwind background class for the status dot. */
  toneClassName?: string
  /** Makes the pill itself the action (e.g. "reopen onboarding") instead of a passive readout — avoids pairing a status label with a separate, unlabeled icon button that does the same thing. */
  onClick?: () => void
}) {
  const dot = (
    <span className={cn('size-2.5 shrink-0 rounded-full ring-2 ring-white/10', toneClassName, pulse && 'animate-pulse')} />
  )
  const text = <span className="max-w-24 truncate text-xs font-medium text-island-foreground">{label}</span>

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-2 rounded-full bg-white/8 px-2.5 py-1.5 transition-colors [-webkit-app-region:no-drag] hover:bg-white/12"
      >
        {dot}
        {text}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-full bg-white/8 px-2.5 py-1.5">
      {dot}
      {text}
    </div>
  )
}

/** Divider between the toggle group and the nav-button group. */
export function IslandSeparator() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-white/16" aria-hidden />
}

/**
 * Dedicated move affordance (four-way arrow). Desktop uses pointer-capture +
 * IPC window positioning because `-webkit-app-region: drag` is unreliable on
 * the blurred Island bar and conflicts with click-through / tooltips.
 */
export function IslandDragHandle({ label = '拖动可移动悬浮窗' }: { label?: string }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      title={label}
      data-island-drag-handle
      className="flex size-8 shrink-0 cursor-move items-center justify-center rounded-sm bg-white/8 text-island-foreground/70 [-webkit-app-region:no-drag]"
      onPointerDown={(event) => {
        if (event.button !== 0) return
        const el = event.currentTarget
        const startScreenX = event.screenX
        const startScreenY = event.screenY
        const desktop = (
          window as unknown as {
            kibotalk?: {
              island?: {
                getBounds?: () => Promise<{ x: number; y: number; width: number; height: number }>
                setPosition?: (x: number, y: number) => Promise<void>
                setPointerThrough?: (ignored: boolean) => Promise<void>
              }
            }
          }
        ).kibotalk?.island
        if (!desktop?.getBounds || !desktop?.setPosition) return
        event.preventDefault()
        void desktop.setPointerThrough?.(false)
        void desktop.getBounds().then((bounds) => {
          const originX = bounds.x
          const originY = bounds.y
          const onMove = (moveEvent: PointerEvent) => {
            void desktop.setPosition?.(
              originX + moveEvent.screenX - startScreenX,
              originY + moveEvent.screenY - startScreenY,
            )
          }
          const onUp = () => {
            el.releasePointerCapture(event.pointerId)
            el.removeEventListener('pointermove', onMove)
            el.removeEventListener('pointerup', onUp)
            el.removeEventListener('pointercancel', onUp)
          }
          el.setPointerCapture(event.pointerId)
          el.addEventListener('pointermove', onMove)
          el.addEventListener('pointerup', onUp)
          el.addEventListener('pointercancel', onUp)
        })
      }}
    >
      <Move className="size-4 pointer-events-none" />
    </div>
  )
}

type IslandButtonProps = {
  label: string
  disabled?: boolean
  onClick?: () => void
  children: React.ReactNode
  className?: string
}

/**
 * A state toggle (转写 / AI 回复提示 / 播放) — turns solid yellow when `on`,
 * back to the plain glass look when off. Must not look like `IslandNavButton`.
 */
export function IslandToggleButton({
  on,
  label,
  disabled,
  onClick,
  children,
  className,
}: IslandButtonProps & { on: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={on}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            'flex size-8 items-center justify-center rounded-sm border border-transparent text-island-foreground transition-colors [-webkit-app-region:no-drag] disabled:opacity-40',
            on ? 'border-white/16 bg-surface-active text-primary-foreground shadow-tier1' : 'bg-white/8 hover:bg-white/12',
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * A one-shot action with no on/off state (设置 / 历史 / 拖动) — always the
 * plain glass look, lives in its own group past a divider so it never
 * borrows the toggle's "on" yellow fill.
 */
export function IslandNavButton({ label, disabled, onClick, children, className }: IslandButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            'flex size-8 items-center justify-center rounded-sm bg-white/8 text-island-foreground transition-colors [-webkit-app-region:no-drag] hover:bg-white/12 disabled:opacity-40',
            className,
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}
