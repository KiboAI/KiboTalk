import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { app } from '../src/app'

const previous = {
  STT_ACTIVE: process.env.STT_ACTIVE,
  STT_IFLYTEK_APP_ID: process.env.STT_IFLYTEK_APP_ID,
  STT_IFLYTEK_API_KEY: process.env.STT_IFLYTEK_API_KEY,
  STT_IFLYTEK_API_SECRET: process.env.STT_IFLYTEK_API_SECRET,
  STT_IFLYTEK_WS_URL: process.env.STT_IFLYTEK_WS_URL,
}

afterEach(() => {
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('iFlytek browser-direct STT sessions', () => {
  it('returns a provider-signed WSS URL without exposing the signing secret', async () => {
    process.env.STT_ACTIVE = 'iflytek-realtime'
    process.env.STT_IFLYTEK_APP_ID = 'test-app'
    process.env.STT_IFLYTEK_API_KEY = 'test-key'
    process.env.STT_IFLYTEK_API_SECRET = 'test-secret'
    process.env.STT_IFLYTEK_WS_URL =
      'wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1'

    const response = await app.request('/api/stt/direct/session?language=ja', {
      method: 'POST',
    })
    expect(response.status).toBe(200)
    const body = await response.json() as {
      requestId: string
      url: string
      frameBytes: number
      frameIntervalMs: number
    }
    const url = new URL(body.url)
    expect(url.origin).toBe('wss://office-api-ast-dx.iflyaisol.com')
    expect(url.searchParams.get('appId')).toBe('test-app')
    expect(url.searchParams.get('accessKeyId')).toBe('test-key')
    expect(url.searchParams.get('lang')).toBe('autominor')
    expect(url.searchParams.get('recognized_language')).toBe('ja')
    expect(url.searchParams.get('audio_encode')).toBe('pcm_s16le')
    expect(url.searchParams.get('samplerate')).toBe('16000')
    expect(url.searchParams.get('uuid')).toMatch(/^[0-9a-f]{32}$/)
    expect(body.url).not.toContain('test-secret')
    expect(body.frameBytes).toBe(1_280)
    expect(body.frameIntervalMs).toBe(40)

    const parameters = [...url.searchParams.entries()]
      .filter(([name]) => name !== 'signature')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
      .join('&')
    expect(url.searchParams.get('signature')).toBe(
      createHmac('sha1', 'test-secret').update(parameters).digest('base64'),
    )
  })

  it('rejects direct URL issuance when iFlytek is not the session provider', async () => {
    process.env.STT_ACTIVE = 'dashscope-realtime'
    const response = await app.request('/api/stt/direct/session', {
      method: 'POST',
    })
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'STT_PROVIDER_NOT_ACTIVE',
    })
  })
})
