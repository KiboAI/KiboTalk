import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  connectIflytekRealtimeStt,
  parseIflytekServerEvent,
} from '../src/iflytek-realtime-client'
import { relayFetch } from '../src/api-runtime'

vi.mock('../src/api-runtime', () => ({
  relayFetch: vi.fn(),
}))

class MockWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static instances: MockWebSocket[] = []

  readyState = MockWebSocket.CONNECTING
  binaryType = ''
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  sent: Array<string | Uint8Array> = []

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this)
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) })
  }

  send(message: string | Uint8Array): void {
    this.sent.push(message)
  }

  close(): void {
    this.readyState = 3
    this.onclose?.()
  }
}

beforeEach(() => {
  MockWebSocket.instances = []
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.mocked(relayFetch).mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('iFlytek realtime browser protocol', () => {
  it('recognizes the provider session handshake', () => {
    expect(parseIflytekServerEvent(JSON.stringify({
      msg_type: 'action',
      data: { sessionId: 'session-1' },
    }))).toEqual({
      type: 'ready',
      sessionId: 'session-1',
    })
  })

  it('extracts final transcript words and the last-frame marker', () => {
    expect(parseIflytekServerEvent(JSON.stringify({
      msg_type: 'result',
      res_type: 'asr',
      data: {
        seg_id: 3,
        ls: true,
        cn: {
          st: {
            type: '0',
            rt: [{
              ws: [
                { cw: [{ w: '你' }] },
                { cw: [{ w: '好' }] },
              ],
            }],
          },
        },
      },
    }))).toEqual({
      type: 'transcript',
      segmentId: 3,
      text: '你好',
      final: true,
      last: true,
    })
  })

  it('maps provider error frames to a recoverable STT error', () => {
    expect(parseIflytekServerEvent(JSON.stringify({
      action: 'error',
      code: '35030',
      desc: '签名已过期或者签名重复',
    }))).toEqual({
      type: 'error',
      code: '35030',
      message: '签名已过期或者签名重复',
    })
  })

  it('streams PCM from the browser directly to the signed provider URL', async () => {
    vi.mocked(relayFetch).mockImplementation(async (path) => {
      if (path === '/api/stt/direct/complete') {
        return new Response(JSON.stringify({ ok: true, exhausted: false }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({
        requestId: 'request-1',
        url: 'wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1?signed=1',
        frameBytes: 1_280,
        frameIntervalMs: 40,
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    const connecting = connectIflytekRealtimeStt({ language: 'ja' })
    await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    const providerSocket = MockWebSocket.instances[0]!
    expect(providerSocket.url).toMatch(/^wss:\/\/office-api-ast-dx\.iflyaisol\.com\//)
    providerSocket.open()
    providerSocket.receive({
      msg_type: 'action',
      data: { sessionId: 'provider-session-1' },
    })
    const client = await connecting

    client.append(new Float32Array(512).fill(0.25))
    client.commit()
    const completed = client.waitCompleted()
    await vi.advanceTimersByTimeAsync(50)

    expect(providerSocket.sent[0]).toBeInstanceOf(Uint8Array)
    expect((providerSocket.sent[0] as Uint8Array).byteLength).toBe(1_024)
    expect(JSON.parse(String(providerSocket.sent[1]))).toEqual({
      end: true,
      sessionId: 'provider-session-1',
    })

    providerSocket.receive({
      msg_type: 'result',
      res_type: 'asr',
      data: {
        seg_id: 0,
        ls: true,
        cn: {
          st: {
            type: '0',
            rt: [{ ws: [{ cw: [{ w: '直连成功' }] }] }],
          },
        },
      },
    })
    await expect(completed).resolves.toBe('直连成功')
    expect(MockWebSocket.instances).toHaveLength(1)

    const completionCall = vi.mocked(relayFetch).mock.calls.find(
      ([path]) => path === '/api/stt/direct/complete',
    )
    expect(completionCall).toBeDefined()
    expect(JSON.parse(String(completionCall?.[1]?.body))).toMatchObject({
      requestId: 'request-1',
      samples: 512,
    })
    expect(
      vi.mocked(relayFetch).mock.calls.some(([path]) =>
        String(path).includes('/api/stt/direct/session')),
    ).toBe(true)
  })
})
