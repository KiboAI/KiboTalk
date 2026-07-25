import { app, net, Notification, shell } from 'electron'

const VERSION_URL = 'https://advx.kibotalk.app/app-version'

type VersionManifest = {
  version: string
  downloadUrl: string
}

function versionParts(value: string): number[] {
  return value.split('.').map((part) => Number.parseInt(part, 10) || 0)
}

function newerThan(candidate: string, current: string): boolean {
  const candidateParts = versionParts(candidate)
  const currentParts = versionParts(current)
  const length = Math.max(candidateParts.length, currentParts.length)
  for (let index = 0; index < length; index++) {
    const difference = (candidateParts[index] ?? 0) - (currentParts[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return false
}

/** Checks only; never downloads or installs without the user's action. */
export async function checkForManualUpdate(): Promise<void> {
  try {
    const response = await net.fetch(VERSION_URL)
    if (!response.ok) return
    const manifest = (await response.json()) as Partial<VersionManifest>
    if (
      !manifest.version
      || !manifest.downloadUrl
      || !newerThan(manifest.version, app.getVersion())
    ) {
      return
    }
    const notification = new Notification({
      title: `KiboTalk ${manifest.version} 可用`,
      body: '点击前往官方下载页。未签名比赛版只支持手动更新。',
    })
    notification.on('click', () => void shell.openExternal(manifest.downloadUrl!))
    notification.show()
  } catch {
    // Offline and transient server failures do not interrupt the local app.
  }
}

