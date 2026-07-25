import { readFile } from 'node:fs/promises'

/** Reads a mono PCM16 RIFF/WAVE fixture at the required sample rate. */
export async function readPcm16Wav(
  path: string,
): Promise<Float32Array> {
  const sampleRate = 16000
  const bytes = await readFile(path)
  if (
    bytes.toString('ascii', 0, 4) !== 'RIFF'
    || bytes.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error(`${path} is not a RIFF/WAVE file`)
  }

  let offset = 12
  let format = 0
  let channels = 0
  let rate = 0
  let bits = 0
  let data: Buffer | null = null
  while (offset + 8 <= bytes.length) {
    const kind = bytes.toString('ascii', offset, offset + 4)
    const size = bytes.readUInt32LE(offset + 4)
    const start = offset + 8
    if (kind === 'fmt ') {
      format = bytes.readUInt16LE(start)
      channels = bytes.readUInt16LE(start + 2)
      rate = bytes.readUInt32LE(start + 4)
      bits = bytes.readUInt16LE(start + 14)
    } else if (kind === 'data') {
      data = bytes.subarray(start, start + size)
    }
    offset = start + size + (size % 2)
  }
  if (
    format !== 1
    || channels !== 1
    || rate !== sampleRate
    || bits !== 16
    || !data
  ) {
    throw new Error(`${path} must be ${sampleRate / 1000} kHz mono PCM16 WAV`)
  }

  const pcm = new Float32Array(data.length / 2)
  for (let index = 0; index < pcm.length; index++) {
    pcm[index] = data.readInt16LE(index * 2) / 32768
  }
  return pcm
}
