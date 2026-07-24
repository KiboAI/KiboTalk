import type { Configuration } from 'electron-builder'

/**
 * Minimal packaging config. The menu-bar brand asset is bundled below; a
 * separate app-bundle icon, notarization, and auto-update are not configured.
 */
const config: Configuration = {
  appId: 'com.kibotalk.desktop',
  productName: 'KiboTalk',
  directories: {
    output: 'dist',
  },
  files: ['out/**/*'],
  // Populated by `pnpm download-models` — bundled models, not runtime-fetched (see `src/main/model-protocol.ts`).
  extraResources: [
    { from: 'resources/models', to: 'models' },
    { from: '../../prototypes/assets/kibotalk-mark.svg', to: 'tray/kibotalk-mark.svg' },
  ],
  mac: {
    category: 'public.app-category.productivity',
    target: 'dir',
  },
}

export default config
