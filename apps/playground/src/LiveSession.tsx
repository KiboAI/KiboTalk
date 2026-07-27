import { useEffect, useRef, useState } from 'react'
import type { PipelineEvent } from '@kibotalk/pipeline'
import { Pipeline } from '@kibotalk/pipeline'
import type { ConversationTurn, ReplyCandidate } from '@kibotalk/conversation'
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
import { Button, Separator, toast } from '@kibotalk/ui'
import {
  AudioSource,
  createSileroInfer,
  SILERO_VARIANTS,
  createWorkerEmbedAudio,
  createCurrentSpeakerEmbeddingStorage,
  ProxyLlmClient,
  connectRealtimeSttWithRetry,
  finalizedTurnFromRealtimeSegments,
  isTranscriptionFailed,
  type RealtimeSttClient,
  type TranscribedAudioSegment,
  fetchRelayNodes,
  openRelaySession,
  probeRelayNodes,
  releaseRelaySession,
} from '@kibotalk/app-shared'
import { readLanguageSnapshot, useConfig } from './config-store'
import {
  CandidateRoundStack,
  type CandidateRound,
} from './components/StickyCandidateStack'
import { SessionToolbar } from './components/SessionToolbar'
import { TranscriptPanel } from './components/TranscriptPanel'
import { DebugPanel } from './components/DebugPanel'
import { IslandBar } from './components/IslandBar'
import { StageShell } from './components/StageShell'
import {
  IOAttributes,
  IOSpanNames,
  IOSubsystems,
  initIOTracer,
  startSpan,
} from '@kibotalk/observability'
import { useIoTracerStore } from './io-tracer/store'

type TurnView = ConversationTurn & { candidates?: ReplyCandidate[] }

type DraftTurn = {
  speaker: 'user' | 'other'
  text: string
  startedAt: number
  endedAt: number
}

export default function LiveSession({
  hasEmbedding,
  onGoEnroll,
}: {
  hasEmbedding: boolean
  onGoEnroll: () => void
}) {
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [state, setState] = useState('IDLE')
  const [turns, setTurns] = useState<TurnView[]>([])
  const [draft, setDraft] = useState<DraftTurn | null>(null)
  const [candidateRounds, setCandidateRounds] = useState<CandidateRound[]>([])
  const [vadStatus, setVadStatus] = useState<'idle' | 'speech' | 'silence'>('idle')
  const [mode, setMode] = useState<'auto' | 'checking'>('checking')
  const [confidence, setConfidence] = useState<number | null>(null)
  const [activeSttPath, setActiveSttPath] = useState<'idle' | 'realtime'>('idle')

  const speechThreshold = useConfig((s) => s.speechThreshold)
  const exitThreshold = useConfig((s) => s.exitThreshold)
  const minSilenceDurationMs = useConfig((s) => s.minSilenceDurationMs)
  const minSpeechDurationMs = useConfig((s) => s.minSpeechDurationMs)
  const pauseMs = useConfig((s) => s.pauseMs)
  const mergeMaxMs = useConfig((s) => s.mergeMaxMs)
  const speakerThreshold = useConfig((s) => s.speakerThreshold)
  const candidateRoundsMax = useConfig((s) => s.candidateRoundsMax)
  const islandSttEnabled = useConfig((s) => s.islandSttEnabled)
  const islandReplyEnabled = useConfig((s) => s.islandReplyEnabled)
  const productSurfaceMode = useConfig((s) => s.productSurfaceMode)
  const patch = useConfig((s) => s.patch)
  const setLiveSessionRunning = useConfig((s) => s.setLiveSessionRunning)

  const stableSpeakerRef = useRef<'user' | 'other'>('other')
  const llmRef = useRef<ProxyLlmClient | null>(null)
  const audioRef = useRef<AudioSource | null>(null)
  const pipelineRef = useRef<Pipeline | null>(null)
  const storageRef = useRef(new InMemoryConversationStorage())
  const verifierRef = useRef<EmbeddingSpeakerVerifier | null>(null)
  const embeddingRef = useRef<Embedding | null>(null)
  const vadRef = useRef<VAD | null>(null)
  const realtimeAggregatorRef =
    useRef<SegmentAggregator<TranscribedAudioSegment> | null>(null)
  const realtimeRef = useRef<RealtimeSttClient | null>(null)
  const realtimeBusyRef = useRef(Promise.resolve())
  const pipelineBusyRef = useRef(Promise.resolve())
  const draftMetaRef = useRef<{ speaker: 'user' | 'other'; startedAt: number } | null>(null)
  const inSpeechRef = useRef(false)
  const uncommittedRef = useRef(false)
  const relaySessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    vadRef.current?.updateConfig({
      speechThreshold,
      exitThreshold,
      minSilenceDurationMs,
      minSpeechDurationMs,
      speechPadMs: 0,
    })
  }, [speechThreshold, exitThreshold, minSilenceDurationMs, minSpeechDurationMs])
  useEffect(() => {
    verifierRef.current?.setThreshold(speakerThreshold)
  }, [speakerThreshold])
  useEffect(() => {
    realtimeAggregatorRef.current?.updateConfig({
      pauseMs,
      maxMs: mergeMaxMs,
    })
  }, [pauseMs, mergeMaxMs])

  useEffect(() => {
    return () => {
      useConfig.getState().setLiveSessionRunning(false)
      useIoTracerStore.getState().stopRecording()
    }
  }, [])

  function reportError(message: string) {
    setError(message)
    toast.error(message)
  }

  async function verifyWithSpan(
    buffer: ArrayBuffer,
  ): Promise<'user' | 'other'> {
    const span = startSpan(IOSpanNames.SpeakerVerify, {
      attrs: {
        [IOAttributes.Subsystem]: IOSubsystems.SpeakerVerify,
        [IOAttributes.SpeakerThreshold]: useConfig.getState().speakerThreshold,
      },
    })
    try {
      if (!embeddingRef.current || !verifierRef.current) {
        throw new Error('VOICEPRINT_REQUIRED')
      }
      const r = await verifierRef.current.verify(buffer, embeddingRef.current)
      setConfidence(r.confidence)
      stableSpeakerRef.current = stabilizeSpeaker(
        r.similarity,
        stableSpeakerRef.current,
        useConfig.getState().speakerThreshold,
      )
      span.setAttribute(IOAttributes.SpeakerConfidence, r.confidence)
      span.setAttribute(IOAttributes.SpeakerResult, stableSpeakerRef.current)
      span.end()
      return stableSpeakerRef.current
    } catch (err) {
      reportError(`说话人判定失败：${String(err)}`)
      span.setAttribute(IOAttributes.SpeakerResult, stableSpeakerRef.current)
      span.end()
      return stableSpeakerRef.current
    }
  }

  async function waitRealtimeCompletedWithSpan(
    rt: NonNullable<typeof realtimeRef.current>,
  ): Promise<string> {
    const span = startSpan(IOSpanNames.SpeechRecognition, {
      attrs: {
        [IOAttributes.Subsystem]: IOSubsystems.STT,
        [IOAttributes.SttPath]: 'realtime',
      },
    })
    try {
      const text = await rt.waitCompleted()
      span.setAttribute(IOAttributes.ASRText, text)
      span.end()
      return text
    } catch (e) {
      span.setAttribute(IOAttributes.ASRAbort, true)
      span.end()
      throw e
    }
  }

  async function start() {
    if (!hasEmbedding) {
      reportError('VOICEPRINT_REQUIRED')
      return
    }
    setError('')
    setStatusNote('')
    setLoading('正在检查声纹录入…')
    setTurns([])
    setDraft(null)
    setCandidateRounds([])
    try {
      initIOTracer()
      useIoTracerStore.getState().clear()
      useIoTracerStore.getState().startRecording()

      if (!verifierRef.current) {
        verifierRef.current = new EmbeddingSpeakerVerifier({
          embedAudio: createWorkerEmbedAudio(),
          storage: createCurrentSpeakerEmbeddingStorage(),
          threshold: speakerThreshold,
        })
      }
      const embedding = await verifierRef.current.loadEmbedding()
      embeddingRef.current = embedding
      if (!embedding) throw new Error('VOICEPRINT_REQUIRED')
      setMode('auto')

      const cfg = useConfig.getState()
      const selectedProvider = cfg.transcribeProvider
      if (!selectedProvider) throw new Error('STT_PROVIDER_REQUIRED')
      const relaySessionId =
        globalThis.crypto?.randomUUID?.()
        ?? `playground-${Date.now()}-${Math.random().toString(36).slice(2)}`
      if (!cfg.relayNodeId) throw new Error('请先选择 API 网络节点')
      setLoading('正在连接所选 API 网络节点…')
      const relayProbeResults = await probeRelayNodes(await fetchRelayNodes())
      const relaySelection = await openRelaySession({
        conversationSessionId: relaySessionId,
        nodeId: cfg.relayNodeId,
        probeResults: relayProbeResults,
      })
      relaySessionIdRef.current = relaySessionId
      const relayStatus =
        relaySelection.latencyMs === null
          ? relaySelection.node.id
          : `${relaySelection.node.id} · ${Math.round(relaySelection.latencyMs)} ms`

      setLoading('正在启动麦克风与音频处理…')
      const audio = new AudioSource()
      audioRef.current = audio
      const vadVariant = SILERO_VARIANTS.find((v) => v.id === cfg.vadVariantId) ?? SILERO_VARIANTS[0]
      const infer = await createSileroInfer(vadVariant, audio.sampleRate)
      const vad = createVAD(infer, {
        speechThreshold,
        exitThreshold,
        minSilenceDurationMs,
        minSpeechDurationMs,
        maxSpeechDurationMs: cfg.mergeMaxMs,
        speechPadMs: 0,
        sampleRate: audio.sampleRate,
      })
      vadRef.current = vad

      const llm = new ProxyLlmClient(readLanguageSnapshot(), () => useConfig.getState().islandReplyEnabled)
      llmRef.current = llm
      const storage = storageRef.current
      const pipeline = new Pipeline({ llm, conversation: storage })
      pipelineRef.current = pipeline

      setActiveSttPath('realtime')
      setLoading('正在连接实时转写…')
      const rt = await connectRealtimeSttWithRetry({
        provider: selectedProvider,
        language: cfg.conversationLang,
        sessionId: relaySessionId,
        handlers: {
          onPartial: (text) => {
            const meta = draftMetaRef.current
            if (!meta) return
            setDraft({
              speaker: meta.speaker,
              text,
              startedAt: meta.startedAt,
              endedAt: Date.now(),
            })
          },
          onError: (message) => {
            reportError(`实时转写：${message}`)
          },
        },
      })
      realtimeRef.current = rt
      setStatusNote(`实时转写已连接 · ${relayStatus}`)

      const realtimeAggregator = createSegmentAggregator<TranscribedAudioSegment>({
        sampleRate: audio.sampleRate,
        pauseMs: cfg.pauseMs,
        maxMs: cfg.mergeMaxMs,
      })
      realtimeAggregator.onFlush((merged) => {
        const turn = finalizedTurnFromRealtimeSegments(
          merged,
          cfg.conversationLang,
        )
        if (!turn) return
        pipelineBusyRef.current = pipelineBusyRef.current
          .then(() => pipeline.ingestFinalizedTurn(turn))
          .catch(() => {})
      })
      realtimeAggregatorRef.current = realtimeAggregator

      pipeline.on((e: PipelineEvent) => {
        switch (e.type) {
          case 'state':
            setState(e.state)
            break
          case 'turnAppended':
            setTurns((prev) => [...prev, e.turn as TurnView])
            break
          case 'candidatesDone':
            if (!useConfig.getState().islandReplyEnabled) break
            if (e.candidates.length === 3) {
              setCandidateRounds((prev) => [
                { id: e.turnId, candidates: e.candidates },
                ...prev,
              ])
            }
            setTurns((prev) =>
              prev.map((t) => (t.id === e.turnId ? { ...t, candidates: e.candidates } : t)),
            )
            break
          case 'candidatesStreaming':
          case 'candidateDelta':
          case 'llmAborted':
          case 'llmFailed':
            break
          case 'sttFailed':
            setTurns((prev) =>
              prev.map((t) => (t.id === e.turnId ? { ...t, sttFailed: true } as TurnView : t)),
            )
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
        if (!useConfig.getState().islandSttEnabled) {
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
        if (!useConfig.getState().islandSttEnabled) return
        const now = Date.now()
        const startedAt =
          draftMetaRef.current?.startedAt ?? now - e.duration * 1000
        const endedAt = now

        const rtConn = realtimeRef.current
        if (!rtConn || !uncommittedRef.current) return

        rtConn.commit()
        uncommittedRef.current = false
        const buffer = e.buffer
        const provisional = draftMetaRef.current?.speaker ?? stableSpeakerRef.current
        const transcription = waitRealtimeCompletedWithSpan(rtConn).then(
          (text) => ({ ok: true as const, text }),
          (error: unknown) => ({ ok: false as const, error }),
        )
        const verifiedSpeaker = verifyWithSpan(buffer.buffer as ArrayBuffer)
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
        if (!useConfig.getState().islandSttEnabled) return
        if (!inSpeechRef.current) return
        const rtConn = realtimeRef.current
        if (!rtConn) return
        uncommittedRef.current = true
        rtConn.append(chunk)
      })
      setRunning(true)
      setLiveSessionRunning(true)
      setLoading('')
    } catch (e) {
      reportError((e as Error).message)
      setLoading('')
      stop()
    }
  }

  function stop() {
    realtimeAggregatorRef.current?.flush()
    realtimeAggregatorRef.current?.dispose()
    realtimeAggregatorRef.current = null
    realtimeRef.current?.finish()
    realtimeRef.current?.close()
    realtimeRef.current = null
    inSpeechRef.current = false
    uncommittedRef.current = false
    audioRef.current?.stop()
    audioRef.current = null
    pipelineRef.current = null
    llmRef.current = null
    vadRef.current = null
    draftMetaRef.current = null
    setDraft(null)
    setRunning(false)
    setLiveSessionRunning(false)
    setActiveSttPath('idle')
    setVadStatus('idle')
    setConfidence(null)
    useIoTracerStore.getState().stopRecording()
    relaySessionIdRef.current = null
    void releaseRelaySession(true)
  }

  async function clearSession() {
    await storageRef.current.clearActiveSession()
    setTurns([])
    setDraft(null)
    setCandidateRounds([])
    setState('IDLE')
  }

  return (
    <StageShell
      leftTitle="对话"
      left={<TranscriptPanel turns={turns} draft={draft} />}
      debugTitle="调试"
      debug={
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto">
          <SessionToolbar
            running={running}
            loading={loading}
            state={state}
            vadStatus={vadStatus}
            activeSttPath={activeSttPath}
            mode={mode}
            confidence={confidence}
            hasEmbedding={hasEmbedding}
            statusNote={statusNote}
            error={error}
            onStart={() => void start()}
            onStop={stop}
            onClear={() => void clearSession()}
            onGoEnroll={onGoEnroll}
          />
          <Separator />
          <DebugPanel running={running} />
        </div>
      }
      stage={
        productSurfaceMode === 'floating' ? (
          <div className="floating-sim island-stage relative flex h-full min-h-0 flex-col">
            <p className="pointer-events-none absolute left-3 top-2 z-10 text-[10px] font-medium tracking-wide text-muted-foreground/80">
              悬浮模拟 · Island + 便利贴
            </p>
            <div className="min-h-0 flex-1 px-2 pt-6 sm:px-4">
              <CandidateRoundStack
                surface="floating"
                rounds={candidateRounds}
                maxRounds={candidateRoundsMax}
                streaming={state === 'LLM_STREAMING' && islandReplyEnabled}
              />
            </div>
            <IslandBar
              running={running}
              loading={loading}
              state={state}
              vadStatus={vadStatus}
              sttEnabled={islandSttEnabled}
              replyEnabled={islandReplyEnabled}
              onToggleStt={() =>
                patch({ islandSttEnabled: !useConfig.getState().islandSttEnabled })
              }
              onToggleReply={() =>
                patch({ islandReplyEnabled: !useConfig.getState().islandReplyEnabled })
              }
              onStart={() => void start()}
              onStop={stop}
            />
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col bg-background">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-2.5">
              <div>
                <p className="text-sm font-medium">回复建议</p>
                <p className="text-xs text-muted-foreground">窗口模式 · 应用内卡片</p>
              </div>
              {!running ? (
                <Button size="sm" onClick={() => void start()} disabled={!!loading || !hasEmbedding}>
                  {loading || '开始会话'}
                </Button>
              ) : (
                <Button size="sm" variant="destructive" onClick={stop}>
                  停止
                </Button>
              )}
            </div>
            <div className="min-h-0 flex-1 px-3 py-3 sm:px-5">
              <CandidateRoundStack
                surface="window"
                rounds={candidateRounds}
                maxRounds={candidateRoundsMax}
                streaming={state === 'LLM_STREAMING' && islandReplyEnabled}
              />
            </div>
          </div>
        )
      }
    />
  )
}
