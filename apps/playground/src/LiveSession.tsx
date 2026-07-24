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
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
} from '@kibotalk/ui'
import { AudioSource } from './audio/audio-source'
import { createSileroInfer, SILERO_VARIANTS } from './audio/silero-vad'
import { createWorkerEmbedAudio } from './audio/speaker-embed'
import { ProxySttClient, ProxyLlmClient } from './proxy-clients'
import { readLanguageSnapshot, useConfig } from './config-store'
import { ReplyCandidateCard } from './components/ReplyCandidateCard'
import {
  VadParamsFields,
  AsrPadFields,
  MergeParamsFields,
  VadModelSelect,
  TranscribeModeSelect,
  NumberField,
} from './components/ConfigFields'
import {
  useTranscribeProvider,
  providerMode,
  SttProviderSelect,
  type SttProvider,
} from './SttProviderSelect'
import {
  connectRealtimeSttWithRetry,
  type RealtimeSttClient,
} from './realtime-stt-client'

type TurnView = ConversationTurn & { candidates?: ReplyCandidate[] }

type DraftTurn = {
  speaker: 'user' | 'other'
  text: string
  startedAt: number
  endedAt: number
}

const STATE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  IDLE: 'secondary',
  OTHER_SPEAKING: 'default',
  USER_SPEAKING: 'default',
  LLM_STREAMING: 'outline',
}

export default function LiveSession() {
  const [speaker, setSpeaker] = useState<'user' | 'other'>('other')
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')
  const [statusNote, setStatusNote] = useState('')
  const [state, setState] = useState('IDLE')
  const [turns, setTurns] = useState<TurnView[]>([])
  const [draft, setDraft] = useState<DraftTurn | null>(null)
  const [latestCandidates, setLatestCandidates] = useState<ReplyCandidate[] | null>(null)
  const [vadStatus, setVadStatus] = useState('idle')
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
  const transcribeMode = useConfig((s) => s.transcribeMode)
  const speakerThreshold = useConfig((s) => s.speakerThreshold)
  const mergeEnabled = transcribeMode === 'aggregated'
  const setLiveSessionRunning = useConfig((s) => s.setLiveSessionRunning)
  const { providers, provider } = useTranscribeProvider()
  const patch = useConfig((s) => s.patch)
  const sttIsRealtime = providerMode(providers, provider) === 'realtime'

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
  useEffect(() => {
    if (!mergeEnabled) aggregatorRef.current?.flush()
  }, [mergeEnabled])

  useEffect(() => {
    return () => {
      useConfig.getState().setLiveSessionRunning(false)
    }
  }, [])

  function degradeToBatch(reason: string) {
    const batch = providersRef.current.find((p) => p.mode !== 'realtime' && p.id)
    if (!batch) {
      setError(`实时转写失败：${reason}（无可用 batch provider 可降级）`)
      return false
    }
    // Session-only: keep UI on realtime selection, but STT POSTs must use a batch id.
    realtimeRef.current?.close()
    realtimeRef.current = null
    realtimeModeRef.current = false
    sttRef.current?.setProviderOverride(batch.id)
    setActiveSttPath('batch')
    setStatusNote(
      `本会话实时转写已降级为 batch（${batch.label}）：${reason}。停止后重新开始可再试实时。`,
    )
    setDraft(null)
    draftMetaRef.current = null
    return true
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
      const text = await rt.waitCompleted()
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
    setLatestCandidates(null)
    try {
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

      setLoading('正在请求麦克风 + 加载 VAD 模型…')
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

      const stt = new ProxySttClient(audio.sampleRate, cfg.conversationLang)
      stt.configurePadding(prePadMs, postPadMs)
      stt.setProviderOverride(null)
      sttRef.current = stt
      const llm = new ProxyLlmClient(readLanguageSnapshot())
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
                setError(`实时转写：${message}`)
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
            if (e.candidates.length === 3) {
              setLatestCandidates(e.candidates)
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
                const text = await rt.waitCompleted()
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
                const verifyPromise =
                  autoRef.current && embeddingRef.current && verifierRef.current
                    ? verifierRef.current
                        .verify(buffer.buffer as ArrayBuffer, embeddingRef.current)
                        .then((r) => {
                          setConfidence(r.confidence)
                          return r.speaker as 'user' | 'other'
                        })
                        .catch((err) => {
                          setError(`说话人判定失败：${String(err)}`)
                          return 'other' as const
                        })
                    : Promise.resolve(speakerRef.current as 'user' | 'other')

                // Spec: speaker gate runs in parallel with STT finalization.
                const [text, who] = await Promise.all([
                  rt.waitCompleted(),
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
            void verifierRef.current
              .verify(e.buffer.buffer as ArrayBuffer, embeddingRef.current)
              .then((r) => {
                setConfidence(r.confidence)
                draftMetaRef.current = { speaker: r.speaker, startedAt }
                const turnId = lastRealtimeTurnIdRef.current
                if (turnId) {
                  setTurns((prev) =>
                    prev.map((t) =>
                      t.id === turnId && t.speaker !== r.speaker
                        ? { ...t, speaker: r.speaker }
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
            const verifyPromise =
              autoRef.current && embeddingRef.current && verifierRef.current
                ? verifierRef.current
                    .verify(buffer.buffer as ArrayBuffer, embeddingRef.current)
                    .then((r) => {
                      setConfidence(r.confidence)
                      return r.speaker as 'user' | 'other'
                    })
                    .catch((err) => {
                      setError(`说话人判定失败：${String(err)}`)
                      return 'other' as const
                    })
                : Promise.resolve(speakerRef.current as 'user' | 'other')

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
            setError(`转写失败：${String(err)}`)
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
      setError((e as Error).message)
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
  }

  async function clearSession() {
    await storageRef.current.clearActiveSession()
    setTurns([])
    setDraft(null)
    setLatestCandidates(null)
    setState('IDLE')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>实时会话</CardTitle>
          <CardDescription>
            麦克风 → Silero VAD → 说话人判定 → TurnGate → batch `/stt` 或 realtime `/stt-realtime` → 管线 → `/llm`。
            实时路径边说边出草稿；定稿后才入库并请求教练（ADR 0004）。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="live-speaker">当前说话人</Label>
              <select
                id="live-speaker"
                value={speaker}
                onChange={(e) => setSpeaker(e.target.value as 'user' | 'other')}
                disabled={mode === 'auto'}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm disabled:opacity-50"
              >
                <option value="other">对方（相手）</option>
                <option value="user">我（学习者）</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <VadModelSelect disabled={running} />
            {!sttIsRealtime && <TranscribeModeSelect disabled={running} />}
            <span className="flex items-center gap-2 text-sm">
              <span className="font-medium">STT：</span>
              <SttProviderSelect
                providers={providers}
                value={provider}
                onChange={(id) => patch({ transcribeProvider: id })}
                allowOff={false}
                disabled={running}
              />
            </span>
          </div>

          <div className="flex gap-2">
            {!running ? (
              <Button onClick={start} disabled={!!loading}>{loading || '开始会话'}</Button>
            ) : (
              <Button variant="destructive" onClick={stop}>停止会话</Button>
            )}
            <Button variant="outline" onClick={clearSession} disabled={running}>清空会话</Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">状态：</span>
            <Badge variant={STATE_VARIANT[state] ?? 'secondary'}>{state}</Badge>
            <span className="text-muted-foreground">·</span>
            <span className="font-medium">转写路径：</span>
            <Badge variant={activeSttPath === 'realtime' ? 'default' : 'secondary'}>
              {activeSttPath === 'realtime'
                ? '实时流式'
                : activeSttPath === 'batch'
                  ? 'batch（无实时草稿）'
                  : '未开始'}
            </Badge>
            <span className="text-muted-foreground">·</span>
            <span className="font-medium">VAD：</span>
            <span>{vadStatus === 'speech' ? '说话中' : vadStatus === 'silence' ? '静音' : '空闲'}</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-medium">说话人：</span>
            {mode === 'auto' ? (
              <span>自动{confidence !== null ? `（置信度 ${confidence.toFixed(2)}）` : ''}</span>
            ) : mode === 'manual' ? (
              <span>
                手动
                <span className="text-muted-foreground ml-2">
                 （到「声纹录入」页录入后可启用自动判定）
                </span>
              </span>
            ) : (
              <span>检测中…</span>
            )}
          </div>

          {statusNote && <p className="text-sm text-amber-700">{statusNote}</p>}
          {error && <p className="text-sm text-destructive">错误：{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>调试参数</CardTitle>
          <CardDescription>
            VAD、说话人判定与成句阈值，改动实时生效。暂停 ms：静音超过该值才成句（双方同一阈值，spec §2.4）。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <VadParamsFields />
            <AsrPadFields />
            <NumberField
              label="说话人阈值（0.8）"
              value={speakerThreshold}
              step={0.05}
              min={0}
              max={1}
              onChange={(v) => useConfig.getState().patch({ speakerThreshold: v })}
            />
            <MergeParamsFields disabled={!mergeEnabled && !sttIsRealtime} />
          </div>
          <Button variant="outline" size="sm" onClick={() => useConfig.getState().reset()}>
            恢复默认
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>最新候选</CardTitle>
          </CardHeader>
          <CardContent>
            {latestCandidates && latestCandidates.length > 0 ? (
              <ul className="space-y-2">
                {latestCandidates.map((c) => (
                  <ReplyCandidateCard key={c.id} candidate={c} />
                ))}
              </ul>
            ) : state === 'LLM_STREAMING' ? (
              <p className="text-sm text-muted-foreground">正在流式生成…</p>
            ) : (
              <p className="text-sm text-muted-foreground">（还没有候选）</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>时间轴</CardTitle>
            <CardDescription>最新在上；实时路径可显示进行中草稿</CardDescription>
          </CardHeader>
          <CardContent>
            {!draft && turns.length === 0 ? (
              <p className="text-sm text-muted-foreground">（还没有对话轮次）</p>
            ) : (
              <ol className="space-y-2">
                {draft && (
                  <li
                    className={`border-l-4 pl-3 py-2 rounded-r-md border-dashed opacity-80 ${
                      draft.speaker === 'other' ? 'border-blue-500' : 'border-emerald-500'
                    } bg-muted/30`}
                  >
                    <div className="font-semibold text-sm">
                      {draft.speaker === 'other' ? '对方' : '我'} · 草稿
                    </div>
                    <div className="text-sm">{draft.text || '…'}</div>
                  </li>
                )}
                {[...turns].reverse().map((t) => (
                  <li
                    key={t.id}
                    className={`border-l-4 pl-3 py-2 rounded-r-md ${
                      t.speaker === 'other' ? 'border-blue-500' : 'border-emerald-500'
                    } ${t.sttFailed ? 'bg-red-50' : 'bg-muted/50'}`}
                  >
                    <div className="font-semibold text-sm">
                      {t.speaker === 'other' ? '对方' : '我'}{t.sttFailed ? ' · STT 失败' : ''}
                    </div>
                    <div className="text-sm">{t.sttFailed ? '（空·转写失败）' : t.text}</div>
                    {t.candidates && t.candidates.length > 0 && (
                      <ul className="mt-1 ml-4 list-disc space-y-1">
                        {t.candidates.map((c) => (
                          <ReplyCandidateCard key={c.id} candidate={c} compact />
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
