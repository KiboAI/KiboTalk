import { describe, it, expect } from 'vitest'
import { Pipeline } from '../src/state-machine'
import type { PipelineEvent } from '../src/types'
import { InMemoryConversationStorage } from '@kibotalk/conversation'
import { MockLlm, candidate, turn } from './mocks'

function recordEvents(pipeline: Pipeline, want: PipelineEvent['type'][] = []) {
  const events: PipelineEvent[] = []
  pipeline.on((e) => {
    if (want.length === 0 || want.includes(e.type)) events.push(e)
  })
  return events
}

const noSleep = async () => {}

describe('Pipeline state machine — spec §2.4 rules 1–8', () => {
  it('rule 1: other turn → append other turn → stream candidates', async () => {
    const llm = new MockLlm([
      [
        { type: 'candidate-start', index: 0 },
        candidate(0, '你好', 'こんにちは', 'konnichiwa'),
        { type: 'candidate-start', index: 1 },
        candidate(1, '您好', 'こんにちは', 'konnichiwa'),
        { type: 'candidate-start', index: 2 },
        candidate(2, '哈喽', 'こんにちは', 'konnichiwa'),
        { type: 'done' },
      ],
    ])
    const conversation = new InMemoryConversationStorage()
    const pipeline = new Pipeline({ llm, conversation, sleep: noSleep })
    const events = recordEvents(pipeline, ['turnAppended', 'candidatesDone', 'state'])

    await pipeline.ingestFinalizedTurn(turn('other', 'こんにちは', 1000))
    await pipeline.idle()

    const turns = await conversation.loadActiveSession()
    expect(turns).toHaveLength(1)
    expect(turns![0]).toMatchObject({ speaker: 'other', text: 'こんにちは' })
    expect(events).toContainEqual({ type: 'turnAppended', turn: turns![0] })
    const done = events.find((e) => e.type === 'candidatesDone')!
    expect(done.type).toBe('candidatesDone')
    if (done.type === 'candidatesDone') expect(done.candidates).toHaveLength(3)
    expect(pipeline.getState()).toBe('IDLE')
  })

  it('rule 2: interruption — new other turn aborts in-flight LLM and discards partials', async () => {
    const llm = new MockLlm([
      // first LLM: emits one candidate then blocks on a gate (mid-stream)
      [
        { type: 'candidate-start', index: 0 },
        candidate(0, '一', '一', 'ichi'),
        { gate: 'block' },
      ],
      // second LLM (after interruption)
      [
        { type: 'candidate-start', index: 0 },
        candidate(0, '二', '二', 'ni'),
        { type: 'done' },
      ],
    ])
    const conversation = new InMemoryConversationStorage()
    const pipeline = new Pipeline({ llm, conversation, sleep: noSleep })
    const events = recordEvents(pipeline, ['candidatesDone', 'llmAborted', 'candidateDelta'])

    await pipeline.ingestFinalizedTurn(turn('other', 'first', 1000))
    await llm.gateEntered('block')
    await pipeline.ingestFinalizedTurn(turn('other', 'second', 3000))
    await pipeline.idle()
    llm.resolveGate('block')
    await new Promise((r) => setTimeout(r, 0))

    expect(events.some((e) => e.type === 'llmAborted')).toBe(true)
    expect(llm.abortedCalls[0]).toBe(true)
    const done = events.filter((e) => e.type === 'candidatesDone')
    expect(done).toHaveLength(1)
    if (done[0].type === 'candidatesDone') {
      expect(done[0].candidates).toHaveLength(1)
      expect(done[0].candidates[0].meaning).toBe('二')
    }
    const turns = await conversation.loadActiveSession()
    expect(turns).toHaveLength(2)
  })

  it('rule 3: multi-turn no user — each other turn triggers a fresh LLM', async () => {
    const llm = new MockLlm([
      [{ type: 'candidate-done', index: 0, candidate: { id: 'c0', meaning: 'a', targetText: 'a', reading: 'a' } }, { type: 'done' }],
      [{ type: 'candidate-done', index: 0, candidate: { id: 'c0', meaning: 'b', targetText: 'b', reading: 'b' } }, { type: 'done' }],
      [{ type: 'candidate-done', index: 0, candidate: { id: 'c0', meaning: 'c', targetText: 'c', reading: 'c' } }, { type: 'done' }],
    ])
    const conversation = new InMemoryConversationStorage()
    const pipeline = new Pipeline({ llm, conversation, sleep: noSleep })

    await pipeline.ingestFinalizedTurn(turn('other', 'a', 1000))
    await pipeline.ingestFinalizedTurn(turn('other', 'b', 3000))
    await pipeline.ingestFinalizedTurn(turn('other', 'c', 5000))
    await pipeline.idle()

    expect(llm.callCount).toBe(3)
    const turns = await conversation.loadActiveSession()
    expect(turns!.map((t) => t.text)).toEqual(['a', 'b', 'c'])
  })

  it('rule 4: interrupted partials do not enter next LLM context', async () => {
    const llm = new MockLlm([
      [{ type: 'candidate-start', index: 0 }, candidate(0, 'partial', 'p', 'p'), { gate: 'block' }],
      [{ type: 'candidate-start', index: 0 }, candidate(0, 'full', 'f', 'f'), { type: 'done' }],
    ])
    const conversation = new InMemoryConversationStorage()
    const pipeline = new Pipeline({ llm, conversation, sleep: noSleep })

    await pipeline.ingestFinalizedTurn(turn('other', 'first', 1000))
    await llm.gateEntered('block')
    await pipeline.ingestFinalizedTurn(turn('other', 'second', 3000))
    await pipeline.idle()
    llm.resolveGate('block')

    const ctx = llm.receivedContexts[1]
    expect(ctx).toHaveLength(2)
    expect(ctx.every((t) => t.suggestions === undefined || t.suggestions.length === 0)).toBe(true)
    const turns = await conversation.loadActiveSession()
    expect(turns![0].suggestions).toBeUndefined()
  })

  it('rule 5: user抢说 — interrupted other appended (no LLM); user turn triggers LLM', async () => {
    const llm = new MockLlm([
      [{ type: 'candidate-done', index: 0, candidate: { id: 'c0', meaning: '续', targetText: 'つづき', reading: 'tsuzuki' } }, { type: 'done' }],
    ])
    const conversation = new InMemoryConversationStorage()
    const pipeline = new Pipeline({ llm, conversation, sleep: noSleep })
    const events = recordEvents(pipeline, ['candidatesStreaming', 'candidatesDone', 'turnAppended'])

    await pipeline.ingestFinalizedTurn(turn('other', 'other-partial', 1000, 1500, true))
    await pipeline.ingestFinalizedTurn(turn('user', 'user-actual', 1500, 2500))
    await pipeline.idle()

    expect(llm.callCount).toBe(1)
    expect(events.some((e) => e.type === 'candidatesDone')).toBe(true)
    const turns = await conversation.loadActiveSession()
    expect(turns!.map((t) => t.speaker)).toEqual(['other', 'user'])
    expect(turns!.map((t) => t.text)).toEqual(['other-partial', 'user-actual'])
  })

  it('rule 5 (alt): user抢说 during LLM_STREAMING aborts LLM then user turn triggers new LLM', async () => {
    const llm = new MockLlm([
      [{ type: 'candidate-start', index: 0 }, candidate(0, 'partial', 'p', 'p'), { gate: 'block' }],
      [{ type: 'candidate-done', index: 0, candidate: { id: 'c0', meaning: 'user', targetText: 'u', reading: 'u' } }, { type: 'done' }],
    ])
    const conversation = new InMemoryConversationStorage()
    const pipeline = new Pipeline({ llm, conversation, sleep: noSleep })
    const events = recordEvents(pipeline, ['llmAborted', 'candidatesDone', 'candidatesStreaming'])

    await pipeline.ingestFinalizedTurn(turn('other', 'other', 1000))
    await llm.gateEntered('block')
    await pipeline.ingestFinalizedTurn(turn('user', 'user抢说', 3000))
    await pipeline.idle()
    llm.resolveGate('block')

    expect(events.some((e) => e.type === 'llmAborted')).toBe(true)
    expect(llm.callCount).toBe(2)
    const done = events.filter((e) => e.type === 'candidatesDone')
    expect(done).toHaveLength(1)
    const turns = await conversation.loadActiveSession()
    expect(turns!.map((t) => t.speaker)).toEqual(['other', 'user'])
  })

  it('rule 6: sttFailed turn appends empty text and still triggers LLM', async () => {
    const llm = new MockLlm([
      [{ type: 'done' }],
      [{ type: 'candidate-done', index: 0, candidate: { id: 'c0', meaning: 'r', targetText: 'r', reading: 'r' } }, { type: 'done' }],
    ])
    const conversation = new InMemoryConversationStorage()
    const pipeline = new Pipeline({ llm, conversation, sleep: noSleep })
    const events = recordEvents(pipeline, ['sttFailed', 'turnAppended', 'candidatesDone'])

    await pipeline.ingestFinalizedTurn(turn('other', '', 1000, 2000, false, true))
    await pipeline.idle()

    expect(events.some((e) => e.type === 'sttFailed')).toBe(true)
    expect(llm.callCount).toBe(1)
    expect(events.some((e) => e.type === 'candidatesDone')).toBe(true)
    const turns = await conversation.loadActiveSession()
    expect(turns).toHaveLength(1)
    expect(turns![0].sttFailed).toBe(true)
    expect(turns![0].text).toBe('')

    await pipeline.ingestFinalizedTurn(turn('other', 'recovered', 3000))
    await pipeline.idle()
    expect(llm.callCount).toBe(2)
  })

  it('rule 7: LLM failure retries once then emits llmFailed; other turn stays; session continues', async () => {
    const llm = new MockLlm([[{ throw: true }], [{ throw: true }], [{ type: 'candidate-done', index: 0, candidate: { id: 'c0', meaning: 'n', targetText: 'n', reading: 'n' } }, { type: 'done' }]])
    const conversation = new InMemoryConversationStorage()
    const pipeline = new Pipeline({ llm, conversation, sleep: noSleep })
    const events = recordEvents(pipeline, ['llmFailed', 'candidatesDone', 'turnAppended'])

    await pipeline.ingestFinalizedTurn(turn('other', 'other-text', 1000))
    await pipeline.idle()

    expect(llm.callCount).toBe(2)
    expect(events.some((e) => e.type === 'llmFailed')).toBe(true)
    expect(events.every((e) => e.type !== 'candidatesDone')).toBe(true)
    const turns = await conversation.loadActiveSession()
    expect(turns).toHaveLength(1)
    expect(turns![0].text).toBe('other-text')

    await pipeline.ingestFinalizedTurn(turn('other', 'next', 3000))
    await pipeline.idle()
    expect(llm.callCount).toBe(3)
  })

  it('rule 7: LLM recovers on retry — candidatesDone emitted', async () => {
    const llm = new MockLlm([
      [{ throw: true }],
      [{ type: 'candidate-done', index: 0, candidate: { id: 'c0', meaning: 'ok', targetText: 'ok', reading: 'ok' } }, { type: 'done' }],
    ])
    const conversation = new InMemoryConversationStorage()
    const pipeline = new Pipeline({ llm, conversation, sleep: noSleep })
    const events = recordEvents(pipeline, ['llmFailed', 'candidatesDone'])

    await pipeline.ingestFinalizedTurn(turn('other', 'other', 1000))
    await pipeline.idle()

    expect(llm.callCount).toBe(2)
    expect(events.every((e) => e.type !== 'llmFailed')).toBe(true)
    expect(events.some((e) => e.type === 'candidatesDone')).toBe(true)
  })

  it('user turn triggers LLM (same as other)', async () => {
    const llm = new MockLlm([
      [{ type: 'candidate-done', index: 0, candidate: { id: 'c0', meaning: '续写', targetText: 'つづき', reading: 'tsuzuki' } }, { type: 'done' }],
    ])
    const conversation = new InMemoryConversationStorage()
    const pipeline = new Pipeline({ llm, conversation, sleep: noSleep })
    const events = recordEvents(pipeline, ['candidatesDone'])

    await pipeline.ingestFinalizedTurn(turn('user', 'user said this', 1000))
    await pipeline.idle()

    expect(llm.callCount).toBe(1)
    expect(events.some((e) => e.type === 'candidatesDone')).toBe(true)
    const turns = await conversation.loadActiveSession()
    expect(turns).toHaveLength(1)
    expect(turns![0].speaker).toBe('user')
    expect(pipeline.getState()).toBe('IDLE')
  })

  it('empty LLM result still emits candidatesDone with []', async () => {
    const llm = new MockLlm([[{ type: 'done' }]])
    const conversation = new InMemoryConversationStorage()
    const pipeline = new Pipeline({ llm, conversation, sleep: noSleep })
    const events = recordEvents(pipeline, ['candidatesDone'])

    await pipeline.ingestFinalizedTurn(turn('user', 'わかりました', 1000))
    await pipeline.idle()

    const done = events.find((e) => e.type === 'candidatesDone')
    expect(done).toBeDefined()
    if (done?.type === 'candidatesDone') expect(done.candidates).toHaveLength(0)
  })

  it('config: pause thresholds accepted from injected config', async () => {
    const llm = new MockLlm([[{ type: 'done' }]])
    const conversation = new InMemoryConversationStorage()
    const pipeline = new Pipeline({
      llm,
      conversation,
      sleep: noSleep,
      config: { vadOtherPauseMs: 700, vadUserPauseMs: 1500 },
    })
    await pipeline.ingestFinalizedTurn(turn('other', 'x', 1000))
    await pipeline.idle()
    expect(pipeline.getState()).toBe('IDLE')
  })
})
