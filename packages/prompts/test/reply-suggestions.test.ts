import { describe, it, expect } from 'vitest'
import {
  buildReplySuggestionsMessages,
  renderReplySuggestionsPrompt,
  buildReplySuggestionsSystem,
} from '../src/index'
import type { ConversationTurn } from '@kibotalk/conversation'

function turn(speaker: 'user' | 'other', text: string): ConversationTurn {
  return {
    id: `${speaker}-${text}`,
    speaker,
    text,
    startedAt: 0,
    endedAt: 0,
  }
}

const baseArgs = {
  context: [
    turn('other', 'いらっしゃいませ'),
    turn('user', 'これをください'),
  ],
  level: 'beginner' as const,
  conversationLang: 'ja' as const,
  meaningLang: 'zh' as const,
}

describe('reply suggestions prompt (production schema)', async () => {
  const messages = await buildReplySuggestionsMessages(baseArgs)
  const output = await renderReplySuggestionsPrompt(baseArgs)

  it('returns system + user messages', () => {
    expect(messages).toHaveLength(2)
    expect(messages[0]?.role).toBe('system')
    expect(messages[1]?.role).toBe('user')
    expect(messages[0]?.content).toBe(buildReplySuggestionsSystem('ja'))
  })

  it('debug render includes SYSTEM and USER sections', () => {
    expect(output).toMatch(/^SYSTEM:/)
    expect(output).toContain('USER:')
  })

  it('requires meaning, targetText, segments — not top-level reading (ja)', () => {
    const user = messages[1]!.content
    expect(user).toContain('meaning')
    expect(user).toContain('targetText')
    expect(user).toContain('segments')
    expect(user).toContain('particle')
    expect(user).toMatch(/Do NOT include top-level/)
    expect(user).toMatch(/NEVER put/)
    expect(user).toContain('こんにちは')
    expect(user).toMatch(/keys ONLY:\s*meaning, targetText, segments/i)
  })

  it('includes the conversation context (prior turn texts)', () => {
    expect(messages[1]!.content).toContain('いらっしゃいませ')
    expect(messages[1]!.content).toContain('これをください')
  })

  it('includes the level, langs, and not a scene field', () => {
    expect(messages[1]!.content).toContain('beginner')
    expect(messages[1]!.content).toContain('Japanese')
    expect(messages[1]!.content).toContain('中文')
    expect(output).not.toMatch(/Scene:/i)
  })

  it('allows [] or exactly 3, and states last-speaker gate rules', () => {
    const system = messages[0]!.content
    const user = messages[1]!.content
    expect(system).toMatch(/STRICT JSON ONLY/i)
    expect(system).toMatch(/empty array \[\]/i)
    expect(user).toMatch(/\[\] or a JSON array of EXACTLY 3 objects/i)
    expect(user).toContain('Last speaker')
    expect(user).toContain('Me (learner)')
    expect(user).toMatch(/Stuck mid-utterance/i)
    expect(user).toMatch(/FULL speakable sentences/i)
    expect(user).toMatch(/almost always return EXACTLY 3/i)
    expect(user).toMatch(/be liberal/i)
  })

  it('handles an empty context gracefully', async () => {
    const msgs = await buildReplySuggestionsMessages({
      context: [],
      level: 'intermediate',
      conversationLang: 'ja',
      meaningLang: 'zh',
    })
    expect(msgs[1]!.content).toContain('no prior turns')
    expect(msgs[1]!.content).toContain('intermediate')
    expect(msgs[1]!.content).toContain('none (opening)')
  })

  it('omits furigana rules for non-Japanese conversation language', async () => {
    const msgs = await buildReplySuggestionsMessages({
      context: [],
      level: 'beginner',
      conversationLang: 'en',
      meaningLang: 'zh',
    })
    const user = msgs[1]!.content
    expect(user).toMatch(/keys ONLY:\s*meaning, targetText/i)
    expect(user).not.toContain('Furigana')
    expect(user).toContain('English')
    expect(msgs[0]!.content).toContain('English learner')
  })
})
