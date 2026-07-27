import type { LlmClient, CandidateStreamEvent } from '@kibotalk/pipeline'
import type {
  AppLanguage,
  ConversationTurn,
  LearnerLevel,
  ReplyCandidate,
} from '@kibotalk/conversation'
import { parseSseStream } from './sse'
import { extractCandidates } from './partial-json'
import { relayFetch } from './api-runtime'

/** Session snapshot of language prefs (frozen at session start). */
export type SessionLanguageSnapshot = {
  conversationLang: AppLanguage
  meaningLang: AppLanguage
  level: LearnerLevel
}

/**
 * Pipeline LLM client that talks to the /llm SSE proxy. The proxy renders the
 * reply-suggestions prompt and streams raw LLM JSON tokens; here we incrementally
 * parse the candidate JSON array (exactly 3 objects, or []) and map each completed
 * candidate onto the pipeline's CandidateStreamEvent.
 *
 * `isEnabled` is caller-supplied so the reply-suggestion on/off toggle can live
 * wherever the host app keeps its state.
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
