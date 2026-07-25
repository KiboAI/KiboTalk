import { copyFile, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AutoModel, AutoProcessor, env } from '@huggingface/transformers'
import {
  defaultAppConfig,
  SPEAKER_MODEL_DTYPE,
  SPEAKER_MODEL_ID,
  SPEAKER_MODEL_REVISION,
  SILERO_VARIANTS,
} from '@kibotalk/app-shared'

/**
 * Downloads the on-device models desktop bundles into the installer —
 * WeSpeaker embedding and the Silero VAD variant `defaultAppConfig`
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
const bundleModelsDir = join(scriptDir, '../resources/bundle-models')

// A pinned revision is cached under
// `<cacheDir>/<modelId>/<revision>/<filename>`. The bundled/VPS layout omits
// that revision directory because their Transformers.js path template is
// `{model}/`; map source to destination explicitly below.
env.allowLocalModels = false
env.allowRemoteModels = true
env.useBrowserCache = false
env.useFSCache = true
env.cacheDir = `${modelsDir}/`

async function main() {
  await mkdir(modelsDir, { recursive: true })

  console.log(`Downloading speaker-embedding model (${SPEAKER_MODEL_ID})…`)
  await AutoProcessor.from_pretrained(SPEAKER_MODEL_ID, {
    revision: SPEAKER_MODEL_REVISION,
  })
  await AutoModel.from_pretrained(SPEAKER_MODEL_ID, {
    dtype: SPEAKER_MODEL_DTYPE,
    revision: SPEAKER_MODEL_REVISION,
  })

  const vadVariant = SILERO_VARIANTS.find((variant) => variant.id === defaultAppConfig.vadVariantId) ?? SILERO_VARIANTS[0]
  console.log(`Downloading VAD model (${vadVariant.modelId})…`)
  await AutoModel.from_pretrained(vadVariant.modelId, {
    config: { model_type: 'custom' },
    dtype: 'q8',
    revision: vadVariant.revision,
  } as Record<string, unknown>)

  await rm(bundleModelsDir, { recursive: true, force: true })
  const bundleFiles = [
    {
      source: `${SPEAKER_MODEL_ID}/${SPEAKER_MODEL_REVISION}/config.json`,
      destination: `${SPEAKER_MODEL_ID}/config.json`,
    },
    {
      source: `${SPEAKER_MODEL_ID}/${SPEAKER_MODEL_REVISION}/preprocessor_config.json`,
      destination: `${SPEAKER_MODEL_ID}/preprocessor_config.json`,
    },
    {
      source: `${SPEAKER_MODEL_ID}/${SPEAKER_MODEL_REVISION}/onnx/model_quantized.onnx`,
      destination: `${SPEAKER_MODEL_ID}/onnx/model_quantized.onnx`,
    },
    {
      source: `${vadVariant.modelId}/${vadVariant.revision}/onnx/model_quantized.onnx`,
      destination: `${vadVariant.modelId}/onnx/model_quantized.onnx`,
    },
  ]
  for (const file of bundleFiles) {
    const source = join(modelsDir, file.source)
    const destination = join(bundleModelsDir, file.destination)
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(source, destination)
  }
  await copyFile(
    join(scriptDir, '../../../THIRD_PARTY_NOTICES.md'),
    join(bundleModelsDir, 'THIRD_PARTY_NOTICES.md'),
  )

  console.log(`Done — Q8 speaker + Q8 VAD bundle staged at ${bundleModelsDir}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
