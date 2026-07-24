import { useEffect, useRef, useState } from 'react'
import { EmbeddingSpeakerVerifier, IndexedDbEmbeddingStorage } from '@kibotalk/speaker'
import type { Speaker } from '@kibotalk/conversation'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@kibotalk/ui'
import { AudioSource } from './audio/audio-source'
import { createWorkerEmbedAudio } from './audio/speaker-embed'
import { useConfig, PASSPHRASE_BY_LANG } from './config-store'
import { NumberField } from './components/ConfigFields'

type Mode = 'enroll' | 'verify'

function concatPcm(chunks: Float32Array[]): Float32Array {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

export default function Enrollment() {
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

  useEffect(() => {
    void verifier()
      .loadEmbedding()
      .then((e) => setEnrolled(!!e))
      .catch((e) => setError(String(e)))
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
      setError((e as Error).message)
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
      setError('没有录到音频，请重试')
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
      } else {
        const embedding = await v.loadEmbedding()
        if (!embedding) throw new Error('本设备尚无声纹，请先录入')
        const r = await v.verify(pcm.buffer as ArrayBuffer, embedding)
        setVerifyView({ speaker: r.speaker, similarity: r.similarity })
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setWorking(false)
    }
  }

  const busy = !!recording || working

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>声纹录入</CardTitle>
        <CardDescription>
          点开始后朗读，自己点结束完成（仅本机，无 VAD）。录入后可验证；实时会话会自动区分你与对方。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-muted/60 p-4">
          <div className="text-sm text-muted-foreground mb-1">固定文案（录入用，随顶部对话语言）：</div>
          <div className="text-xl font-semibold">{passphrase}</div>
        </div>

        <div className="flex flex-wrap gap-2">
          {recording ? (
            <Button variant="destructive" onClick={() => void stop()} disabled={working}>
              结束
            </Button>
          ) : (
            <>
              <Button onClick={() => void start('enroll')} disabled={busy}>
                {enrolled ? '重新录制' : '开始录入'}
              </Button>
              {enrolled && (
                <>
                  <Button variant="secondary" onClick={() => void start('verify')} disabled={busy}>
                    开始验证
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void new IndexedDbEmbeddingStorage().clear().then(() => {
                        setEnrolled(false)
                        setVerifyView(null)
                      })
                    }
                  >
                    清除声纹
                  </Button>
                </>
              )}
            </>
          )}
        </div>

        {enrolled && (
          <NumberField
            label="说话人阈值（0.8）"
            value={speakerThreshold}
            step={0.05}
            min={0}
            max={1}
            disabled={busy}
            onChange={(v) => useConfig.getState().patch({ speakerThreshold: v })}
          />
        )}

        <div className="space-y-1 text-sm">
          {recording === 'enroll' && (
            <p className="text-amber-600">录制中——朗读文案，说完点「结束」</p>
          )}
          {recording === 'verify' && (
            <p className="text-amber-600">验证中——随便说一句，说完点「结束」</p>
          )}
          {working && <p className="text-muted-foreground">处理中（首次会加载 wavlm）…</p>}
          {enrolled && !busy && !verifyView && (
            <p className="text-emerald-600">本设备已有声纹。</p>
          )}
          {verifyView && (
            <p className={verifyView.speaker === 'user' ? 'text-emerald-600' : 'text-amber-700'}>
              判定：{verifyView.speaker === 'user' ? '匹配（我）' : '不匹配（对方）'}
              {' · '}similarity {verifyView.similarity.toFixed(3)}
              {' · '}阈值 {speakerThreshold.toFixed(2)}
              <span className="text-muted-foreground">（改阈值立刻重判）</span>
            </p>
          )}
          {error && <p className="text-destructive">错误：{error}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
