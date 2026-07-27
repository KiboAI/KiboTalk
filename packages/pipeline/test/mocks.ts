import type { LlmClient, CandidateStreamEvent } from '../src/types'
import type { ConversationTurn, ReplyCandidate } from '@kibotalk/conversation'

/** A scripted mock LLM stream item. `gate` blocks the stream until the test
 * resolves it (used to hold an LLM mid-stream so a newer turn can abort it).
 * `throw` makes the stream reject. */
export type MockLlmItem = CandidateStreamEvent | { gate: string } | { throw: true }

/** A scripted mock LLM. `streamCandidates` yields the scripted events for the
 * current call. A `{ gate }` item blocks on a gate the test controls. Tracks
 * whether each call's signal was aborted when the stream ended. */
export class MockLlm implements LlmClient {
  scripts: Array<MockLlmItem[]>
  private calls = 0
  readonly receivedContexts: ConversationTurn[][] = []
  readonly abortedCalls: boolean[] = []
  private gates = new Map<string, Gate>()

  constructor(scripts: Array<MockLlmItem[]>) {
    this.scripts = scripts
  }

  /** Resolves when the stream for the current call reaches the named gate. */
  gateEntered(name: string): Promise<void> {
    return this.ensureGate(name).enteredPromise
  }

  /** Unblocks a gate so a (possibly orphaned) generator can finish. */
  resolveGate(name: string): void {
    this.gates.get(name)?.resolveBlock()
  }

  private ensureGate(name: string): Gate {
    let gate = this.gates.get(name)
    if (!gate) {
      let resolveBlock!: () => void
      let resolveEnter!: () => void
      const blockPromise = new Promise<void>((r) => {
        resolveBlock = r
      })
      const enteredPromise = new Promise<void>((r) => {
        resolveEnter = r
      })
      gate = { blockPromise, resolveBlock, enteredPromise, resolveEnter }
      this.gates.set(name, gate)
    }
    return gate
  }

  async *streamCandidates(
    context: ConversationTurn[],
    signal: AbortSignal,
  ): AsyncIterable<CandidateStreamEvent> {
    const script = this.scripts[this.calls] ?? []
    this.receivedContexts.push([...context])
    const callIndex = this.calls
    this.calls++
    for (const item of script) {
      if (signal.aborted) {
        this.abortedCalls[callIndex] = true
        return
      }
      if ('gate' in item) {
        const gate = this.ensureGate(item.gate)
        gate.resolveEnter()
        await gate.blockPromise
        if (signal.aborted) {
          this.abortedCalls[callIndex] = true
          return
        }
        continue
      }
      if ('throw' in item) {
        this.abortedCalls[callIndex] = signal.aborted
        throw new Error('mock llm failure')
      }
      yield item
    }
    this.abortedCalls[callIndex] = signal.aborted
  }

  get callCount(): number {
    return this.calls
  }
}

type Gate = {
  blockPromise: Promise<void>
  resolveBlock: () => void
  enteredPromise: Promise<void>
  resolveEnter: () => void
}

export function candidate(index: number, meaning: string, targetText: string, reading: string): CandidateStreamEvent {
  const candidate: ReplyCandidate = { id: `c${index}`, meaning, targetText, reading }
  return { type: 'candidate-done', index, candidate }
}

export function turn(
  speaker: 'user' | 'other',
  text: string,
  startedAt: number,
  endedAt = startedAt + 1000,
  interrupted = false,
  sttFailed = false,
) {
  return {
    speaker,
    text,
    startedAt,
    endedAt,
    ...(interrupted ? { interrupted } : {}),
    ...(sttFailed ? { sttFailed: true } : {}),
  }
}
