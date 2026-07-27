import { useEffect, useRef, useState } from 'react'
import type { PipelineEvent } from '@kibotalk/pipeline'
import { Pipeline } from '@kibotalk/pipeline'
import type {
  ConversationSession,
  ConversationSessionSnapshot,
  ConversationStorage,
  ConversationTurn,
  ReplyCandidate,
} from '@kibotalk/conversation'
import { InMemoryConversationStorage } from '@kibotalk/conversation'
import {
  EmbeddingSpeakerVerifier,
  stabilizeSpeaker,
} from '@kibotalk/speaker'
import type { Embedding } from '@kibotalk/speaker'
import { createVAD } from '@kibotalk/audio/vad'
import type { VAD } from '@kibotalk/audio/vad'
import { createSegmentAggregator } from '@kibotalk/audio/aggregator'
import type { SegmentAggregator } from '@kibotalk/audio/aggregator'
import { AudioSource } from '../audio/audio-source'
import { createSileroInfer, SILERO_VARIANTS } from '../audio/silero-vad'
import { createWorkerEmbedAudio } from '../audio/speaker-embed'
import { createCurrentSpeakerEmbeddingStorage } from '../speaker-embedding-storage'
import { ProxyLlmClient, type SessionLanguageSnapshot } from '../proxy-clients'
import {
  connectRealtimeSttWithRetry,
  isTranscriptionFailed,
  type RealtimeSttClient,
} from '../realtime-stt-client'
import type { SttProvider } from '../stt-providers'
import {
  finalizedTurnFromRealtimeSegments,
  type TranscribedAudioSegment,
} from './realtime-turn'
import {
  openRelaySession,
  releaseRelaySession,
  releaseRelaySessionById,
} from '../api-runtime'
import type { RelayProbeResult } from '../relay-routing'

export type SessionTurn = ConversationTurn & { candidates?: ReplyCandidate[] }

export type SessionDraft = {
  speaker: 'user' | 'other'
  text: string
  startedAt: number
  endedAt: number
}

export type CandidateRound = { id: string; candidates: ReplyCandidate[] }

export type ProductSessionLifecycle = 'restoring' | 'stopped' | 'starting' | 'running' | 'paused'

/** The knobs `defaultAppConfig` hardcodes for product apps and the playground exposes as sliders. */
export type ConversationSessionParams = {
  speechThreshold: number
  exitThreshold: number
  minSilenceDurationMs: number
  minSpeechDurationMs: number
  vadVariantId: string
  pauseMs: number
  mergeMaxMs: number
  speakerThreshold: number
  candidateRoundsMax: number
  sttEnabled: boolean
  replyEnabled: boolean
  languageSnapshot: SessionLanguageSnapshot
  /** Realtime STT providers from `/api/stt/providers`. */
  providers: SttProvider[]
  /** Preferred realtime provider id. */
  selectedProvider: string | null
  /** Defaults to a fresh `InMemoryConversationStorage` (playground behavior). */
  storage?: ConversationStorage
  /** Product shells persist lifecycle/history; playground sessions stay ephemeral. */
  persistSessionLifecycle?: boolean
  /** Full settings snapshot frozen when a persisted session begins. */
  sessionSnapshot?: ConversationSessionSnapshot
  /** Localized fallback title available before the background review finishes. */
  sessionTitle?: string
  /** Desktop-only system-audio stream factory; Web leaves this unset. */
  getSystemAudioStream?: () => Promise<MediaStream>
  stopSystemAudioStream?: () => Promise<void>
}

/**
 * The full live-session orchestration: mic capture → VAD → speaker
 * verification → realtime STT (Manual commit) → TurnGate merge →
 * `ingestFinalizedTurn` → LLM reply candidates via `Pipeline`.
 */
export function useConversationSession(params: ConversationSessionParams) {
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [state, setState] = useState('IDLE')
  const [turns, setTurns] = useState<SessionTurn[]>([])
  const [draft, setDraft] = useState<SessionDraft | null>(null)
  const [candidateRounds, setCandidateRounds] = useState<CandidateRound[]>([])
  const [vadStatus, setVadStatus] = useState<'idle' | 'speech' | 'silence'>('idle')
  const [mode, setMode] = useState<'auto' | 'checking'>('checking')
  const [confidence, setConfidence] = useState<number | null>(null)
  const [activeSttPath, setActiveSttPath] = useState<'idle' | 'realtime'>('idle')
  const [lifecycle, setLifecycle] = useState<ProductSessionLifecycle>(
    params.persistSessionLifecycle ? 'restoring' : 'stopped',
  )
  const [activeSession, setActiveSession] = useState<ConversationSession | null>(null)
  const [recoveredUnexpectedPause, setRecoveredUnexpectedPause] = useState(false)
  const [quotaExhausted, setQuotaExhausted] = useState(false)
  const [relayNodeId, setRelayNodeId] = useState<string | null>(null)
  const [relayLatencyMs, setRelayLatencyMs] = useState<number | null>(null)

  const stableSpeakerRef = useRef<'user' | 'other'>('other')
  const paramsRef = useRef(params)
  paramsRef.current = params

  const llmRef = useRef<ProxyLlmClient | null>(null)
  const audioRef = useRef<AudioSource | null>(null)
  const systemAudioRef = useRef<AudioSource | null>(null)
  const pipelineRef = useRef<Pipeline | null>(null)
  const settlingPipelineRef = useRef<Pipeline | null>(null)
  const storageRef = useRef<ConversationStorage>(params.storage ?? new InMemoryConversationStorage())
  const verifierRef = useRef<EmbeddingSpeakerVerifier | null>(null)
  const embeddingRef = useRef<Embedding | null>(null)
  const vadRef = useRef<VAD | null>(null)
  const systemVadRef = useRef<VAD | null>(null)
  const realtimeAggregatorRef =
    useRef<SegmentAggregator<TranscribedAudioSegment> | null>(null)
  const systemRealtimeAggregatorRef =
    useRef<SegmentAggregator<TranscribedAudioSegment> | null>(null)
  const realtimeRef = useRef<RealtimeSttClient | null>(null)
  const systemRealtimeRef = useRef<RealtimeSttClient | null>(null)
  const realtimeBusyRef = useRef(Promise.resolve())
  const pipelineBusyRef = useRef(Promise.resolve())
  const startInFlightRef = useRef(false)
  const draftMetaRef = useRef<{ speaker: 'user' | 'other'; startedAt: number } | null>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const pauseRef = useRef<(reason?: 'user' | 'unexpected') => Promise<void>>(async () => {})
  pauseRef.current = pause
  /** Realtime: stream mic while Silero says in-speech (not wait for speech-ready). */
  const inSpeechRef = useRef(false)
  const systemInSpeechRef = useRef(false)
  /** True after append until commit completes — blocks next speech stream from mixing. */
  const uncommittedRef = useRef(false)
  const systemUncommittedRef = useRef(false)

  useEffect(() => {
    if (!params.persistSessionLifecycle) return
    let cancelled = false
    void storageRef.current
      .getActiveSession()
      .then(async (session) => {
        if (cancelled) return
        if (!session) {
          setLifecycle('stopped')
          return
        }
        const restored =
          session.status === 'running'
            ? await storageRef.current.pauseActiveSession('unexpected')
            : session
        if (cancelled || !restored) return
        setTurns(
          restored.turns.map((turn) => ({
            ...turn,
            ...(turn.suggestions ? { candidates: turn.suggestions } : {}),
          })),
        )
        setCandidateRounds(
          restored.turns
            .filter((turn) => turn.suggestions?.length)
            .map((turn) => ({ id: turn.id, candidates: turn.suggestions! }))
            .reverse(),
        )
        setActiveSession(restored)
        setRecoveredUnexpectedPause(restored.pauseReason === 'unexpected')
        setLifecycle('paused')
      })
      .catch((cause) => {
        if (cancelled) return
        reportError(String(cause))
        setLifecycle('stopped')
      })
    return () => {
      cancelled = true
    }
    // Storage is fixed for the lifetime of one product shell.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const config = {
      speechThreshold: params.speechThreshold,
      exitThreshold: params.exitThreshold,
      minSilenceDurationMs: params.minSilenceDurationMs,
      minSpeechDurationMs: params.minSpeechDurationMs,
      speechPadMs: 0,
    }
    vadRef.current?.updateConfig(config)
    systemVadRef.current?.updateConfig(config)
  }, [params.speechThreshold, params.exitThreshold, params.minSilenceDurationMs, params.minSpeechDurationMs])
  useEffect(() => {
    verifierRef.current?.setThreshold(params.speakerThreshold)
  }, [params.speakerThreshold])
  useEffect(() => {
    const config = { pauseMs: params.pauseMs, maxMs: params.mergeMaxMs }
    realtimeAggregatorRef.current?.updateConfig(config)
    systemRealtimeAggregatorRef.current?.updateConfig(config)
  }, [params.pauseMs, params.mergeMaxMs])

  function reportError(message: string) {
    setError(message)
  }

  async function verifySpeaker(buffer: ArrayBuffer): Promise<'user' | 'other'> {
    const audioSource = paramsRef.current.sessionSnapshot?.audioSource
    if (audioSource === 'both') return 'user'
    if (audioSource === 'system') return 'other'
    if (!embeddingRef.current || !verifierRef.current) {
      throw new Error('VOICEPRINT_REQUIRED')
    }
    try {
      const r = await verifierRef.current.verify(buffer, embeddingRef.current)
      setConfidence(r.confidence)
      stableSpeakerRef.current = stabilizeSpeaker(
        r.similarity,
        stableSpeakerRef.current,
        paramsRef.current.speakerThreshold,
      )
      return stableSpeakerRef.current
    } catch (err) {
      reportError(`说话人判定失败：${String(err)}`)
      return stableSpeakerRef.current
    }
  }

  async function start(options: {
    resume?: boolean
    relayNodeId?: string
    relayProbeResults?: RelayProbeResult[]
  } = {}) {
    if (startInFlightRef.current || lifecycle === 'starting' || running) return
    startInFlightRef.current = true
    setError('')
    setStatusNote('')
    setLoading('正在检查声纹录入…')
    setLifecycle('starting')
    const resuming = options.resume === true
    if (!resuming) setTurns([])
    setDraft(null)
    if (!resuming) setCandidateRounds([])
    if (!resuming) setQuotaExhausted(false)
    let conversationSessionId = `ephemeral-${Date.now()}`
    try {
      let frozenRelayNodeId: string | undefined
      let pendingSessionStart: {
        id: string
        relayNodeId: string
        startedAt: number
        snapshot: ConversationSessionSnapshot
        title: string
      } | null = null
      if (!verifierRef.current) {
        verifierRef.current = new EmbeddingSpeakerVerifier({
          embedAudio: createWorkerEmbedAudio(),
          storage: createCurrentSpeakerEmbeddingStorage(),
          threshold: params.speakerThreshold,
        })
      }
      const embedding = await verifierRef.current.loadEmbedding()
      embeddingRef.current = embedding
      if (!embedding) throw new Error('VOICEPRINT_REQUIRED')
      setMode('auto')

      if (paramsRef.current.persistSessionLifecycle) {
        if (resuming) {
          const resumed = await storageRef.current.resumeActiveSession()
          if (!resumed) throw new Error('NO_SESSION_TO_RESUME')
          conversationSessionId = resumed.id
          frozenRelayNodeId = resumed.relayNodeId
          setActiveSession(resumed)
          setRecoveredUnexpectedPause(false)
        } else {
          const snapshot = paramsRef.current.sessionSnapshot
          if (!snapshot) throw new Error('MISSING_SESSION_SNAPSHOT')
          const startedAt = Date.now()
          conversationSessionId =
            globalThis.crypto?.randomUUID?.()
            ?? `${startedAt}-${Math.random().toString(36).slice(2)}`
          pendingSessionStart = {
            id: conversationSessionId,
            relayNodeId: '',
            startedAt,
            snapshot,
            title: paramsRef.current.sessionTitle ?? '',
          }
        }
      }

      const p = paramsRef.current
      const selectedProvider = p.selectedProvider
      if (!selectedProvider) throw new Error('STT_PROVIDER_REQUIRED')
      const selectedRelayNodeId = frozenRelayNodeId ?? options.relayNodeId
      if (!selectedRelayNodeId) throw new Error('RELAY_NODE_SELECTION_REQUIRED')
      setLoading('正在连接所选网络节点…')
      const relaySelection = await openRelaySession({
        conversationSessionId,
        nodeId: selectedRelayNodeId,
        probeResults: options.relayProbeResults,
      })
      setRelayNodeId(relaySelection.node.id)
      setRelayLatencyMs(relaySelection.latencyMs)
      const relayStatus =
        relaySelection.latencyMs === null
          ? `网络节点：${relaySelection.node.id}`
          : `网络节点：${relaySelection.node.id}（${Math.round(relaySelection.latencyMs)} ms）`
      if (pendingSessionStart) {
        const created = await storageRef.current.startSession({
          ...pendingSessionStart,
          relayNodeId: relaySelection.node.id,
        })
        setActiveSession(created)
      }
      const audioSourceMode = p.sessionSnapshot?.audioSource ?? 'microphone'

      setLoading('正在启动麦克风…')
      const primaryStream =
        audioSourceMode === 'system'
          ? await p.getSystemAudioStream?.()
          : undefined
      if (audioSourceMode === 'system' && !primaryStream) {
        throw new Error('系统音频不可用')
      }
      const audio = new AudioSource({
        deviceId: p.sessionSnapshot?.microphoneDeviceId,
        stream: primaryStream,
        echoCancellation: audioSourceMode !== 'system',
        onDeviceEnded: () => {
          void pauseRef.current('unexpected')
        },
      })
      audioRef.current = audio
      const vadVariant = SILERO_VARIANTS.find((v) => v.id === p.vadVariantId) ?? SILERO_VARIANTS[0]
      const infer = await createSileroInfer(vadVariant, audio.sampleRate)
      const vad = createVAD(infer, {
        speechThreshold: p.speechThreshold,
        exitThreshold: p.exitThreshold,
        minSilenceDurationMs: p.minSilenceDurationMs,
        minSpeechDurationMs: p.minSpeechDurationMs,
        maxSpeechDurationMs: p.mergeMaxMs,
        speechPadMs: 0,
        sampleRate: audio.sampleRate,
      })
      vadRef.current = vad

      const llm = new ProxyLlmClient(
        p.languageSnapshot,
        () => paramsRef.current.replyEnabled,
        conversationSessionId,
      )
      llmRef.current = llm
      const storage = storageRef.current
      const pipeline = new Pipeline({ llm, conversation: storage })
      pipelineRef.current = pipeline

      setActiveSttPath('realtime')
      setLoading('正在连接实时转写…')
      const rt = await connectRealtimeSttWithRetry({
        provider: selectedProvider,
        language: p.languageSnapshot.conversationLang,
        sessionId: conversationSessionId,
        handlers: {
          onPartial: (text) => {
            const meta = draftMetaRef.current
            if (!meta) return
            setDraft({ speaker: meta.speaker, text, startedAt: meta.startedAt, endedAt: Date.now() })
          },
          onError: (message) => {
            reportError(`实时转写：${message}`)
          },
          onQuotaExhausted: () => {
            setQuotaExhausted(true)
            setStatusNote('本轮已完成；本月可用分钟数已用完，会话将在最终建议生成后停止。')
            globalThis.dispatchEvent?.(new CustomEvent('kibotalk:quota-changed'))
            void (async () => {
              await pipeline.idle().catch(() => {})
              await stop()
            })()
          },
        },
      })
      realtimeRef.current = rt
      setStatusNote(`${relayStatus}；实时转写已连接。`)

      const realtimeAggregator = createSegmentAggregator<TranscribedAudioSegment>({
        sampleRate: audio.sampleRate,
        pauseMs: p.pauseMs,
        maxMs: p.mergeMaxMs,
      })
      realtimeAggregator.onFlush((merged) => {
        const turn = finalizedTurnFromRealtimeSegments(
          merged,
          p.languageSnapshot.conversationLang,
        )
        if (!turn) return
        pipelineBusyRef.current = pipelineBusyRef.current
          .then(() => pipeline.ingestFinalizedTurn(turn))
          .catch(() => {})
      })
      realtimeAggregatorRef.current = realtimeAggregator

      if (audioSourceMode === 'both') {
        const systemStream = await p.getSystemAudioStream?.()
        if (!systemStream) throw new Error('系统音频不可用')
        const systemAudio = new AudioSource({
          stream: systemStream,
          echoCancellation: false,
          onDeviceEnded: () => void pauseRef.current('unexpected'),
        })
        systemAudioRef.current = systemAudio
        const systemInfer = await createSileroInfer(vadVariant, systemAudio.sampleRate)
        const systemVad = createVAD(systemInfer, {
          speechThreshold: p.speechThreshold,
          exitThreshold: p.exitThreshold,
          minSilenceDurationMs: p.minSilenceDurationMs,
          minSpeechDurationMs: p.minSpeechDurationMs,
          maxSpeechDurationMs: p.mergeMaxMs,
          speechPadMs: 0,
          sampleRate: systemAudio.sampleRate,
        })
        systemVadRef.current = systemVad
        systemRealtimeRef.current = await connectRealtimeSttWithRetry({
          provider: selectedProvider,
          language: p.languageSnapshot.conversationLang,
          sessionId: conversationSessionId,
          handlers: {
            onPartial: (text) => {
              setDraft((current) =>
                current?.speaker === 'user'
                  ? current
                  : {
                      speaker: 'other',
                      text,
                      startedAt: current?.startedAt ?? Date.now(),
                      endedAt: Date.now(),
                    },
              )
            },
            onError: (message) => reportError(`系统音频实时转写：${message}`),
            onQuotaExhausted: () => {
              setQuotaExhausted(true)
              setStatusNote('本轮已完成；本月可用分钟数已用完，会话将在最终建议生成后停止。')
              globalThis.dispatchEvent?.(new CustomEvent('kibotalk:quota-changed'))
              void (async () => {
                await pipeline.idle().catch(() => {})
                await stop()
              })()
            },
          },
        })
        const systemRealtimeAggregator = createSegmentAggregator<TranscribedAudioSegment>({
          sampleRate: systemAudio.sampleRate,
          pauseMs: p.pauseMs,
          maxMs: p.mergeMaxMs,
        })
        systemRealtimeAggregator.onFlush((merged) => {
          const turn = finalizedTurnFromRealtimeSegments(
            merged,
            p.languageSnapshot.conversationLang,
          )
          if (!turn) return
          pipelineBusyRef.current = pipelineBusyRef.current
            .then(() => pipeline.ingestFinalizedTurn(turn))
            .catch(() => {})
        })
        systemRealtimeAggregatorRef.current = systemRealtimeAggregator
        systemVad.on('speech-start', () => {
          systemInSpeechRef.current = true
          systemRealtimeAggregatorRef.current?.hold()
          setDraft({
            speaker: 'other',
            text: '',
            startedAt: Date.now(),
            endedAt: Date.now(),
          })
        })
        systemVad.on('speech-end', () => {
          systemInSpeechRef.current = false
          systemRealtimeAggregatorRef.current?.resume()
        })
        systemVad.on('speech-ready', (event) => {
          const endedAt = Date.now()
          const realtime = systemRealtimeRef.current
          if (!realtime || !systemUncommittedRef.current) return
          systemUncommittedRef.current = false
          realtime.commit()
          const startedAt = endedAt - event.duration * 1000
          const completed = realtime.waitCompleted()
          realtimeBusyRef.current = realtimeBusyRef.current
            .then(async () => {
              try {
                const text = await completed
                setDraft((current) =>
                  current?.startedAt === startedAt ? null : current,
                )
                systemRealtimeAggregatorRef.current?.feed({
                  buffer: event.buffer,
                  speaker: 'other',
                  text,
                  startedAt,
                  endedAt,
                })
              } catch (cause) {
                if (isTranscriptionFailed(cause)) {
                  systemRealtimeAggregatorRef.current?.feed({
                    buffer: event.buffer,
                    speaker: 'other',
                    text: '',
                    sttFailed: true,
                    startedAt,
                    endedAt,
                  })
                  return
                }
                reportError(`系统音频实时转写：${String(cause)}`)
              }
            })
            .catch(() => {})
        })
        await systemAudio.start(async (chunk) => {
          await systemVad.processAudio(chunk)
          if (systemInSpeechRef.current && systemRealtimeRef.current) {
            systemUncommittedRef.current = true
            systemRealtimeRef.current.append(chunk)
          }
        })
      }

      pipeline.on((e: PipelineEvent) => {
        switch (e.type) {
          case 'state':
            setState(e.state)
            break
          case 'turnAppended':
            setTurns((prev) => [...prev, e.turn as SessionTurn])
            break
          case 'candidatesDone':
            if (!paramsRef.current.replyEnabled) break
            if (e.candidates.length === 3) {
              setCandidateRounds((prev) => [{ id: e.turnId, candidates: e.candidates }, ...prev])
            }
            setTurns((prev) => prev.map((t) => (t.id === e.turnId ? { ...t, candidates: e.candidates } : t)))
            void storageRef.current.updateTurnSuggestions(e.turnId, e.candidates)
            break
          case 'candidatesStreaming':
          case 'candidateDelta':
          case 'llmAborted':
          case 'llmFailed':
            break
          case 'sttFailed':
            setTurns((prev) => prev.map((t) => (t.id === e.turnId ? { ...t, sttFailed: true } as SessionTurn : t)))
            break
          default: {
            const _exhaustive: never = e
            void _exhaustive
            break
          }
        }
      })

      vad.on('speech-start', () => {
        setVadStatus('speech')
        if (!paramsRef.current.sttEnabled) {
          inSpeechRef.current = true
          return
        }
        const startedAt = Date.now()
        realtimeAggregatorRef.current?.hold()
        const who = draftMetaRef.current?.speaker ?? stableSpeakerRef.current
        draftMetaRef.current = { speaker: who, startedAt }
        setDraft({ speaker: who, text: '', startedAt, endedAt: startedAt })
        inSpeechRef.current = true
      })
      vad.on('speech-end', () => {
        setVadStatus('silence')
        inSpeechRef.current = false
        realtimeAggregatorRef.current?.resume()
      })
      vad.on('speech-ready', (e) => {
        if (!paramsRef.current.sttEnabled) return
        const now = Date.now()
        const startedAt = draftMetaRef.current?.startedAt ?? now - e.duration * 1000
        const endedAt = now

        const rt = realtimeRef.current
        if (!rt || !uncommittedRef.current) return

        rt.commit()
        uncommittedRef.current = false
        const buffer = e.buffer
        const provisional = draftMetaRef.current?.speaker ?? stableSpeakerRef.current
        const transcription = rt.waitCompleted().then(
          (text) => ({ ok: true as const, text }),
          (error: unknown) => ({ ok: false as const, error }),
        )
        const verifiedSpeaker = verifySpeaker(buffer.buffer as ArrayBuffer)
        realtimeBusyRef.current = realtimeBusyRef.current
          .then(async () => {
            const [outcome, who] = await Promise.all([
              transcription,
              verifiedSpeaker,
            ])
            if (outcome.ok) {
              draftMetaRef.current = { speaker: who, startedAt }
              setDraft((current) =>
                current?.startedAt === startedAt ? null : current,
              )
              realtimeAggregatorRef.current?.feed({
                buffer,
                speaker: who,
                text: outcome.text,
                startedAt,
                endedAt,
              })
              return
            }
            if (isTranscriptionFailed(outcome.error)) {
              setDraft((current) =>
                current?.startedAt === startedAt ? null : current,
              )
              realtimeAggregatorRef.current?.feed({
                buffer,
                speaker: provisional,
                text: '',
                sttFailed: true,
                startedAt,
                endedAt,
              })
              return
            }
            reportError(`实时转写：${String(outcome.error)}`)
            realtimeAggregatorRef.current?.feed({
              buffer,
              speaker: who,
              text: '',
              sttFailed: true,
              startedAt,
              endedAt,
            })
          })
          .catch(() => {})
      })

      await audio.start(async (chunk) => {
        await vad.processAudio(chunk)
        if (!paramsRef.current.sttEnabled) return
        if (!inSpeechRef.current) return
        const rtConn = realtimeRef.current
        if (!rtConn) return
        uncommittedRef.current = true
        rtConn.append(chunk)
      })
      setRunning(true)
      setLifecycle('running')
      setLoading('')
    } catch (e) {
      const message = (e as Error).message
      reportError(message)
      setLoading('')
      releaseCapture()
      await realtimeBusyRef.current.catch(() => {})
      flushRealtimeAggregators()
      await releaseRelaySession(false)
      await releaseRelaySessionById(conversationSessionId, false)
      if (paramsRef.current.persistSessionLifecycle) {
        // Abort the half-started session so the real error is visible
        // (session errors are hidden while lifecycle === 'paused').
        const stopped = await storageRef.current.stopActiveSession()
        setActiveSession(stopped)
        setRecoveredUnexpectedPause(false)
        setLifecycle('stopped')
      } else {
        setLifecycle('stopped')
      }
    } finally {
      startInFlightRef.current = false
    }
  }

  function releaseCapture() {
    systemRealtimeAggregatorRef.current?.flush()
    systemRealtimeAggregatorRef.current?.dispose()
    systemRealtimeAggregatorRef.current = null
    systemAudioRef.current?.stop()
    systemAudioRef.current = null
    systemVadRef.current = null
    systemRealtimeRef.current?.finish()
    systemRealtimeRef.current?.close()
    systemRealtimeRef.current = null
    systemInSpeechRef.current = false
    systemUncommittedRef.current = false
    void paramsRef.current.stopSystemAudioStream?.()
    realtimeAggregatorRef.current?.flush()
    realtimeAggregatorRef.current?.dispose()
    realtimeAggregatorRef.current = null
    realtimeRef.current?.finish()
    realtimeRef.current?.close()
    realtimeRef.current = null
    uncommittedRef.current = false
    inSpeechRef.current = false
    audioRef.current?.stop()
    audioRef.current = null
    if (pipelineRef.current) settlingPipelineRef.current = pipelineRef.current
    pipelineRef.current = null
    llmRef.current = null
    vadRef.current = null
    draftMetaRef.current = null
    setDraft(null)
    setRunning(false)
    setActiveSttPath('idle')
    setVadStatus('idle')
    setConfidence(null)
  }

  function flushRealtimeAggregators() {
    systemRealtimeAggregatorRef.current?.flush()
    systemRealtimeAggregatorRef.current?.dispose()
    systemRealtimeAggregatorRef.current = null
    realtimeAggregatorRef.current?.flush()
    realtimeAggregatorRef.current?.dispose()
    realtimeAggregatorRef.current = null
  }

  function sealPendingRealtimeDraft() {
    const pending = draftRef.current
    const pipeline = pipelineRef.current
    if (!uncommittedRef.current || !pending?.text.trim() || !pipeline) return

    uncommittedRef.current = false
    draftMetaRef.current = null
    draftRef.current = null
    setDraft(null)
    pipelineBusyRef.current = pipelineBusyRef.current
      .then(() =>
        pipeline.ingestFinalizedTurn({
          speaker: pending.speaker,
          text: pending.text.trim(),
          startedAt: pending.startedAt,
          endedAt: Date.now(),
        }),
      )
      .catch(() => {})
  }

  async function pause(reason: 'user' | 'unexpected' = 'user') {
    if (!running && lifecycle !== 'starting') return
    sealPendingRealtimeDraft()
    releaseCapture()
    await realtimeBusyRef.current.catch(() => {})
    flushRealtimeAggregators()
    await pipelineBusyRef.current.catch(() => {})
    await releaseRelaySession(false)
    if (paramsRef.current.persistSessionLifecycle) {
      const paused = await storageRef.current.pauseActiveSession(reason)
      setActiveSession(paused)
    }
    setRecoveredUnexpectedPause(reason === 'unexpected')
    setLifecycle('paused')
  }

  async function resume() {
    if (lifecycle !== 'paused') return
    await realtimeBusyRef.current.catch(() => {})
    await pipelineBusyRef.current.catch(() => {})
    await settlingPipelineRef.current?.idle().catch(() => {})
    settlingPipelineRef.current = null
    await start({ resume: true })
  }

  async function stop() {
    const pipeline = pipelineRef.current ?? settlingPipelineRef.current
    sealPendingRealtimeDraft()
    releaseCapture()
    await realtimeBusyRef.current.catch(() => {})
    flushRealtimeAggregators()
    await pipelineBusyRef.current.catch(() => {})
    await pipeline?.idle().catch(() => {})
    settlingPipelineRef.current = null
    await releaseRelaySession(true)
    if (paramsRef.current.persistSessionLifecycle) {
      const stopped = await storageRef.current.stopActiveSession()
      setActiveSession(stopped)
    }
    setRecoveredUnexpectedPause(false)
    setLifecycle('stopped')
  }

  async function interrupt() {
    if (lifecycle === 'running' || lifecycle === 'starting') {
      await pause('unexpected')
    }
  }

  async function clearSession() {
    const sessionId = activeSession?.id
    if (sessionId) await releaseRelaySessionById(sessionId, true)
    await storageRef.current.clearActiveSession()
    setTurns([])
    setDraft(null)
    setCandidateRounds([])
    setState('IDLE')
    setActiveSession(null)
    setRecoveredUnexpectedPause(false)
    setLifecycle('stopped')
  }

  return {
    running,
    loading,
    error,
    statusNote,
    state,
    turns,
    draft,
    candidateRounds,
    vadStatus,
    mode,
    confidence,
    activeSttPath,
    lifecycle,
    activeSession,
    recoveredUnexpectedPause,
    quotaExhausted,
    relayNodeId,
    relayLatencyMs,
    start,
    pause,
    resume,
    stop,
    interrupt,
    clearSession,
  }
}
