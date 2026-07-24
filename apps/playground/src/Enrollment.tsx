import { useEffect, useRef, useState } from 'react'
import { EmbeddingSpeakerVerifier, IndexedDbEmbeddingStorage } from '@kibotalk/speaker'
import type { Speaker } from '@kibotalk/conversation'
import {
  Button,
  Progress,
  toast,
} from '@kibotalk/ui'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Fingerprint,
  Loader2,
  Mic,
  RotateCcw,
  Square,
  Trash2,
} from 'lucide-react'
import { AudioSource } from './audio/audio-source'
import { createWorkerEmbedAudio } from './audio/speaker-embed'
import { useConfig, PASSPHRASE_BY_LANG } from './config-store'
import { ThresholdSlider } from './components/ConfigFields'
import { StageShell } from './components/StageShell'

type Mode = 'enroll' | 'verify'
type WizardStep = 'intro' | 'record' | 'done'

function concatPcm(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

export default function Enrollment({
  onEnrolled,
  onGoLive,
}: {
  onEnrolled?: () => void
  onGoLive?: () => void
}) {
  const [step, setStep] = useState<WizardStep>('intro')
  const [recording, setRecording] = useState<Mode | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [enrolled, setEnrolled] = useState(false)
  const [verifyView, setVerifyView] = useState<{ speaker: Speaker; similarity: number } | null>(null)
  const speakerThreshold = useConfig((s) => s.speakerThreshold)
  const conversationLang = useConfig((s) => s.conversationLang)
  const passphrase = PASSPHRASE_BY_LANG[conversationLang]
  const verifierRef = useRef<EmbeddingSpeakerVerifier | null>(null)
  const audioRef = useRef<AudioSource | null>(null)
  const chunksRef = useRef<Float32Array[]>([])

  function verifier() {
    return (verifierRef.current ??= new EmbeddingSpeakerVerifier({
      embedAudio: createWorkerEmbedAudio(),
      storage: new IndexedDbEmbeddingStorage(),
      threshold: useConfig.getState().speakerThreshold,
    }))
  }

  function fail(message: string) {
    setError(message)
    toast.error(message)
  }

  useEffect(() => {
    void verifier()
      .loadEmbedding()
      .then((e) => {
        const ok = !!e
        setEnrolled(ok)
        if (ok) setStep('done')
      })
      .catch((e) => fail(String(e)))
    return () => {
      audioRef.current?.stop()
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    verifierRef.current?.setThreshold(speakerThreshold)
    setVerifyView((prev) =>
      prev
        ? { ...prev, speaker: prev.similarity >= speakerThreshold ? 'user' : 'other' }
        : prev,
    )
  }, [speakerThreshold])

  async function start(mode: Mode) {
    setError('')
    setVerifyView(null)
    chunksRef.current = []
    try {
      const audio = new AudioSource()
      audioRef.current = audio
      await audio.start((chunk) => chunksRef.current.push(chunk))
      setRecording(mode)
    } catch (e) {
      fail((e as Error).message)
      audioRef.current?.stop()
      audioRef.current = null
    }
  }

  async function stop() {
    const mode = recording
    if (!mode) return
    const pcm = concatPcm(chunksRef.current)
    chunksRef.current = []
    audioRef.current?.stop()
    audioRef.current = null
    setRecording(null)

    if (pcm.length === 0) {
      fail('没有录到音频，请重试')
      return
    }

    setWorking(true)
    try {
      const v = verifier()
      v.setThreshold(useConfig.getState().speakerThreshold)
      if (mode === 'enroll') {
        await v.enroll((async function* () { yield pcm.buffer as ArrayBuffer })(), passphrase)
        setVerifyView(null)
        setEnrolled(true)
        setStep('done')
        onEnrolled?.()
        toast.success('声纹已保存到本机')
      } else {
        const embedding = await v.loadEmbedding()
        if (!embedding) throw new Error('本设备尚无声纹，请先录入')
        const r = await v.verify(pcm.buffer as ArrayBuffer, embedding)
        setVerifyView({ speaker: r.speaker, similarity: r.similarity })
      }
    } catch (e) {
      fail((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  const busy = !!recording || working
  const stepIndex = step === 'intro' ? 0 : step === 'record' ? 1 : 2
  const stepLabels = ['说明', '录入', '完成'] as const

  const wizard = (
    <div className="mx-auto flex h-full max-w-lg flex-col justify-center gap-4 p-6">
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Fingerprint className="size-5" />
            声纹录入
          </h2>
          <p className="text-sm text-muted-foreground">
            登记你的声音，好让教练分清谁是你。约半分钟，仅保存在本机。
          </p>
        </div>
        <ol className="flex items-center gap-3">
          {stepLabels.map((label, i) => (
            <li key={label} className="flex min-w-0 items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span
                  className={
                    i <= stepIndex
                      ? 'flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs text-background'
                      : 'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs text-muted-foreground'
                  }
                >
                  {i + 1}
                </span>
                <span className={i === stepIndex ? 'text-sm font-medium' : 'text-sm text-muted-foreground'}>
                  {label}
                </span>
              </span>
              {i < stepLabels.length - 1 ? (
                <span className="h-px w-6 shrink-0 bg-border sm:w-10" aria-hidden />
              ) : null}
            </li>
          ))}
        </ol>

        {step === 'intro' ? (
          <div className="space-y-4">
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>朗读一段短口令（随当前对话语言）</li>
              <li>自己点结束，无需等 VAD</li>
              <li>完成后即可进入实时会话，自动区分你与对方</li>
            </ul>
            <Button className="w-full" onClick={() => setStep('record')}>
              <Mic className="size-4" />
              开始录入
            </Button>
            {enrolled ? (
              <Button variant="outline" className="w-full" onClick={() => setStep('done')}>
                <Check className="size-4" />
                已有声纹，查看完成页
              </Button>
            ) : null}
          </div>
        ) : null}

        {step === 'record' ? (
          <div className="space-y-4">
            <div className="rounded-md bg-secondary/60 p-4">
              <div className="mb-1 text-sm text-muted-foreground">请朗读：</div>
              <div className="text-xl font-semibold leading-relaxed">{passphrase}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {recording === 'enroll' ? (
                <Button variant="destructive" onClick={() => void stop()} disabled={working}>
                  <Square className="size-4" />
                  结束录音
                </Button>
              ) : (
                <Button onClick={() => void start('enroll')} disabled={busy}>
                  <Mic className="size-4" />
                  {enrolled ? '重新录制' : '开始录音'}
                </Button>
              )}
              <Button variant="ghost" onClick={() => setStep('intro')} disabled={busy}>
                <ArrowLeft className="size-4" />
                返回说明
              </Button>
            </div>
            {recording === 'enroll' ? (
              <div className="space-y-2">
                <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
                  <div className="absolute inset-y-0 w-1/3 animate-pulse rounded-full bg-primary" />
                </div>
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  录制中——朗读文案，说完点「结束录音」
                </p>
              </div>
            ) : null}
            {working ? (
              <div className="space-y-2">
                <Progress value={66} className="h-1.5" />
                <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  处理中（首次会加载模型）…
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 'done' ? (
          <div className="space-y-4">
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              {enrolled ? '本设备已登记声纹。可以开始实时会话了。' : '尚未录入。'}
            </p>
            <div className="flex flex-wrap gap-2">
              {onGoLive ? (
                <Button onClick={onGoLive} disabled={!enrolled}>
                  <ArrowRight className="size-4" />
                  进入实时会话
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={() => setStep('record')}
                disabled={busy}
              >
                <RotateCcw className="size-4" />
                重新录制
              </Button>
            </div>
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">错误：{error}</p> : null}
      </div>
    </div>
  )

  const lab = (
    <div className="space-y-4 overflow-auto p-1 pb-6">
      <div>
        <h3 className="text-sm font-semibold">实验室</h3>
        <p className="text-xs text-muted-foreground">阈值与当场校验 · 正式产品可不暴露</p>
      </div>
      <ThresholdSlider
        label="说话人阈值"
        hint="与声纹相似度高于此值判为我（默认 0.8）"
        value={speakerThreshold}
        disabled={busy}
        onChange={(v) => useConfig.getState().patch({ speakerThreshold: v })}
      />
      <div className="flex flex-wrap gap-2">
        {recording === 'verify' ? (
          <Button variant="destructive" size="sm" onClick={() => void stop()} disabled={working}>
            <Square className="size-3.5" />
            结束验证
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void start('verify')}
            disabled={busy || !enrolled}
          >
            <Mic className="size-3.5" />
            自由说话校验
          </Button>
        )}
        {enrolled ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              void new IndexedDbEmbeddingStorage().clear().then(() => {
                setEnrolled(false)
                setVerifyView(null)
                setStep('intro')
              })
            }
          >
            <Trash2 className="size-3.5" />
            清除声纹
          </Button>
        ) : null}
      </div>
      {recording === 'verify' ? (
        <p className="text-sm text-amber-800 dark:text-amber-200">
          验证中——随便说一句，说完点结束
        </p>
      ) : null}
      {verifyView ? (
        <p className={verifyView.speaker === 'user' ? 'text-sm text-emerald-700' : 'text-sm text-amber-800'}>
          判定：{verifyView.speaker === 'user' ? '匹配（我）' : '不匹配（对方）'}
          {' · '}similarity {verifyView.similarity.toFixed(3)}
          {' · '}阈值 {speakerThreshold.toFixed(2)}
        </p>
      ) : null}
    </div>
  )

  return (
    <StageShell
      stage={wizard}
      debug={lab}
      debugTitle="调试"
    />
  )
}
