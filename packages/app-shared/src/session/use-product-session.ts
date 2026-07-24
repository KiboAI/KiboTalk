import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConversationSessionSnapshot, ConversationStorage } from '@kibotalk/conversation'
import { defaultAppConfig } from '../config'
import { fetchSttProviders, defaultRealtimeFirstProvider } from '../stt-providers'
import type { SessionLanguageSnapshot } from '../proxy-clients'
import {
  useConversationSession,
  type CandidateRound,
  type ProductSessionLifecycle,
} from './use-conversation-session'

export type ProductSessionParams = {
  languageSnapshot: SessionLanguageSnapshot
  sessionSnapshot?: ConversationSessionSnapshot
  sessionTitle?: string
  getSystemAudioStream?: () => Promise<MediaStream>
  stopSystemAudioStream?: () => Promise<void>
  /** Defaults to an in-memory session (playground behavior); product apps pass a persisted `ConversationStorage`. */
  storage?: ConversationStorage
  /** Reply-suggestion rounds kept visible on the stage. */
  candidateRoundsMax?: number
}

/**
 * The always-on live session every product surface (`apps/web`'s
 * `SessionPage`, `apps/desktop`'s Island) drives identically: fetch STT
 * providers, wire `useConversationSession` on `defaultAppConfig`'s hardcoded
 * knobs, auto-start once providers are known, interrupt on unmount, and derive
 * the newest-first candidate rounds for `StickyNoteStack`. Only the
 * surrounding JSX differs per surface.
 */
export function useProductSession({
  languageSnapshot,
  sessionSnapshot,
  sessionTitle,
  getSystemAudioStream,
  stopSystemAudioStream,
  storage,
  candidateRoundsMax = 3,
}: ProductSessionParams) {
  const [providers, setProviders] = useState<Awaited<ReturnType<typeof fetchSttProviders>>>([])
  const [providersLoaded, setProvidersLoaded] = useState(false)
  const [replyEnabled, setReplyEnabled] = useState(true)
  const autoStartedRef = useRef(false)
  const previousLifecycleRef = useRef<ProductSessionLifecycle>('restoring')

  useEffect(() => {
    let cancelled = false
    void fetchSttProviders().then((list) => {
      if (cancelled) return
      setProviders(list)
      setProvidersLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedProvider = useMemo(() => defaultRealtimeFirstProvider(providers), [providers])

  const session = useConversationSession({
    speechThreshold: defaultAppConfig.vad.speechThreshold,
    exitThreshold: defaultAppConfig.vad.exitThreshold,
    minSilenceDurationMs: defaultAppConfig.vad.minSilenceDurationMs,
    minSpeechDurationMs: defaultAppConfig.vad.minSpeechDurationMs,
    vadVariantId: defaultAppConfig.vadVariantId,
    prePadMs: defaultAppConfig.asrPadMs.pre,
    postPadMs: defaultAppConfig.asrPadMs.post,
    pauseMs: defaultAppConfig.aggregator.pauseMs,
    mergeMaxMs: defaultAppConfig.aggregator.maxMs,
    speakerThreshold: defaultAppConfig.speakerThreshold,
    transcribeMode: 'aggregated',
    candidateRoundsMax,
    sttEnabled: true,
    replyEnabled,
    languageSnapshot,
    sessionSnapshot,
    sessionTitle,
    getSystemAudioStream,
    stopSystemAudioStream,
    providers,
    selectedProvider,
    storage,
    persistSessionLifecycle: !!storage && !!sessionSnapshot,
  })
  const interruptRef = useRef(session.interrupt)
  interruptRef.current = session.interrupt

  useEffect(() => {
    const previous = previousLifecycleRef.current
    previousLifecycleRef.current = session.lifecycle
    if (
      session.lifecycle === 'stopped' &&
      (previous === 'running' || previous === 'paused')
    ) {
      setReplyEnabled(true)
    }
  }, [session.lifecycle])

  // The coach is always-on once a session surface is reached (onboarding +
  // enrollment already gated entry) — no separate "start recording" click.
  useEffect(() => {
    if (
      providersLoaded &&
      session.lifecycle === 'stopped' &&
      !session.loading &&
      !autoStartedRef.current
    ) {
      autoStartedRef.current = true
      void session.start()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providersLoaded, session.lifecycle])

  useEffect(() => {
    return () => {
      void interruptRef.current()
    }
  }, [])

  const rounds: CandidateRound[] = useMemo(
    () =>
      session.turns
        .filter((t) => t.candidates && t.candidates.length > 0)
        .map((t) => ({ id: t.id, candidates: t.candidates! }))
        .reverse(),
    [session.turns],
  )

  return {
    session,
    rounds,
    replyEnabled,
    setReplyEnabled,
  }
}

export type ProductSessionController = ReturnType<typeof useProductSession>
