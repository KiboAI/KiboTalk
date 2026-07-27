import { beforeEach, describe, expect, it } from 'vitest'
import type { RelaySessionClaims } from '@kibotalk/shared'
import {
  acquireRelayWebsocket,
  authorizeRelayLlm,
  consumeRelayWebsocketTicket,
  deductRelaySessionSeconds,
  issueRelayWebsocketTicket,
  releaseRelayLlm,
  releaseRelayWebsocket,
  resetRelaySessionStateForTests,
  syncRelaySessionState,
} from '../src/relay-session-state'

const claims: RelaySessionClaims = {
  version: 1,
  issuer: 'kibotalk-primary',
  tokenId: 'token-1',
  userId: 'user-1',
  deviceSessionId: 'device-1',
  conversationSessionId: 'session-1',
  nodeId: 'cn-relay',
  scopes: ['llm', 'stt-realtime'],
  sttProvider: 'dashscope-realtime',
  llmProvider: 'openai',
  llmModel: 'deepseek-v4-flash',
  quotaSeconds: 5,
  issuedAt: 1,
  expiresAt: 2,
}

beforeEach(resetRelaySessionStateForTests)

describe('relay session state', () => {
  it('meters quota locally and grants one final reply', () => {
    expect(deductRelaySessionSeconds(claims, 3.2)).toMatchObject({
      billedSeconds: 4,
      deductedSeconds: 4,
      exhausted: false,
      remainingSeconds: 1,
    })
    expect(deductRelaySessionSeconds(claims, 1)).toMatchObject({
      billedSeconds: 1,
      deductedSeconds: 1,
      exhausted: true,
      remainingSeconds: 0,
    })
    expect(authorizeRelayLlm(claims)).toEqual({
      allowed: true,
      finalAllowanceConsumed: true,
    })
    releaseRelayLlm(claims)
    expect(authorizeRelayLlm(claims).allowed).toBe(false)
  })

  it('preserves the lower local balance across token renewal', () => {
    deductRelaySessionSeconds(claims, 4)
    syncRelaySessionState({
      ...claims,
      tokenId: 'token-2',
      quotaSeconds: 5,
    })
    expect(deductRelaySessionSeconds(claims, 1)).toMatchObject({
      deductedSeconds: 1,
      exhausted: true,
    })
  })

  it('allows two websocket streams for the desktop both-audio mode', () => {
    expect(acquireRelayWebsocket(claims)).toBe(true)
    expect(acquireRelayWebsocket(claims)).toBe(true)
    expect(acquireRelayWebsocket(claims)).toBe(false)
    releaseRelayWebsocket(claims)
    expect(acquireRelayWebsocket(claims)).toBe(true)
  })

  it('consumes websocket tickets once and expires them', () => {
    const issued = issueRelayWebsocketTicket(claims, 1_000)
    expect(consumeRelayWebsocketTicket(issued.ticket, 2_000)).toEqual(claims)
    expect(consumeRelayWebsocketTicket(issued.ticket, 2_000)).toBeNull()

    const expired = issueRelayWebsocketTicket(claims, 1_000)
    expect(consumeRelayWebsocketTicket(expired.ticket, 62_000)).toBeNull()
  })
})
