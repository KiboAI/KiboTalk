import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectRealtimeStt } from '../src/realtime-stt-client'

type ServerMessage = {
  type: string
  text?: string
  code?: string
  message?: string
}

class MockWebSocket {
  static readonly OPEN = 1
  static readonly CONNECTING = 0
  static instances: MockWebSocket[] = []

  readyState = MockWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null
  sent: string[] = []

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this)
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  receive(message: ServerMessage): void {
    this.onmessage?.({ data: JSON.stringify(message) })
  }

  send(message: string): void {
    this.sent.push(message)
  }

  close(): void {
    this.readyState = 3
  }
}

async function connectClient(onError?: (message: string) => void) {
  const connecting = connectRealtimeStt({
    provider: 'dashscope-realtime',
    handlers: { onError },
  })
  await vi.waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
  const socket = MockWebSocket.instances[0]
  socket.open()
  socket.receive({ type: 'ready' })
  return { client: await connecting, socket }
}

describe('realtime STT completion queue', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ticket: 'test-ticket' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('resolves one waiter per completed turn in FIFO order', async () => {
    const { client, socket } = await connectClient()

    client.commit()
    const first = client.waitCompleted()
    client.commit()
    const second = client.waitCompleted()
    let secondSettled = false
    void second.finally(() => {
      secondSettled = true
    })

    socket.receive({ type: 'completed', text: '第一轮' })

    await expect(first).resolves.toBe('第一轮')
    await Promise.resolve()
    expect(secondSettled).toBe(false)

    socket.receive({ type: 'completed', text: '第二轮' })
    await expect(second).resolves.toBe('第二轮')
  })

  it('rejects only the failed turn when transcription failure is recoverable', async () => {
    const onError = vi.fn()
    const { client, socket } = await connectClient(onError)

    client.commit()
    const failed = client.waitCompleted()
    client.commit()
    const next = client.waitCompleted()

    socket.receive({
      type: 'error',
      code: 'TRANSCRIPTION_FAILED',
      message: 'audio was not recognized',
    })

    await expect(failed).rejects.toThrow('audio was not recognized')
    expect(onError).not.toHaveBeenCalled()
    socket.receive({ type: 'completed', text: '下一轮成功' })
    await expect(next).resolves.toBe('下一轮成功')
  })
})
