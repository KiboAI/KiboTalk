import { desktopCapturer, session } from 'electron'
import type { SystemAudioStartResult } from '../shared/ipc'

/**
 * System-audio loopback capture — desktop-only, single consumer (the Island
 * renderer), so this lives directly in `apps/desktop` rather than a shared
 * package (per the desktop plan's Phase D note). Mirrors AIRI's
 * `@proj-airi/electron-screen-capture`, trimmed to the one thing we need:
 * a `getDisplayMedia()` call in the renderer that resolves with system audio
 * (the renderer drops the accompanying video track — see IslandPage).
 *
 * Not yet wired into `useConversationSession`'s VAD/STT pipeline — that's a
 * genuinely new "second audio source" architecture decision beyond this
 * plan's scope, logged as a known gap rather than built here.
 */

let activeHandlerInstalled = false

export async function startSystemAudioCapture(): Promise<SystemAudioStartResult> {
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    const source = sources[0]
    if (!source) return { ok: false, error: '未找到可用的屏幕音频源' }

    session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
      callback({ video: source, audio: 'loopback' })
    })
    activeHandlerInstalled = true
    return { ok: true }
  } catch (error) {
    return { ok: false, error: (error as Error).message }
  }
}

export function stopSystemAudioCapture(): void {
  if (!activeHandlerInstalled) return
  session.defaultSession.setDisplayMediaRequestHandler(null)
  activeHandlerInstalled = false
}
