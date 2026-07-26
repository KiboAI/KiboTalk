import type { RelaySessionGrant } from '@kibotalk/shared'
import type { RequestAuth } from './auth'
import {
  claimActiveAiSession,
  refreshActiveAiSession,
  releaseActiveAiSession,
} from './active-session'
import { databaseConfigured, getDatabase } from './db'
import { availableRelayNodeList } from './relay-nodes'
import { quotaSummary } from './quota'
import { issueRelaySessionToken } from './relay-token'

const SESSION_ID_MAX_LENGTH = 200

function providerSnapshot(env: NodeJS.ProcessEnv): {
  sttProvider: string
  sttBatchProvider: string
  llmProvider: string
  llmModel: string
} {
  const sttProvider = env.STT_ACTIVE ?? 'dashscope-realtime'
  const sttBatchProvider = env.STT_BATCH_ACTIVE ?? 'dashscope'
  const llmProvider = env.LLM_ACTIVE ?? 'openrouter'
  const llmModel = env[`LLM_${llmProvider.toUpperCase()}_MODEL`] ?? 'development'
  return { sttProvider, sttBatchProvider, llmProvider, llmModel }
}

async function existingRelaySession(
  auth: RequestAuth,
  conversationSessionId: string,
): Promise<{
  nodeId: string
  confirmed: boolean
  ended: boolean
} | null> {
  if (!databaseConfigured()) return null
  const sql = getDatabase()
  const [row] = await sql<{
    node_id: string
    confirmed_at: Date | null
    ended_at: Date | null
  }[]>`
    SELECT node_id, confirmed_at, ended_at
    FROM relay_sessions
    WHERE user_id = ${auth.userId}
      AND conversation_session_id = ${conversationSessionId}
  `
  return row
    ? {
        nodeId: row.node_id,
        confirmed: row.confirmed_at !== null,
        ended: row.ended_at !== null,
      }
    : null
}

async function persistRelaySession(args: {
  auth: RequestAuth
  conversationSessionId: string
  nodeId: string
}): Promise<boolean> {
  if (!databaseConfigured()) return true
  const sql = getDatabase()
  const rows = await sql<{ node_id: string }[]>`
    INSERT INTO relay_sessions (
      user_id,
      device_session_id,
      conversation_session_id,
      node_id,
      expires_at
    )
    VALUES (
      ${args.auth.userId},
      ${args.auth.deviceSessionId},
      ${args.conversationSessionId},
      ${args.nodeId},
      now() + interval '30 minutes'
    )
    ON CONFLICT (user_id, conversation_session_id) DO UPDATE SET
      device_session_id = EXCLUDED.device_session_id,
      node_id = EXCLUDED.node_id,
      expires_at = EXCLUDED.expires_at,
      updated_at = now()
    WHERE relay_sessions.ended_at IS NULL
      AND (
        relay_sessions.confirmed_at IS NULL
        OR relay_sessions.node_id = EXCLUDED.node_id
      )
    RETURNING node_id
  `
  return rows.length > 0
}

export async function grantRelaySession(args: {
  auth: RequestAuth
  conversationSessionId: string
  requestedNodeId: string
  env?: NodeJS.ProcessEnv
}): Promise<RelaySessionGrant> {
  const env = args.env ?? process.env
  if (
    !args.conversationSessionId
    || args.conversationSessionId.length > SESSION_ID_MAX_LENGTH
  ) throw new Error('INVALID_CONVERSATION_SESSION')

  const existing = await existingRelaySession(args.auth, args.conversationSessionId)
  if (existing?.ended) throw new Error('RELAY_SESSION_ENDED')
  if (existing?.confirmed && existing.nodeId !== args.requestedNodeId) {
    throw new Error('RELAY_NODE_FROZEN')
  }

  const nodeList = await availableRelayNodeList(env)
  const node = nodeList.nodes.find(({ id }) => id === args.requestedNodeId)
  if (!node) throw new Error('RELAY_NODE_UNAVAILABLE')

  if (databaseConfigured()) {
    const claimed = await claimActiveAiSession({
      userId: args.auth.userId,
      deviceSessionId: args.auth.deviceSessionId,
      conversationSessionId: args.conversationSessionId,
    })
    if (!claimed) throw new Error('ACTIVE_SESSION_CONFLICT')
  }
  if (!await persistRelaySession({
    auth: args.auth,
    conversationSessionId: args.conversationSessionId,
    nodeId: node.id,
  })) throw new Error('RELAY_NODE_FROZEN')

  const quotaSeconds = databaseConfigured()
    ? (await quotaSummary(args.auth.userId)).totalSeconds
    : 30 * 60
  const token = issueRelaySessionToken({
    userId: args.auth.userId,
    deviceSessionId: args.auth.deviceSessionId,
    conversationSessionId: args.conversationSessionId,
    nodeId: node.id,
    scopes: ['llm', 'stt', 'stt-realtime'],
    ...providerSnapshot(env),
    quotaSeconds,
  }, { env })
  return {
    token: token.token,
    claims: token.claims,
    renewAfterSeconds: token.renewAfterSeconds,
    node,
  }
}

export async function confirmRelaySession(args: {
  auth: RequestAuth
  conversationSessionId: string
  nodeId: string
}): Promise<boolean> {
  if (!databaseConfigured()) return true
  const sql = getDatabase()
  const rows = await sql<{ node_id: string }[]>`
    UPDATE relay_sessions
    SET confirmed_at = COALESCE(confirmed_at, now()),
        updated_at = now()
    WHERE user_id = ${args.auth.userId}
      AND device_session_id = ${args.auth.deviceSessionId}
      AND conversation_session_id = ${args.conversationSessionId}
      AND node_id = ${args.nodeId}
      AND ended_at IS NULL
    RETURNING node_id
  `
  return rows.length > 0
}

export async function releaseRelaySession(args: {
  auth: RequestAuth
  conversationSessionId: string
  final: boolean
}): Promise<void> {
  if (!databaseConfigured()) return
  await releaseActiveAiSession({
    userId: args.auth.userId,
    deviceSessionId: args.auth.deviceSessionId,
    conversationSessionId: args.conversationSessionId,
  })
  if (!args.final) return
  const sql = getDatabase()
  await sql`
    UPDATE relay_sessions
    SET ended_at = now(),
        updated_at = now()
    WHERE user_id = ${args.auth.userId}
      AND device_session_id = ${args.auth.deviceSessionId}
      AND conversation_session_id = ${args.conversationSessionId}
      AND ended_at IS NULL
  `
}

export async function refreshRelayedActiveSessions(
  sessions: Array<{
    userId: string
    deviceSessionId: string
    conversationSessionId: string
  }>,
): Promise<void> {
  if (!databaseConfigured()) return
  for (const session of sessions.slice(0, 1_000)) {
    await refreshActiveAiSession(session)
  }
}

export async function relaySessionMatches(args: {
  userId: string
  deviceSessionId: string
  conversationSessionId: string
  nodeId: string
}): Promise<boolean> {
  if (!databaseConfigured()) return true
  const sql = getDatabase()
  const rows = await sql<{ one: number }[]>`
    SELECT 1 AS one
    FROM relay_sessions
    WHERE user_id = ${args.userId}
      AND device_session_id = ${args.deviceSessionId}
      AND conversation_session_id = ${args.conversationSessionId}
      AND node_id = ${args.nodeId}
      AND created_at > now() - interval '7 days'
  `
  return rows.length > 0
}

export function relayNodeErrorStatus(message: string): 400 | 409 | 503 {
  switch (message) {
    case 'INVALID_CONVERSATION_SESSION':
      return 400
    case 'ACTIVE_SESSION_CONFLICT':
    case 'RELAY_NODE_FROZEN':
    case 'RELAY_SESSION_ENDED':
      return 409
    default:
      return 503
  }
}
