import type {
  RelayNode,
  RelayNodeList,
} from '@kibotalk/shared'
import { databaseConfigured, getDatabase } from './db'
import {
  primaryRelayNodeId,
  relayAcceptingNewSessions,
} from './server-role'

const DEFAULT_PROBE = {
  attempts: 5,
  timeoutMs: 1_500,
} as const
const HEARTBEAT_MAX_AGE_SECONDS = 45

type ConfiguredRelay = {
  id: string
  origin: string
}

function normalizeOrigin(value: string, name: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) origin`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${name} must use HTTP(S)`)
  }
  return url.origin
}

function configuredSecondaryRelays(
  value: string | undefined,
  primaryNodeId: string,
): RelayNode[] {
  if (!value?.trim()) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('RELAY_NODES_JSON must be valid JSON')
  }
  if (!Array.isArray(parsed)) {
    throw new Error('RELAY_NODES_JSON must be an array')
  }
  const seen = new Set([primaryNodeId])
  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`RELAY_NODES_JSON[${index}] must be an object`)
    }
    const relay = entry as Partial<ConfiguredRelay>
    const id = typeof relay.id === 'string' ? relay.id.trim() : ''
    const origin = typeof relay.origin === 'string' ? relay.origin.trim() : ''
    if (!id || !origin) {
      throw new Error(`RELAY_NODES_JSON[${index}] must contain id and origin`)
    }
    if (seen.has(id)) {
      throw new Error(`RELAY_NODES_JSON contains duplicate node id: ${id}`)
    }
    seen.add(id)
    return {
      id,
      origin: normalizeOrigin(origin, `RELAY_NODES_JSON[${index}].origin`),
      role: 'relay' as const,
      acceptingNewSessions: true,
    }
  })
}

export function configuredRelayNodes(
  env: NodeJS.ProcessEnv = process.env,
): RelayNode[] {
  const primaryNodeId = primaryRelayNodeId(env)
  const primaryOrigin = normalizeOrigin(
    env.RELAY_PRIMARY_ORIGIN
      ?? env.PUBLIC_APP_URL
      ?? `http://localhost:${env.PORT ?? 8787}`,
    'RELAY_PRIMARY_ORIGIN',
  )
  return [{
    id: primaryNodeId,
    origin: primaryOrigin,
    role: 'primary',
    acceptingNewSessions: relayAcceptingNewSessions(env),
  }, ...configuredSecondaryRelays(env.RELAY_NODES_JSON, primaryNodeId)]
}

export async function availableRelayNodeList(
  env: NodeJS.ProcessEnv = process.env,
): Promise<RelayNodeList> {
  const configured = configuredRelayNodes(env)
  if (!databaseConfigured()) {
    return {
      nodes: configured.filter((node) => node.acceptingNewSessions),
      primaryNodeId: primaryRelayNodeId(env),
      probe: DEFAULT_PROBE,
    }
  }

  const relayIds = configured
    .filter((node) => node.role === 'relay')
    .map((node) => node.id)
  const sql = getDatabase()
  const healthyRows = relayIds.length === 0
    ? []
    : await sql<{ node_id: string; accepting_new_sessions: boolean }[]>`
        SELECT node_id, accepting_new_sessions
        FROM relay_node_status
        WHERE node_id = ANY(${relayIds})
          AND provider_healthy = true
          AND last_seen_at > now() - (${HEARTBEAT_MAX_AGE_SECONDS} * interval '1 second')
      `
  const healthyRelays = new Map(
    healthyRows.map((row) => [row.node_id, row.accepting_new_sessions]),
  )
  const nodes = configured
    .map((node) =>
      node.role === 'primary'
        ? node
        : {
            ...node,
            acceptingNewSessions: healthyRelays.get(node.id) === true,
          })
    .filter((node) => node.acceptingNewSessions)
  return {
    nodes,
    primaryNodeId: primaryRelayNodeId(env),
    probe: DEFAULT_PROBE,
  }
}

export async function recordRelayNodeHeartbeat(args: {
  nodeId: string
  acceptingNewSessions: boolean
  providerHealthy: boolean
  version?: string
}): Promise<void> {
  if (!databaseConfigured()) return
  const sql = getDatabase()
  await sql`
    INSERT INTO relay_node_status (
      node_id, accepting_new_sessions, provider_healthy, version, last_seen_at
    )
    VALUES (
      ${args.nodeId},
      ${args.acceptingNewSessions},
      ${args.providerHealthy},
      ${args.version ?? null},
      now()
    )
    ON CONFLICT (node_id) DO UPDATE SET
      accepting_new_sessions = EXCLUDED.accepting_new_sessions,
      provider_healthy = EXCLUDED.provider_healthy,
      version = EXCLUDED.version,
      last_seen_at = EXCLUDED.last_seen_at,
      updated_at = now()
  `
}
