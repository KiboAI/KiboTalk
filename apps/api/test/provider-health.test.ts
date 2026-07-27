import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  refreshProviderHealth,
  setProviderHealthForTests,
} from '../src/provider-health'

const env = {
  STT_DASHSCOPE_WS_URL: 'wss://stt.example/realtime',
  LLM_ACTIVE: 'openrouter',
  LLM_OPENROUTER_BASE_URL: 'https://llm.example/v1',
}

beforeEach(() => setProviderHealthForTests(true))

describe('provider health', () => {
  it('requires realtime STT and LLM upstreams', async () => {
    const fetchImpl = vi.fn(async (
      _input: URL | RequestInfo,
      _init?: RequestInit,
    ) => new Response(null, { status: 401 }))

    expect(await refreshProviderHealth(env, fetchImpl as typeof fetch)).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(fetchImpl.mock.calls[0]?.[0].toString()).toBe(
      'https://stt.example/realtime',
    )
  })

  it('fails closed when a required upstream is missing or unavailable', async () => {
    const missingRealtime = { ...env, STT_DASHSCOPE_WS_URL: undefined }
    expect(await refreshProviderHealth(
      missingRealtime,
      vi.fn(async () => new Response(null, { status: 200 })) as typeof fetch,
    )).toBe(false)

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
    expect(await refreshProviderHealth(
      env,
      fetchImpl as typeof fetch,
    )).toBe(false)
  })
})
