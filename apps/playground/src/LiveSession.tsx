import { useEffect, useRef, useState } from 'react'
import type { PipelineEvent } from '@kibotalk/pipeline'
import { Pipeline } from '@kibotalk/pipeline'
import type { ConversationTurn, ReplyCandidate } from '@kibotalk/conversation'
import { InMemoryConversationStorage } from '@kibotalk/conversation'
import { EmbeddingSpeakerVerifier, IndexedDbEmbeddingStorage } from '@kibotalk/speaker'
import type { Embedding } from '@kibotalk/speaker'
import { createVAD } from '@kibotalk/audio/vad'
import type { VAD } from '@kibotalk/audio/vad'
import { createSegmentAggregator } from '@kibotalk/audio/aggregator'
import type { SegmentAggregator, AggregatedSegment } from '@kibotalk/audio/aggregator'
import { Button, Separator, toast } from '@kibotalk/ui'
import {
  AudioSource,
  createSileroInfer,
  SILERO_VARIANTS,
  createWorkerEmbedAudio,
  ProxySttClient,
  ProxyLlmClient,
  connectRealtimeSttWithRetry,
  type RealtimeSttClient,
  providerMode,
  type SttProvider,
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
import { useTranscribeProvider } from './SttProviderSelect'

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
  const [speaker, setSpeaker] = useState<'user' | 'other'>('other')
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [state, setState] = useState('IDLE')
  const [turns, setTurns] = useState<TurnView[]>([])
  const [draft, setDraft] = useState<DraftTurn | null>(null)
  const [candidateRounds, setCandidateRounds] = useState<CandidateRound[]>([])
  const [vadStatus, setVadStatus] = useState<'idle' | 'speech' | 'silence'>('idle')
  const [mode, setMode] = useState<'auto' | 'manual' | 'checking'>('checking')
  const [confidence, setConfidence] = useState<number | null>(null)
  /** Actual STT path for the running session (may differ from UI after session-only R4 degrade). */
  const [activeSttPath, setActiveSttPath] = useState<'idle' | 'realtime' | 'batch'>('idle')

  const speechThreshold = useConfig((s) => s.speechThreshold)
  const exitThreshold = useConfig((s) => s.exitThreshold)
  const minSilenceDurationMs = useConfig((s) => s.minSilenceDurationMs)
  const minSpeechDurationMs = useConfig((s) => s.minSpeechDurationMs)
  const prePadMs = useConfig((s) => s.prePadMs)
  const postPadMs = useConfig((s) => s.postPadMs)
  const pauseMs = useConfig((s) => s.pauseMs)
  const mergeMaxMs = useConfig((s) => s.mergeMaxMs)
  const speakerThreshold = useConfig((s) => s.speakerThreshold)
  const candidateRoundsMax = useConfig((s) => s.candidateRoundsMax)
  const islandSttEnabled = useConfig((s) => s.islandSttEnabled)
  const islandReplyEnabled = useConfig((s) => s.islandReplyEnabled)
  const productSurfaceMode = useConfig((s) => s.productSurfaceMode)
  const patch = useConfig((s) => s.patch)
  const setLiveSessionRunning = useConfig((s) => s.setLiveSessionRunning)
  const { providers } = useTranscribeProvider()

  const speakerRef = useRef(speaker)
  speakerRef.current = speaker
  const llmRef = useRef<ProxyLlmClient | null>(null)
  const audioRef = useRef<AudioSource | null>(null)
  const pipelineRef = useRef<Pipeline | null>(null)
  const storageRef = useRef(new InMemoryConversationStorage())
  const verifierRef = useRef<EmbeddingSpeakerVerifier | null>(null)
  const embeddingRef = useRef<Embedding | null>(null)
  const autoRef = useRef(false)
  const vadRef = useRef<VAD | null>(null)
  const sttRef = useRef<ProxySttClient | null>(null)
  const aggregatorRef = useRef<SegmentAggregator | null>(null)
  const realtimeRef = useRef<RealtimeSttClient | null>(null)
  const realtimeModeRef = useRef(false)
  const realtimeBusyRef = useRef(Promise.resolve())
  const providersRef = useRef<SttProvider[]>(providers)
  providersRef.current = providers
  const draftMetaRef = useRef<{ speaker: 'user' | 'other'; startedAt: number } | null>(null)
  /** Realtime: stream mic while Silero says in-speech (not wait for speech-ready). */
  const inSpeechRef = useRef(false)
  /** True after append until commit completes — blocks next speech stream from mixing. */
  const uncommittedRef = useRef(false)
  /** Last realtime turn id — verify may patch speaker after provisional commit. */
  const lastRealtimeTurnIdRef = useRef<string | null>(null)

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
    sttRef.current?.configurePadding(prePadMs, postPadMs)
  }, [prePadMs, postPadMs])
  useEffect(() => {
    aggregatorRef.current?.updateConfig({
      pauseMs,
      maxMs: mergeMaxMs,
    })
  }, [pauseMs, mergeMaxMs])
  const transcribeMode = useConfig((s) => s.transcribeMode)
  useEffect(() => {
    if (transcribeMode !== 'aggregated') aggregatorRef.current?.flush()
  }, [transcribeMode])

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

  function degradeToBatch(reason: string) {
    const batch = providersRef.current.find((p) => p.mode !== 'realtime' && p.id)
    if (!batch) {
      reportError(`实时转写失败：${reason}（无可用 batch provider 可降级）`)
      return false
    }
    // Session-only: keep UI on realtime selection, but STT POSTs must use a batch id.
    realtimeRef.current?.close()
    realtimeRef.current = null
    realtimeModeRef.current = false
    sttRef.current?.setProviderOverride(batch.id)
    setActiveSttPath('batch')
    const degradeSpan = startSpan(IOSpanNames.SpeechRecognition, {
      attrs: {
        [IOAttributes.Subsystem]: IOSubsystems.STT,
        [IOAttributes.SttPath]: 'realtime',
        [IOAttributes.SttDegraded]: true,
      },
    })
    degradeSpan.end()
    setStatusNote(
      `本会话实时转写已降级为 batch（${batch.label}）：${reason}。停止后重新开始可再试实时。`,
    )
    setDraft(null)
    draftMetaRef.current = null
    return true
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
      if (!autoRef.current || !embeddingRef.current || !verifierRef.current) {
        span.setAttribute(IOAttributes.SpeakerResult, speakerRef.current)
        span.end()
        return speakerRef.current
      }
      const r = await verifierRef.current.verify(buffer, embeddingRef.current)
      setConfidence(r.confidence)
      span.setAttribute(IOAttributes.SpeakerConfidence, r.confidence)
      span.setAttribute(IOAttributes.SpeakerResult, r.speaker)
      span.end()
      return r.speaker as 'user' | 'other'
    } catch (err) {
      reportError(`说话人判定失败：${String(err)}`)
      span.setAttribute(IOAttributes.SpeakerResult, 'other')
      span.end()
      return 'other'
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

  async function handleRealtimeFlush(merged: AggregatedSegment, pipeline: Pipeline) {
    const rt = realtimeRef.current
    if (!rt) {
      if (!degradeToBatch('连接已断开')) {
        await pipeline.ingestFinalizedTurn({
          speaker: merged.speaker,
          text: '',
          startedAt: merged.startedAt,
          endedAt: merged.endedAt,
          sttFailed: true,
        })
      }
      return
    }
    try {
      rt.commit()
      const text = await waitRealtimeCompletedWithSpan(rt)
      uncommittedRef.current = false
      setDraft(null)
      draftMetaRef.current = null
      await pipeline.ingestFinalizedTurn({
        speaker: merged.speaker,
        text,
        startedAt: merged.startedAt,
        endedAt: merged.endedAt,
      })
    } catch (e) {
      const msg = (e as Error).message
      uncommittedRef.current = false
      if (!degradeToBatch(msg)) {
        setDraft(null)
        draftMetaRef.current = null
        await pipeline.ingestFinalizedTurn({
          speaker: merged.speaker,
          text: '',
          startedAt: merged.startedAt,
          endedAt: merged.endedAt,
          sttFailed: true,
        })
      }
    }
  }

  async function start() {
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
          storage: new IndexedDbEmbeddingStorage(),
          threshold: speakerThreshold,
        })
      }
      const embedding = await verifierRef.current.loadEmbedding()
      embeddingRef.current = embedding
      autoRef.current = !!embedding
      setMode(embedding ? 'auto' : 'manual')

      const cfg = useConfig.getState()
      const selectedProvider = cfg.transcribeProvider
      const isRealtime = providerMode(providers, selectedProvider) === 'realtime'

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
        speechPadMs: 0,
        sampleRate: audio.sampleRate,
      })
      vadRef.current = vad

      const stt = new ProxySttClient(
        audio.sampleRate,
        cfg.conversationLang,
        () => useConfig.getState().islandSttEnabled,
        () => useConfig.getState().transcribeProvider,
      )
      stt.configurePadding(prePadMs, postPadMs)
      stt.setProviderOverride(null)
      sttRef.current = stt
      const llm = new ProxyLlmClient(readLanguageSnapshot(), () => useConfig.getState().islandReplyEnabled)
      llmRef.current = llm
      const storage = storageRef.current
      const pipeline = new Pipeline({ stt, llm, conversation: storage })
      pipelineRef.current = pipeline

      realtimeModeRef.current = isRealtime
      setActiveSttPath(isRealtime ? 'realtime' : 'batch')
      if (!isRealtime) {
        setStatusNote(
          '当前为 batch STT：无实时草稿，停顿后整段上传。要边说边出字请把 STT 选成带「· 实时」的项（如 dashscope-realtime）。',
        )
      }
      if (isRealtime && selectedProvider) {
        setLoading('正在连接实时转写…')
        try {
          const rt = await connectRealtimeSttWithRetry({
            provider: selectedProvider,
            language: cfg.conversationLang,
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
          setStatusNote('实时转写已连接：说话中应出现草稿字幕。')
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
        pauseMs: cfg.pauseMs,
        maxMs: cfg.mergeMaxMs,
      })
      aggregator.onFlush((merged) => {
        if (realtimeModeRef.current) {
          const next = realtimeBusyRef.current
            .then(() => handleRealtimeFlush(merged, pipeline))
            .catch(() => {})
          realtimeBusyRef.current = next
        } else {
          void pipeline.ingestSegment({
            pcm: merged.pcm,
            speaker: merged.speaker,
            startedAt: merged.startedAt,
            endedAt: merged.endedAt,
          })
        }
      })
      aggregatorRef.current = aggregator

      pipeline.on((e: PipelineEvent) => {
        switch (e.type) {
          case 'state':
            setState(e.state)
            break
          case 'turnAppended':
            setTurns((prev) => [...prev, e.turn as TurnView])
            if (realtimeModeRef.current) {
              lastRealtimeTurnIdRef.current = e.turn.id
            }
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
          case 'llmAborted':
          case 'llmFailed':
            break
          case 'sttFailed':
            setTurns((prev) =>
              prev.map((t) => (t.id === e.turnId ? { ...t, sttFailed: true } as TurnView : t)),
            )
            break
          default:
            break
        }
      })

      vad.on('speech-start', () => {
        setVadStatus('speech')
        if (!useConfig.getState().islandSttEnabled) {
          inSpeechRef.current = true
          return
        }
        const startedAt = Date.now()
        if (realtimeModeRef.current) {
          // Safety: if prior segment never committed, seal buffer before new audio.
          if (uncommittedRef.current && realtimeRef.current) {
            const meta = draftMetaRef.current
            const rt = realtimeRef.current
            rt.commit()
            uncommittedRef.current = false
            void (async () => {
              try {
                const text = await waitRealtimeCompletedWithSpan(rt)
                await pipeline.ingestFinalizedTurn({
                  speaker: meta?.speaker ?? speakerRef.current,
                  text,
                  startedAt: meta?.startedAt ?? startedAt,
                  endedAt: startedAt,
                })
              } catch {
                /* handleRealtime path / degrade elsewhere */
              }
            })()
          }
          const who = draftMetaRef.current?.speaker ?? speakerRef.current
          draftMetaRef.current = { speaker: who, startedAt }
          setDraft({ speaker: who, text: '', startedAt, endedAt: startedAt })
        }
        inSpeechRef.current = true
      })
      vad.on('speech-end', () => {
        setVadStatus('silence')
        inSpeechRef.current = false
      })
      vad.on('speech-ready', (e) => {
        if (!useConfig.getState().islandSttEnabled) return
        const now = Date.now()
        const startedAt =
          draftMetaRef.current?.startedAt ?? now - e.duration * 1000
        const endedAt = now

        if (realtimeModeRef.current) {
          const rt = realtimeRef.current
          const provisional =
            draftMetaRef.current?.speaker ?? speakerRef.current

          // Seal Manual buffer synchronously — must not await verify first.
          if (rt && uncommittedRef.current) {
            rt.commit()
            uncommittedRef.current = false
            const buffer = e.buffer
            void (async () => {
              try {
                const verifyPromise = verifyWithSpan(buffer.buffer as ArrayBuffer)

                // Spec: speaker gate runs in parallel with STT finalization.
                const [text, who] = await Promise.all([
                  waitRealtimeCompletedWithSpan(rt),
                  verifyPromise,
                ])
                draftMetaRef.current = { speaker: who, startedAt }
                setDraft(null)
                await pipeline.ingestFinalizedTurn({
                  speaker: who,
                  text,
                  startedAt,
                  endedAt,
                })
              } catch (err) {
                const msg = (err as Error).message
                if (!degradeToBatch(msg)) {
                  setDraft(null)
                  await pipeline.ingestFinalizedTurn({
                    speaker: provisional,
                    text: '',
                    startedAt,
                    endedAt,
                    sttFailed: true,
                  })
                }
              }
            })()
          } else if (autoRef.current && embeddingRef.current && verifierRef.current) {
            // Already committed (e.g. speech-start safety flush); still label async.
            void verifyWithSpan(e.buffer.buffer as ArrayBuffer)
              .then((who) => {
                draftMetaRef.current = { speaker: who, startedAt }
                const turnId = lastRealtimeTurnIdRef.current
                if (turnId) {
                  setTurns((prev) =>
                    prev.map((t) =>
                      t.id === turnId && t.speaker !== who
                        ? { ...t, speaker: who }
                        : t,
                    ),
                  )
                }
              })
              .catch(() => {})
          }
          return
        }

        // Batch: verify || STT in parallel, then ingest finalized text.
        const buffer = e.buffer
        void (async () => {
          try {
            const verifyPromise = verifyWithSpan(buffer.buffer as ArrayBuffer)

            if (useConfig.getState().transcribeMode === 'aggregated') {
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
            const [who, text] = await Promise.all([
              verifyPromise,
              stt.transcribe(buffer, new AbortController().signal),
            ])
            await pipeline.ingestFinalizedTurn({
              speaker: who,
              text,
              startedAt,
              endedAt,
            })
          } catch (err) {
            reportError(`转写失败：${String(err)}`)
            const who = speakerRef.current
            await pipeline.ingestFinalizedTurn({
              speaker: who,
              text: '',
              startedAt,
              endedAt,
              sttFailed: true,
            })
          }
        })()
      })

      await audio.start(async (chunk) => {
        await vad.processAudio(chunk)
        if (!useConfig.getState().islandSttEnabled) return
        if (!realtimeModeRef.current || !inSpeechRef.current) return
        const rt = realtimeRef.current
        if (!rt) return
        uncommittedRef.current = true
        rt.append(chunk)
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
    aggregatorRef.current?.flush()
    aggregatorRef.current?.dispose()
    aggregatorRef.current = null
    realtimeRef.current?.finish()
    realtimeRef.current?.close()
    realtimeRef.current = null
    realtimeModeRef.current = false
    inSpeechRef.current = false
    audioRef.current?.stop()
    audioRef.current = null
    pipelineRef.current = null
    llmRef.current = null
    vadRef.current = null
    sttRef.current = null
    draftMetaRef.current = null
    setDraft(null)
    setRunning(false)
    setLiveSessionRunning(false)
    setActiveSttPath('idle')
    setVadStatus('idle')
    setConfidence(null)
    useIoTracerStore.getState().stopRecording()
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
            speaker={speaker}
            onSpeakerChange={setSpeaker}
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
                <Button size="sm" onClick={() => void start()} disabled={!!loading}>
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
