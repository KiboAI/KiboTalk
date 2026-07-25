import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import { createVAD } from '../packages/audio/src/vad'
import { readPcm16Wav } from './lib/read-pcm16-wav'

type SubtitleCue = {
  startMs: number
  endMs: number
  translationText: string
}

type BenchmarkManifest = {
  media: string
  subtitles: string
  clipStartMs: number
  clipDurationMs: number
  audio: string
  transcriptGroundTruth: false
  note: string
  audioPreparation: string
  cues: SubtitleCue[]
}

type Interval = { startMs: number; endMs: number }

function argument(name: string, fallback?: string): string {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : fallback
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

function parseClock(value: string): number {
  const parts = value.split(':').map(Number)
  if (parts.some((part) => !Number.isFinite(part))) {
    throw new Error(`Invalid timestamp: ${value}`)
  }
  const [hours, minutes, seconds] =
    parts.length === 3 ? parts : [0, parts[0], parts[1]]
  return ((hours * 60 + minutes) * 60 + seconds) * 1000
}

function cleanAssText(text: string): string {
  return text
    .replace(/\{[^}]*\}/g, '')
    .replace(/\\[Nn]/g, ' ')
    .replace(/\\h/g, ' ')
    .trim()
}

function parseAss(source: string): SubtitleCue[] {
  const cues: SubtitleCue[] = []
  for (const line of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!line.startsWith('Dialogue:')) continue
    const fields = line.slice('Dialogue:'.length).split(',')
    if (fields.length < 10) continue
    const [layer, start, end, style] = fields
    if (layer.trim() !== '0' || style.trim() !== 'Default') continue
    const translationText = cleanAssText(fields.slice(9).join(','))
    if (!translationText) continue
    cues.push({
      startMs: parseClock(start.trim()),
      endMs: parseClock(end.trim()),
      translationText,
    })
  }
  return cues
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`${basename(command)} exited with ${code}`))
    })
  })
}

async function prepare() {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not provide a binary')
  const media = resolve(argument('--media'))
  const subtitles = resolve(argument('--subtitles'))
  const output = resolve(argument('--output', '.benchmarks/drama'))
  const clipStartMs = parseClock(argument('--start', '00:00:50'))
  const clipDurationMs = parseClock(argument('--duration', '00:03:00'))
  const audio = resolve(output, 'audio-16k-mono.wav')
  await mkdir(output, { recursive: true })

  await run(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-y',
    '-ss',
    String(clipStartMs / 1000),
    '-t',
    String(clipDurationMs / 1000),
    '-i',
    media,
    '-map',
    '0:a:0',
    '-af',
    'pan=mono|c0=FC,loudnorm=I=-23:LRA=7:TP=-2',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'pcm_s16le',
    audio,
  ])

  const allCues = parseAss(await readFile(subtitles, 'utf8'))
  const clipEndMs = clipStartMs + clipDurationMs
  const cues = allCues
    .filter((cue) => cue.endMs > clipStartMs && cue.startMs < clipEndMs)
    .map((cue) => ({
      startMs: Math.max(0, cue.startMs - clipStartMs),
      endMs: Math.min(clipDurationMs, cue.endMs - clipStartMs),
      translationText: cue.translationText,
    }))
  const manifest: BenchmarkManifest = {
    media,
    subtitles,
    clipStartMs,
    clipDurationMs,
    audio,
    transcriptGroundTruth: false,
    note:
      'The ASS file is a Chinese translation without speaker labels. Use cue times for approximate VAD scoring and text for scene semantics, not Japanese ASR WER.',
    audioPreparation:
      'Extracted the 5.1 center channel, which carries dialogue, then normalized it to -23 LUFS before resampling to 16 kHz mono PCM16.',
    cues,
  }
  await writeFile(
    resolve(output, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  console.log(`Prepared ${cues.length} subtitle cues in ${output}`)
}

function overlap(left: Interval, right: Interval): number {
  return Math.max(0, Math.min(left.endMs, right.endMs) - Math.max(left.startMs, right.startMs))
}

function scoreIntervals(predicted: Interval[], expected: Interval[], durationMs: number) {
  const bucketMs = 50
  let truePositive = 0
  let falsePositive = 0
  let falseNegative = 0
  for (let time = 0; time < durationMs; time += bucketMs) {
    const predictedSpeech = predicted.some(
      (interval) => time < interval.endMs && time + bucketMs > interval.startMs,
    )
    const expectedSpeech = expected.some(
      (interval) => time < interval.endMs && time + bucketMs > interval.startMs,
    )
    if (predictedSpeech && expectedSpeech) truePositive++
    else if (predictedSpeech) falsePositive++
    else if (expectedSpeech) falseNegative++
  }
  const precision = truePositive / Math.max(1, truePositive + falsePositive)
  const recall = truePositive / Math.max(1, truePositive + falseNegative)
  const f1 = (2 * precision * recall) / Math.max(Number.EPSILON, precision + recall)
  const splitCount = expected.reduce(
    (total, cue) =>
      total + Math.max(0, predicted.filter((interval) => overlap(interval, cue) > 0).length - 1),
    0,
  )
  const mergeCount = predicted.reduce(
    (total, interval) =>
      total + Math.max(0, expected.filter((cue) => overlap(interval, cue) > 0).length - 1),
    0,
  )
  const boundaryErrors = predicted
    .map((interval) => {
      const match = expected
        .map((cue) => ({ cue, overlapMs: overlap(interval, cue) }))
        .sort((left, right) => right.overlapMs - left.overlapMs)[0]
      return match?.overlapMs
        ? (Math.abs(interval.startMs - match.cue.startMs) +
            Math.abs(interval.endMs - match.cue.endMs)) /
            2
        : null
    })
    .filter((error): error is number => error !== null)
  const boundaryMeanAbsoluteErrorMs =
    boundaryErrors.reduce((sum, error) => sum + error, 0) /
    Math.max(1, boundaryErrors.length)
  const totalScore =
    f1 -
    (splitCount + mergeCount) / Math.max(1, expected.length) * 0.03 -
    Math.min(boundaryMeanAbsoluteErrorMs / 10000, 0.2)
  return {
    totalScore,
    precision,
    recall,
    f1,
    splitCount,
    mergeCount,
    boundaryMeanAbsoluteErrorMs,
  }
}

async function vadGrid() {
  const manifestPath = resolve(argument('--manifest'))
  const output = resolve(argument('--output', `${manifestPath}.vad-grid.json`))
  const manifest = JSON.parse(
    await readFile(manifestPath, 'utf8'),
  ) as BenchmarkManifest
  const pcm = await readPcm16Wav(manifest.audio)

  const { env } = await import(
    '../packages/app-shared/node_modules/@huggingface/transformers/dist/transformers.node.mjs'
  )
  env.allowLocalModels = false
  env.allowRemoteModels = true
  env.useBrowserCache = false
  env.useFSCache = true
  env.cacheDir = `${resolve('apps/desktop/resources/models')}/`
  const { createSileroInfer, SILERO_VARIANTS } = await import(
    '../packages/app-shared/src/audio/silero-vad'
  )
  const infer = await createSileroInfer(SILERO_VARIANTS[0], 16000)
  const probabilities: number[] = []
  for (let offset = 0; offset < pcm.length; offset += 512) {
    const chunk = new Float32Array(512)
    chunk.set(pcm.subarray(offset, offset + 512))
    probabilities.push(await infer(chunk))
  }
  const sortedProbabilities = probabilities.toSorted((left, right) => left - right)
  const percentile = (fraction: number) =>
    sortedProbabilities[
      Math.min(
        sortedProbabilities.length - 1,
        Math.floor(sortedProbabilities.length * fraction),
      )
    ] ?? 0
  const probabilitySummary = {
    min: percentile(0),
    p50: percentile(0.5),
    p90: percentile(0.9),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: percentile(1),
  }

  const expected = manifest.cues.map(({ startMs, endMs }) => ({ startMs, endMs }))
  const results: Array<Record<string, number>> = []
  for (const speechThreshold of [0.2, 0.35, 0.5]) {
    for (const exitThreshold of [0.1, 0.2]) {
      for (const minSilenceDurationMs of [200, 400, 600]) {
        for (const minSpeechDurationMs of [200, 320]) {
          let probabilityIndex = 0
          let currentStartMs = 0
          let processedSamples = 0
          const predicted: Interval[] = []
          const vad = createVAD(
            async () => probabilities[probabilityIndex++] ?? 0,
            {
              sampleRate: 16000,
              speechThreshold,
              exitThreshold,
              minSilenceDurationMs,
              minSpeechDurationMs,
              speechPadMs: 0,
              newBufferSize: 512,
            },
          )
          vad.on('speech-start', () => {
            currentStartMs = processedSamples / 16
          })
          vad.on('speech-ready', () => {
            predicted.push({
              startMs: currentStartMs,
              endMs: processedSamples / 16,
            })
          })
          for (let index = 0; index < probabilities.length + 20; index++) {
            await vad.processAudio(new Float32Array(512))
            processedSamples += 512
          }
          results.push({
            speechThreshold,
            exitThreshold,
            minSilenceDurationMs,
            minSpeechDurationMs,
            predictedSegments: predicted.length,
            ...scoreIntervals(predicted, expected, manifest.clipDurationMs),
          })
        }
      }
    }
  }
  results.sort((left, right) => right.totalScore - left.totalScore)
  await writeFile(
    output,
    `${JSON.stringify(
      {
        manifest: manifestPath,
        caveat: manifest.note,
        audioPreparation: manifest.audioPreparation,
        probabilitySummary,
        evaluatedConfigurations: results.length,
        top: results.slice(0, 10),
        results,
      },
      null,
      2,
    )}\n`,
  )
  console.table(probabilitySummary)
  console.table(results.slice(0, 10))
  console.log(`Wrote ${output}`)
}

const command = process.argv[2]
if (command === 'prepare') await prepare()
else if (command === 'vad-grid') await vadGrid()
else {
  throw new Error(
    'Usage: drama-benchmark <prepare|vad-grid> --media ... --subtitles ... --output ...',
  )
}
