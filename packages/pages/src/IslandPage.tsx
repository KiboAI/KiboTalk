import { useEffect, useRef, useState } from 'react'
import type { ProductSessionController } from '@kibotalk/app-shared'
import { useI18n } from '@kibotalk/app-shared'
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IslandBar,
  IslandDragHandle,
  IslandNavButton,
  IslandSeparator,
  IslandStatus,
  IslandToggleButton,
  StickyNoteStack,
} from '@kibotalk/ui'
import {
  Ellipsis,
  EyeOff,
  History,
  LogOut,
  Pause,
  Play,
  Settings,
  Sparkles,
  Square,
  UserRound,
} from 'lucide-react'

export type IslandPageProps = {
  controller: ProductSessionController
  contentSide: 'above' | 'below'
  onGoSettings?: () => void
  onGoHistory?: () => void
  onGoAccount?: () => void
  onHide?: () => void
  onQuit?: () => void
}

function useVisibleRoundCount() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [count, setCount] = useState(1)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const update = () => {
      const height = root.getBoundingClientRect().height
      setCount(height >= 820 ? 3 : height >= 620 ? 2 : 1)
    }
    const observer = new ResizeObserver(update)
    observer.observe(root)
    update()
    return () => observer.disconnect()
  }, [])
  return { rootRef, count }
}

function islandStatus(controller: ProductSessionController, translate: ReturnType<typeof useI18n>['t']) {
  const { lifecycle, state, vadStatus, loading } = controller.session
  if (loading) return { label: translate('preparing'), pulse: true, toneClassName: 'bg-white/60' }
  if (lifecycle === 'paused') return { label: translate('paused'), pulse: false, toneClassName: 'bg-yellow-400' }
  if (lifecycle === 'stopped') return { label: translate('stopped'), pulse: false, toneClassName: 'bg-white/35' }
  if (state === 'LLM_STREAMING') {
    return { label: translate('generatingSuggestions'), pulse: true, toneClassName: 'bg-white/70' }
  }
  if (vadStatus === 'speech') {
    return { label: translate('listening'), pulse: true, toneClassName: 'bg-emerald-400' }
  }
  return { label: translate('listening'), pulse: false, toneClassName: 'bg-emerald-400' }
}

/** Production desktop floating window, including live resize-aware round count and vertical flip. */
export function IslandPage({
  controller,
  contentSide,
  onGoSettings,
  onGoHistory,
  onGoAccount,
  onHide,
  onQuit,
}: IslandPageProps) {
  const { t } = useI18n()
  const { rootRef, count } = useVisibleRoundCount()
  const [stopDialogOpen, setStopDialogOpen] = useState(false)
  const [quitDialogOpen, setQuitDialogOpen] = useState(false)
  const { session, rounds, replyEnabled, setReplyEnabled } = controller
  const tone = islandStatus(controller, t)
  const active = session.lifecycle === 'running' || session.lifecycle === 'paused'
  const latestTurn = session.turns.at(-1)
  const transcript = session.draft ?? latestTurn
  const showSuggestions = rounds.length > 0 || session.state === 'LLM_STREAMING'

  const content = transcript || showSuggestions ? (
    <div className="desktop-float-content desktop-interactive flex min-h-0 w-full flex-1 flex-col gap-2.5">
      {transcript ? (
        <div className="glass-chip shrink-0 px-3.5 py-2 text-xs" aria-live="polite">
          <strong className="mr-2 text-[10px] text-island-foreground/50">
            {transcript.speaker === 'user' ? t('me') : t('other')}
          </strong>
          {'sttFailed' in transcript && transcript.sttFailed ? t('sttFailed') : transcript.text || '…'}
        </div>
      ) : null}
      {showSuggestions ? (
        <StickyNoteStack
          className="min-h-0 flex-1 overflow-hidden"
          rounds={rounds}
          maxRounds={count}
          streaming={session.state === 'LLM_STREAMING'}
          generatingLabel={t('generatingSuggestions')}
          previousRoundLabel={t('previousRound')}
          compactOlderRounds
          scrollable={false}
        />
      ) : null}
    </div>
  ) : null

  const island = (
    <IslandBar className="desktop-interactive mx-auto shrink-0">
      <IslandStatus
        label={tone.label}
        pulse={tone.pulse}
        toneClassName={tone.toneClassName}
      />
      <IslandSeparator />
      {session.lifecycle === 'running' ? (
        <IslandToggleButton on label={t('pause')} onClick={() => void session.pause()}>
          <Pause className="size-4" />
        </IslandToggleButton>
      ) : session.lifecycle === 'paused' ? (
        <IslandToggleButton on={false} label={t('resume')} onClick={() => void session.resume()}>
          <Play className="size-4" />
        </IslandToggleButton>
      ) : (
        <IslandToggleButton
          on={false}
          disabled={session.lifecycle === 'starting' || session.lifecycle === 'restoring'}
          label={t('start')}
          onClick={() => void session.start()}
        >
          <Play className="size-4" />
        </IslandToggleButton>
      )}
      <IslandNavButton
        label={t('stopAndSave')}
        disabled={!active}
        onClick={() => setStopDialogOpen(true)}
      >
        <Square className="size-4" />
      </IslandNavButton>
      <IslandToggleButton
        on={replyEnabled}
        label={t('aiSuggestions')}
        onClick={() => setReplyEnabled((enabled) => !enabled)}
      >
        <Sparkles className="size-4" />
      </IslandToggleButton>
      <IslandSeparator />
      <IslandDragHandle label={t('moveWindow')} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IslandNavButton label={t('more')}>
            <Ellipsis className="size-4" />
          </IslandNavButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          side={contentSide === 'above' ? 'top' : 'bottom'}
          sideOffset={8}
        >
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
          {onHide ? (
            <DropdownMenuItem onSelect={onHide}>
              <EyeOff className="size-4" />
              {t('hideWindow')}
            </DropdownMenuItem>
          ) : null}
          {onQuit ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => setQuitDialogOpen(true)}
              >
                <LogOut className="size-4" />
                {t('quit')}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </IslandBar>
  )

  return (
    <>
      <div ref={rootRef} className="island-window-shell h-dvh w-full p-2">
        <div className="flex h-full w-full flex-col gap-2.5">
          {contentSide === 'above' ? content : island}
          {contentSide === 'above' ? island : content}
        </div>
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

      <Dialog open={quitDialogOpen} onOpenChange={setQuitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{active ? t('quitTitleActive') : t('quitTitleStopped')}</DialogTitle>
            <DialogDescription>
              {active ? t('quitDescriptionActive') : t('quitDescriptionStopped')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="soft">{t('cancel')}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={async () => {
                if (active) await session.stop()
                onQuit?.()
              }}
            >
              {t('quit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
