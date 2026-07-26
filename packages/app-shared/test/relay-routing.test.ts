import { describe, expect, it } from 'vitest'
import type { RelayNode } from '@kibotalk/shared'
import { selectRelayNode, type RelayProbeResult } from '../src/relay-routing'

const primary: RelayNode = {
  id: 'jp-primary',
  origin: 'https://app.kibotalk.app',
  role: 'primary',
  acceptingNewSessions: true,
}
const relay: RelayNode = {
  id: 'cn-relay',
  origin: 'https://cn-api.kibotalk.app:8443',
  role: 'relay',
  acceptingNewSessions: true,
}

function result(node: RelayNode, latencyMs: number | null): RelayProbeResult {
  return { node, latencyMs, successfulAttempts: latencyMs === null ? 0 : 4 }
}

describe('relay node selection', () => {
  it('selects the relay when it is at least 5 ms faster', () => {
    expect(selectRelayNode([
      result(primary, 45),
      result(relay, 39),
    ], primary.id, 5).node.id).toBe(relay.id)
  })

  it('prefers the primary inside the 5 ms tie window', () => {
    expect(selectRelayNode([
      result(primary, 45),
      result(relay, 41),
    ], primary.id, 5).node.id).toBe(primary.id)
  })

  it('falls back to the primary when all probes fail', () => {
    expect(selectRelayNode([
      result(primary, null),
      result(relay, null),
    ], primary.id, 5).node.id).toBe(primary.id)
  })
})
