import { Pipeline } from '@kibotalk/pipeline'
import type { CandidateStreamEvent, LlmClient } from '@kibotalk/pipeline'
import { InMemoryConversationStorage } from '@kibotalk/conversation'
import type { ConversationTurn, ReplyCandidate } from '@kibotalk/conversation'
import { StubSpeakerVerifier } from '@kibotalk/speaker'

/**
 * In-browser mock providers for the playground session simulator. T4 ships no
 * real LLM/WASM speaker — these stand in so the state machine can be driven
 * visually. Swap for real clients without touching this wiring.
 */

export class PlaygroundLlm implements LlmClient {
  async *streamCandidates(
    context: ConversationTurn[],
    _signal: AbortSignal,
  ): AsyncIterable<CandidateStreamEvent> {
    const lastOther = [...context].reverse().find((t) => t.speaker === 'other')
    const prompt = lastOther?.text ?? '(empty)'
    const candidates: ReplyCandidate[] = [
      { id: 'c0', meaning: `回复A·${prompt}`, targetText: `そうですか（A）`, reading: 'sou desu ka (A)' },
      { id: 'c1', meaning: `回复B·${prompt}`, targetText: `なるほど（B）`, reading: 'naruhodo (B)' },
      { id: 'c2', meaning: `回复C·${prompt}`, targetText: `もう一度お願いします（C）`, reading: 'mou ichido onegaai shimasu (C)' },
    ]
    for (let i = 0; i < candidates.length; i++) {
      yield { type: 'candidate-start', index: i }
      yield { type: 'candidate-done', index: i, candidate: candidates[i] }
    }
    yield { type: 'done' }
  }
}

export type SessionHandle = {
  pipeline: Pipeline
  storage: InMemoryConversationStorage
  speaker: StubSpeakerVerifier
}

export function createSession(): SessionHandle {
  const storage = new InMemoryConversationStorage()
  const llm = new PlaygroundLlm()
  const speaker = new StubSpeakerVerifier('other')
  const pipeline = new Pipeline({ llm, conversation: storage })
  return { pipeline, storage, speaker }
}
