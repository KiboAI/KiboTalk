import { describe, expect, it } from 'vitest'
import { app } from '../src/app'

describe('cloud sync account binding', () => {
  it('rejects a sync request created for a different account', async () => {
    const response = await app.request('/api/sync?since=0', {
      headers: { 'x-kibotalk-user-id': '00000000-0000-0000-0000-000000000099' },
    })

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'SYNC_ACCOUNT_CHANGED' })
  })

  it('rejects an unbound sync request', async () => {
    const response = await app.request('/api/sync?since=0')

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'SYNC_ACCOUNT_CHANGED' })
  })
})

describe('API payload boundary', () => {
  it('rejects oversized request bodies before route handlers run', async () => {
    const response = await app.request('/api/not-a-route', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(3 * 1024 * 1024) }),
    })

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({ error: 'PAYLOAD_TOO_LARGE' })
  })
})
