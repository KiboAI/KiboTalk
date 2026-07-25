import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  Menu,
  Tray,
  app,
  dialog,
  nativeImage,
  type BrowserWindow,
  type MessageBoxOptions,
} from 'electron'
import {
  IPC_CHANNEL,
  type DesktopSessionCommand,
  type DesktopSessionState,
} from '../shared/ipc'
import { openOnboardingWindow } from './windows/onboarding'

const copy = {
  zh: {
    running: '正在转写',
    paused: '已暂停',
    stopped: '已停止',
    show: '显示悬浮窗',
    hide: '隐藏悬浮窗',
    start: '开始新会话',
    pause: '暂停',
    resume: '继续',
    stop: '停止并保存…',
    ai: 'AI 建议',
    history: '历史会话',
    settings: '设置',
    quit: '退出 KiboTalk…',
    stopTitle: '停止并保存这次会话？',
    stopBody: '当前转写和建议会立即保存。再次开启时会创建新的对话场景。',
    cancel: '取消',
    confirmStop: '停止并保存',
    quitActiveTitle: '结束会话并退出？',
    quitStoppedTitle: '退出 KiboTalk？',
    quitActiveBody: '会话会先封存并保存，然后退出 KiboTalk。',
    quitStoppedBody: '悬浮窗和状态栏图标都会关闭。',
    confirmQuit: '退出',
  },
  ja: {
    running: '文字起こし中',
    paused: '一時停止中',
    stopped: '停止済み',
    show: 'ウィンドウを表示',
    hide: 'ウィンドウを隠す',
    start: '新しい会話を開始',
    pause: '一時停止',
    resume: '再開',
    stop: '停止して保存…',
    ai: 'AI 候補',
    history: '履歴',
    settings: '設定',
    quit: 'KiboTalk を終了…',
    stopTitle: 'この会話を停止して保存しますか？',
    stopBody: '文字起こしと候補を保存します。次に開始すると新しい会話になります。',
    cancel: 'キャンセル',
    confirmStop: '停止して保存',
    quitActiveTitle: '会話を終了してアプリを終了しますか？',
    quitStoppedTitle: 'KiboTalk を終了しますか？',
    quitActiveBody: '会話を保存してから KiboTalk を終了します。',
    quitStoppedBody: 'フローティングウィンドウとメニューバーアイコンを閉じます。',
    confirmQuit: '終了',
  },
  en: {
    running: 'Transcribing',
    paused: 'Paused',
    stopped: 'Stopped',
    show: 'Show floating window',
    hide: 'Hide floating window',
    start: 'Start new session',
    pause: 'Pause',
    resume: 'Resume',
    stop: 'Stop and save…',
    ai: 'AI suggestions',
    history: 'History',
    settings: 'Settings',
    quit: 'Quit KiboTalk…',
    stopTitle: 'Stop and save this session?',
    stopBody: 'The transcript and suggestions will be saved. Starting again creates a new conversation.',
    cancel: 'Cancel',
    confirmStop: 'Stop and save',
    quitActiveTitle: 'End the session and quit?',
    quitStoppedTitle: 'Quit KiboTalk?',
    quitActiveBody: 'The session will be sealed and saved before KiboTalk quits.',
    quitStoppedBody: 'The floating window and menu bar icon will close.',
    confirmQuit: 'Quit',
  },
} as const

function trayImagePath(): string {
  const candidates = [
    join(process.resourcesPath, 'tray', 'kibotalk.png'),
    join(process.cwd(), 'apps', 'desktop', 'build', 'tray', 'kibotalk.png'),
    join(process.cwd(), 'build', 'tray', 'kibotalk.png'),
  ]
  return candidates.find(existsSync) ?? candidates[0]
}

export function createTrayController(params: {
  getIslandWindow: () => BrowserWindow | null
  onQuitConfirmed: () => void
}) {
  const image = nativeImage.createFromPath(trayImagePath())
  const tray = new Tray(image)
  let sessionState: DesktopSessionState = {
    lifecycle: 'stopped',
    replyEnabled: true,
    uiLang: 'zh',
  }

  function send(command: DesktopSessionCommand) {
    params.getIslandWindow()?.webContents.send(IPC_CHANNEL.sessionCommandEvent, command)
  }

  async function confirmStop() {
    const text = copy[sessionState.uiLang]
    const options: MessageBoxOptions = {
      type: 'question',
      title: text.stopTitle,
      message: text.stopTitle,
      detail: text.stopBody,
      buttons: [text.cancel, text.confirmStop],
      defaultId: 1,
      cancelId: 0,
    }
    const owner = params.getIslandWindow()
    const result = owner
      ? await dialog.showMessageBox(owner, options)
      : await dialog.showMessageBox(options)
    if (result.response === 1) send('stop')
  }

  async function requestQuit() {
    const text = copy[sessionState.uiLang]
    const active = sessionState.lifecycle === 'running' || sessionState.lifecycle === 'paused'
    const options: MessageBoxOptions = {
      type: 'warning',
      title: active ? text.quitActiveTitle : text.quitStoppedTitle,
      message: active ? text.quitActiveTitle : text.quitStoppedTitle,
      detail: active ? text.quitActiveBody : text.quitStoppedBody,
      buttons: [text.cancel, text.confirmQuit],
      defaultId: 0,
      cancelId: 0,
    }
    const owner = params.getIslandWindow()
    const result = owner
      ? await dialog.showMessageBox(owner, options)
      : await dialog.showMessageBox(options)
    if (result.response !== 1) return
    if (active) {
      send('prepare-quit')
    } else {
      params.onQuitConfirmed()
    }
  }

  function rebuildMenu() {
    const text = copy[sessionState.uiLang]
    const window = params.getIslandWindow()
    const visible = window?.isVisible() === true
    const lifecycleAction =
      sessionState.lifecycle === 'running'
        ? { label: text.pause, command: 'pause' as const }
        : sessionState.lifecycle === 'paused'
          ? { label: text.resume, command: 'resume' as const }
          : { label: text.start, command: 'start' as const }
    const statusLabel =
      sessionState.lifecycle === 'running'
        ? text.running
        : sessionState.lifecycle === 'paused'
          ? text.paused
          : text.stopped

    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: statusLabel, enabled: false },
        { type: 'separator' },
        {
          label: visible ? text.hide : text.show,
          click: () => {
            if (visible) window?.hide()
            else {
              window?.show()
              window?.focus()
            }
            rebuildMenu()
          },
        },
        { label: lifecycleAction.label, click: () => send(lifecycleAction.command) },
        {
          label: text.stop,
          enabled: sessionState.lifecycle === 'running' || sessionState.lifecycle === 'paused',
          click: () => void confirmStop(),
        },
        {
          label: text.ai,
          type: 'checkbox',
          checked: sessionState.replyEnabled,
          click: () => send('toggle-ai'),
        },
        { type: 'separator' },
        { label: text.history, click: () => void openOnboardingWindow('history') },
        { label: text.settings, click: () => void openOnboardingWindow('settings') },
        { type: 'separator' },
        { label: text.quit, click: () => void requestQuit() },
      ]),
    )
    tray.setToolTip(`KiboTalk · ${statusLabel}`)
  }

  tray.on('click', () => {
    const window = params.getIslandWindow()
    window?.show()
    window?.focus()
    rebuildMenu()
  })
  app.on('browser-window-focus', rebuildMenu)
  rebuildMenu()

  return {
    requestQuit,
    refresh: rebuildMenu,
    updateState(next: DesktopSessionState) {
      sessionState = next
      rebuildMenu()
    },
    destroy() {
      tray.destroy()
    },
  }
}
