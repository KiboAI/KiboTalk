import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { is } from '@electron-toolkit/utils'
import type { BrowserWindow } from 'electron'

const mainDirname = dirname(fileURLToPath(import.meta.url))

/**
 * Loads a renderer entry by its output HTML file name (e.g. `index` for
 * `src/renderer/index.html`, `onboarding` for `src/renderer/onboarding.html`)
 * — dev server URL when running under `electron-vite dev`, built file
 * otherwise.
 */
export async function loadRendererEntry(window: BrowserWindow, entry: string): Promise<void> {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    await window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${entry}.html`)
    return
  }
  await window.loadFile(join(mainDirname, `../renderer/${entry}.html`))
}
