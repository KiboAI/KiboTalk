import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, screen, type Display, type Rectangle } from 'electron'
import { IPC_CHANNEL } from '../../shared/ipc'
import { loadRendererEntry } from '../location'
import { readConfig, updateConfig } from '../config'
import { protectPrivilegedWindowNavigation, transparentWindowConfig } from './shared'

const isMacOS = process.platform === 'darwin'
const mainDirname = dirname(fileURLToPath(import.meta.url))

const DEFAULT_WIDTH = 420
const DEFAULT_HEIGHT = 640
const MIN_WIDTH = 360
const MIN_HEIGHT = 420
const MAX_WIDTH = 680
const MARGIN = 24
const ISLAND_CENTER_OFFSET = 29
const FLIP_HYSTERESIS = 32

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
  })

  let contentSide = config.islandContentSide
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

  function settleVerticalFlip() {
    const boundsNow = window.getBounds()
    const display = screen.getDisplayMatching(boundsNow)
    const midpoint = display.workArea.y + display.workArea.height / 2
    const islandCenter =
      contentSide === 'above'
        ? boundsNow.y + boundsNow.height - ISLAND_CENTER_OFFSET
        : boundsNow.y + ISLAND_CENTER_OFFSET
    const desired =
      islandCenter < midpoint - FLIP_HYSTERESIS
        ? 'below'
        : islandCenter > midpoint + FLIP_HYSTERESIS
          ? 'above'
          : contentSide
    if (desired === contentSide) return

    const nextY =
      desired === 'below'
        ? islandCenter - ISLAND_CENTER_OFFSET
        : islandCenter - boundsNow.height + ISLAND_CENTER_OFFSET
    const clampedY = clamp(
      Math.round(nextY),
      display.workArea.y,
      display.workArea.y + display.workArea.height - boundsNow.height,
    )
    contentSide = desired
    updateConfig({ islandContentSide: desired })
    window.setPosition(boundsNow.x, clampedY)
    window.webContents.send(IPC_CHANNEL.islandContentSideChanged, desired)
  }

  function scheduleMoveSettled() {
    persistBounds()
    if (moveSettledTimer) clearTimeout(moveSettledTimer)
    moveSettledTimer = setTimeout(settleVerticalFlip, 140)
  }

  window.on('move', scheduleMoveSettled)
  window.on('resize', persistBounds)
  window.on('closed', () => {
    if (moveSettledTimer) clearTimeout(moveSettledTimer)
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
