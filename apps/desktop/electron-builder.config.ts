import type { Configuration } from 'electron-builder'

/**
 * Minimal packaging config — no custom icon/notarization/auto-update yet
 * (no design asset exists for one; logged as a known gap, not blocking dev).
 */
const config: Configuration = {
  appId: 'com.kibotalk.desktop',
  productName: 'KiboTalk',
  directories: {
    output: 'dist',
  },
  files: ['out/**/*'],
  // Populated by `pnpm download-models` — bundled models, not runtime-fetched (see `src/main/model-protocol.ts`).
  extraResources: [{ from: 'resources/models', to: 'models' }],
  mac: {
    category: 'public.app-category.productivity',
    target: 'dir',
  },
}

export default config
