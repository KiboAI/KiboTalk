export type ServerRole = 'primary' | 'relay'

export function serverRole(env: NodeJS.ProcessEnv = process.env): ServerRole {
  const value = env.SERVER_ROLE ?? 'primary'
  if (value === 'primary' || value === 'relay') return value
  throw new Error(`Invalid SERVER_ROLE: ${value}`)
}

export function relayNodeId(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.RELAY_NODE_ID?.trim()
  if (value) return value
  return serverRole(env) === 'primary' ? 'jp-primary' : 'cn-relay'
}

export function primaryRelayNodeId(env: NodeJS.ProcessEnv = process.env): string {
  return env.RELAY_PRIMARY_NODE_ID?.trim() || 'jp-primary'
}

export function relayAcceptingNewSessions(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.RELAY_ACCEPT_NEW_SESSIONS !== 'false'
}
