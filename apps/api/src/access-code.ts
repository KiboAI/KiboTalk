import { randomBytes } from 'node:crypto'

export function normalizeAccessCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase().replace(/\s+/g, '')
  return /^[A-Z0-9-]{4,40}$/.test(code) ? code : null
}

export function generateAccessCode(): string {
  const raw = randomBytes(8).toString('hex').toUpperCase()
  return `KIBO-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12)}`
}
