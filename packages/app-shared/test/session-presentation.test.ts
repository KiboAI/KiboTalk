import { describe, expect, it } from 'vitest'
import { shouldShowSessionError } from '../src/session/session-presentation'

describe('session error presentation', () => {
  it('does not present a voice failure while the user intentionally paused', () => {
    expect(shouldShowSessionError('paused', 'MICROPHONE_ENDED')).toBe(false)
  })

  it('still presents a start failure while stopped', () => {
    expect(shouldShowSessionError('stopped', 'MICROPHONE_DENIED')).toBe(true)
  })
})
