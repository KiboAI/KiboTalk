import type { ConversationStorage } from '@kibotalk/conversation'
import { useProductSession, type SessionLanguageSnapshot } from '@kibotalk/app-shared'
import {
  IslandBar,
  IslandDragHandle,
  IslandNavButton,
  IslandSeparator,
  IslandStatus,
  StickyNoteStack,
  IslandToggleButton,
} from '@kibotalk/ui'
import { History, Loader2, Mic, MicOff, Pause, Play, Settings, Sparkles } from 'lucide-react'

export type IslandPageProps = {
  languageSnapshot: SessionLanguageSnapshot
  storage?: ConversationStorage
  onGoSettings?: () => void
  onGoHistory?: () => void
}

/** Max reply-suggestion rounds kept visible on the compact dock (one, unlike the full-screen `SessionPage`'s two). */
const CANDIDATE_ROUNDS_MAX = 1

function statusTone(state: string, vadStatus: 'idle' | 'speech' | 'silence'): { label: string; pulse: boolean; toneClassName: string } {
  if (state === 'LLM_STREAMING') return { label: '生成中', pulse: true, toneClassName: 'bg-white/70' }
  if (vadStatus === 'speech' || state === 'USER_SPEAKING' || state === 'OTHER_SPEAKING') {
    return { label: '听写中', pulse: true, toneClassName: 'bg-emerald-400' }
  }
  if (state !== 'IDLE') return { label: state, pulse: false, toneClassName: 'bg-white/50' }
  return { label: '空闲', pulse: false, toneClassName: 'bg-white/35' }
}

/**
 * The desktop Island's floating dock content — draft caption, one sticky
 * note, and the state-toggle/nav-button bar, per
 * `prototypes/product-style-direction.html`'s `#desktop` page. Reuses
 * `useProductSession` (the same mic → VAD → speaker → STT → LLM wiring as
 * `SessionPage`); only the compact layout and `IslandBar` chrome differ.
 */
export function IslandPage({ languageSnapshot, storage, onGoSettings, onGoHistory }: IslandPageProps) {
  const { session, rounds, sttEnabled, setSttEnabled, replyEnabled, setReplyEnabled } = useProductSession({
    languageSnapshot,
    storage,
    candidateRoundsMax: CANDIDATE_ROUNDS_MAX,
  })

  const tone = statusTone(session.state, session.vadStatus)
  const busy = !!session.loading

  return (
    <div className="island-stage flex h-screen w-full flex-col items-end justify-end gap-3.5 p-6">
      {session.draft?.text ? (
        <div className="glass-chip max-w-72 self-end px-3.5 py-2 text-xs">{session.draft.text}</div>
      ) : null}

      <StickyNoteStack
        className="w-full max-w-80"
        rounds={rounds}
        maxRounds={CANDIDATE_ROUNDS_MAX}
        streaming={session.state === 'LLM_STREAMING'}
        emptyHint="开始说话，教练会在这里给出回复建议"
      />

      <IslandBar>
        <IslandStatus label={busy ? (session.loading as string) : tone.label} pulse={tone.pulse} toneClassName={tone.toneClassName} />
        <IslandSeparator />
        {busy ? (
          <IslandToggleButton on={false} disabled label={session.loading || '加载中'}>
            <Loader2 className="size-4 animate-spin" />
          </IslandToggleButton>
        ) : session.running ? (
          <IslandToggleButton on label="暂停会话" onClick={session.stop}>
            <Pause className="size-4" />
          </IslandToggleButton>
        ) : (
          <IslandToggleButton on={false} label="开始会话" onClick={() => void session.start()}>
            <Play className="size-4" />
          </IslandToggleButton>
        )}
        <IslandToggleButton
          on={sttEnabled}
          label={sttEnabled ? '转写（开）' : '转写（关）'}
          onClick={() => setSttEnabled((v) => !v)}
        >
          {sttEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
        </IslandToggleButton>
        <IslandToggleButton
          on={replyEnabled}
          label={replyEnabled ? 'AI 回复提示（开）' : 'AI 回复提示（关）'}
          onClick={() => setReplyEnabled((v) => !v)}
        >
          <Sparkles className="size-4" />
        </IslandToggleButton>
        <IslandSeparator />
        {onGoHistory ? (
          <IslandNavButton label="历史会话" onClick={onGoHistory}>
            <History className="size-4" />
          </IslandNavButton>
        ) : null}
        {onGoSettings ? (
          <IslandNavButton label="设置" onClick={onGoSettings}>
            <Settings className="size-4" />
          </IslandNavButton>
        ) : null}
        <IslandSeparator />
        <IslandDragHandle />
      </IslandBar>
    </div>
  )
}
