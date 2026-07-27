import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  RelayNode,
  RelaySessionClaims,
} from '@kibotalk/shared'
import {
  openRelaySession,
  relayFetch,
  releaseRelaySession,
  resetRelaySessionForTests,
} from '../src/api-runtime'

const primary: RelayNode = {
  id: 'jp-primary',
  origin: 'https://app.kibotalk.app',
  role: 'primary',
  acceptingNewSessions: true,
}
const relay: RelayNode = {
  id: 'cn-relay',
  origin: 'http://123.99.200.156:8443',
  role: 'relay',
  acceptingNewSessions: true,
}

afterEach(() => {
  resetRelaySessionForTests()
  vi.restoreAllMocks()
})

describe('relay API runtime', () => {
  it('handshakes the preferred node and routes data-plane fetches with its short token', async () => {
    const calls: Array<{ url: string; authorization: string | null }> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = input instanceof URL
        ? input
        : new URL(typeof input === 'string' ? input : input.url)
      const headers = new Headers(init?.headers)
      calls.push({ url: url.toString(), authorization: headers.get('authorization') })

      if (url.pathname === '/api/relay/nodes') {
        return Response.json({
          nodes: [primary, relay],
          primaryNodeId: primary.id,
          probe: { attempts: 2, timeoutMs: 100 },
        })
      }
      if (url.pathname === '/api/latency') return Response.json({ ok: true })
      if (url.pathname === '/api/relay/sessions') {
        const body = JSON.parse(String(init?.body)) as {
          conversationSessionId: string
          nodeId: string
        }
        const node = body.nodeId === relay.id ? relay : primary
        const now = Math.floor(Date.now() / 1_000)
        const claims: RelaySessionClaims = {
          version: 1,
          issuer: 'kibotalk-primary',
          tokenId: 'token-id',
          userId: 'user-1',
          deviceSessionId: 'device-1',
          conversationSessionId: body.conversationSessionId,
          nodeId: node.id,
          scopes: ['llm', 'stt', 'stt-realtime'],
          sttProvider: 'dashscope-realtime',
          sttBatchProvider: 'dashscope',
          llmProvider: 'openai',
          llmModel: 'deepseek-v4-flash',
          quotaSeconds: 1_800,
          issuedAt: now,
          expiresAt: now + 1_800,
        }
        return Response.json({
          token: 'short-token',
          node,
          claims,
          renewAfterSeconds: 1_200,
        })
      }
      if (url.pathname === '/api/relay/handshake') {
        return Response.json({ ok: true, nodeId: relay.id })
      }
      if (url.pathname.endsWith('/confirm')) return Response.json({ ok: true })
      if (url.pathname === '/api/relay/selection-telemetry') {
        return Response.json({ ok: true })
      }
      if (url.pathname === '/api/llm') return Response.json({ ok: true })
      if (url.pathname.endsWith('/release')) return Response.json({ ok: true })
      return Response.json({ error: 'unexpected' }, { status: 500 })
    })

    const selection = await openRelaySession({
      conversationSessionId: 'session-1',
      nodeId: relay.id,
      probeResults: [
        { node: primary, latencyMs: 80, successfulAttempts: 4 },
        { node: relay, latencyMs: 24, successfulAttempts: 4 },
      ],
    })
    expect(selection.node.id).toBe(relay.id)
    expect(selection.latencyMs).toBe(24)

    const response = await relayFetch('/api/llm', { method: 'POST' })
    expect(response.ok).toBe(true)
    expect(calls).toContainEqual({
      url: 'http://123.99.200.156:8443/api/llm',
      authorization: 'Bearer short-token',
    })

    await releaseRelaySession(true)
  })
})
