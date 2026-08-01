import { describe, expect, it } from 'vitest'
import { generateAccessCode, normalizeAccessCode } from '../src/access-code'

describe('shared voucher code format', () => {
  it('generates the existing KIBO code shape', () => {
    expect(generateAccessCode()).toMatch(
      /^KIBO-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/,
    )
  })

  it('normalizes case and whitespace for voucher codes', () => {
    expect(normalizeAccessCode('  kibo-abcd  -1234 ')).toBe('KIBO-ABCD-1234')
    expect(normalizeAccessCode('bad_code')).toBeNull()
  })
})
