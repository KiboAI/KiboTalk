import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { cosineSimilarity } from '../packages/speaker/src/cosine-sim'
import { speakerEmbeddingFromModelOutput } from '../packages/speaker/src/model-output'
import {
  prepareEnrollmentAudio,
  trimSpeakerAudio,
} from '../packages/speaker/src/audio-quality'
import {
  AutoModel,
  AutoProcessor,
  env,
} from '../packages/app-shared/node_modules/@huggingface/transformers/dist/transformers.node.mjs'
import { readPcm16Wav } from './lib/read-pcm16-wav'

type TrialSubset = 'calibration' | 'evaluation'
type TrialLabel = 'target' | 'non-target'

type SpeakerTrial = {
  subset: TrialSubset
  label: TrialLabel
  enrollment: string
  test: string
}

type SpeakerTrialManifest = {
  dataset: string
  trials: SpeakerTrial[]
}

type ScoredTrial = SpeakerTrial & { score: number }

function argument(name: string, fallback?: string): string {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : fallback
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function optionalArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function ratesAtThreshold(trials: ScoredTrial[], threshold: number) {
  const target = trials.filter((trial) => trial.label === 'target')
  const nonTarget = trials.filter((trial) => trial.label === 'non-target')
  const falseRejections = target.filter((trial) => trial.score < threshold).length
  const falseAcceptances = nonTarget.filter(
    (trial) => trial.score >= threshold,
  ).length
  return {
    threshold,
    falseAcceptanceRate: falseAcceptances / Math.max(1, nonTarget.length),
    falseRejectionRate: falseRejections / Math.max(1, target.length),
    falseAcceptances,
    falseRejections,
    targetTrials: target.length,
    nonTargetTrials: nonTarget.length,
  }
}

function equalErrorThreshold(trials: ScoredTrial[]): number {
  const scores = [...new Set(trials.map((trial) => trial.score))].sort(
    (left, right) => left - right,
  )
  const candidates = [
    scores[0] - Number.EPSILON,
    ...scores.slice(0, -1).map((score, index) => (score + scores[index + 1]) / 2),
    scores.at(-1)! + Number.EPSILON,
  ]
  return candidates
    .map((threshold) => ratesAtThreshold(trials, threshold))
    .sort((left, right) => {
      const leftGap = Math.abs(
        left.falseAcceptanceRate - left.falseRejectionRate,
      )
      const rightGap = Math.abs(
        right.falseAcceptanceRate - right.falseRejectionRate,
      )
      if (leftGap !== rightGap) return leftGap - rightGap
      return (
        left.falseAcceptanceRate
        + left.falseRejectionRate
        - right.falseAcceptanceRate
        - right.falseRejectionRate
      )
    })[0].threshold
}

function percentile(sorted: number[], position: number): number {
  const index = (sorted.length - 1) * position
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  const weight = index - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

function scoreSummary(trials: ScoredTrial[], label: TrialLabel) {
  const scores = trials
    .filter((trial) => trial.label === label)
    .map((trial) => trial.score)
    .sort((left, right) => left - right)
  return {
    count: scores.length,
    minimum: scores[0],
    p05: percentile(scores, 0.05),
    median: percentile(scores, 0.5),
    p95: percentile(scores, 0.95),
    maximum: scores.at(-1),
    mean: scores.reduce((sum, score) => sum + score, 0) / scores.length,
  }
}

async function main() {
  const modelId = argument(
    '--model',
    'onnx-community/wespeaker-voxceleb-resnet34-LM',
  )
  const dtype = argument('--dtype', 'fp32')
  const referenceThreshold = Number(
    optionalArgument('--reference-threshold') ?? '0.8',
  )
  if (!Number.isFinite(referenceThreshold)) {
    throw new Error('--reference-threshold must be a finite number')
  }
  const manifestPath = resolve(argument('--manifest'))
  const outputPath = resolve(
    optionalArgument('--output')
      ?? `${manifestPath}.${modelId.split('/').at(-1)}.${dtype}.json`,
  )
  const cacheDirectory = resolve(
    optionalArgument('--cache') ?? '.benchmarks/model-cache',
  )
  const manifest = JSON.parse(
    await readFile(manifestPath, 'utf8'),
  ) as SpeakerTrialManifest

  env.allowLocalModels = false
  env.allowRemoteModels = true
  env.useBrowserCache = false
  env.useFSCache = true
  env.cacheDir = `${cacheDirectory}/`

  const startedAt = performance.now()
  const [processor, model] = await Promise.all([
    AutoProcessor.from_pretrained(modelId),
    AutoModel.from_pretrained(modelId, { dtype } as Record<string, unknown>),
  ])
  const loadMs = performance.now() - startedAt

  async function embed(pcm: Float32Array): Promise<Float32Array> {
    const inputs = await processor(pcm)
    return speakerEmbeddingFromModelOutput(await model(inputs))
  }

  const inferenceStartedAt = performance.now()
  const manifestDirectory = dirname(manifestPath)
  const embeddings = new Map<string, Float32Array>()
  async function embedding(
    path: string,
    purpose: 'enrollment' | 'test',
  ): Promise<Float32Array> {
    const cacheKey = `${purpose}:${path}`
    const cached = embeddings.get(cacheKey)
    if (cached) return cached
    const pcm = await readPcm16Wav(path)
    const prepared =
      purpose === 'enrollment'
        ? prepareEnrollmentAudio(pcm)
        : trimSpeakerAudio(pcm)
    const result = await embed(prepared.length > 0 ? prepared : pcm)
    embeddings.set(cacheKey, result)
    return result
  }

  const scoredTrials: ScoredTrial[] = []
  for (const trial of manifest.trials) {
    const enrollmentPath = resolve(manifestDirectory, trial.enrollment)
    const testPath = resolve(manifestDirectory, trial.test)
    const [enrollmentEmbedding, testEmbedding] = await Promise.all([
      embedding(enrollmentPath, 'enrollment'),
      embedding(testPath, 'test'),
    ])
    scoredTrials.push({
      ...trial,
      score: cosineSimilarity(enrollmentEmbedding, testEmbedding),
    })
  }

  const calibrationTrials = scoredTrials.filter(
    (trial) => trial.subset === 'calibration',
  )
  const evaluationTrials = scoredTrials.filter(
    (trial) => trial.subset === 'evaluation',
  )
  const threshold = equalErrorThreshold(calibrationTrials)
  const report = {
    dataset: manifest.dataset,
    modelId,
    dtype,
    embeddingDimensions: embeddings.values().next().value?.length,
    uniqueAudioFiles: embeddings.size,
    loadMs,
    inferenceMs: performance.now() - inferenceStartedAt,
    calibration: {
      targetScores: scoreSummary(calibrationTrials, 'target'),
      nonTargetScores: scoreSummary(calibrationTrials, 'non-target'),
      operatingPoint: ratesAtThreshold(calibrationTrials, threshold),
      referenceOperatingPoint: ratesAtThreshold(
        calibrationTrials,
        referenceThreshold,
      ),
    },
    evaluation: {
      targetScores: scoreSummary(evaluationTrials, 'target'),
      nonTargetScores: scoreSummary(evaluationTrials, 'non-target'),
      operatingPoint: ratesAtThreshold(evaluationTrials, threshold),
      referenceOperatingPoint: ratesAtThreshold(
        evaluationTrials,
        referenceThreshold,
      ),
    },
    scoredTrials,
  }
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(
    JSON.stringify(
      { outputPath, ...report, scoredTrials: undefined },
      null,
      2,
    ),
  )
}

await main()
