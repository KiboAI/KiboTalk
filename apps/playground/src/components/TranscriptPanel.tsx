import type { ConversationTurn, ReplyCandidate } from '@kibotalk/conversation'
import { ScrollArea } from '@kibotalk/ui'
import { MessagesSquare } from 'lucide-react'
import { ReplyCandidateCard } from './ReplyCandidateCard'

type TurnView = ConversationTurn & { candidates?: ReplyCandidate[] }

type DraftTurn = {
  speaker: 'user' | 'other'
  text: string
  startedAt: number
  endedAt: number
}

export type TranscriptPanelProps = {
  turns: TurnView[]
  draft: DraftTurn | null
}

export function TranscriptPanel({ turns, draft }: TranscriptPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div>
        <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <MessagesSquare className="size-3.5" />
          对话
        </h3>
        <p className="text-xs text-muted-foreground">最新在上 · 草稿虚线框</p>
      </div>
      <ScrollArea className="min-h-0 flex-1 pr-2">
        {!draft && turns.length === 0 ? (
          <p className="text-sm text-muted-foreground">（还没有对话轮次）</p>
        ) : (
          <ol className="space-y-2 pb-4">
            {draft && (
              <li
                className={`rounded-r-md border-l-4 border-dashed bg-muted/30 py-2 pl-3 opacity-80 ${
                  draft.speaker === 'other' ? 'border-blue-500' : 'border-emerald-500'
                }`}
              >
                <div className="text-sm font-semibold">
                  {draft.speaker === 'other' ? '对方' : '我'} · 草稿
                </div>
                <div className="text-sm">{draft.text || '…'}</div>
              </li>
            )}
            {[...turns].reverse().map((t) => (
              <li
                key={t.id}
                className={`rounded-r-md border-l-4 py-2 pl-3 ${
                  t.speaker === 'other' ? 'border-blue-500' : 'border-emerald-500'
                } ${t.sttFailed ? 'bg-red-50 dark:bg-red-950/30' : 'bg-muted/50'}`}
              >
                <div className="text-sm font-semibold">
                  {t.speaker === 'other' ? '对方' : '我'}
                  {t.sttFailed ? ' · STT 失败' : ''}
                </div>
                <div className="text-sm">{t.sttFailed ? '（空·转写失败）' : t.text}</div>
                {t.candidates && t.candidates.length > 0 ? (
                  <ul className="mt-1 ml-3 list-disc space-y-1">
                    {t.candidates.map((c) => (
                      <ReplyCandidateCard key={c.id} candidate={c} compact />
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </ScrollArea>
    </div>
  )
}
