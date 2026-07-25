import { useEffect, useRef, useState } from 'react'
import { createVAD } from '@kibotalk/audio/vad'
import type { VAD } from '@kibotalk/audio/vad'
import { encodeWav, padBuffer } from '@kibotalk/audio'
import { createSegmentAggregator } from '@kibotalk/audio/aggregator'
import type { SegmentAggregator, AggregatedSegment } from '@kibotalk/audio/aggregator'
import { useConfig } from './config-store'
import { sttUrl, providerMode, useSttProviders } from './SttProviderSelect'
import {
  Badge,
  Button,
  ScrollArea,
} from '@kibotalk/ui'
import {
  AudioLines,
  ChartLine,
  ListTree,
  Loader2,
  Mic,
  Play,
  Settings2,
  Square,
} from 'lucide-react'
import { AudioSource, createSileroInfer, SILERO_VARIANTS } from '@kibotalk/app-shared'
import {
  VadParamsFields,
  AsrPadFields,
  MergeParamsFields,
  VadModelSelect,
  TranscribeModeSelect,
  TranscribeProviderSelect,
} from './components/ConfigFields'
import { StageShell } from './components/StageShell'

type Segment = {
  id: number
  duration: number
  buffer: Float32Array
  text?: string
  transcribing?: boolean
  sttError?: string
  sttMs?: number
}

type MergedSegment = {
  id: number
  duration: number
  buffer: Float32Array
  text?: string
  transcribing?: boolean
  sttError?: string
  sttMs?: number
  constituents: { buffer: Float32Array; duration: number }[]
}

const STATUS_VARIANT = { idle: 'secondary', speech: 'default', silence: 'outline' } as const

export default function VadPanel() {
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'idle' | 'speech' | 'silence'>('idle')
  const [segments, setSegments] = useState<Segment[]>([])
  const [mergedSegments, setMergedSegments] = useState<MergedSegment[]>([])
  const [prob, setProb] = useState(0)
  const [probHistory, setProbHistory] = useState<number[]>([])

  // Shared config (zustand). UI reads via hooks; async callbacks read
  // useConfig.getState() so they always see the latest values without refs.
  const speechThreshold = useConfig((s) => s.speechThreshold)
  const exitThreshold = useConfig((s) => s.exitThreshold)
  const minSilenceDurationMs = useConfig((s) => s.minSilenceDurationMs)
  const minSpeechDurationMs = useConfig((s) => s.minSpeechDurationMs)
  const pauseMs = useConfig((s) => s.pauseMs)
  const transcribeProvider = useConfig((s) => s.transcribeProvider)
  const transcribeMode = useConfig((s) => s.transcribeMode)
  const mergeMaxMs = useConfig((s) => s.mergeMaxMs)
  const sttProviders = useSttProviders()
  const sttProvidersRef = useRef(sttProviders)
  sttProvidersRef.current = sttProviders

  const audioRef = useRef<AudioSource | null>(null)
  const vadRef = useRef<VAD | null>(null)
  const aggregatorRef = useRef<SegmentAggregator | null>(null)
  const segIdRef = useRef(0)
  const mergedIdRef = useRef(0)
  const sampleRateRef = useRef(16000)
  const playCtxRef = useRef<AudioContext | null>(null)

  // Live-tune VAD knobs without restarting. speechPadMs is forced to 0 so VAD
  // cuts stay tight; pre/post padding is applied at ASR-send time (see padBuffer).
  useEffect(() => {
    vadRef.current?.updateConfig({
      speechThreshold,
      exitThreshold,
      minSilenceDurationMs,
      minSpeechDurationMs,
      speechPadMs: 0,
    })
  }, [speechThreshold, exitThreshold, minSilenceDurationMs, minSpeechDurationMs])

  // Live-tune the aggregator's merge/scheduling knobs.
  useEffect(() => {
    aggregatorRef.current?.updateConfig({ pauseMs, maxMs: mergeMaxMs })
  }, [pauseMs, mergeMaxMs])

  // Stop playback when the panel unmounts.
  useEffect(() => {
    return () => {
      playCtxRef.current?.close().catch(() => {})
      playCtxRef.current = null
    }
  }, [])

  function playSegment(buffer: Float32Array) {
    const sampleRate = sampleRateRef.current
    let ctx = playCtxRef.current
    if (!ctx || ctx.state === 'closed') {
      ctx = new AudioContext({ sampleRate })
      playCtxRef.current = ctx
    }
    void ctx.resume()
    const audioBuffer = ctx.createBuffer(1, buffer.length, sampleRate)
    audioBuffer.getChannelData(0).set(buffer)
    const src = ctx.createBufferSource()
    src.buffer = audioBuffer
    src.connect(ctx.destination)
    src.start()
  }

  async function transcribeSegment(id: number, buffer: Float32Array) {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, transcribing: true } : s)))
    const { prePadMs, postPadMs, transcribeProvider } = useConfig.getState()
    if (providerMode(sttProvidersRef.current, transcribeProvider) === 'realtime') {
      setSegments((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                transcribing: false,
                sttError: '实时 STT 请用「实时会话」页；本页仅支持 batch provider',
              }
            : s,
        ),
      )
      return
    }
    const padded = padBuffer(buffer, prePadMs, postPadMs, sampleRateRef.current)
    const _wav = encodeWav(padded, sampleRateRef.current)
    const startedAt = performance.now()
    try {
      const res = await fetch(
        sttUrl(transcribeProvider, useConfig.getState().conversationLang),
        { method: 'POST', body: _wav },
      )
      const json = (await res.json()) as { text?: string; error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      const sttMs = Math.round(performance.now() - startedAt)
      setSegments((prev) =>
        prev.map((s) => (s.id === id ? { ...s, text: json.text ?? '', transcribing: false, sttMs } : s)),
      )
    } catch (e) {
      const sttMs = Math.round(performance.now() - startedAt)
      setSegments((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, transcribing: false, sttError: (e as Error).message, sttMs } : s,
        ),
      )
    }
  }

  async function transcribeMerged(id: number, buffer: Float32Array) {
    setMergedSegments((prev) => prev.map((s) => (s.id === id ? { ...s, transcribing: true } : s)))
    const { transcribeProvider } = useConfig.getState()
    if (providerMode(sttProvidersRef.current, transcribeProvider) === 'realtime') {
      setMergedSegments((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                transcribing: false,
                sttError: '实时 STT 请用「实时会话」页；本页仅支持 batch provider',
              }
            : s,
        ),
      )
      return
    }
    const startedAt = performance.now()
    try {
      const wav = encodeWav(buffer, sampleRateRef.current)
      const res = await fetch(
        sttUrl(transcribeProvider, useConfig.getState().conversationLang),
        { method: 'POST', body: wav },
      )
      const json = (await res.json()) as { text?: string; error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      const sttMs = Math.round(performance.now() - startedAt)
      setMergedSegments((prev) =>
        prev.map((s) => (s.id === id ? { ...s, text: json.text ?? '', transcribing: false, sttMs } : s)),
      )
    } catch (e) {
      const sttMs = Math.round(performance.now() - startedAt)
      setMergedSegments((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, transcribing: false, sttError: (e as Error).message, sttMs } : s,
        ),
      )
    }
  }

  async function start() {
    setError('')
    setLoading('正在启动麦克风与音频处理…')
    setSegments([])
    setMergedSegments([])
    setProb(0)
    setProbHistory([])
    setStatus('idle')
    try {
      const audio = new AudioSource()
      audioRef.current = audio
      sampleRateRef.current = audio.sampleRate
      const cfg = useConfig.getState()
      const infer = await createSileroInfer(
        SILERO_VARIANTS.find((v) => v.id === cfg.vadVariantId) ?? SILERO_VARIANTS[0],
        audio.sampleRate,
      )
      const vad = createVAD(infer, { sampleRate: audio.sampleRate })
      vadRef.current = vad

      // Aggregator: same shared module the live session uses. The VAD panel has
      // no speaker verification, so every segment is fed as 'other' (the panel's
      // pause threshold is therefore `pauseMs`).
      const aggregator = createSegmentAggregator({
        sampleRate: audio.sampleRate,
        pauseMs: cfg.pauseMs,
        maxMs: cfg.mergeMaxMs,
      })
      aggregator.onFlush((merged: AggregatedSegment) => {
        const id = ++mergedIdRef.current
        const { prePadMs, postPadMs, transcribeProvider } = useConfig.getState()
        const buffer = padBuffer(merged.pcm, prePadMs, postPadMs, sampleRateRef.current)
        const duration = buffer.length / sampleRateRef.current
        const constituents = merged.segments.map((s) => ({
          buffer: s.buffer,
          duration: s.buffer.length / sampleRateRef.current,
        }))
        setMergedSegments((prev) => [...prev, { id, duration, buffer, constituents }].slice(-20))
        if (transcribeProvider !== null) void transcribeMerged(id, buffer)
      })
      aggregatorRef.current = aggregator

      vad.on('prob', (p) => {
        setProb(p)
        setProbHistory((prev) => [...prev, p].slice(-120))
      })
      vad.on('speech-start', () => setStatus('speech'))
      vad.on('speech-end', () => setStatus('silence'))
      vad.on('speech-ready', (e) => {
        const id = ++segIdRef.current
        setSegments((prev) => [...prev, { id, duration: e.duration, buffer: e.buffer }].slice(-20))
        const { transcribeMode, transcribeProvider } = useConfig.getState()
        if (transcribeMode === 'aggregated') {
          aggregator.feed({
            buffer: e.buffer,
            speaker: 'other',
            startedAt: Date.now() - e.duration * 1000,
            endedAt: Date.now(),
          })
        } else if (transcribeProvider !== null) {
          void transcribeSegment(id, e.buffer)
        }
      })
      await audio.start((chunk) => void vad.processAudio(chunk))
      setRunning(true)
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
    audioRef.current?.stop()
    audioRef.current = null
    vadRef.current = null
    setRunning(false)
    setStatus('idle')
  }

  return (
    <StageShell
      stage={
        <div className="flex h-full flex-col items-center justify-center gap-8 p-8">
          <div className="space-y-1 text-center">
            <h2 className="inline-flex items-center gap-2 text-xl font-semibold">
              <AudioLines className="size-5" />
              VAD 检测
            </h2>
            <p className="text-sm text-muted-foreground">麦克风 → Silero · 验证一句切段</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {!running ? (
              <Button size="lg" onClick={start} disabled={!!loading}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                {loading || '开始检测'}
              </Button>
            ) : (
              <Button size="lg" variant="destructive" onClick={stop}>
                <Square className="size-4" />
                停止
              </Button>
            )}
            <Badge variant={STATUS_VARIANT[status]}>
              {status === 'speech' ? '说话中' : status === 'silence' ? '静音' : '空闲'}
            </Badge>
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Mic className="size-3.5" />
              已切段 {segments.length}
            </span>
          </div>
          <div className="w-full max-w-md space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">语音概率</span>
              <span className="tabular-nums">{(prob * 100).toFixed(1)}%</span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-[width] duration-75 ${
                  prob > speechThreshold
                    ? 'bg-emerald-500'
                    : prob > speechThreshold * 0.5
                      ? 'bg-primary'
                      : 'bg-muted-foreground/30'
                }`}
                style={{ width: `${Math.min(100, prob * 100)}%` }}
              />
            </div>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
      }
      debug={
        <ScrollArea className="h-full pr-2">
          <div className="space-y-5 pb-6">
            <div className="space-y-3">
              <TranscribeProviderSelect modeFilter="batch" />
              <VadModelSelect disabled={running} />
              <TranscribeModeSelect disabled={running} />
            </div>
            <div className="space-y-2">
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Settings2 className="size-3.5" />
                参数
              </p>
              <div className="grid gap-3">
                <VadParamsFields />
                <AsrPadFields />
                <MergeParamsFields disabled={transcribeMode === 'perSegment'} />
              </div>
            </div>
            <div className="space-y-2">
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <ChartLine className="size-3.5" />
                概率曲线
              </p>
              <div className="rounded-md border bg-muted/30 p-1">
                <svg viewBox="0 0 120 40" preserveAspectRatio="none" className="h-16 w-full">
                  <line
                    x1={0} x2={120} y1={40 - speechThreshold * 40} y2={40 - speechThreshold * 40}
                    stroke="currentColor" strokeWidth={0.5} strokeDasharray="2 2" className="text-emerald-600"
                  />
                  <line
                    x1={0} x2={120} y1={40 - exitThreshold * 40} y2={40 - exitThreshold * 40}
                    stroke="currentColor" strokeWidth={0.5} strokeDasharray="2 2" className="text-destructive" opacity={0.6}
                  />
                  {probHistory.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1}
                      points={probHistory
                        .map((p, i) => `${(i / (probHistory.length - 1)) * 120},${40 - p * 40}`)
                        .join(' ')}
                    />
                  )}
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <ListTree className="size-3.5" />
                {transcribeMode === 'aggregated' ? '合并片段' : '语音片段'}
              </p>
              {transcribeMode === 'aggregated' ? (
                mergedSegments.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    停顿 {pauseMs}ms 以上会触发一次合并转写
                  </p>
                ) : (
                  <ol className="space-y-3 text-sm">
                    {[...mergedSegments].reverse().map((m) => (
                      <li key={m.id} className="space-y-2 rounded-md border p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">#{m.id}</span>
                          <span className="text-muted-foreground">{(m.duration * 1000).toFixed(0)} ms</span>
                          <span className="text-muted-foreground">{m.constituents.length} 段</span>
                          <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => playSegment(m.buffer)}>
                            播放
                          </Button>
                        </div>
                        {transcribeProvider !== null ? (
                          <div className="text-sm">
                            {m.transcribing ? (
                              <span className="text-muted-foreground">转写中…</span>
                            ) : m.sttError ? (
                              <span className="text-destructive">{m.sttError}</span>
                            ) : (
                              <span>{m.text ?? ''}</span>
                            )}
                            {m.sttMs != null && !m.transcribing ? (
                              <span className="ml-2 text-xs text-muted-foreground">{m.sttMs} ms</span>
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )
              ) : segments.length === 0 ? (
                <p className="text-sm text-muted-foreground">还没有检测到语音</p>
              ) : (
                <ol className="space-y-2 text-sm">
                  {[...segments].reverse().map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">#{s.id}</span>
                      <span>{(s.duration * 1000).toFixed(0)} ms</span>
                      <Button variant="outline" size="sm" className="h-6 px-2 text-xs" onClick={() => playSegment(s.buffer)}>
                        播放
                      </Button>
                      {transcribeProvider !== null ? (
                        <span className="w-full text-sm">
                          {s.transcribing ? (
                            <span className="text-muted-foreground">转写中…</span>
                          ) : s.sttError ? (
                            <span className="text-destructive">{s.sttError}</span>
                          ) : (
                            <span>{s.text ?? ''}</span>
                          )}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </ScrollArea>
      }
    />
  )
}
