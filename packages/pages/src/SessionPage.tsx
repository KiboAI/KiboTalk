import { useEffect, useMemo, useState } from 'react'
import type { ProductSessionController, SessionTurn } from '@kibotalk/app-shared'
import {
  languageLabel,
  levelLabel,
  shouldShowSessionError,
  useI18n,
} from '@kibotalk/app-shared'
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ScrollArea,
  StickyNoteStack,
  Switch,
} from '@kibotalk/ui'
import {
  Ellipsis,
  History,
  PanelLeft,
  Pause,
  Play,
  Settings,
  Sparkles,
  Square,
  UserRound,
} from 'lucide-react'

export type SessionPageProps = {
  controller: ProductSessionController
  onGoSettings?: () => void
  onGoHistory?: () => void
  onGoAccount?: () => void
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function useSessionDuration(controller: ProductSessionController): number {
  const [now, setNow] = useState(Date.now())
  const { activeSession, lifecycle } = controller.session
  useEffect(() => {
    if (lifecycle !== 'running') return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [lifecycle])
  if (!activeSession) return 0
  const end = activeSession.endedAt ?? (lifecycle === 'paused' ? activeSession.pausedAt ?? now : now)
  return Math.max(0, end - activeSession.startedAt - activeSession.pausedDurationMs)
}

function TurnBubble({ turn }: { turn: SessionTurn }) {
  const { t } = useI18n()
  const isUser = turn.speaker === 'user'
  const time = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(turn.startedAt)
  return (
    <li className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`max-w-[82%] ${isUser ? 'text-right' : ''}`}>
        <div className="mb-1 text-[10.5px] font-bold text-muted-foreground">
          {isUser ? t('me') : t('other')} · {time}
        </div>
        <div
          className={`rounded-md px-3.5 py-2.5 text-left text-sm leading-relaxed ${
            isUser ? 'rounded-tr-sm bg-accent' : 'rounded-tl-sm bg-foreground/5'
          }`}
        >
          {turn.sttFailed ? t('sttFailed') : turn.text}
        </div>
      </div>
    </li>
  )
}

function statusLabel(controller: ProductSessionController, translate: ReturnType<typeof useI18n>['t']) {
  const { lifecycle, loading } = controller.session
  if (loading) return translate('preparingMicrophone')
  if (lifecycle === 'paused') return translate('paused')
  if (lifecycle === 'stopped') return translate('stopped')
  if (lifecycle === 'restoring' || lifecycle === 'starting') return translate('preparing')
  return translate('listening')
}

/**
 * Responsive A+B workbench: equal-height, independently scrolling transcript
 * and suggestion columns on desktop; one suggestion stage with a transcript
 * overlay on narrow screens.
 */
export function SessionPage({ controller, onGoSettings, onGoHistory, onGoAccount }: SessionPageProps) {
  const { t, language } = useI18n()
  const [transcriptOpen, setTranscriptOpen] = useState(() =>
    window.matchMedia('(min-width: 640px)').matches,
  )
  const [stopDialogOpen, setStopDialogOpen] = useState(false)
  const { session, rounds, replyEnabled, setReplyEnabled } = controller
  const duration = useSessionDuration(controller)
  const snapshot = session.activeSession?.snapshot
  const latestTurn = session.turns.at(-1)
  const currentTranscript = session.draft ?? latestTurn
  const transcriptItems = useMemo(() => session.turns, [session.turns])
  const status = statusLabel(controller, t)
  const active = session.lifecycle === 'running' || session.lifecycle === 'paused'

  return (
    <div className="session-workbench mx-auto flex h-dvh w-full max-w-[90rem] flex-col gap-3 overflow-hidden p-3 sm:gap-4 sm:p-5">
      <header className="paper-sheet z-30 flex shrink-0 flex-wrap items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={`size-2.5 shrink-0 rounded-full ${
              session.lifecycle === 'running'
                ? 'animate-pulse bg-emerald-500'
                : session.lifecycle === 'paused'
                  ? 'bg-yellow-500'
                  : 'bg-foreground/25'
            }`}
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{status}</div>
            {snapshot ? (
              <div className="hidden text-[11px] text-muted-foreground sm:block">
                {languageLabel(snapshot.conversationLang, language)} · {levelLabel(snapshot.level, language)} ·{' '}
                {formatDuration(duration)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <label className="hidden items-center gap-2 rounded-full bg-foreground/5 px-3 py-2 text-xs font-semibold md:flex">
            <Sparkles className="size-3.5" />
            {t('aiSuggestions')}
            <Switch
              checked={replyEnabled}
              onCheckedChange={setReplyEnabled}
              aria-label={t('aiSuggestions')}
            />
          </label>

          {session.lifecycle === 'running' ? (
            <Button
              variant="soft"
              size="icon"
              onClick={() => void session.pause()}
              aria-label={t('pause')}
            >
              <Pause className="size-4" />
            </Button>
          ) : session.lifecycle === 'paused' ? (
            <Button variant="soft" size="icon" onClick={() => void session.resume()} aria-label={t('resume')}>
              <Play className="size-4" />
            </Button>
          ) : null}

          {active ? (
            <Button size="sm" onClick={() => setStopDialogOpen(true)}>
              <Square className="size-3.5" />
              <span className="hidden sm:inline">{t('stop')}</span>
            </Button>
          ) : session.lifecycle === 'stopped' ? (
            <Button size="sm" onClick={() => void session.start()}>
              <Play className="size-3.5" />
              <span className="hidden sm:inline">{t('start')}</span>
            </Button>
          ) : null}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="soft" size="icon" aria-label={t('more')}>
                <Ellipsis className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setReplyEnabled((enabled) => !enabled)} className="md:hidden">
                <Sparkles className="size-4" />
                {t('aiSuggestions')}
              </DropdownMenuItem>
              {onGoHistory ? (
                <DropdownMenuItem onSelect={onGoHistory}>
                  <History className="size-4" />
                  {t('history')}
                </DropdownMenuItem>
              ) : null}
              {onGoSettings ? (
                <DropdownMenuItem onSelect={onGoSettings}>
                  <Settings className="size-4" />
                  {t('settings')}
                </DropdownMenuItem>
              ) : null}
              {onGoAccount ? (
                <DropdownMenuItem onSelect={onGoAccount}>
                  <UserRound className="size-4" />
                  账户与额度
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {session.recoveredUnexpectedPause ? (
        <div className="shrink-0 rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
          {t('activeSessionRecovered')}
        </div>
      ) : null}
      {shouldShowSessionError(session.lifecycle, session.error) ? (
        <div className="shrink-0 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {session.error === 'VOICEPRINT_REQUIRED' ? t('voiceprintRequired') : t('sessionUnavailable')}
        </div>
      ) : null}

      {currentTranscript ? (
        <div className="glass-transcript shrink-0 px-3.5 py-2 text-sm" aria-live="polite">
          <strong className="mr-2 text-[11px] text-muted-foreground">
            {currentTranscript.speaker === 'user' ? t('me') : t('other')}
          </strong>
          {'sttFailed' in currentTranscript && currentTranscript.sttFailed
            ? t('sttFailed')
            : currentTranscript.text || '…'}
        </div>
      ) : null}

      <div
        className={`relative grid min-h-0 flex-1 gap-4 ${
          transcriptOpen ? 'sm:grid-cols-[20rem_minmax(0,1fr)]' : 'grid-cols-1'
        }`}
      >
        {transcriptOpen ? (
          <aside className="paper-sheet absolute inset-0 z-20 flex min-h-0 flex-col overflow-hidden sm:static sm:z-auto">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2 className="text-sm font-bold">{t('conversationHistory')}</h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t('currentSession')} · {transcriptItems.length}
                </p>
              </div>
              <Button
                variant="default"
                size="sm"
                className="sm:hidden"
                aria-expanded
                onClick={() => setTranscriptOpen(false)}
              >
                <PanelLeft className="size-4" />
                {t('conversationHistory')}
              </Button>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              {transcriptItems.length === 0 && !session.draft ? (
                <div className="flex min-h-48 items-center justify-center px-5 text-sm text-muted-foreground">
                  {t('noTranscript')}
                </div>
              ) : (
                <ol className="space-y-3 p-4">
                  {transcriptItems.map((turn) => (
                    <TurnBubble key={turn.id} turn={turn} />
                  ))}
                  {session.draft ? (
                    <li
                      className={`flex ${session.draft.speaker === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className="max-w-[82%] rounded-md border border-dashed border-border px-3.5 py-2.5 text-sm opacity-70">
                        {session.draft.text || '…'}
                      </div>
                    </li>
                  ) : null}
                </ol>
              )}
            </ScrollArea>
          </aside>
        ) : null}

        <main className="web-suggestion-stage paper-sheet flex min-h-0 flex-col overflow-hidden p-3 sm:p-5">
          <div className="flex shrink-0 items-center justify-between gap-3 pb-3">
            <div>
              <h1 className="text-base font-bold sm:text-lg">{t('suggestions')}</h1>
              <p className="hidden text-xs text-muted-foreground sm:block">{t('emptySuggestions')}</p>
            </div>
            <Button
              variant={transcriptOpen ? 'default' : 'soft'}
              size="sm"
              aria-expanded={transcriptOpen}
              onClick={() => setTranscriptOpen((open) => !open)}
            >
              <PanelLeft className="size-4" />
              {t('conversationHistory')}
            </Button>
          </div>
          <StickyNoteStack
            className="min-h-0 flex-1"
            rounds={rounds}
            maxRounds={3}
            streaming={session.state === 'LLM_STREAMING'}
            emptyHint={t('emptySuggestions')}
            generatingLabel={t('generatingSuggestions')}
            previousRoundLabel={t('previousRound')}
          />
        </main>
      </div>

      <Dialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('stopTitle')}</DialogTitle>
            <DialogDescription>{t('stopDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="soft">{t('cancel')}</Button>
            </DialogClose>
            <Button
              onClick={() => {
                setStopDialogOpen(false)
                void session.stop()
              }}
            >
              {t('stopAndSave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
