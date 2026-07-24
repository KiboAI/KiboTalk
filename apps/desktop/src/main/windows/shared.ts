import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'
import { shell } from 'electron'

const isMacOS = process.platform === 'darwin'

/** AIRI's transparent-panel recipe (frame:false + transparent + no shadow; hidden title bar on macOS). */
export function transparentWindowConfig(): BrowserWindowConstructorOptions {
  return {
    frame: false,
    titleBarStyle: isMacOS ? 'hidden' : undefined,
    transparent: true,
    hasShadow: false,
  }
}

/**
 * AIRI's onboarding recipe: opaque, hidden title bar on macOS (the renderer
 * supplies its own drag strip — see `WizardScreen`'s `embedded` mode) so the
 * page can fill the window edge-to-edge without a native title bar *and* an
 * inner floating card each drawing their own border/shadow. Normal framed
 * window on other platforms.
 */
export function embeddedWindowConfig(backgroundColor: string): BrowserWindowConstructorOptions {
  return {
    frame: !isMacOS,
    titleBarStyle: isMacOS ? 'hidden' : undefined,
    transparent: false,
    backgroundColor,
  }
}

/** Blocks in-app navigation to arbitrary URLs, opening http(s)/mailto links in the system browser instead. */
export function protectPrivilegedWindowNavigation(window: BrowserWindow): void {
  function openSafeExternalUrl(rawUrl: string): void {
    try {
      const url = new URL(rawUrl)
      if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') {
        void shell.openExternal(url.toString())
      }
    } catch {
      // Malformed navigation target — ignore.
    }
  }

  window.webContents.setWindowOpenHandler((details) => {
    openSafeExternalUrl(details.url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl === window.webContents.getURL()) return
    event.preventDefault()
    openSafeExternalUrl(navigationUrl)
  })
}
