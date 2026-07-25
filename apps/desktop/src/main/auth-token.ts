import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app, safeStorage } from 'electron'

function secureDataPath(name: string): string {
  return join(app.getPath('userData'), `${name}.bin`)
}

function readSecureString(name: string): string | null {
  try {
    const path = secureDataPath(name)
    if (!existsSync(path) || !safeStorage.isEncryptionAvailable()) return null
    return safeStorage.decryptString(readFileSync(path))
  } catch {
    return null
  }
}

function writeSecureString(name: string, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('macOS secure storage is unavailable')
  }
  const path = secureDataPath(name)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, safeStorage.encryptString(value), { mode: 0o600 })
}

function clearSecureString(name: string): void {
  try {
    unlinkSync(secureDataPath(name))
  } catch {
    // Already absent.
  }
}

export function readAccessToken(): string | null {
  return readSecureString('auth-token')
}

export function writeAccessToken(token: string): void {
  writeSecureString('auth-token', token)
}

export function clearAccessToken(): void {
  clearSecureString('auth-token')
}

export function readAccountCache(): string | null {
  return readSecureString('account-cache')
}

export function writeAccountCache(value: string): void {
  writeSecureString('account-cache', value)
}

export function clearAccountCache(): void {
  clearSecureString('account-cache')
}
