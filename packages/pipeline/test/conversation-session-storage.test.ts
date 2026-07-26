import { describe, expect, it } from 'vitest'
import { InMemoryConversationStorage } from '@kibotalk/conversation'

const snapshot = {
  conversationLang: 'ja' as const,
  meaningLang: 'zh' as const,
  uiLang: 'zh' as const,
  level: 'beginner' as const,
  audioSource: 'microphone' as const,
  microphoneDeviceId: 'default',
}

describe('conversation session lifecycle storage', () => {
  it('preserves one context through pause/resume and starts history on stop', async () => {
    const storage = new InMemoryConversationStorage()
    await storage.startSession({
      id: 's1',
      relayNodeId: 'jp-primary',
      startedAt: 1000,
      snapshot,
      title: 'fallback',
    })
    await storage.appendTurn({
      id: 't1',
      speaker: 'other',
      text: 'こんにちは',
      startedAt: 1100,
      endedAt: 1200,
    })
    await storage.pauseActiveSession('user', 2000)
    await storage.resumeActiveSession(5000)
    await storage.appendTurn({
      id: 't2',
      speaker: 'user',
      text: 'こんにちは',
      startedAt: 5100,
      endedAt: 5200,
    })
    const stopped = await storage.stopActiveSession(6000)

    expect(stopped).toMatchObject({
      id: 's1',
      status: 'stopped',
      pausedDurationMs: 3000,
    })
    expect(stopped?.turns.map((turn) => turn.id)).toEqual(['t1', 't2'])
    expect(await storage.getActiveSession()).toBeNull()
    expect(await storage.listSessions()).toHaveLength(1)
  })

  it('persists committed suggestions and keeps the active session when clearing history', async () => {
    const storage = new InMemoryConversationStorage()
    await storage.startSession({
      id: 'past',
      relayNodeId: 'jp-primary',
      startedAt: 1000,
      snapshot,
      title: 'past',
    })
    await storage.stopActiveSession(2000)
    await storage.startSession({
      id: 'active',
      relayNodeId: 'cn-relay',
      startedAt: 3000,
      snapshot,
      title: 'active',
    })
    await storage.appendTurn({
      id: 't1',
      speaker: 'other',
      text: '袋はご利用ですか？',
      startedAt: 3100,
      endedAt: 3200,
    })
    await storage.updateTurnSuggestions('t1', [
      { id: 'c1', meaning: '要一个袋子', targetText: '袋を一枚お願いします。' },
    ])

    await storage.clearHistory()

    const sessions = await storage.listSessions()
    expect(sessions.map((session) => session.id)).toEqual(['active'])
    expect(sessions[0]?.turns[0]?.suggestions?.[0]?.id).toBe('c1')
  })
})
