import type { ReactNode } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@kibotalk/ui'
import {
  Loader2,
  Mic,
  MicOff,
  Play,
  Sparkles,
  Square,
} from 'lucide-react'

export type IslandBarProps = {
  running: boolean
  loading?: string
  state: string
  vadStatus: 'idle' | 'speech' | 'silence'
  sttEnabled: boolean
  replyEnabled: boolean
  onToggleStt: () => void
  onToggleReply: () => void
  onStart: () => void
  onStop: () => void
}

function statusTone(state: string, vadStatus: IslandBarProps['vadStatus']): {
  label: string
  pulse: boolean
  className: string
} {
  if (state === 'LLM_STREAMING') {
    return { label: '生成中', pulse: true, className: 'bg-foreground/80' }
  }
  if (vadStatus === 'speech' || state === 'USER_SPEAKING' || state === 'OTHER_SPEAKING') {
    return { label: '听写中', pulse: true, className: 'bg-emerald-700' }
  }
  if (state !== 'IDLE') {
    return { label: state, pulse: false, className: 'bg-foreground/50' }
  }
  return { label: '空闲', pulse: false, className: 'bg-foreground/35' }
}

function IslandIconButton({
  pressed,
  disabled,
  label,
  onClick,
  children,
}: {
  pressed?: boolean
  disabled?: boolean
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={pressed}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            'relative flex size-10 items-center justify-center rounded-md transition-colors',
            'text-island-foreground disabled:opacity-40',
            pressed
              ? 'bg-foreground text-background shadow-sm'
              : 'bg-black/8 hover:bg-black/12',
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
 * Playground preview of the desktop Island: icon-first yellow bar with
 * session control + STT / reply-suggestion toggles (each with live status).
 */
export function IslandBar({
  running,
  loading,
  state,
  vadStatus,
  sttEnabled,
  replyEnabled,
  onToggleStt,
  onToggleReply,
  onStart,
  onStop,
}: IslandBarProps) {
  const tone = statusTone(state, vadStatus)
  const busy = !!loading

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div
        className="island-bar pointer-events-auto flex items-center gap-2 px-2.5 py-2"
        role="toolbar"
        aria-label="悬浮岛"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 rounded-md bg-black/10 px-2.5 py-1.5">
              <span
                className={cn(
                  'size-2.5 shrink-0 rounded-full',
                  tone.className,
                  tone.pulse && 'animate-pulse',
                )}
              />
              <span className="max-w-[5.5rem] truncate text-xs font-medium text-island-foreground">
                {busy ? loading : tone.label}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">会话状态 · {state}</TooltipContent>
        </Tooltip>

        <div className="h-6 w-px bg-black/15" aria-hidden />

        {busy ? (
          <IslandIconButton label={loading || '加载中'} disabled onClick={() => {}}>
            <Loader2 className="size-4 animate-spin" />
          </IslandIconButton>
        ) : !running ? (
          <IslandIconButton label="开始会话" onClick={onStart}>
            <Play className="size-4" />
          </IslandIconButton>
        ) : (
          <IslandIconButton label="停止会话" pressed onClick={onStop}>
            <Square className="size-4" />
          </IslandIconButton>
        )}

        <div className="h-6 w-px bg-black/15" aria-hidden />

        <IslandIconButton
          label={sttEnabled ? '转写：开' : '转写：关'}
          pressed={sttEnabled}
          onClick={onToggleStt}
        >
          {sttEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
          <span
            className={cn(
              'absolute right-1 top-1 size-1.5 rounded-full',
              sttEnabled ? 'bg-emerald-600' : 'bg-foreground/30',
            )}
          />
        </IslandIconButton>

        <IslandIconButton
          label={replyEnabled ? 'AI 提示：开' : 'AI 提示：关'}
          pressed={replyEnabled}
          onClick={onToggleReply}
        >
          <Sparkles className={cn('size-4', !replyEnabled && 'opacity-50')} />
          <span
            className={cn(
              'absolute right-1 top-1 size-1.5 rounded-full',
              replyEnabled ? 'bg-emerald-600' : 'bg-foreground/30',
            )}
          />
        </IslandIconButton>
      </div>
    </div>
  )
}
