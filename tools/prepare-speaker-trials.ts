import { spawn } from 'node:child_process'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import {
  EnrollmentAudioError,
  prepareEnrollmentAudio,
} from '../packages/speaker/src/audio-quality'
import { readPcm16Wav } from './lib/read-pcm16-wav'

type TrialSubset = 'calibration' | 'evaluation'

type SpeakerTrial = {
  subset: TrialSubset
  label: 'target' | 'non-target'
  enrollmentSpeakerId: string
  testSpeakerId: string
  enrollment: string
  test: string
}

type SpeakerTrialManifest = {
  dataset: string
  sourceUrl: string
  license: string
  language: string
  audioPreparation: string
  speakers: number
  trials: SpeakerTrial[]
}

function argument(name: string, fallback?: string): string {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : fallback
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

async function findFlacFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) return findFlacFiles(path)
      return entry.isFile() && entry.name.endsWith('.flac') ? [path] : []
    }),
  )
  return nested.flat().sort()
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

async function convertToWav(input: string, output: string): Promise<void> {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not provide a binary')
  await run(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input,
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'pcm_s16le',
    output,
  ])
}

async function main() {
  const corpus = resolve(
    argument(
      '--corpus',
      '.benchmarks/speaker-trials/corpora/LibriSpeech/dev-clean-2',
    ),
  )
  const output = resolve(
    argument('--output', '.benchmarks/speaker-trials/mini-librispeech'),
  )
  const audioOutput = resolve(output, 'audio')
  await mkdir(audioOutput, { recursive: true })

  const speakerEntries = (await readdir(corpus, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { numeric: true }),
    )
  if (speakerEntries.length < 4) {
    throw new Error(`Expected at least four speaker directories in ${corpus}`)
  }

  const audioBySpeaker = new Map<string, string[]>()
  for (const speaker of speakerEntries) {
    const sourceFiles = await findFlacFiles(resolve(corpus, speaker.name))
    const convertedFiles: string[] = []
    let enrollmentFile: string | undefined
    for (const source of sourceFiles) {
      const destination = resolve(
        audioOutput,
        `${speaker.name}-${basename(source, '.flac')}.wav`,
      )
      await convertToWav(source, destination)
      convertedFiles.push(destination)
      if (!enrollmentFile) {
        try {
          prepareEnrollmentAudio(await readPcm16Wav(destination))
          enrollmentFile = destination
        } catch (error) {
          if (!(error instanceof EnrollmentAudioError)) throw error
        }
      }
      if (enrollmentFile && convertedFiles.length >= 3) break
    }
    if (!enrollmentFile || convertedFiles.length < 3) {
      throw new Error(
        `Speaker ${speaker.name} has no valid enrollment plus two test utterances`,
      )
    }
    audioBySpeaker.set(speaker.name, [
      enrollmentFile,
      ...convertedFiles.filter((path) => path !== enrollmentFile).slice(0, 2),
    ])
  }

  const splitIndex = Math.floor(speakerEntries.length / 2)
  const subsets: Array<{
    name: TrialSubset
    speakers: typeof speakerEntries
  }> = [
    { name: 'calibration', speakers: speakerEntries.slice(0, splitIndex) },
    { name: 'evaluation', speakers: speakerEntries.slice(splitIndex) },
  ]
  const trials: SpeakerTrial[] = []
  for (const subset of subsets) {
    for (const [speakerIndex, speaker] of subset.speakers.entries()) {
      const enrollmentFiles = audioBySpeaker.get(speaker.name)!

      for (const testIndex of [1, 2]) {
        trials.push({
          subset: subset.name,
          label: 'target',
          enrollmentSpeakerId: speaker.name,
          testSpeakerId: speaker.name,
          enrollment: relative(output, enrollmentFiles[0]),
          test: relative(output, enrollmentFiles[testIndex]),
        })

        const nonTargetSpeaker =
          subset.speakers[
            (speakerIndex + testIndex) % subset.speakers.length
          ]
        const nonTargetFiles = audioBySpeaker.get(nonTargetSpeaker.name)!
        trials.push({
          subset: subset.name,
          label: 'non-target',
          enrollmentSpeakerId: speaker.name,
          testSpeakerId: nonTargetSpeaker.name,
          enrollment: relative(output, enrollmentFiles[0]),
          test: relative(output, nonTargetFiles[testIndex]),
        })
      }
    }
  }

  const manifest: SpeakerTrialManifest = {
    dataset: 'Mini LibriSpeech dev-clean-2',
    sourceUrl: 'https://www.openslr.org/31/',
    license: 'CC BY 4.0',
    language: 'English',
    audioPreparation:
      'Decoded FLAC to 16 kHz mono PCM16 WAV without loudness normalization.',
    speakers: speakerEntries.length,
    trials,
  }
  const manifestPath = resolve(output, 'manifest.json')
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(
    `Prepared ${trials.length} balanced trials from `
    + `${speakerEntries.length} speakers in ${manifestPath}`,
  )
}

await main()
