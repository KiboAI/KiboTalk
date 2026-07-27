import type {
  RelayNode,
  RelayNodeList,
} from '@kibotalk/shared'

export type RelayProbeResult = {
  node: RelayNode
  latencyMs: number | null
  successfulAttempts: number
}

type ProbeOptions = RelayNodeList['probe'] & {
  fetch?: typeof globalThis.fetch
  now?: () => number
}

function median(samples: number[]): number | null {
  if (samples.length === 0) return null
  const midpoint = Math.floor(samples.length / 2)
  if (samples.length % 2 === 1) return samples[midpoint]!
  return (samples[midpoint - 1]! + samples[midpoint]!) / 2
}

async function timedProbe(
  node: RelayNode,
  timeoutMs: number,
  fetchImpl: typeof globalThis.fetch,
  now: () => number,
): Promise<number | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = now()
  try {
    const url = new URL('/api/latency', node.origin)
    url.searchParams.set('nonce', globalThis.crypto?.randomUUID?.() ?? String(Math.random()))
    const response = await fetchImpl(url, {
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    })
    return response.ok ? Math.max(0, now() - startedAt) : null
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function probeRelayNode(
  node: RelayNode,
  options: ProbeOptions,
): Promise<RelayProbeResult> {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
  const now = options.now ?? (() => performance.now())

  await timedProbe(node, options.timeoutMs, fetchImpl, now)
  const samples: number[] = []
  for (let index = 1; index < options.attempts; index++) {
    const sample = await timedProbe(node, options.timeoutMs, fetchImpl, now)
    if (sample !== null) samples.push(sample)
  }
  samples.sort((left, right) => left - right)
  return {
    node,
    latencyMs: median(samples),
    successfulAttempts: samples.length,
  }
}

export async function probeRelayNodes(
  nodeList: RelayNodeList,
  overrides: Partial<ProbeOptions> = {},
): Promise<RelayProbeResult[]> {
  const options: ProbeOptions = {
    ...nodeList.probe,
    ...overrides,
  }
  return Promise.all(nodeList.nodes.map((node) => probeRelayNode(node, options)))
}
