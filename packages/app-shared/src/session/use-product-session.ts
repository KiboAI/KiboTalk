import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConversationSessionSnapshot, ConversationStorage } from '@kibotalk/conversation'
import { defaultAppConfig } from '../config'
import { fetchSttProviders, defaultRealtimeFirstProvider } from '../stt-providers'
import type { SessionLanguageSnapshot } from '../proxy-clients'
import { useRelayNodeProbes } from '../use-relay-node-probes'
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
  /** User preference used to highlight the default choice in the pre-session picker. */
  preferredRelayNodeId?: string
}

/**
 * The live session every product surface (`apps/web`'s
 * `SessionPage`, `apps/desktop`'s Island) drives identically: fetch STT
 * providers, wire `useConversationSession` on `defaultAppConfig`'s hardcoded
 * knobs, probe user-to-node latency for the pre-session manual picker,
 * interrupt on unmount, and derive the newest-first candidate rounds for
 * `StickyNoteStack`. Only the surrounding JSX differs per surface.
 */
export function useProductSession({
  languageSnapshot,
  sessionSnapshot,
  sessionTitle,
  getSystemAudioStream,
  stopSystemAudioStream,
  storage,
  candidateRoundsMax = 3,
  preferredRelayNodeId,
}: ProductSessionParams) {
  const [providers, setProviders] = useState<Awaited<ReturnType<typeof fetchSttProviders>>>([])
  const [providersLoaded, setProvidersLoaded] = useState(false)
  const [replyEnabled, setReplyEnabled] = useState(true)
  const [relaySelectionOpen, setRelaySelectionOpen] = useState(false)
  const previousLifecycleRef = useRef<ProductSessionLifecycle>('restoring')
  const relayProbes = useRelayNodeProbes()

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
    pauseMs: defaultAppConfig.aggregator.pauseMs,
    mergeMaxMs: defaultAppConfig.aggregator.maxMs,
    speakerThreshold: defaultAppConfig.speakerThreshold,
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

  function requestSessionStart() {
    setRelaySelectionOpen(true)
    void relayProbes.refresh()
  }

  async function startOnRelayNode(nodeId: string) {
    if (!providersLoaded) return
    const selected = relayProbes.results.find(({ node }) => node.id === nodeId)
    if (!selected || selected.latencyMs === null) return
    setRelaySelectionOpen(false)
    await session.start({
      relayNodeId: nodeId,
      relayProbeResults: relayProbes.results,
    })
  }

  return {
    session,
    rounds,
    replyEnabled,
    setReplyEnabled,
    providersLoaded,
    preferredRelayNodeId,
    relayProbeResults: relayProbes.results,
    relayProbeLoading: relayProbes.loading,
    relayProbeError: relayProbes.error,
    relaySelectionOpen,
    setRelaySelectionOpen,
    refreshRelayProbes: relayProbes.refresh,
    requestSessionStart,
    startOnRelayNode,
  }
}

export type ProductSessionController = ReturnType<typeof useProductSession>
