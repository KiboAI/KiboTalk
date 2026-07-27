import { afterEach, describe, expect, it } from 'vitest'
import { app } from '../src/app'
import { FREE_MONTHLY_SECONDS } from '../src/quota'

const previous = {
  RELAY_PRIMARY_ORIGIN: process.env.RELAY_PRIMARY_ORIGIN,
  RELAY_CN_ORIGIN: process.env.RELAY_CN_ORIGIN,
  RELAY_CN_ENABLED: process.env.RELAY_CN_ENABLED,
  STT_ACTIVE: process.env.STT_ACTIVE,
  LLM_ACTIVE: process.env.LLM_ACTIVE,
  LLM_OPENROUTER_MODEL: process.env.LLM_OPENROUTER_MODEL,
}

afterEach(() => {
  for (const [name, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

describe('relay control plane', () => {
  it('publishes both configured nodes and signs a node-bound session grant', async () => {
    process.env.RELAY_PRIMARY_ORIGIN = 'https://app.kibotalk.app'
    process.env.RELAY_CN_ORIGIN = 'http://123.99.200.156:8443'
    process.env.RELAY_CN_ENABLED = 'true'
    process.env.STT_ACTIVE = 'dashscope-realtime'
    process.env.LLM_ACTIVE = 'openrouter'
    process.env.LLM_OPENROUTER_MODEL = 'deepseek-v4-flash'

    const nodesResponse = await app.request('/api/relay/nodes')
    expect(nodesResponse.status).toBe(200)
    const nodes = await nodesResponse.json() as {
      nodes: Array<{ id: string; origin: string }>
      probe: { attempts: number }
    }
    expect(nodes.nodes).toEqual([
      expect.objectContaining({ id: 'jp-primary', origin: 'https://app.kibotalk.app' }),
      expect.objectContaining({
        id: 'cn-relay',
        origin: 'http://123.99.200.156:8443',
      }),
    ])
    expect(nodes.probe).toMatchObject({ attempts: 5 })

    const grantResponse = await app.request('/api/relay/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        conversationSessionId: 'session-1',
        nodeId: 'cn-relay',
      }),
    })
    expect(grantResponse.status).toBe(200)
    const grant = await grantResponse.json() as {
      token: string
      renewAfterSeconds: number
      claims: {
        nodeId: string
        conversationSessionId: string
        quotaSeconds: number
        expiresAt: number
        issuedAt: number
      }
    }
    expect(grant.token.split('.')).toHaveLength(2)
    expect(grant.claims).toMatchObject({
      nodeId: 'cn-relay',
      conversationSessionId: 'session-1',
      quotaSeconds: 30 * 60,
    })
    expect(grant.claims.expiresAt - grant.claims.issuedAt).toBe(30 * 60)
    expect(grant.renewAfterSeconds).toBe(20 * 60)
  })

  it('sets the monthly free allowance to 30 minutes', () => {
    expect(FREE_MONTHLY_SECONDS).toBe(30 * 60)
  })
})
