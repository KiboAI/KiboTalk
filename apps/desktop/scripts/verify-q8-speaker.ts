import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { AutoModel, AutoProcessor, env } from '@huggingface/transformers'
import {
  createSileroInfer,
  defaultAppConfig,
  SILERO_VARIANTS,
  WAVLM_MODEL_ID,
  WAVLM_MODEL_REVISION,
} from '@kibotalk/app-shared'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const modelsDirectory = join(scriptDirectory, '../resources/models')
const sampleRate = 16000

env.allowLocalModels = false
// "Remote" is the hub/cache code path in Transformers.js; the populated
// filesystem cache below satisfies every file without a network request.
env.allowRemoteModels = true
env.useBrowserCache = false
env.useFSCache = true
env.cacheDir = `${modelsDirectory}/`

function voiceLikeSample(fundamentalHz: number, seed: number): Float32Array {
  const samples = new Float32Array(sampleRate * 4)
  let randomState = seed >>> 0
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate
    const syllableEnvelope = 0.35 + 0.65 * Math.max(0, Math.sin(Math.PI * 3.2 * time))
    const vibrato = 1 + 0.018 * Math.sin(2 * Math.PI * 5.3 * time)
    const phase = 2 * Math.PI * fundamentalHz * vibrato * time
    randomState = (1664525 * randomState + 1013904223) >>> 0
    const noise = (randomState / 0xffffffff - 0.5) * 0.018
    samples[index] = syllableEnvelope * (
      0.52 * Math.sin(phase)
      + 0.25 * Math.sin(phase * 2.03)
      + 0.14 * Math.sin(phase * 3.97)
      + 0.07 * Math.sin(2 * Math.PI * 900 * time)
    ) + noise
  }
  return samples
}

async function readPcm16Wav(path: string): Promise<Float32Array> {
  const bytes = await readFile(path)
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${path} is not a RIFF/WAVE file`)
  }
  let offset = 12
  let channels = 0
  let rate = 0
  let format = 0
  let bits = 0
  let data: Buffer | null = null
  while (offset + 8 <= bytes.length) {
    const chunk = bytes.toString('ascii', offset, offset + 4)
    const size = bytes.readUInt32LE(offset + 4)
    const start = offset + 8
    if (chunk === 'fmt ') {
      format = bytes.readUInt16LE(start)
      channels = bytes.readUInt16LE(start + 2)
      rate = bytes.readUInt32LE(start + 4)
      bits = bytes.readUInt16LE(start + 14)
    } else if (chunk === 'data') {
      data = bytes.subarray(start, start + size)
    }
    offset = start + size + (size % 2)
  }
  if (format !== 1 || channels !== 1 || rate !== sampleRate || bits !== 16 || !data) {
    throw new Error(`${path} must be 16 kHz mono PCM16 WAV`)
  }
  const pcm = new Float32Array(data.length / 2)
  for (let index = 0; index < pcm.length; index++) {
    pcm[index] = data.readInt16LE(index * 2) / 32768
  }
  return pcm
}

function cosine(left: Float32Array, right: Float32Array): number {
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let index = 0; index < left.length; index++) {
    dot += left[index] * right[index]
    leftNorm += left[index] ** 2
    rightNorm += right[index] ** 2
  }
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

async function embed(
  model: Awaited<ReturnType<typeof AutoModel.from_pretrained>>,
  processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>,
  pcm: Float32Array,
): Promise<Float32Array> {
  const inputs = await processor(pcm)
  const result = (await model(inputs)) as { embeddings: { data: Float32Array } }
  return new Float32Array(result.embeddings.data)
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
  const processor = await AutoProcessor.from_pretrained(WAVLM_MODEL_ID, {
    revision: WAVLM_MODEL_REVISION,
  })
  const [fp32Model, q8Model] = await Promise.all([
    AutoModel.from_pretrained(WAVLM_MODEL_ID, {
      dtype: 'fp32',
      revision: WAVLM_MODEL_REVISION,
    }),
    AutoModel.from_pretrained(WAVLM_MODEL_ID, {
      dtype: 'q8',
      revision: WAVLM_MODEL_REVISION,
    }),
  ])
  const paths = process.argv.slice(2).filter((argument) => argument !== '--')
  const usingWaveFixtures = paths.length === 3
  const [enrollment, sameSpeaker, differentSpeaker] =
    paths.length === 3
      ? await Promise.all(paths.map(readPcm16Wav))
      : [
          voiceLikeSample(148, 11),
          voiceLikeSample(151, 12),
          voiceLikeSample(225, 29),
        ]

  const fp32Enrollment = await embed(fp32Model, processor, enrollment)
  const fp32Same = await embed(fp32Model, processor, sameSpeaker)
  const fp32Different = await embed(fp32Model, processor, differentSpeaker)
  const q8Enrollment = await embed(q8Model, processor, enrollment)
  const q8Same = await embed(q8Model, processor, sameSpeaker)
  const q8Different = await embed(q8Model, processor, differentSpeaker)
  const q8VadMaxSpeechProbability = await maxVadProbability(enrollment)

  const metrics = {
    embeddingAgreement: cosine(fp32Enrollment, q8Enrollment),
    fp32SameSpeaker: cosine(fp32Enrollment, fp32Same),
    q8SameSpeaker: cosine(q8Enrollment, q8Same),
    fp32DifferentSpeaker: cosine(fp32Enrollment, fp32Different),
    q8DifferentSpeaker: cosine(q8Enrollment, q8Different),
    q8VadMaxSpeechProbability,
  }
  const sameDelta = Math.abs(metrics.fp32SameSpeaker - metrics.q8SameSpeaker)
  const differentDelta = Math.abs(metrics.fp32DifferentSpeaker - metrics.q8DifferentSpeaker)
  console.log(JSON.stringify({ ...metrics, sameDelta, differentDelta }, null, 2))

  if (metrics.embeddingAgreement < 0.95) {
    throw new Error(`Q8 embedding agreement too low: ${metrics.embeddingAgreement}`)
  }
  if (sameDelta > 0.03 || differentDelta > 0.05) {
    throw new Error(`Q8 similarity drift too high: same=${sameDelta}, different=${differentDelta}`)
  }
  const threshold = 0.8
  if (
    (metrics.fp32SameSpeaker >= threshold) !== (metrics.q8SameSpeaker >= threshold)
    || (metrics.fp32DifferentSpeaker >= threshold) !== (metrics.q8DifferentSpeaker >= threshold)
  ) {
    throw new Error('Q8 changes a speaker decision at the production threshold')
  }
  if (
    usingWaveFixtures
    && (metrics.q8SameSpeaker < threshold || metrics.q8DifferentSpeaker >= threshold)
  ) {
    throw new Error('Q8 does not separate the same/different TTS speakers at the production threshold')
  }
  if (usingWaveFixtures && metrics.q8VadMaxSpeechProbability < 0.5) {
    throw new Error(`Q8 VAD did not detect the TTS fixture: ${metrics.q8VadMaxSpeechProbability}`)
  }
}

main().catch((cause) => {
  console.error(cause)
  process.exit(1)
})
