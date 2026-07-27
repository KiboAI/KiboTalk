import { useRef, useState } from 'react'
import type { ConversationTurn, ReplyCandidate } from '@kibotalk/conversation'
import {
  Button,
  ScrollArea,
  StickyNoteCard,
  StickyNoteCardPlaceholder,
  Textarea,
  toast,
} from '@kibotalk/ui'
import { Cable, Loader2, Sparkles, StopCircle } from 'lucide-react'
import { extractCandidates, parseSseStream } from '@kibotalk/app-shared'
import { readLanguageSnapshot, useConfig } from './config-store'
import { WindowRoundCard, WindowRoundPlaceholder } from './components/WindowRoundCard'
import { StageShell } from './components/StageShell'

type CandidateState = ReplyCandidate[]

type LlmRunStatus = 'idle' | 'waiting' | 'generating' | 'done' | 'aborted'

type LlmMetrics = {
  status: LlmRunStatus
  ttftMs: number | null
  genMs: number | null
  totalMs: number | null
  charCount: number
  charsPerSec: number | null
}

function formatMs(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function formatRate(rate: number | null): string {
  if (rate == null) return '—'
  return `${rate.toFixed(1)} chars/s`
}

function formatStreamBuffer(raw: string): { label: string; text: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { label: '（空）', text: '' }
  try {
    return { label: '完整 JSON', text: JSON.stringify(JSON.parse(trimmed), null, 2) }
  } catch {
    const tail = trimmed.length > 800 ? trimmed.slice(-800) : trimmed
    return {
      label: trimmed.length > 800 ? '缓冲中（尾部）' : '缓冲中',
      text: tail,
    }
  }
}

const STATUS_LABEL: Record<LlmRunStatus, string> = {
  idle: '空闲',
  waiting: '等待首 token…',
  generating: '生成中',
  done: '完成',
  aborted: '已中止',
}

export default function DirectApi() {
  const productSurfaceMode = useConfig((s) => s.productSurfaceMode)

  const [contextText, setContextText] = useState(
    'other: 本日はお忙しい中お越しいただきありがとうございます。まずは簡単に自己紹介をお願いします。\nuser: 〇〇大学で情報工学を専攻しております、田中と申します。\nother: では、数ある企業の中で、なぜ弊社を志望されたのでしょうか。',
  )
  const [candidates, setCandidates] = useState<CandidateState>([])
  const [raw, setRaw] = useState('')
  const [prompt, setPrompt] = useState('')
  const [llmError, setLlmError] = useState('')
  const [busy, setBusy] = useState(false)
  const [metrics, setMetrics] = useState<LlmMetrics>({
    status: 'idle',
    ttftMs: null,
    genMs: null,
    totalMs: null,
    charCount: 0,
    charsPerSec: null,
  })
  const [tokenBatches, setTokenBatches] = useState<Array<{ atMs: number; chars: number }>>([])
  const abortRef = useRef<AbortController | null>(null)
  const batchRef = useRef({ chars: 0, lastFlush: 0 })

  function failLlm(message: string) {
    setLlmError(message)
    toast.error(message)
  }

  function parseContext(text: string): ConversationTurn[] {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => {
        const m = line.match(/^(user|other)\s*:\s*(.*)$/i)
        const speaker = m ? (m[1].toLowerCase() as 'user' | 'other') : 'other'
        const t = m ? m[2] : line
        return { id: `t${i}`, speaker, text: t, startedAt: i, endedAt: i + 1 }
      })
  }

  async function generate() {
    setBusy(true)
    setLlmError('')
    setRaw('')
    setPrompt('')
    setCandidates([])
    setTokenBatches([])
    batchRef.current = { chars: 0, lastFlush: 0 }
    const t0 = performance.now()
    let firstTokenAt: number | null = null
    setMetrics({
      status: 'waiting',
      ttftMs: null,
      genMs: null,
      totalMs: null,
      charCount: 0,
      charsPerSec: null,
    })
    const controller = new AbortController()
    abortRef.current = controller
    let rawAccum = ''
    try {
      const snap = readLanguageSnapshot()
      const res = await fetch('/llm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          context: parseContext(contextText),
          level: snap.level,
          conversationLang: snap.conversationLang,
          meaningLang: snap.meaningLang,
        }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status} ${txt}`)
      }
      for await (const msg of parseSseStream(res)) {
        if (msg.event === 'error') {
          failLlm(msg.data)
          continue
        }
        if (msg.event === 'prompt') {
          setPrompt(msg.data)
          continue
        }
        if (msg.event !== 'token') continue

        const now = performance.now()
        if (firstTokenAt == null) {
          firstTokenAt = now
          setMetrics((m) => ({ ...m, status: 'generating', ttftMs: now - t0 }))
        }

        rawAccum += msg.data
        const next = rawAccum
        setRaw(next)
        setCandidates((cur) => {
          const parsed = extractCandidates(next)
          return parsed.length > cur.length ? parsed : cur
        })
        const elapsedGen = firstTokenAt != null ? now - firstTokenAt : 0
        setMetrics((m) => ({
          ...m,
          charCount: next.length,
          genMs: elapsedGen,
          totalMs: now - t0,
          charsPerSec: elapsedGen > 0 ? (next.length / elapsedGen) * 1000 : null,
        }))

        batchRef.current.chars += msg.data.length
        if (now - batchRef.current.lastFlush >= 100 && batchRef.current.chars > 0) {
          const chars = batchRef.current.chars
          batchRef.current = { chars: 0, lastFlush: now }
          setTokenBatches((prev) => [...prev, { atMs: now - t0, chars }])
        }
      }
      if (batchRef.current.chars > 0) {
        const now = performance.now()
        setTokenBatches((prev) => [...prev, { atMs: now - t0, chars: batchRef.current.chars }])
        batchRef.current = { chars: 0, lastFlush: now }
      }
      const tEnd = performance.now()
      setMetrics({
        status: 'done',
        ttftMs: firstTokenAt != null ? firstTokenAt - t0 : null,
        totalMs: tEnd - t0,
        genMs: firstTokenAt != null ? tEnd - firstTokenAt : null,
        charCount: rawAccum.length,
        charsPerSec:
          firstTokenAt != null && tEnd > firstTokenAt
            ? (rawAccum.length / (tEnd - firstTokenAt)) * 1000
            : null,
      })
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        const tEnd = performance.now()
        setMetrics((m) => ({
          ...m,
          status: 'aborted',
          totalMs: tEnd - t0,
          genMs: firstTokenAt != null ? tEnd - firstTokenAt : m.genMs,
        }))
      } else {
        failLlm((e as Error).message)
        setMetrics((m) => ({ ...m, status: 'idle' }))
      }
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const streamView = formatStreamBuffer(raw)

  const replyPreview =
    candidates.length > 0 ? (
      productSurfaceMode === 'floating' ? (
        <StickyNoteCard candidates={candidates} />
      ) : (
        <WindowRoundCard candidates={candidates} label="本轮建议" />
      )
    ) : busy ? (
      productSurfaceMode === 'floating' ? (
        <StickyNoteCardPlaceholder label="正在流式生成…" />
      ) : (
        <WindowRoundPlaceholder label="正在流式生成…" />
      )
    ) : productSurfaceMode === 'floating' ? (
      <StickyNoteCardPlaceholder label="（还没有候选）" />
    ) : (
      <WindowRoundPlaceholder label="（还没有候选）" />
    )

  return (
    <StageShell
      stage={
        <div className="flex h-full min-h-0 flex-col gap-4 p-5">
          <div className="space-y-1">
            <h2 className="inline-flex items-center gap-2 text-lg font-semibold">
              <Cable className="size-4" />
              回复预览
            </h2>
            <p className="text-xs text-muted-foreground">
              用户侧看到的回复预览 · 旁栏调试代理调用
            </p>
          </div>
          <Textarea
            value={contextText}
            onChange={(e) => setContextText(e.target.value)}
            rows={4}
            className="min-h-[6rem]"
          />
          <div className="flex gap-2">
            <Button onClick={() => void generate()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              生成
            </Button>
            <Button
              variant="outline"
              onClick={() => abortRef.current?.abort()}
              disabled={!busy}
            >
              <StopCircle className="size-4" />
              中止
            </Button>
          </div>
          {llmError ? <p className="text-sm text-destructive">{llmError}</p> : null}
          <div className="flex flex-1 items-start justify-center overflow-auto py-4">
            {replyPreview}
          </div>
        </div>
      }
      debug={
        <ScrollArea className="h-full pr-2">
          <div className="space-y-5 pb-6">
            {metrics.status !== 'idle' ? (
              <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 p-2 text-[11px]">
                <div>
                  <div className="text-muted-foreground">状态</div>
                  <div className="font-medium">{STATUS_LABEL[metrics.status]}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">TTFT</div>
                  <div className="font-medium tabular-nums">{formatMs(metrics.ttftMs)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">生成</div>
                  <div className="font-medium tabular-nums">{formatMs(metrics.genMs)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">总耗时</div>
                  <div className="font-medium tabular-nums">{formatMs(metrics.totalMs)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">字符</div>
                  <div className="font-medium tabular-nums">{metrics.charCount}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">速率</div>
                  <div className="font-medium tabular-nums">{formatRate(metrics.charsPerSec)}</div>
                </div>
              </div>
            ) : null}

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">prompt</p>
              {prompt ? (
                <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-[11px] whitespace-pre-wrap">
{prompt}
                </pre>
              ) : (
                <p className="text-[11px] text-muted-foreground">生成后显示</p>
              )}
            </div>

            {raw ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">输出流 · {streamView.label}</p>
                <pre className="max-h-48 overflow-auto rounded-md bg-muted p-2 text-[11px]">
{streamView.text}
                </pre>
              </div>
            ) : null}

            {tokenBatches.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  token 批次（{tokenBatches.length}）
                </p>
                <ul className="max-h-32 overflow-auto text-[11px] text-muted-foreground">
                  {tokenBatches.map((b, i) => (
                    <li key={i}>
                      +{formatMs(b.atMs)} · {b.chars} chars
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </ScrollArea>
      }
    />
  )
}
