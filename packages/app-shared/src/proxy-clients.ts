import type { LlmClient, SttClient, CandidateStreamEvent } from '@kibotalk/pipeline'
import type {
  AppLanguage,
  ConversationTurn,
  LearnerLevel,
  ReplyCandidate,
} from '@kibotalk/conversation'
import { encodeWav, padBuffer } from '@kibotalk/audio'
import { parseSseStream } from './sse'
import { extractCandidates } from './partial-json'
import { sttUrl } from './stt-providers'
import { relayFetch } from './api-runtime'

/** Session snapshot of language prefs (frozen at session start). */
export type SessionLanguageSnapshot = {
  conversationLang: AppLanguage
  meaningLang: AppLanguage
  level: LearnerLevel
}

/**
 * Pipeline STT client that talks to the /stt proxy. The proxy holds the
 * provider key; the browser just ships WAV. `pcm` is the VAD-cut segment at
 * `sampleRate` (16kHz mono). Pre/post silence padding is applied here (ASR
 * preprocessing) so VAD cuts can stay tight (speechPadMs = 0).
 *
 * `isEnabled` / `getProvider` are caller-supplied so this stays agnostic of
 * where STT on/off state and provider selection live (playground's dev
 * config store vs. a product app's session state) — both wire the same
 * client through their own state.
 */
export class ProxySttClient implements SttClient {
  private prePadMs = 0
  private postPadMs = 0
  /** Session-only override (e.g. R4 degrade to batch while UI still shows realtime). */
  private providerOverride: string | null = null

  constructor(
    private sampleRate = 16000,
    private language: AppLanguage = 'ja',
    private isEnabled: () => boolean = () => true,
    private getProvider: () => string | null = () => null,
  ) {}

  configureLanguage(language: AppLanguage): void {
    this.language = language
  }

  /** Live-tune ASR-level padding without restarting the session. */
  configurePadding(prePadMs: number, postPadMs: number): void {
    this.prePadMs = prePadMs
    this.postPadMs = postPadMs
  }

  setProviderOverride(provider: string | null): void {
    this.providerOverride = provider
  }

  async transcribe(pcm: Float32Array, signal: AbortSignal): Promise<string> {
    if (!this.isEnabled()) return ''
    const provider = this.providerOverride ?? this.getProvider()
    const padded = padBuffer(pcm, this.prePadMs, this.postPadMs, this.sampleRate)
    const wav = encodeWav(padded, this.sampleRate)
    const res = await relayFetch(
      sttUrl(provider, this.language),
      { method: 'POST', body: wav, signal },
    )
    const json = (await res.json().catch(() => ({}))) as { text?: string; error?: string }
    if (!res.ok) throw new Error(json.error ?? `STT HTTP ${res.status}`)
    return json.text ?? ''
  }
}

/**
 * Pipeline LLM client that talks to the /llm SSE proxy. The proxy renders the
 * reply-suggestions prompt and streams raw LLM JSON tokens; here we incrementally
 * parse the candidate JSON array (exactly 3 objects, or []) and map each completed
 * candidate onto the pipeline's CandidateStreamEvent.
 *
 * `isEnabled` is caller-supplied (see `ProxySttClient`) so the reply-suggestion
 * on/off toggle can live wherever the host app keeps its state.
 */
export class ProxyLlmClient implements LlmClient {
  private conversationLang: AppLanguage
  private meaningLang: AppLanguage
  private level: LearnerLevel

  constructor(
    snapshot: SessionLanguageSnapshot = {
      conversationLang: 'ja',
      meaningLang: 'zh',
      level: 'beginner',
    },
    private isEnabled: () => boolean = () => true,
    private conversationSessionId?: string,
  ) {
    this.conversationLang = snapshot.conversationLang
    this.meaningLang = snapshot.meaningLang
    this.level = snapshot.level
  }

  configure(snapshot: SessionLanguageSnapshot): void {
    this.conversationLang = snapshot.conversationLang
    this.meaningLang = snapshot.meaningLang
    this.level = snapshot.level
  }

  async *streamCandidates(
    context: ConversationTurn[],
    signal: AbortSignal,
  ): AsyncIterable<CandidateStreamEvent> {
    if (!this.isEnabled()) {
      yield { type: 'done' }
      return
    }
    const res = await relayFetch('/api/llm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        context,
        level: this.level,
        conversationLang: this.conversationLang,
        meaningLang: this.meaningLang,
        sessionId: this.conversationSessionId,
      }),
      signal,
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error(`LLM HTTP ${res.status} ${txt}`)
    }

    let raw = ''
    let emitted = 0
    for await (const msg of parseSseStream(res)) {
      if (msg.event === 'error') throw new Error(msg.data)
      if (msg.event !== 'token') continue
      if (!this.isEnabled()) {
        yield { type: 'done' }
        return
      }
      raw += msg.data
      const complete = extractCandidates(raw)
      while (emitted < complete.length) {
        const c: ReplyCandidate = complete[emitted]
        const index = emitted
        yield { type: 'candidate-start', index }
        yield { type: 'candidate-delta', index, field: 'meaning', delta: c.meaning }
        yield { type: 'candidate-delta', index, field: 'targetText', delta: c.targetText }
        if (c.reading) {
          yield { type: 'candidate-delta', index, field: 'reading', delta: c.reading }
        }
        yield { type: 'candidate-done', index, candidate: c }
        emitted++
      }
    }
    yield { type: 'done' }
  }
}
