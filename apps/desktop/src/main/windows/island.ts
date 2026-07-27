import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, screen, type Display, type Rectangle } from 'electron'
import { IPC_CHANNEL, type IslandContentSide } from '../../shared/ipc'
import { loadRendererEntry } from '../location'
import { readConfig, updateConfig } from '../config'
import { protectPrivilegedWindowNavigation, transparentWindowConfig } from './shared'
import { decideIslandContentSide } from './island-content-side'

const isMacOS = process.platform === 'darwin'
const mainDirname = dirname(fileURLToPath(import.meta.url))

const DEFAULT_WIDTH = 420
const DEFAULT_HEIGHT = 640
const MIN_WIDTH = 360
const MIN_HEIGHT = 420
const MAX_WIDTH = 680
const MARGIN = 24

type IslandBrowserWindow = BrowserWindow & {
  __scheduleMoveSettled?: () => void
  __suppressMoveSettle?: boolean
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}

function displayKey(display: Display): string {
  return String(display.id)
}

function defaultBounds(display: Display): Rectangle {
  const { x, y, width, height } = display.workArea
  const windowHeight = Math.min(DEFAULT_HEIGHT, height - MARGIN * 2)
  return {
    width: DEFAULT_WIDTH,
    height: windowHeight,
    x: x + width - DEFAULT_WIDTH - MARGIN,
    y: y + height - windowHeight - MARGIN,
  }
}

function boundsInsideDisplay(bounds: Rectangle, display: Display): Rectangle {
  const area = display.workArea
  const width = clamp(bounds.width, MIN_WIDTH, Math.min(MAX_WIDTH, area.width))
  const height = clamp(bounds.height, MIN_HEIGHT, area.height)
  return {
    width,
    height,
    x: clamp(bounds.x, area.x, area.x + area.width - width),
    y: clamp(bounds.y, area.y, area.y + area.height - height),
  }
}

/**
 * Compute content side from the renderer's current value + window geometry.
 * The renderer owns the live value; main only persists.
 */
export function settleIslandContentSide(
  window: BrowserWindow,
  currentSide: IslandContentSide,
): IslandContentSide {
  const boundsNow = window.getBounds()
  const displays = screen.getAllDisplays().map((item) => ({
    id: item.id,
    workArea: item.workArea,
  }))
  const { desired } = decideIslandContentSide({
    bounds: boundsNow,
    currentSide,
    displays,
  })
  if (desired === currentSide) return currentSide
  updateConfig({ islandContentSide: desired })
  return desired
}

/** AIRI-style transparent, always-on-top, edge-resizable floating window. */
export async function createIslandWindow(): Promise<BrowserWindow> {
  const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const config = readConfig()
  const saved = config.islandBoundsByDisplay[displayKey(cursorDisplay)]
  const bounds = boundsInsideDisplay(saved ?? defaultBounds(cursorDisplay), cursorDisplay)

  const window = new BrowserWindow({
    ...bounds,
    show: false,
    resizable: true,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    maxWidth: Math.min(MAX_WIDTH, cursorDisplay.workArea.width),
    maxHeight: cursorDisplay.workArea.height,
    skipTaskbar: true,
    webPreferences: {
      preload: join(mainDirname, '../preload/index.mjs'),
      sandbox: false,
    },
    ...transparentWindowConfig(),
  }) as IslandBrowserWindow

  let moveSettledTimer: ReturnType<typeof setTimeout> | null = null

  function persistBounds() {
    const currentBounds = window.getBounds()
    const display = screen.getDisplayMatching(currentBounds)
    window.setMaximumSize(Math.min(MAX_WIDTH, display.workArea.width), display.workArea.height)
    updateConfig({
      islandBoundsByDisplay: {
        ...readConfig().islandBoundsByDisplay,
        [displayKey(display)]: currentBounds,
      },
    })
  }

  function scheduleMoveSettled() {
    if (window.__suppressMoveSettle) return
    persistBounds()
    if (moveSettledTimer) clearTimeout(moveSettledTimer)
    // Renderer owns contentSide — notify it to settle with its single value.
    moveSettledTimer = setTimeout(() => {
      if (window.isDestroyed()) return
      window.webContents.send(IPC_CHANNEL.islandMoveSettledEvent)
    }, 140)
  }
  window.__scheduleMoveSettled = scheduleMoveSettled

  window.on('move', scheduleMoveSettled)
  window.on('moved', scheduleMoveSettled)
  window.on('resize', persistBounds)
  window.on('closed', () => {
    if (moveSettledTimer) clearTimeout(moveSettledTimer)
    delete window.__scheduleMoveSettled
  })

  window.setAlwaysOnTop(true, 'screen-saver', 1)
  window.setFullScreenable(false)
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  if (isMacOS) window.setWindowButtonVisibility(false)

  window.on('ready-to-show', () => window.show())
  protectPrivilegedWindowNavigation(window)

  await loadRendererEntry(window, 'index')
  return window
}
