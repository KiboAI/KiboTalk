import {
  IslandBar as SharedIslandBar,
  IslandDragHandle,
  IslandSeparator,
  IslandStatus,
  IslandToggleButton,
} from '@kibotalk/ui'
import { Loader2, Mic, MicOff, Play, Sparkles, Square } from 'lucide-react'

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
  toneClassName: string
} {
  if (state === 'LLM_STREAMING') {
    return { label: '生成中', pulse: true, toneClassName: 'bg-white/70' }
  }
  if (vadStatus === 'speech' || state === 'USER_SPEAKING' || state === 'OTHER_SPEAKING') {
    return { label: '听写中', pulse: true, toneClassName: 'bg-emerald-400' }
  }
  if (state !== 'IDLE') {
    return { label: state, pulse: false, toneClassName: 'bg-white/50' }
  }
  return { label: '空闲', pulse: false, toneClassName: 'bg-white/35' }
}

/**
 * Playground preview of the desktop Island: session control + STT / reply
 * toggles composed from the shared @kibotalk/ui Island primitives.
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
      <SharedIslandBar className="pointer-events-auto">
        <IslandStatus label={busy ? (loading as string) : tone.label} pulse={tone.pulse} toneClassName={tone.toneClassName} />
        <IslandSeparator />
        {busy ? (
          <IslandToggleButton on={false} disabled label={loading || '加载中'}>
            <Loader2 className="size-4 animate-spin" />
          </IslandToggleButton>
        ) : !running ? (
          <IslandToggleButton on={false} label="开始会话" onClick={onStart}>
            <Play className="size-4" />
          </IslandToggleButton>
        ) : (
          <IslandToggleButton on label="停止会话" onClick={onStop}>
            <Square className="size-4" />
          </IslandToggleButton>
        )}
        <IslandToggleButton on={sttEnabled} label={sttEnabled ? '转写：开' : '转写：关'} onClick={onToggleStt}>
          {sttEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
        </IslandToggleButton>
        <IslandToggleButton on={replyEnabled} label={replyEnabled ? 'AI 提示：开' : 'AI 提示：关'} onClick={onToggleReply}>
          <Sparkles className="size-4" />
        </IslandToggleButton>
        <IslandSeparator />
        <IslandDragHandle />
      </SharedIslandBar>
    </div>
  )
}
