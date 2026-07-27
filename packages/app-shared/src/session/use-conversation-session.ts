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
import { ProxySttClient, ProxyLlmClient, type SessionLanguageSnapshot } from '../proxy-clients'
import {
  connectRealtimeSttWithRetry,
  isTranscriptionFailed,
  type RealtimeSttClient,
} from '../realtime-stt-client'
import { providerMode, type SttProvider } from '../stt-providers'
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
  prePadMs: number
  postPadMs: number
  pauseMs: number
  mergeMaxMs: number
  speakerThreshold: number
  transcribeMode: 'aggregated' | 'perSegment'
  candidateRoundsMax: number
  sttEnabled: boolean
  replyEnabled: boolean
  languageSnapshot: SessionLanguageSnapshot
  /** STT providers the `/stt` proxy has configured (batch + realtime). */
  providers: SttProvider[]
  /** Preferred provider id; realtime if its mode is `realtime`, else batch. */
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
 * verification → segment aggregation → STT (realtime WS with Manual commit,
 * session-only degrade to batch on failure, per ADR 0004) → LLM reply
 * candidates via `Pipeline`. One hook, two presentations: the playground's
 * `LiveSession` (dev toolbar + debug panel) and `packages/pages`'
 * `SessionPage` (product UI) both drive it — only the JSX differs.
 */
export function useConversationSession(params: ConversationSessionParams) {
  const [speaker, setSpeaker] = useState<'user' | 'other'>('other')
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [state, setState] = useState('IDLE')
  const [turns, setTurns] = useState<SessionTurn[]>([])
  const [draft, setDraft] = useState<SessionDraft | null>(null)
  const [candidateRounds, setCandidateRounds] = useState<CandidateRound[]>([])
  const [vadStatus, setVadStatus] = useState<'idle' | 'speech' | 'silence'>('idle')
  const [mode, setMode] = useState<'auto' | 'manual' | 'checking'>('checking')
  const [confidence, setConfidence] = useState<number | null>(null)
  /** Actual STT path for the running session (may differ from the selected provider after R4 degrade). */
  const [activeSttPath, setActiveSttPath] = useState<'idle' | 'realtime' | 'batch'>('idle')
  const [lifecycle, setLifecycle] = useState<ProductSessionLifecycle>(
    params.persistSessionLifecycle ? 'restoring' : 'stopped',
  )
  const [activeSession, setActiveSession] = useState<ConversationSession | null>(null)
  const [recoveredUnexpectedPause, setRecoveredUnexpectedPause] = useState(false)
  const [quotaExhausted, setQuotaExhausted] = useState(false)
  const [relayNodeId, setRelayNodeId] = useState<string | null>(null)
  const [relayLatencyMs, setRelayLatencyMs] = useState<number | null>(null)

  const speakerRef = useRef(speaker)
  speakerRef.current = speaker
  const stableSpeakerRef = useRef(speaker)
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
  const autoRef = useRef(false)
  const vadRef = useRef<VAD | null>(null)
  const systemVadRef = useRef<VAD | null>(null)
  const sttRef = useRef<ProxySttClient | null>(null)
  const aggregatorRef = useRef<SegmentAggregator | null>(null)
  const systemAggregatorRef = useRef<SegmentAggregator | null>(null)
  const realtimeAggregatorRef =
    useRef<SegmentAggregator<TranscribedAudioSegment> | null>(null)
  const systemRealtimeAggregatorRef =
    useRef<SegmentAggregator<TranscribedAudioSegment> | null>(null)
  const realtimeRef = useRef<RealtimeSttClient | null>(null)
  const systemRealtimeRef = useRef<RealtimeSttClient | null>(null)
  const realtimeModeRef = useRef(false)
  const systemRealtimeModeRef = useRef(false)
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
    sttRef.current?.configurePadding(params.prePadMs, params.postPadMs)
  }, [params.prePadMs, params.postPadMs])
  useEffect(() => {
    const config = { pauseMs: params.pauseMs, maxMs: params.mergeMaxMs }
    aggregatorRef.current?.updateConfig(config)
    systemAggregatorRef.current?.updateConfig(config)
    realtimeAggregatorRef.current?.updateConfig(config)
    systemRealtimeAggregatorRef.current?.updateConfig(config)
  }, [params.pauseMs, params.mergeMaxMs])
  useEffect(() => {
    if (params.transcribeMode !== 'aggregated') aggregatorRef.current?.flush()
  }, [params.transcribeMode])

  function reportError(message: string) {
    setError(message)
  }

  function degradeToBatch(reason: string) {
    const batch = paramsRef.current.providers.find((p) => p.mode !== 'realtime' && p.id)
    if (!batch) {
      reportError(`实时转写失败：${reason}（无可用 batch provider 可降级）`)
      return false
    }
    // Session-only: keep the caller's provider selection, but STT POSTs must use a batch id.
    realtimeRef.current?.close()
    realtimeRef.current = null
    realtimeModeRef.current = false
    sttRef.current?.setProviderOverride(batch.id)
    setActiveSttPath('batch')
    setStatusNote(`本会话实时转写已降级为 batch（${batch.label}）：${reason}。停止后重新开始可再试实时。`)
    setDraft(null)
    draftMetaRef.current = null
    return true
  }

  async function verifySpeaker(buffer: ArrayBuffer): Promise<'user' | 'other'> {
    const audioSource = paramsRef.current.sessionSnapshot?.audioSource
    if (audioSource === 'both') return 'user'
    if (audioSource === 'system') return 'other'
    if (!autoRef.current || !embeddingRef.current || !verifierRef.current) {
      stableSpeakerRef.current = speakerRef.current
      return speakerRef.current
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
    stableSpeakerRef.current = speakerRef.current
    const resuming = options.resume === true
    setError('')
    setStatusNote('')
    setLoading('正在检查声纹录入…')
    setLifecycle('starting')
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
      autoRef.current = !!embedding
      setMode(embedding ? 'auto' : 'manual')
      if (paramsRef.current.persistSessionLifecycle && !embedding) {
        throw new Error('VOICEPRINT_REQUIRED')
      }

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
      const selectedProvider = p.selectedProvider
      const audioSourceMode = p.sessionSnapshot?.audioSource ?? 'microphone'
      const isRealtime =
        providerMode(p.providers, selectedProvider) === 'realtime'

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
        onDeviceEnded: () => void pauseRef.current('unexpected'),
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

      const stt = new ProxySttClient(
        audio.sampleRate,
        p.languageSnapshot.conversationLang,
        () => paramsRef.current.sttEnabled,
        () => paramsRef.current.selectedProvider,
      )
      stt.configurePadding(p.prePadMs, p.postPadMs)
      stt.setProviderOverride(null)
      sttRef.current = stt
      const llm = new ProxyLlmClient(
        p.languageSnapshot,
        () => paramsRef.current.replyEnabled,
        conversationSessionId,
      )
      llmRef.current = llm
      const storage = storageRef.current
      const pipeline = new Pipeline({ stt, llm, conversation: storage })
      pipelineRef.current = pipeline

      realtimeModeRef.current = isRealtime
      setActiveSttPath(isRealtime ? 'realtime' : 'batch')
      if (!isRealtime) {
        setStatusNote(
          `${relayStatus}；当前为 batch STT：无实时草稿，停顿后整段上传。`,
        )
      }
      if (isRealtime && selectedProvider) {
        setLoading('正在连接实时转写…')
        try {
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
          setActiveSttPath('realtime')
        } catch (e) {
          if (!degradeToBatch((e as Error).message)) {
            throw e
          }
          realtimeModeRef.current = false
        }
      }

      const aggregator = createSegmentAggregator({
        sampleRate: audio.sampleRate,
        pauseMs: p.pauseMs,
        maxMs: p.mergeMaxMs,
      })
      aggregator.onFlush((merged) => {
        pipelineBusyRef.current = pipelineBusyRef.current
          .then(() =>
            pipeline.ingestSegment({
              pcm: merged.pcm,
              speaker: merged.speaker,
              startedAt: merged.startedAt,
              endedAt: merged.endedAt,
            }),
          )
          .catch(() => {})
      })
      aggregatorRef.current = aggregator

      if (realtimeModeRef.current) {
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
      }

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
        if (isRealtime && selectedProvider) {
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
          systemRealtimeModeRef.current = true
        }
        const systemAggregator = createSegmentAggregator({
          sampleRate: systemAudio.sampleRate,
          pauseMs: p.pauseMs,
          maxMs: p.mergeMaxMs,
        })
        systemAggregator.onFlush((merged) => {
          pipelineBusyRef.current = pipelineBusyRef.current
            .then(() =>
              pipeline.ingestSegment({
                pcm: merged.pcm,
                speaker: 'other',
                startedAt: merged.startedAt,
                endedAt: merged.endedAt,
              }),
            )
            .catch(() => {})
        })
        systemAggregatorRef.current = systemAggregator
        if (systemRealtimeModeRef.current) {
          const realtimeAggregator = createSegmentAggregator<TranscribedAudioSegment>({
            sampleRate: systemAudio.sampleRate,
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
          systemRealtimeAggregatorRef.current = realtimeAggregator
        }
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
          if (systemRealtimeModeRef.current) {
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
            return
          }
          systemAggregator?.feed({
            buffer: event.buffer,
            speaker: 'other',
            startedAt: endedAt - event.duration * 1000,
            endedAt,
          })
        })
        await systemAudio.start(async (chunk) => {
          await systemVad.processAudio(chunk)
          if (
            systemRealtimeModeRef.current
            && systemInSpeechRef.current
            && systemRealtimeRef.current
          ) {
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
          case 'llmAborted':
          case 'llmFailed':
            break
          case 'sttFailed':
            setTurns((prev) => prev.map((t) => (t.id === e.turnId ? { ...t, sttFailed: true } as SessionTurn : t)))
            break
          default:
            break
        }
      })

      vad.on('speech-start', () => {
        setVadStatus('speech')
        if (!paramsRef.current.sttEnabled) {
          inSpeechRef.current = true
          return
        }
        const startedAt = Date.now()
        if (realtimeModeRef.current) {
          realtimeAggregatorRef.current?.hold()
          const who = draftMetaRef.current?.speaker ?? speakerRef.current
          draftMetaRef.current = { speaker: who, startedAt }
          setDraft({ speaker: who, text: '', startedAt, endedAt: startedAt })
        }
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

        if (realtimeModeRef.current) {
          const rt = realtimeRef.current
          if (!rt || !uncommittedRef.current) return

          rt.commit()
          uncommittedRef.current = false
          const buffer = e.buffer
          const provisional = draftMetaRef.current?.speaker ?? speakerRef.current
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
              if (degradeToBatch(String(outcome.error))) {
                await pipeline.ingestSegment({
                  pcm: buffer,
                  speaker: who,
                  startedAt,
                  endedAt,
                })
                return
              }
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
          return
        }

        // Batch: verify || STT in parallel, then ingest finalized text.
        const buffer = e.buffer
        void (async () => {
          try {
            const verifyPromise = verifySpeaker(buffer.buffer as ArrayBuffer)

            if (paramsRef.current.transcribeMode === 'aggregated') {
              const who = await verifyPromise
              aggregatorRef.current?.feed({ buffer, speaker: who, startedAt, endedAt })
              return
            }

            const stt = sttRef.current
            if (!stt) {
              const who = await verifyPromise
              void pipeline.ingestSegment({ pcm: buffer, speaker: who, startedAt, endedAt })
              return
            }
            const [who, text] = await Promise.all([verifyPromise, stt.transcribe(buffer, new AbortController().signal)])
            await pipeline.ingestFinalizedTurn({ speaker: who, text, startedAt, endedAt })
          } catch (err) {
            reportError(`转写失败：${String(err)}`)
            const who = speakerRef.current
            await pipeline.ingestFinalizedTurn({ speaker: who, text: '', startedAt, endedAt, sttFailed: true })
          }
        })()
      })

      await audio.start(async (chunk) => {
        await vad.processAudio(chunk)
        if (!paramsRef.current.sttEnabled) return
        if (!realtimeModeRef.current || !inSpeechRef.current) return
        const rt = realtimeRef.current
        if (!rt) return
        uncommittedRef.current = true
        rt.append(chunk)
      })
      setRunning(true)
      setLifecycle('running')
      setLoading('')
    } catch (e) {
      reportError((e as Error).message)
      setLoading('')
      releaseCapture()
      await realtimeBusyRef.current.catch(() => {})
      flushRealtimeAggregators()
      await releaseRelaySession(false)
      await releaseRelaySessionById(conversationSessionId, false)
      if (paramsRef.current.persistSessionLifecycle) {
        const paused = await storageRef.current.pauseActiveSession('unexpected')
        setActiveSession(paused)
        setRecoveredUnexpectedPause(true)
        setLifecycle(paused ? 'paused' : 'stopped')
      } else {
        setLifecycle('stopped')
      }
    } finally {
      startInFlightRef.current = false
    }
  }

  function releaseCapture() {
    systemAggregatorRef.current?.flush()
    systemAggregatorRef.current?.dispose()
    systemAggregatorRef.current = null
    systemAudioRef.current?.stop()
    systemAudioRef.current = null
    systemVadRef.current = null
    systemRealtimeRef.current?.finish()
    systemRealtimeRef.current?.close()
    systemRealtimeRef.current = null
    systemRealtimeModeRef.current = false
    systemInSpeechRef.current = false
    systemUncommittedRef.current = false
    void paramsRef.current.stopSystemAudioStream?.()
    aggregatorRef.current?.flush()
    aggregatorRef.current?.dispose()
    aggregatorRef.current = null
    realtimeRef.current?.finish()
    realtimeRef.current?.close()
    realtimeRef.current = null
    realtimeModeRef.current = false
    uncommittedRef.current = false
    inSpeechRef.current = false
    audioRef.current?.stop()
    audioRef.current = null
    if (pipelineRef.current) settlingPipelineRef.current = pipelineRef.current
    pipelineRef.current = null
    llmRef.current = null
    vadRef.current = null
    sttRef.current = null
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
    speaker,
    setSpeaker,
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
