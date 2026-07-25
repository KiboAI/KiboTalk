import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ConversationSession, ConversationStorage } from '@kibotalk/conversation'
import { languageLabel, useI18n } from '@kibotalk/app-shared'
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ScrollArea,
  SessionListItem,
  StickyNoteCard,
} from '@kibotalk/ui'
import { ArrowLeft, Loader2, RotateCcw, Trash2 } from 'lucide-react'

export type HistoryPageProps = {
  storage: ConversationStorage
  activeSessionId?: string
  onBack: () => void
  onRetryReview?: (sessionId: string) => Promise<void>
  readOnly?: boolean
}

function sessionSubtitle(session: ConversationSession, locale: string, currentLabel: string): string {
  if (session.status !== 'stopped') return currentLabel
  const date = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(session.startedAt)
  const endedAt = session.endedAt ?? session.startedAt
  const durationMinutes = Math.max(
    1,
    Math.round((endedAt - session.startedAt - session.pausedDurationMs) / 60000),
  )
  return `${date} · ${durationMinutes} min`
}

function HistoryTurn({ session }: { session: ConversationSession }) {
  const { t } = useI18n()
  return (
    <ol className="space-y-3">
      {session.turns.map((turn) => {
        const user = turn.speaker === 'user'
        return (
          <li key={turn.id} className={`flex ${user ? 'justify-end' : 'justify-start'}`}>
            <div className="max-w-[82%]">
              <div className={`mb-1 text-[10.5px] font-bold text-muted-foreground ${user ? 'text-right' : ''}`}>
                {user ? t('me') : t('other')}
              </div>
              <div className={`rounded-md px-3.5 py-2.5 text-sm ${user ? 'bg-accent' : 'bg-foreground/5'}`}>
                {turn.sttFailed ? t('sttFailed') : turn.text}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function HistoryPage({
  storage,
  activeSessionId,
  onBack,
  onRetryReview,
  readOnly = false,
}: HistoryPageProps) {
  const { t, language } = useI18n()
  const [sessions, setSessions] = useState<ConversationSession[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const refresh = useCallback(async () => {
    const next = await storage.listSessions()
    setSessions(next)
    setSelectedId((current) => current ?? next[0]?.id ?? null)
  }, [storage])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const reviewPending = !readOnly && sessions.some(
    (session) => session.status === 'stopped' && session.reviewStatus === 'pending',
  )
  useEffect(() => {
    if (!reviewPending) return
    const timer = window.setInterval(() => void refresh(), 1200)
    return () => window.clearInterval(timer)
  }, [refresh, reviewPending])

  const selected = useMemo(
    () => sessions.find((session) => session.id === selectedId) ?? null,
    [selectedId, sessions],
  )
  const locale = language === 'zh' ? 'zh-CN' : language === 'ja' ? 'ja-JP' : 'en'

  return (
    <div className="min-h-dvh bg-background p-2 sm:p-5">
      <div className="paper-sheet mx-auto grid h-[calc(100dvh-1rem)] max-w-6xl overflow-hidden sm:h-[calc(100dvh-2.5rem)] sm:grid-cols-[19rem_minmax(0,1fr)]">
        <aside
          className={`min-h-0 border-border bg-muted/45 sm:flex sm:flex-col sm:border-r ${
            selected ? 'hidden sm:flex' : 'flex flex-col'
          }`}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-border p-3">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label={t('back')}>
              <ArrowLeft className="size-4" />
            </Button>
            <h1 className="text-base font-bold">{t('history')}</h1>
          </div>
          <ScrollArea className="min-h-0 flex-1 p-2">
            {sessions.length === 0 ? (
              <div className="flex min-h-48 items-center justify-center px-5 text-center text-sm text-muted-foreground">
                {t('noHistory')}
              </div>
            ) : (
              sessions.map((session) => (
                <SessionListItem
                  key={session.id}
                  title={session.title}
                  subtitle={sessionSubtitle(session, locale, t('currentSession'))}
                  current={session.id === activeSessionId}
                  onClick={() => setSelectedId(session.id)}
                  className={session.id === selectedId ? 'bg-accent/75' : undefined}
                />
              ))
            )}
          </ScrollArea>
        </aside>

        <main className={`min-h-0 ${selected ? 'flex flex-col' : 'hidden sm:flex sm:flex-col'}`}>
          {selected ? (
            <>
              <div className="flex shrink-0 items-center gap-3 border-b border-border px-3 py-3 sm:px-5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="sm:hidden"
                  onClick={() => setSelectedId(null)}
                  aria-label={t('back')}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-bold">{selected.title}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {languageLabel(selected.snapshot.conversationLang, language)} ·{' '}
                    {sessionSubtitle(selected, locale, t('currentSession'))}
                  </p>
                </div>
                {!readOnly && selected.status === 'stopped' && selected.id !== activeSessionId ? (
                  <Button
                    variant="soft"
                    size="icon"
                    aria-label="删除本次会话"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>
              <ScrollArea className="min-h-0 flex-1">
                <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(20rem,1.15fr)] lg:p-6">
                  <section className="space-y-4">
                    <div>
                      <h3 className="mb-2 text-sm font-bold">{t('sessionSummary')}</h3>
                      <div className="rounded-lg border border-border bg-card p-4 text-sm leading-relaxed">
                        {selected.reviewStatus === 'ready' && selected.summary ? (
                          selected.summary
                        ) : selected.reviewStatus === 'failed' ? (
                          <div className="space-y-3">
                            <p className="text-destructive">{t('summaryFailed')}</p>
                            {onRetryReview ? (
                              <Button
                                variant="soft"
                                size="sm"
                                disabled={retrying}
                                onClick={async () => {
                                  setRetrying(true)
                                  try {
                                    await onRetryReview(selected.id)
                                    await refresh()
                                  } finally {
                                    setRetrying(false)
                                  }
                                }}
                              >
                                {retrying ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <RotateCcw className="size-4" />
                                )}
                                {t('retry')}
                              </Button>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">{t('summaryPending')}</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <h3 className="mb-2 text-sm font-bold">{t('conversationHistory')}</h3>
                      <HistoryTurn session={selected} />
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h3 className="text-sm font-bold">{t('suggestions')}</h3>
                    {selected.turns.some((turn) => turn.suggestions?.length) ? (
                      selected.turns
                        .filter((turn) => turn.suggestions?.length)
                        .reverse()
                        .map((turn, index) => (
                          <div key={turn.id} className={index > 0 ? 'opacity-65' : undefined}>
                            {index > 0 ? (
                              <p className="mb-2 text-center text-xs text-muted-foreground">
                                {t('previousRound')}
                              </p>
                            ) : null}
                            <StickyNoteCard candidates={turn.suggestions!} className="mx-auto" />
                          </div>
                        ))
                    ) : (
                      <p className="text-sm text-muted-foreground">{t('emptySuggestions')}</p>
                    )}
                  </section>
                </div>
              </ScrollArea>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {t('noHistory')}
            </div>
          )}
        </main>
      </div>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除本次会话？</DialogTitle>
            <DialogDescription>
              这会从所有已登录设备和云端永久删除本次文本记录、建议与复盘。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="soft">{t('cancel')}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!selected) return
                await storage.deleteSession(selected.id)
                setDeleteOpen(false)
                setSelectedId(null)
                await refresh()
              }}
            >
              {t('confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
