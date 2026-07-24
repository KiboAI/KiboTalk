import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow } from 'electron'
import {
  IPC_CHANNEL,
  type OnboardingContentSize,
  type ProductWindowView,
} from '../../shared/ipc'
import { loadRendererEntry } from '../location'
import { embeddedWindowConfig, protectPrivilegedWindowNavigation } from './shared'

/** Matches `--background` (light theme) in `packages/ui/src/theme.css` — the window's initial paint before the renderer's own CSS loads. */
const ONBOARDING_BACKGROUND = '#fafafa'

const ONBOARDING_WIDTH = 480
const ONBOARDING_MIN_WIDTH = 400
/** Floor only — real height comes from renderer `onboarding:resize` once content lays out. */
const ONBOARDING_MIN_HEIGHT = 160

const mainDirname = dirname(fileURLToPath(import.meta.url))

let onboardingWindow: BrowserWindow | null = null
let requestedView: ProductWindowView = 'settings'

export function getRequestedProductView(): ProductWindowView {
  return requestedView
}

/**
 * Onboarding / settings window — first-run language + voiceprint, later
 * reused from Island「设置」. Height is content-driven via
 * `resizeOnboardingWindow`.
 */
export async function openOnboardingWindow(view: ProductWindowView = 'settings'): Promise<BrowserWindow> {
  requestedView = view
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.webContents.send(IPC_CHANNEL.onboardingViewRequestedEvent, view)
    onboardingWindow.show()
    onboardingWindow.focus()
    return onboardingWindow
  }

  const window = new BrowserWindow({
    title: 'KiboTalk 设置',
    width: ONBOARDING_WIDTH,
    height: ONBOARDING_MIN_HEIGHT,
    minWidth: ONBOARDING_MIN_WIDTH,
    minHeight: ONBOARDING_MIN_HEIGHT,
    show: false,
    resizable: true,
    ...embeddedWindowConfig(ONBOARDING_BACKGROUND),
    webPreferences: {
      preload: join(mainDirname, '../preload/index.mjs'),
      sandbox: false,
    },
  })

  window.on('ready-to-show', () => window.show())
  protectPrivilegedWindowNavigation(window)
  window.on('closed', () => {
    onboardingWindow = null
  })

  await loadRendererEntry(window, 'onboarding')
  window.webContents.send(IPC_CHANNEL.onboardingViewRequestedEvent, requestedView)
  onboardingWindow = window
  return window
}

/** Applies renderer-measured content size. */
export function resizeOnboardingWindow(size: OnboardingContentSize): void {
  if (!onboardingWindow || onboardingWindow.isDestroyed()) return
  const width = Math.max(ONBOARDING_MIN_WIDTH, Math.ceil(size.width))
  const height = Math.max(ONBOARDING_MIN_HEIGHT, Math.ceil(size.height))
  onboardingWindow.setContentSize(width, height)
  if (!onboardingWindow.isVisible()) {
    onboardingWindow.show()
    onboardingWindow.focus()
  }
}

export function closeOnboardingWindow(): void {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.close()
  }
}
