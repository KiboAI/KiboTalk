import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

function applicationSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not set')
  return secret
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function keyedHash(value: string): string {
  return createHmac('sha256', applicationSecret()).update(value).digest('hex')
}

export function safeHashEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expected)
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

type EncryptedPayload = {
  ciphertext: Buffer
  iv: Buffer
  authTag: Buffer
}

function masterEncryptionKey(): Buffer {
  const raw = process.env.SYNC_ENCRYPTION_KEY
  if (!raw) throw new Error('SYNC_ENCRYPTION_KEY is not set')
  if (/^[\da-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex')
  const decoded = Buffer.from(raw, 'base64')
  if (decoded.length === 32) return decoded
  throw new Error('SYNC_ENCRYPTION_KEY must be 32 bytes encoded as base64 or 64 hex characters')
}

function userEncryptionKey(userId: string): Buffer {
  return createHmac('sha256', masterEncryptionKey())
    .update(`kibotalk-sync:${userId}`)
    .digest()
}

export function encryptJson(userId: string, resourceId: string, value: unknown): EncryptedPayload {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', userEncryptionKey(userId), iv)
  cipher.setAAD(Buffer.from(`${userId}:${resourceId}`))
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ])
  return { ciphertext, iv, authTag: cipher.getAuthTag() }
}

export function decryptJson<T>(
  userId: string,
  resourceId: string,
  encrypted: EncryptedPayload,
): T {
  const decipher = createDecipheriv('aes-256-gcm', userEncryptionKey(userId), encrypted.iv)
  decipher.setAAD(Buffer.from(`${userId}:${resourceId}`))
  decipher.setAuthTag(encrypted.authTag)
  const plaintext = Buffer.concat([
    decipher.update(encrypted.ciphertext),
    decipher.final(),
  ])
  return JSON.parse(plaintext.toString('utf8')) as T
}

