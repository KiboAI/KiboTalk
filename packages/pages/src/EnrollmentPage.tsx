import { useEffect, useRef, useState } from 'react'
import { EmbeddingSpeakerVerifier, IndexedDbEmbeddingStorage } from '@kibotalk/speaker'
import type { AppLanguage } from '@kibotalk/conversation'
import { AudioSource, createWorkerEmbedAudio, PASSPHRASE_BY_LANG, defaultAppConfig } from '@kibotalk/app-shared'
import { Button, LevelMeter, StepIndicator, toast, WizardScreen } from '@kibotalk/ui'
import { ArrowRight, Loader2, Mic, RotateCcw, Square } from 'lucide-react'

type WizardStep = 'intro' | 'record' | 'done'

const STEPS = [{ label: '说明' }, { label: '录入' }, { label: '完成' }]

function concatPcm(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

/** RMS mapped through a sqrt curve so typical speech (quiet in raw RMS terms) still visibly moves the meter. */
function levelFromChunk(chunk: Float32Array): number {
  let sumSquares = 0
  for (const sample of chunk) sumSquares += sample * sample
  const rms = Math.sqrt(sumSquares / chunk.length)
  return Math.min(1, Math.sqrt(rms) * 2.2)
}

export type EnrollmentPageProps = {
  conversationLang: AppLanguage
  /** Whether a voiceprint is already saved on this device (skips straight to "done"). */
  enrolled: boolean
  onEnrolled: () => void
  onEnterSession: () => void
  /** Desktop's standalone onboarding window — see `WizardScreen`. */
  embedded?: boolean
  /**
   * Whether the speaker-embedding model has finished downloading — `apps/web`
   * gates entering the record step on this (see `startModelPreload`).
   * Defaults to `true` (desktop bundles the model, so it's always ready).
   */
  recordReady?: boolean
  /** Override the done-step primary button label (default: 进入会话). */
  enterSessionLabel?: string
  /** Start on this step instead of inferring from `enrolled`. */
  initialStep?: WizardStep
}

/**
 * Voiceprint enrollment wizard: read a short passphrase once, save the
 * embedding locally. Three real states of `WizardStep` — intro → record →
 * done — no dev-only threshold tuning or free-speech verify (see
 * `apps/playground/src/Enrollment.tsx`'s "实验室" panel for that).
 */
export function EnrollmentPage({
  conversationLang,
  enrolled,
  onEnrolled,
  onEnterSession,
  embedded,
  recordReady = true,
  enterSessionLabel = '进入会话',
  initialStep,
}: EnrollmentPageProps) {
  const [step, setStep] = useState<WizardStep>(initialStep ?? (enrolled ? 'done' : 'intro'))
  const [starting, setStarting] = useState(false)
  const [recording, setRecording] = useState(false)
  const [working, setWorking] = useState(false)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState('')
  const passphrase = PASSPHRASE_BY_LANG[conversationLang]
  const verifierRef = useRef<EmbeddingSpeakerVerifier | null>(null)
  const audioRef = useRef<AudioSource | null>(null)
  const chunksRef = useRef<Float32Array[]>([])

  function verifier() {
    return (verifierRef.current ??= new EmbeddingSpeakerVerifier({
      embedAudio: createWorkerEmbedAudio(),
      storage: new IndexedDbEmbeddingStorage(),
      threshold: defaultAppConfig.speakerThreshold,
    }))
  }

  function fail(message: string) {
    setError(message)
    toast.error(message)
  }

  useEffect(() => {
    return () => {
      audioRef.current?.stop()
      audioRef.current = null
    }
  }, [])

  /** Advances to the record step and starts capturing in one action — no separate "start" click once the passphrase is on screen. */
  async function beginRecording() {
    setStep('record')
    setError('')
    setStarting(true)
    chunksRef.current = []
    try {
      const audio = new AudioSource()
      audioRef.current = audio
      await audio.start((chunk) => {
        chunksRef.current.push(chunk)
        setLevel(levelFromChunk(chunk))
      })
      setRecording(true)
    } catch (e) {
      fail((e as Error).message)
      audioRef.current?.stop()
      audioRef.current = null
    } finally {
      setStarting(false)
    }
  }

  async function stopRecording() {
    if (!recording) return
    const pcm = concatPcm(chunksRef.current)
    chunksRef.current = []
    audioRef.current?.stop()
    audioRef.current = null
    setRecording(false)
    setLevel(0)

    if (pcm.length === 0) {
      fail('没有录到音频，请重试')
      return
    }

    setWorking(true)
    try {
      await verifier().enroll((async function* () {
        yield pcm.buffer as ArrayBuffer
      })(), passphrase)
      setEnrolledDone()
      toast.success('声纹已保存到本机')
    } catch (e) {
      fail((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  function setEnrolledDone() {
    setStep('done')
    onEnrolled()
  }

  const busy = starting || recording || working
  const stepIndex = step === 'intro' ? 0 : step === 'record' ? 1 : 2

  return (
    <WizardScreen embedded={embedded} className="space-y-5 p-7">
      <StepIndicator steps={STEPS} current={stepIndex} />

      {step === 'intro' ? (
        <div className="space-y-5">
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold">录一下声音</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              读一段短口令，让教练分清哪句是你说的。大约 15 秒，只保存在这台设备上。
            </p>
          </div>
          <Button className="w-full" size="lg" onClick={() => void beginRecording()} disabled={!recordReady}>
            {recordReady ? <Mic className="size-4" /> : <Loader2 className="size-4 animate-spin" />}
            {recordReady ? '开始录音' : '模型下载中…'}
          </Button>
        </div>
      ) : null}

      {step === 'record' ? (
        <div className="space-y-4">
          <div className="rounded-md bg-foreground/6 p-4">
            <div className="mb-1.5 text-xs text-muted-foreground">请朗读：</div>
            <div className="text-lg font-bold leading-relaxed">{passphrase}</div>
          </div>

          {recording ? (
            <>
              <LevelMeter level={level} />
              <Button className="w-full" variant="destructive" onClick={() => void stopRecording()} disabled={working}>
                <Square className="size-4" />
                结束录音
              </Button>
            </>
          ) : error ? (
            <Button className="w-full" onClick={() => void beginRecording()} disabled={!recordReady}>
              <Mic className="size-4" />
              重试录音
            </Button>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              {starting ? '正在准备麦克风…' : '处理中…'}
            </p>
          )}
        </div>
      ) : null}

      {step === 'done' ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold">声纹已保存</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              这台设备已经能认出你的声音了，可以开始真实会话，教练会自动分清谁在说话。
            </p>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" size="lg" onClick={onEnterSession}>
              <ArrowRight className="size-4" />
              {enterSessionLabel}
            </Button>
            <Button className="flex-1" variant="soft" size="lg" onClick={() => void beginRecording()} disabled={busy}>
              <RotateCcw className="size-4" />
              重新录制
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">错误：{error}</p> : null}
    </WizardScreen>
  )
}
