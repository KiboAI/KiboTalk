import type { Configuration } from 'electron-builder'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

async function deletePlistKey(plistPath: string, key: string): Promise<void> {
  try {
    await execFileAsync('/usr/libexec/PlistBuddy', ['-c', `Delete :${key}`, plistPath])
  } catch {
    // electron-builder defaults vary by version, so an absent optional key is fine.
  }
}

async function adHocSign(context: {
  appOutDir: string
  packager: { appInfo: { productFilename: string } }
}): Promise<void> {
  if (process.platform !== 'darwin') return
  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const plistPath = join(appPath, 'Contents/Info.plist')
  await execFileAsync('/usr/libexec/PlistBuddy', [
    '-c',
    'Set :NSAppTransportSecurity:NSAllowsArbitraryLoads false',
    plistPath,
  ])
  for (const key of [
    'NSAppTransportSecurity:NSAllowsLocalNetworking',
    'NSAppTransportSecurity:NSExceptionDomains',
    'NSBluetoothAlwaysUsageDescription',
    'NSBluetoothPeripheralUsageDescription',
    'NSCameraUsageDescription',
  ]) {
    await deletePlistKey(plistPath, key)
  }
  await execFileAsync('/usr/bin/codesign', [
    '--force',
    '--deep',
    '--sign',
    '-',
    '--entitlements',
    join(import.meta.dirname, 'build/entitlements.mac.plist'),
    appPath,
  ])
  await execFileAsync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath])
}

/**
 * Apple Silicon competition build. There is intentionally no Developer ID or
 * notarization: `afterPack` applies an ad-hoc signature, and updates are manual.
 */
const config: Configuration = {
  appId: 'com.kibotalk.desktop',
  productName: 'KiboTalk',
  directories: {
    output: 'dist',
  },
  artifactName: '${productName}-${version}-${arch}.${ext}',
  files: ['out/**/*'],
  electronLanguages: ['en', 'en_GB', 'ja', 'zh_CN', 'zh_TW'],
  // Populated by `pnpm download-models` — bundled models, not runtime-fetched (see `src/main/model-protocol.ts`).
  extraResources: [
    { from: 'resources/bundle-models', to: 'models' },
    { from: 'build/tray/kibotalkTemplate.png', to: 'tray/kibotalkTemplate.png' },
    { from: 'build/tray/kibotalkTemplate@2x.png', to: 'tray/kibotalkTemplate@2x.png' },
  ],
  mac: {
    category: 'public.app-category.productivity',
    target: [{ target: 'dmg', arch: ['arm64'] }],
    icon: 'build/icon-assets/Kibo_icon.png',
    identity: null,
    minimumSystemVersion: '13.0.0',
    hardenedRuntime: false,
    gatekeeperAssess: false,
    notarize: false,
    extendInfo: {
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: false,
      },
      NSMicrophoneUsageDescription: 'KiboTalk 需要麦克风权限来实时识别对话并提供回复建议。',
      NSScreenCaptureUsageDescription: 'KiboTalk 需要屏幕录制权限来捕获系统音频。',
      NSAudioCaptureUsageDescription: 'KiboTalk 需要音频捕获权限来识别 Mac 上播放的对话。',
    },
  },
  dmg: {
    sign: false,
    title: 'KiboTalk ${version}',
  },
  afterPack: adHocSign,
}

export default config
