import { useState } from 'react'
import type { ConversationStorage } from '@kibotalk/conversation'
import { useProductSession, type SessionLanguageSnapshot, type SessionTurn } from '@kibotalk/app-shared'
import { Button, PillTag, ScrollArea, StickyNoteStack } from '@kibotalk/ui'
import { History, PanelLeft, Settings, Sparkle, Square } from 'lucide-react'

export type SessionPageProps = {
  languageSnapshot: SessionLanguageSnapshot
  /** Defaults to an in-memory session (playground behavior); `apps/web` passes `IndexedDbConversationStorage`. */
  storage?: ConversationStorage
  onGoSettings?: () => void
  onGoHistory?: () => void
}

/** Max reply-suggestion rounds kept visible on the stage. */
const CANDIDATE_ROUNDS_MAX = 2

function TurnBubble({ turn }: { turn: SessionTurn }) {
  const isUser = turn.speaker === 'user'
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`max-w-[78%] rounded-md px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser ? 'rounded-tr-sm bg-accent' : 'rounded-tl-sm bg-foreground/5'
        }`}
      >
        <div className="mb-0.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
          {isUser ? '我' : '对方'}
        </div>
        {turn.sttFailed ? '（空·转写失败）' : turn.text}
      </div>
    </div>
  )
}

/**
 * The `apps/web` "session window" — final-product view of a live coaching
 * session. Composes `useConversationSession` (mic → VAD → speaker → STT →
 * LLM) with the sticky-note reply stage; no dev toolbar, provider picker, or
 * debug panel (see `apps/playground/src/LiveSession.tsx` for that surface).
 */
export function SessionPage({ languageSnapshot, storage, onGoSettings, onGoHistory }: SessionPageProps) {
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const { session, rounds } = useProductSession({
    languageSnapshot,
    storage,
    candidateRoundsMax: CANDIDATE_ROUNDS_MAX,
  })

  return (
    <div className="mx-auto flex h-screen max-w-4xl flex-col gap-4 p-6">
      <div className="paper-sheet flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`size-2.5 rounded-full ${session.running ? 'animate-pulse bg-emerald-500' : 'bg-foreground/25'}`}
          />
          <span className="text-sm font-semibold">{session.running ? '听写中' : session.loading || '待机'}</span>
          {session.activeSttPath === 'realtime' ? <PillTag>实时转写</PillTag> : null}
          {session.activeSttPath === 'batch' ? <PillTag>batch 转写</PillTag> : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="soft" size="sm" onClick={() => setTranscriptOpen((v) => !v)}>
            <PanelLeft className="size-4" />
            对话记录
          </Button>
          {onGoHistory ? (
            <Button variant="soft" size="icon" onClick={onGoHistory} aria-label="历史会话">
              <History className="size-4" />
            </Button>
          ) : null}
          {onGoSettings ? (
            <Button variant="soft" size="icon" onClick={onGoSettings} aria-label="设置">
              <Settings className="size-4" />
            </Button>
          ) : null}
          {session.running ? (
            <Button size="sm" variant="destructive" onClick={session.stop}>
              <Square className="size-4" />
              停止会话
            </Button>
          ) : null}
        </div>
      </div>

      {session.error ? <p className="text-sm text-destructive">{session.error}</p> : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="paper-sheet min-h-0 p-5">
          <StickyNoteStack
            rounds={rounds}
            maxRounds={CANDIDATE_ROUNDS_MAX}
            streaming={session.state === 'LLM_STREAMING'}
            emptyHint="开始说话，教练会在这里给出回复建议"
          />
        </div>
        {transcriptOpen ? (
          <div className="paper-sheet flex min-h-0 flex-col gap-2 p-4">
            <p className="inline-flex items-center gap-1.5 text-sm font-bold">
              <Sparkle className="size-3.5" />
              对话记录
            </p>
            <ScrollArea className="min-h-0 flex-1">
              {session.turns.length === 0 && !session.draft ? (
                <p className="text-sm text-muted-foreground">（还没有对话轮次）</p>
              ) : (
                <div className="space-y-2.5 pb-3 pr-2">
                  {session.draft ? (
                    <div className="rounded-md border border-dashed border-border px-3.5 py-2.5 text-sm opacity-70">
                      {session.draft.text || '…'}
                    </div>
                  ) : null}
                  {[...session.turns].reverse().map((t) => (
                    <TurnBubble key={t.id} turn={t} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : null}
      </div>
    </div>
  )
}
