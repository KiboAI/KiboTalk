import { describe, expect, it } from 'vitest'
import type { RelayNode, RelayNodeList } from '@kibotalk/shared'
import { probeRelayNodes } from '../src/relay-routing'

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

describe('relay node latency probes', () => {
  it('returns measured latency for the user-facing manual picker', async () => {
    const nodeList: RelayNodeList = {
      nodes: [primary],
      primaryNodeId: primary.id,
      probe: { attempts: 3, timeoutMs: 100 },
    }
    const times = [0, 8, 10, 30, 40, 64]
    const results = await probeRelayNodes(nodeList, {
      fetch: async () => Response.json({ ok: true }),
      now: () => times.shift()!,
    })

    expect(results).toEqual([
      { node: primary, latencyMs: 22, successfulAttempts: 2 },
    ])
  })

  it('marks an unreachable node without choosing another node', async () => {
    const nodeList: RelayNodeList = {
      nodes: [relay],
      primaryNodeId: primary.id,
      probe: { attempts: 2, timeoutMs: 100 },
    }
    const results = await probeRelayNodes(nodeList, {
      fetch: async () => {
        throw new Error('blocked')
      },
    })

    expect(results).toEqual([
      { node: relay, latencyMs: null, successfulAttempts: 0 },
    ])
  })
})
