import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, screen } from 'electron'
import { loadRendererEntry } from '../location'
import { readConfig, updateConfig } from '../config'
import { protectPrivilegedWindowNavigation, transparentWindowConfig } from './shared'

const isMacOS = process.platform === 'darwin'
const mainDirname = dirname(fileURLToPath(import.meta.url))

const ISLAND_WIDTH = 420
const ISLAND_HEIGHT = 640
const ISLAND_MARGIN = 24

function defaultBounds(): { x: number; y: number; width: number; height: number } {
  const { width: screenWidth } = screen.getPrimaryDisplay().workArea
  return {
    width: ISLAND_WIDTH,
    height: ISLAND_HEIGHT,
    x: screenWidth - ISLAND_WIDTH - ISLAND_MARGIN,
    y: ISLAND_MARGIN,
  }
}

/**
 * The always-on-top floating Island — transparent/frameless per AIRI's
 * `windows/main` recipe (`src/main/windows/main/index.ts:80-98,166-171` in
 * `airi/apps/stage-tamagotchi`). Dragging uses CSS `app-region: drag` on the
 * renderer's handle, not AIRI's native click-drag plugin (simpler, no extra
 * native dependency — revisit only if insufficient).
 */
export async function createIslandWindow(): Promise<BrowserWindow> {
  const saved = readConfig().islandBounds
  const bounds = saved ?? defaultBounds()

  const window = new BrowserWindow({
    ...bounds,
    show: false,
    resizable: false,
    skipTaskbar: false,
    webPreferences: {
      preload: join(mainDirname, '../preload/index.mjs'),
      sandbox: false,
    },
    ...transparentWindowConfig(),
  })

  function persistBounds() {
    updateConfig({ islandBounds: window.getBounds() })
  }
  window.on('move', persistBounds)
  window.on('resize', persistBounds)

  // Float above fullscreen apps too — see the electron/electron#10078 workaround AIRI documents.
  window.setAlwaysOnTop(true, 'screen-saver', 1)
  window.setFullScreenable(false)
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  if (isMacOS) window.setWindowButtonVisibility(false)

  window.on('ready-to-show', () => window.show())
  protectPrivilegedWindowNavigation(window)

  await loadRendererEntry(window, 'index')
  return window
}
