import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AutoModel, AutoProcessor, env } from '@huggingface/transformers'
import { defaultAppConfig, SILERO_VARIANTS } from '@kibotalk/app-shared'

/**
 * Downloads the on-device models desktop bundles into the installer —
 * WavLM speaker embedding and the Silero VAD variant `defaultAppConfig`
 * hardcodes — so `pnpm package:mac` can ship them via `extraResources`
 * instead of fetching them at runtime (see `src/main/model-protocol.ts` +
 * `packages/app-shared/src/audio/model-source.ts`).
 *
 * Run manually (`pnpm --filter @kibotalk/desktop download-models`) whenever
 * a model changes; re-run isn't needed for every build since files are
 * cached to disk under `resources/models/` (gitignored — see `.gitignore`).
 */

const scriptDir = dirname(fileURLToPath(import.meta.url))
const modelsDir = join(scriptDir, '../resources/models')

// `env.cacheDir`'s on-disk layout for revision "main" is `<cacheDir>/<modelId>/<filename>`,
// which is exactly the layout `model-protocol.ts`'s `{model}/<file>` handler expects —
// no reshaping needed between download and bundling.
env.allowLocalModels = false
env.allowRemoteModels = true
env.useBrowserCache = false
env.useFSCache = true
env.cacheDir = `${modelsDir}/`

const WAVLM_MODEL_ID = 'Xenova/wavlm-base-plus-sv'

async function main() {
  await mkdir(modelsDir, { recursive: true })

  console.log(`Downloading speaker-embedding model (${WAVLM_MODEL_ID})…`)
  await AutoProcessor.from_pretrained(WAVLM_MODEL_ID)
  await AutoModel.from_pretrained(WAVLM_MODEL_ID)

  const vadVariant = SILERO_VARIANTS.find((variant) => variant.id === defaultAppConfig.vadVariantId) ?? SILERO_VARIANTS[0]
  console.log(`Downloading VAD model (${vadVariant.modelId})…`)
  await AutoModel.from_pretrained(vadVariant.modelId, {
    config: { model_type: 'custom' },
    dtype: 'fp32',
  } as Record<string, unknown>)

  console.log(`Done — models saved to ${modelsDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
