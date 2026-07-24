import { useEffect, useRef, useState } from 'react'
import { IndexedDbConversationStorage } from '@kibotalk/conversation'
import {
  createSessionSnapshot,
  I18nProvider,
  loadLanguagePrefs,
  localizedSessionFallbackTitle,
  reviewConversationSession,
  resumePendingSessionReviews,
  subscribeLanguagePrefs,
  useI18n,
  useProductSession,
  type LanguagePrefs,
} from '@kibotalk/app-shared'
import { IslandBar, IslandDragHandle, IslandSeparator, IslandStatus } from '@kibotalk/ui'
import { IslandPage } from '@kibotalk/pages'
import type { DesktopSessionCommand, IslandContentSide } from '../shared/ipc'

const storage = new IndexedDbConversationStorage()

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

function ReadyIsland({ prefs }: { prefs: LanguagePrefs }) {
  const { language } = useI18n()
  const [contentSide, setContentSide] = useState<IslandContentSide>('above')
  const snapshot = createSessionSnapshot(prefs)
  const controller = useProductSession({
    languageSnapshot: snapshot,
    sessionSnapshot: snapshot,
    sessionTitle: localizedSessionFallbackTitle(Date.now(), snapshot.conversationLang, language),
    storage,
    candidateRoundsMax: 3,
    getSystemAudioStream,
    stopSystemAudioStream: () => window.kibotalk.systemAudio.stop(),
  })
  const controllerRef = useRef(controller)
  controllerRef.current = controller

  useEffect(() => {
    void resumePendingSessionReviews(storage)
  }, [])

  useEffect(() => {
    void window.kibotalk.island.getContentSide().then(setContentSide)
    return window.kibotalk.island.onContentSideChanged(setContentSide)
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
          void current.session.start()
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
    const setOutlineActive = (active: boolean) => {
      document
        .querySelector('.island-window-shell')
        ?.setAttribute('data-pointer-active', active ? 'true' : 'false')
    }
    const handlePointerMove = (event: MouseEvent) => {
      const edge =
        event.clientX <= 8 ||
        event.clientY <= 8 ||
        event.clientX >= window.innerWidth - 8 ||
        event.clientY >= window.innerHeight - 8
      const target = document.elementFromPoint(event.clientX, event.clientY)
      const interactive =
        !!document.querySelector('[role="dialog"]') ||
        (target instanceof Element &&
          !!target.closest('.desktop-interactive, [role="dialog"], [role="menu"]'))
      setOutlineActive(edge || interactive)
      const nextIgnored = !edge && !interactive
      if (nextIgnored === ignored) return
      ignored = nextIgnored
      void window.kibotalk.island.setPointerThrough(ignored)
    }
    const handlePointerLeave = () => {
      setOutlineActive(false)
      if (ignored) return
      ignored = true
      void window.kibotalk.island.setPointerThrough(true)
    }
    window.addEventListener('mousemove', handlePointerMove)
    document.documentElement.addEventListener('mouseleave', handlePointerLeave)
    return () => {
      window.removeEventListener('mousemove', handlePointerMove)
      document.documentElement.removeEventListener('mouseleave', handlePointerLeave)
      setOutlineActive(false)
      void window.kibotalk.island.setPointerThrough(false)
    }
  }, [])

  return (
    <IslandPage
      controller={controller}
      contentSide={contentSide}
      onGoSettings={() => void window.kibotalk.onboarding.open('settings')}
      onGoHistory={() => void window.kibotalk.onboarding.open('history')}
      onHide={() => void window.kibotalk.island.hide()}
      onQuit={() => void window.kibotalk.app.quitReady()}
    />
  )
}

function IslandContent({ prefs }: { prefs: LanguagePrefs }) {
  const { t } = useI18n()
  const [completed, setCompleted] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.kibotalk.onboarding.getStatus().then((status) => {
      if (!cancelled) setCompleted(status.completed)
    })
    const unsubscribeCompleted = window.kibotalk.onboarding.onCompleted(() => setCompleted(true))
    const unsubscribeReset = window.kibotalk.onboarding.onReset(() => setCompleted(false))
    return () => {
      cancelled = true
      unsubscribeCompleted()
      unsubscribeReset()
    }
  }, [])

  if (completed !== true) {
    return (
      <div className="flex h-dvh w-full items-end justify-end p-2">
        <IslandBar>
          <IslandStatus
            label={completed === null ? t('preparing') : t('settings')}
            onClick={completed === null ? undefined : () => void window.kibotalk.onboarding.open()}
          />
          <IslandSeparator />
          <IslandDragHandle label={t('moveWindow')} />
        </IslandBar>
      </div>
    )
  }

  return <ReadyIsland prefs={prefs} />
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
