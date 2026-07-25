import { describe, it, expect } from 'vitest'
import {
  thinClientToUpstream,
  upstreamToThinServer,
  parseThinClientMessage,
  isDashscopeRealtimeConfigured,
  dashscopeRealtimeUpstreamUrl,
  listSttProviders,
} from '../src/index'

describe('dashscope realtime thin protocol', () => {
  it('maps session.start to Manual session.update', () => {
    const events = thinClientToUpstream({ type: 'session.start', language: 'ja' })
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('session.update')
    const session = events[0].session as {
      turn_detection: null
      input_audio_format: string
      input_audio_transcription: { language: string }
    }
    expect(session.turn_detection).toBeNull()
    expect(session.input_audio_format).toBe('pcm')
    expect(session.input_audio_transcription.language).toBe('ja')
  })

  it('maps append / commit / finish', () => {
    expect(thinClientToUpstream({ type: 'append', audio: 'abc' })[0].type).toBe(
      'input_audio_buffer.append',
    )
    expect(thinClientToUpstream({ type: 'commit' })[0].type).toBe(
      'input_audio_buffer.commit',
    )
    expect(thinClientToUpstream({ type: 'finish' })[0].type).toBe('session.finish')
  })

  it('maps upstream transcription events to thin server messages', () => {
    expect(
      upstreamToThinServer(
        JSON.stringify({ type: 'session.updated', session: {} }),
      ),
    ).toEqual({ type: 'ready' })
    expect(
      upstreamToThinServer(
        JSON.stringify({
          type: 'conversation.item.input_audio_transcription.delta',
          transcript: 'こん',
        }),
      ),
    ).toEqual({ type: 'partial', text: 'こん' })
    expect(
      upstreamToThinServer(
        JSON.stringify({
          type: 'conversation.item.input_audio_transcription.text',
          text: '',
          stash: "Beijing's",
        }),
      ),
    ).toEqual({ type: 'partial', text: "Beijing's" })
    expect(
      upstreamToThinServer(
        JSON.stringify({
          type: 'conversation.item.input_audio_transcription.text',
          text: 'The',
          stash: ' weather',
        }),
      ),
    ).toEqual({ type: 'partial', text: 'The weather' })
    expect(
      upstreamToThinServer(
        JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          transcript: 'こんにちは',
        }),
      ),
    ).toEqual({ type: 'completed', text: 'こんにちは' })
    expect(
      upstreamToThinServer(JSON.stringify({ type: 'input_audio_buffer.committed' })),
    ).toBeNull()
    expect(
      upstreamToThinServer(
        JSON.stringify({
          type: 'conversation.item.input_audio_transcription.failed',
          error: { message: 'audio was not recognized' },
        }),
      ),
    ).toEqual({
      type: 'error',
      code: 'TRANSCRIPTION_FAILED',
      message: 'audio was not recognized',
    })
  })

  it('parses thin client messages', () => {
    expect(parseThinClientMessage('{"type":"commit"}')).toEqual({ type: 'commit' })
    expect(parseThinClientMessage('{')).toEqual({ error: 'Invalid JSON' })
  })

  it('lists dashscope-realtime when WS_URL + API_KEY set', () => {
    expect(isDashscopeRealtimeConfigured({})).toBe(false)
    const env = {
      STT_DASHSCOPE_API_KEY: 'sk-x',
      STT_DASHSCOPE_WS_URL: 'wss://example.com/api-ws/v1/realtime',
    }
    expect(isDashscopeRealtimeConfigured(env)).toBe(true)
    const providers = listSttProviders(env)
    const rt = providers.find((p) => p.id === 'dashscope-realtime')
    expect(rt).toMatchObject({
      mode: 'realtime',
      configured: true,
      model: 'qwen3-asr-flash-realtime',
    })
    const url = dashscopeRealtimeUpstreamUrl({
      wsUrl: env.STT_DASHSCOPE_WS_URL,
      apiKey: env.STT_DASHSCOPE_API_KEY,
      model: 'qwen3-asr-flash-realtime',
    })
    expect(url).toContain('model=qwen3-asr-flash-realtime')
  })
})
