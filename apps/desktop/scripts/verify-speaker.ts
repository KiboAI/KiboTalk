import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AutoModel, AutoProcessor, env } from '@huggingface/transformers'
import {
  cosineSimilarity,
  prepareEnrollmentAudio,
  speakerEmbeddingFromModelOutput,
  stabilizeSpeaker,
  trimSpeakerAudio,
} from '@kibotalk/speaker'
import { readPcm16Wav } from '../../../tools/lib/read-pcm16-wav'
import {
  createSileroInfer,
  defaultAppConfig,
  SPEAKER_MODEL_DTYPE,
  SPEAKER_MODEL_ID,
  SPEAKER_MODEL_REVISION,
  SILERO_VARIANTS,
} from '@kibotalk/app-shared'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const modelsDirectory = join(scriptDirectory, '../resources/models')

env.allowLocalModels = false
// "Remote" is the hub/cache code path in Transformers.js; the populated
// filesystem cache below satisfies every file without a network request.
env.allowRemoteModels = true
env.useBrowserCache = false
env.useFSCache = true
env.cacheDir = `${modelsDirectory}/`

async function embed(
  model: Awaited<ReturnType<typeof AutoModel.from_pretrained>>,
  processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>,
  pcm: Float32Array,
): Promise<Float32Array> {
  const inputs = await processor(pcm)
  return speakerEmbeddingFromModelOutput(await model(inputs))
}

async function maxVadProbability(pcm: Float32Array): Promise<number> {
  const variant =
    SILERO_VARIANTS.find(({ id }) => id === defaultAppConfig.vadVariantId)
    ?? SILERO_VARIANTS[0]
  const infer = await createSileroInfer(variant)
  let maximum = 0
  for (let offset = 0; offset < pcm.length; offset += 512) {
    const chunk = new Float32Array(512)
    chunk.set(pcm.subarray(offset, offset + 512))
    const probability = await infer(chunk)
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new Error(`Q8 VAD returned invalid probability: ${probability}`)
    }
    maximum = Math.max(maximum, probability)
  }
  return maximum
}

async function main() {
  const paths = process.argv.slice(2).filter((argument) => argument !== '--')
  if (paths.length !== 3) {
    throw new Error(
      'Expected enrollment, same-speaker, and different-speaker WAV paths',
    )
  }
  const processor = await AutoProcessor.from_pretrained(SPEAKER_MODEL_ID, {
    revision: SPEAKER_MODEL_REVISION,
  })
  const model = await AutoModel.from_pretrained(SPEAKER_MODEL_ID, {
    dtype: SPEAKER_MODEL_DTYPE,
    revision: SPEAKER_MODEL_REVISION,
  })
  const [enrollment, sameSpeaker, differentSpeaker] = await Promise.all(
    paths.map((path) => readPcm16Wav(path)),
  )

  const enrollmentEmbedding = await embed(
    model,
    processor,
    prepareEnrollmentAudio(enrollment),
  )
  const sameEmbedding = await embed(
    model,
    processor,
    trimSpeakerAudio(sameSpeaker),
  )
  const differentEmbedding = await embed(
    model,
    processor,
    trimSpeakerAudio(differentSpeaker),
  )
  const q8VadMaxSpeechProbability = await maxVadProbability(enrollment)
  const sameSpeakerSimilarity = cosineSimilarity(
    enrollmentEmbedding,
    sameEmbedding,
  )
  const differentSpeakerSimilarity = cosineSimilarity(
    enrollmentEmbedding,
    differentEmbedding,
  )
  const threshold = defaultAppConfig.speakerThreshold
  const metrics = {
    modelId: SPEAKER_MODEL_ID,
    dtype: SPEAKER_MODEL_DTYPE,
    threshold,
    sameSpeakerSimilarity,
    differentSpeakerSimilarity,
    q8VadMaxSpeechProbability,
  }
  console.log(JSON.stringify(metrics, null, 2))

  if (
    stabilizeSpeaker(sameSpeakerSimilarity, 'other', threshold) !== 'user'
    || stabilizeSpeaker(differentSpeakerSimilarity, 'user', threshold)
      !== 'other'
  ) {
    throw new Error(
      'Production speaker model failed the hysteresis decision smoke test',
    )
  }
  if (metrics.q8VadMaxSpeechProbability < 0.5) {
    throw new Error(`Q8 VAD did not detect the TTS fixture: ${metrics.q8VadMaxSpeechProbability}`)
  }
}

main().catch((cause) => {
  console.error(cause)
  process.exit(1)
})
