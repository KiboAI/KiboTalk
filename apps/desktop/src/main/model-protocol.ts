import { existsSync } from 'node:fs'
import { join, normalize } from 'node:path'
import { app, net, protocol } from 'electron'

/** Matches `BUNDLED_MODELS_HOST` in `packages/app-shared/src/audio/model-source.ts`. */
export const MODEL_PROTOCOL_SCHEME = 'kibotalk-model'

/** Where `scripts/download-models.ts` writes files and `electron-builder.config.ts`'s `extraResources` bundles them from/to. */
function modelsRoot(): string {
  return app.isPackaged ? join(process.resourcesPath, 'models') : join(app.getAppPath(), 'resources/models')
}

/**
 * Must run before `app.whenReady()` — Electron only allows privileged
 * custom schemes (ones that support `fetch()`, like a normal HTTP origin)
 * to be registered at module load time.
 */
export function registerModelProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MODEL_PROTOCOL_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  ])
}

/**
 * Serves `<modelsRoot>/<model>/<file>` for `kibotalk-model://app/<model>/<file>`
 * — see `useBundledModels` in `packages/app-shared/src/audio/model-source.ts`,
 * which points transformers.js's remote-model fetch at this scheme instead of
 * the real Hugging Face Hub whenever the renderer runs a production build.
 */
export function registerModelProtocolHandler(): void {
  const root = modelsRoot()
  protocol.handle(MODEL_PROTOCOL_SCHEME, (request) => {
    const relativePath = normalize(decodeURIComponent(new URL(request.url).pathname)).replace(/^(\.\.[/\\])+/, '')
    const filePath = join(root, relativePath)
    if (!filePath.startsWith(root) || !existsSync(filePath)) return new Response('Not found', { status: 404 })
    return net.fetch(`file://${filePath}`)
  })
}
