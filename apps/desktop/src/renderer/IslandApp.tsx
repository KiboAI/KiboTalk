import { useEffect, useMemo, useRef, useState } from 'react'
import {
  accountConversationDatabaseName,
  IndexedDbConversationStorage,
  type ConversationStorage,
} from '@kibotalk/conversation'
import {
  createSessionSnapshot,
  I18nProvider,
  loadLanguagePrefs,
  localizedSessionFallbackTitle,
  reviewConversationSession,
  resumePendingSessionReviews,
  subscribeLanguagePrefs,
  useI18n,
  useAccount,
  useCloudConversationStorage,
  useProductSession,
  type LanguagePrefs,
} from '@kibotalk/app-shared'
import { IslandBar, IslandDragHandle, IslandSeparator, IslandStatus } from '@kibotalk/ui'
import { IslandPage } from '@kibotalk/pages'
import type { DesktopSessionCommand, IslandContentSide } from '../shared/ipc'

async function getSystemAudioStream(): Promise<MediaStream> {
  const result = await window.kibotalk.systemAudio.start()
  if (!result.ok) throw new Error(result.error)
  const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
  displayStream.getVideoTracks().forEach((track) => track.stop())
  const audioTracks = displayStream.getAudioTracks()
  if (audioTracks.length === 0) {
    await window.kibotalk.systemAudio.stop()
    throw new Error('No system audio track was available')
  }
  return new MediaStream(audioTracks)
}

function ReadyIsland({
  prefs,
  storage,
  syncPending,
}: {
  prefs: LanguagePrefs
  storage: ConversationStorage
  syncPending: boolean
}) {
  const { language } = useI18n()
  const [contentSide, setContentSide] = useState<IslandContentSide>('above')
  const contentSideRef = useRef(contentSide)
  contentSideRef.current = contentSide
  const snapshot = createSessionSnapshot(prefs)
  const controller = useProductSession({
    languageSnapshot: snapshot,
    sessionSnapshot: snapshot,
    sessionTitle: localizedSessionFallbackTitle(Date.now(), snapshot.conversationLang, language),
    storage,
    candidateRoundsMax: 3,
    preferredRelayNodeId: prefs.relayNodeId,
    getSystemAudioStream,
    stopSystemAudioStream: () => window.kibotalk.systemAudio.stop(),
  })
  const controllerRef = useRef(controller)
  controllerRef.current = controller

  useEffect(() => {
    void resumePendingSessionReviews(storage)
  }, [])

  useEffect(() => {
    void window.kibotalk.island.getContentSide().then((side) => {
      setContentSide(side)
    })
    return window.kibotalk.island.onMoveSettled(() => {
      const bar = document.querySelector('.island-bar')
      if (!(bar instanceof HTMLElement)) return
      const bounds = bar.getBoundingClientRect()
      const barOffset = {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      }
      void window.kibotalk.island.settleContentSide(
        contentSideRef.current,
        barOffset,
      ).then((next) => {
        setContentSide(next)
      })
    })
  }, [])

  useEffect(() => {
    void window.kibotalk.session.updateState({
      lifecycle: controller.session.lifecycle,
      replyEnabled: controller.replyEnabled,
      uiLang: prefs.uiLang,
    })
  }, [controller.replyEnabled, controller.session.lifecycle, prefs.uiLang])

  useEffect(() => {
    const handleCommand = (command: DesktopSessionCommand) => {
      const current = controllerRef.current
      switch (command) {
        case 'start':
          current.requestSessionStart()
          break
        case 'pause':
          void current.session.pause()
          break
        case 'resume':
          void current.session.resume()
          break
        case 'stop':
          void current.session.stop()
          break
        case 'toggle-ai':
          current.setReplyEnabled((enabled) => !enabled)
          break
        case 'open-history':
          void window.kibotalk.onboarding.open('history')
          break
        case 'open-settings':
          void window.kibotalk.onboarding.open('settings')
          break
        case 'prepare-quit':
          void current.session.stop().then(() => window.kibotalk.app.quitReady())
          break
        default: {
          const exhaustive: never = command
          void exhaustive
        }
      }
    }
    return window.kibotalk.session.onCommand(handleCommand)
  }, [])

  useEffect(() => {
    const stopped = controller.session.activeSession
    if (controller.session.lifecycle !== 'stopped' || !stopped || stopped.reviewStatus !== 'pending') return
    void reviewConversationSession(storage, stopped)
  }, [controller.session.activeSession, controller.session.lifecycle])

  useEffect(() => {
    let ignored = false
    let resizing = false
    let resizeIdleTimer: number | null = null
    const setOutlineActive = (active: boolean) => {
      document
        .querySelector('.island-window-shell')
        ?.setAttribute('data-pointer-active', active ? 'true' : 'false')
    }
    const handlePointerMove = (event: MouseEvent) => {
      const edge =
        event.clientX <= 12 ||
        event.clientY <= 12 ||
        event.clientX >= window.innerWidth - 12 ||
        event.clientY >= window.innerHeight - 12
      const target = document.elementFromPoint(event.clientX, event.clientY)
      const overlayOpen = !!(
        document.querySelector('[role="dialog"]')
        || document.querySelector('[role="menu"]')
      )
      const interactive =
        overlayOpen
        || (target instanceof Element
          && !!target.closest(
            '.desktop-interactive, [role="dialog"], [role="menu"], [role="tooltip"], [data-radix-popper-content-wrapper], [data-island-drag-handle]',
          ))
      // Keep yellow outline sticky while resizing so it does not flicker off
      // when the OS briefly leaves the edge hit zone.
      setOutlineActive(edge || interactive || overlayOpen || resizing)
      const nextIgnored = !edge && !interactive
      if (nextIgnored === ignored) return
      ignored = nextIgnored
      void window.kibotalk.island.setPointerThrough(ignored)
    }
    const handlePointerLeave = () => {
      if (resizing) return
      setOutlineActive(false)
      if (ignored) return
      ignored = true
      void window.kibotalk.island.setPointerThrough(true)
    }
    const handleResize = () => {
      resizing = true
      setOutlineActive(true)
      if (ignored) {
        ignored = false
        void window.kibotalk.island.setPointerThrough(false)
      }
      if (resizeIdleTimer !== null) window.clearTimeout(resizeIdleTimer)
      resizeIdleTimer = window.setTimeout(() => {
        resizing = false
        resizeIdleTimer = null
      }, 250)
    }
    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('resize', handleResize)
    document.documentElement.addEventListener('mouseleave', handlePointerLeave)
    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('resize', handleResize)
      document.documentElement.removeEventListener('mouseleave', handlePointerLeave)
      if (resizeIdleTimer !== null) window.clearTimeout(resizeIdleTimer)
      setOutlineActive(false)
      void window.kibotalk.island.setPointerThrough(false)
    }
  }, [])

  return (
    <IslandPage
      controller={controller}
      contentSide={contentSide}
      syncPending={syncPending}
      onGoSettings={() => void window.kibotalk.onboarding.open('settings')}
      onGoHistory={() => void window.kibotalk.onboarding.open('history')}
      onGoAccount={() => void window.kibotalk.onboarding.open('account')}
      onHide={() => void window.kibotalk.island.hide()}
      onQuit={() => void window.kibotalk.app.quitReady()}
    />
  )
}

function IslandContent({ prefs }: { prefs: LanguagePrefs }) {
  const { t } = useI18n()
  const [completed, setCompleted] = useState<boolean | null>(null)
  const accountState = useAccount()
  const localStorage = useMemo(
    () => new IndexedDbConversationStorage(
      accountState.account
        ? accountConversationDatabaseName(accountState.account.user.id)
        : undefined,
    ),
    [accountState.account?.user.id],
  )
  const cloud = useCloudConversationStorage({
    local: localStorage,
    userId: accountState.account?.user.id ?? null,
  })

  useEffect(() => {
    let cancelled = false
    void window.kibotalk.onboarding.getStatus().then((status) => {
      if (!cancelled) setCompleted(status.completed)
    })
    const unsubscribeCompleted = window.kibotalk.onboarding.onCompleted(() => {
      setCompleted(true)
      void accountState.refresh()
    })
    const unsubscribeReset = window.kibotalk.onboarding.onReset(() => setCompleted(false))
    return () => {
      cancelled = true
      unsubscribeCompleted()
      unsubscribeReset()
    }
  }, [accountState.refresh])

  if (completed !== true || accountState.loading || !accountState.account || !cloud.storage) {
    return (
      <div className="flex h-dvh w-full items-end justify-end p-2">
        <IslandBar>
          <IslandStatus
            label={
              completed === null || accountState.loading
                ? t('preparing')
                : !accountState.account
                  ? '登录'
                  : t('preparing')
            }
            onClick={
                completed === null || accountState.loading
                  ? undefined
                  : () => void window.kibotalk.onboarding.open(
                      accountState.account ? 'settings' : 'account',
                    )
            }
          />
          <IslandSeparator />
          <IslandDragHandle label={t('moveWindow')} />
        </IslandBar>
      </div>
    )
  }

  return <ReadyIsland prefs={prefs} storage={cloud.storage} syncPending={Boolean(cloud.error)} />
}

export default function IslandApp() {
  const [prefs, setPrefs] = useState<LanguagePrefs>(loadLanguagePrefs)
  useEffect(() => subscribeLanguagePrefs(setPrefs), [])
  return (
    <I18nProvider value={prefs} onChange={setPrefs}>
      <IslandContent prefs={prefs} />
    </I18nProvider>
  )
}
