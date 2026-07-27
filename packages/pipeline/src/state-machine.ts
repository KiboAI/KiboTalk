import type {
  CandidateField,
  CandidateStreamEvent,
  FinalizedTurnInput,
  PipelineDeps,
  PipelineEvent,
  PipelineEventHandler,
  PipelineState,
} from './types'
import type { ConversationTurn, ReplyCandidate } from '@kibotalk/conversation'
import type { Span } from '@kibotalk/observability'
import {
  IOAttributes,
  IOEvents,
  IOSpanNames,
  IOSubsystems,
  getActiveTurnSpan,
  setActiveTurnSpan,
  startSpan,
} from '@kibotalk/observability'
import { envNumber } from './env'

const defaultGenerateId = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`)

/**
 * The conversation pipeline state machine (spec §2.4 rules 1–8).
 *
 * Concurrency model: `ingestFinalizedTurn` appends a pre-transcribed turn, then
 * — for a non-interrupted turn (user or other) — starts the LLM stream as a
 * DETACHED task and resolves. A subsequent turn aborts any in-flight LLM
 * (AbortController), discards its partial candidates, and proceeds. Ownership
 * tracking prevents a superseded LLM task from mutating shared state when it
 * finally returns.
 *
 * Invariants:
 * - Every finalized turn is appended (other's words are never lost).
 * - LLM is triggered after any non-interrupted turn append (including
 *   sttFailed turns — model may return []).
 * - LLM retries once on failure (1s backoff), then surfaces a user-visible
 *   state without killing the session.
 * - Partial candidates never enter the next LLM's context — context is the
 *   completed turns from `conversation.loadActiveSession()`.
 *
 * Callers MUST await `ingestFinalizedTurn` before feeding the next turn
 * (TurnGate emits segments sequentially; tests control timing).
 */
export class Pipeline {
  private state: PipelineState = 'IDLE'
  private handlers = new Set<PipelineEventHandler>()
  private llm: NonNullable<PipelineDeps['llm']>
  private conversation: NonNullable<PipelineDeps['conversation']>
  private config: Required<import('./types').PipelineConfig>
  private generateId: () => string
  private sleep: (ms: number) => Promise<void>
  private currentLlm: { abort: AbortController; turnId: string; span?: Span } | null = null
  private turnSpans = new Map<string, Span>()

  constructor(deps: PipelineDeps) {
    this.llm = deps.llm
    this.conversation = deps.conversation
    const cfg = deps.config ?? {}
    this.config = {
      vadOtherPauseMs: cfg.vadOtherPauseMs ?? envNumber('VAD_OTHER_PAUSE_MS', 1000),
      vadUserPauseMs: cfg.vadUserPauseMs ?? envNumber('VAD_USER_PAUSE_MS', 1000),
      llmRetryBackoffMs: cfg.llmRetryBackoffMs ?? 1000,
    }
    this.generateId = deps.generateId ?? defaultGenerateId
    this.sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  }

  on(handler: PipelineEventHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  getState(): PipelineState {
    return this.state
  }

  /** Resolves once the pipeline is IDLE with no detached LLM running. */
  idle(): Promise<void> {
    if (this.state === 'IDLE' && this.currentLlm === null) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const off = this.on((e) => {
        if (e.type === 'state' && e.state === 'IDLE' && this.currentLlm === null) {
          off()
          resolve()
        }
      })
    })
  }

  /** Append a pre-transcribed turn (realtime STT `completed`). */
  async ingestFinalizedTurn(input: FinalizedTurnInput): Promise<void> {
    this.abortInFlightLlm()
    this.setState(input.speaker === 'other' ? 'OTHER_SPEAKING' : 'USER_SPEAKING')

    const turnId = this.generateId()
    const turnSpan = startSpan(IOSpanNames.InteractionTurn, {
      attrs: {
        [IOAttributes.TurnId]: turnId,
        ...(input.text ? { [IOAttributes.ASRText]: input.text } : {}),
      },
    })
    this.turnSpans.set(turnId, turnSpan)
    setActiveTurnSpan(turnSpan)

    const sttFailed = input.sttFailed === true
    await this.commitTurn({
      turnId,
      speaker: input.speaker,
      text: sttFailed ? '' : input.text,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      sttFailed,
      interrupted: input.interrupted,
      turnSpan,
    })
  }

  private abortInFlightLlm(): void {
    if (!this.currentLlm) return
    const aborted = this.currentLlm
    aborted.abort.abort()
    this.currentLlm = null
    aborted.span?.setAttribute(IOAttributes.ASRAbort, true)
    aborted.span?.end()
    const turnSpan = this.turnSpans.get(aborted.turnId)
    turnSpan?.end()
    this.turnSpans.delete(aborted.turnId)
    if (getActiveTurnSpan() === turnSpan) setActiveTurnSpan(undefined)
    this.emit({ type: 'llmAborted', turnId: aborted.turnId })
  }

  private async commitTurn(args: {
    turnId: string
    speaker: 'user' | 'other'
    text: string
    startedAt: number
    endedAt: number
    sttFailed: boolean
    interrupted?: boolean
    turnSpan: Span
  }): Promise<void> {
    const turn: ConversationTurn = {
      id: args.turnId,
      speaker: args.speaker,
      text: args.text,
      startedAt: args.startedAt,
      endedAt: args.endedAt,
      ...(args.sttFailed ? { sttFailed: true } : {}),
    }
    if (args.text) {
      args.turnSpan.setAttribute(IOAttributes.ASRText, args.text)
    }
    await this.conversation.appendTurn(turn)
    this.emit({ type: 'turnAppended', turn })

    if (args.sttFailed) {
      this.emit({ type: 'sttFailed', turnId: args.turnId })
    }

    if (!args.interrupted) {
      void this.runLlm(args.turnId, args.turnSpan).catch(() => {})
    } else {
      args.turnSpan.end()
      this.turnSpans.delete(args.turnId)
      if (getActiveTurnSpan() === args.turnSpan) setActiveTurnSpan(undefined)
      this.setState('IDLE')
    }
  }

  private async runLlm(turnId: string, turnSpan: Span): Promise<void> {
    const context = (await this.conversation.loadActiveSession()) ?? []
    const controller = new AbortController()
    const llmSpan = startSpan(IOSpanNames.LLMInference, {
      parent: turnSpan,
      attrs: {
        [IOAttributes.Subsystem]: IOSubsystems.LLM,
        [IOAttributes.TurnId]: turnId,
      },
    })
    this.currentLlm = { abort: controller, turnId, span: llmSpan }
    this.setState('LLM_STREAMING')
    this.emit({ type: 'candidatesStreaming', turnId })

    const candidates: ReplyCandidate[] = []
    const partials: Map<number, Partial<Record<CandidateField, string>>> = new Map()
    let firstTokenMarked = false
    const llmStart = performance.now()

    const streamOnce = async (): Promise<'done' | 'aborted' | 'failed'> => {
      try {
        for await (const ev of this.llm.streamCandidates(context, controller.signal)) {
          if (controller.signal.aborted) return 'aborted'
          if (!firstTokenMarked && ev.type === 'candidate-delta') {
            firstTokenMarked = true
            const ttftMs = performance.now() - llmStart
            llmSpan.addEvent(IOEvents.LLMFirstToken, {
              [IOAttributes.LLM_TTFT]: ttftMs,
            })
            llmSpan.setAttribute(IOAttributes.LLM_TTFT, ttftMs)
          }
          this.handleStreamEvent(ev, turnId, candidates, partials)
          if (ev.type === 'done') break
        }
        return controller.signal.aborted ? 'aborted' : 'done'
      } catch {
        if (controller.signal.aborted) return 'aborted'
        return 'failed'
      }
    }

    let outcome = await streamOnce()
    if (outcome === 'failed') {
      // Rule 7: retry once.
      candidates.length = 0
      partials.clear()
      firstTokenMarked = false
      await this.sleep(this.config.llmRetryBackoffMs)
      this.emit({ type: 'candidatesStreaming', turnId })
      outcome = await streamOnce()
    }

    // Only the current owner may mutate shared state; a superseding turn
    // already aborted this task and emitted llmAborted.
    if (this.currentLlm?.abort !== controller) return

    this.currentLlm = null
    if (outcome === 'done') {
      llmSpan.setAttribute(IOAttributes.LLMTextLength, candidates.length)
      llmSpan.end()
      turnSpan.end()
      this.turnSpans.delete(turnId)
      if (getActiveTurnSpan() === turnSpan) setActiveTurnSpan(undefined)
      this.emit({ type: 'candidatesDone', turnId, candidates })
      this.setState('IDLE')
    } else if (outcome === 'failed') {
      llmSpan.end()
      turnSpan.end()
      this.turnSpans.delete(turnId)
      if (getActiveTurnSpan() === turnSpan) setActiveTurnSpan(undefined)
      this.emit({ type: 'llmFailed', turnId })
      this.setState('IDLE')
    }
    // outcome === 'aborted': partials already discarded by the superseding
    // turn; emit nothing here (abortInFlightLlm already ended spans).
  }

  private handleStreamEvent(
    ev: CandidateStreamEvent,
    turnId: string,
    candidates: ReplyCandidate[],
    partials: Map<number, Partial<Record<CandidateField, string>>>,
  ): void {
    switch (ev.type) {
      case 'candidate-start':
        partials.set(ev.index, {})
        return
      case 'candidate-delta': {
        const slot = partials.get(ev.index) ?? {}
        slot[ev.field] = (slot[ev.field] ?? '') + ev.delta
        partials.set(ev.index, slot)
        this.emit({ type: 'candidateDelta', turnId, index: ev.index, field: ev.field, delta: ev.delta })
        return
      }
      case 'candidate-done':
        partials.delete(ev.index)
        candidates.push(ev.candidate)
        return
      case 'done':
        return
      default: {
        const _exhaustive: never = ev
        void _exhaustive
        return
      }
    }
  }

  private setState(state: PipelineState): void {
    if (this.state === state) return
    this.state = state
    this.emit({ type: 'state', state })
  }

  private emit(event: PipelineEvent): void {
    for (const handler of this.handlers) handler(event)
  }
}
