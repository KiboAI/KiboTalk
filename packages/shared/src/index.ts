export type RelayNodeRole = 'primary' | 'relay'

export type RelayNode = {
  id: string
  origin: string
  role: RelayNodeRole
  acceptingNewSessions: boolean
}

export type RelayNodeList = {
  nodes: RelayNode[]
  primaryNodeId: string
  probe: {
    attempts: number
    timeoutMs: number
  }
}

export type RelayScope =
  | 'llm'
  | 'stt-realtime'

export type RelaySessionClaims = {
  version: 1
  issuer: 'kibotalk-primary'
  tokenId: string
  userId: string
  deviceSessionId: string
  conversationSessionId: string
  nodeId: string
  scopes: RelayScope[]
  sttProvider: string
  llmProvider: string
  llmModel: string
  quotaSeconds: number
  issuedAt: number
  expiresAt: number
}

export type RelaySessionGrant = {
  token: string
  node: RelayNode
  claims: RelaySessionClaims
  renewAfterSeconds: number
}

export type RelayUsageEvent = {
  requestId: string
  nodeId: string
  userId: string
  deviceSessionId: string
  conversationSessionId: string
  audioSeconds: number
  provider: string
  model: string
  durationMs: number
  createdAt: string
}

export type RelayActiveSessionHeartbeat = {
  userId: string
  deviceSessionId: string
  conversationSessionId: string
}
