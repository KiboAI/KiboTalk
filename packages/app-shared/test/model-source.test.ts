import { env } from '@huggingface/transformers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultAppConfig } from '../src/config'
import {
  loadModelWithFallback,
  SPEAKER_MODEL_DTYPE,
  SPEAKER_MODEL_ID,
  SPEAKER_MODEL_REVISION,
  useHuggingFaceModels,
} from '../src/audio/model-source'

afterEach(() => {
  useHuggingFaceModels()
  vi.restoreAllMocks()
})

describe('model source fallback', () => {
  it('pins the speaker model and threshold selected by held-out trials', () => {
    expect(SPEAKER_MODEL_ID).toBe(
      'onnx-community/wespeaker-voxceleb-resnet34-LM',
    )
    expect(SPEAKER_MODEL_REVISION).toBe(
      '6a61a1833ff2583aabeba044f5c8221f00b67ceb',
    )
    expect(SPEAKER_MODEL_DTYPE).toBe('q8')
    expect(defaultAppConfig.speakerThreshold).toBe(0.49)
  })

  it('uses immutable Hugging Face paths by default', () => {
    useHuggingFaceModels('https://advx.kibotalk.app')

    expect(env.remoteHost).toBe('https://huggingface.co/')
    expect(env.remotePathTemplate).toBe('{model}/resolve/{revision}/')
  })

  it('retries a failed Hugging Face load once against the VPS mirror', async () => {
    useHuggingFaceModels('https://advx.kibotalk.app/')
    const load = vi.fn(async () => {
      if (env.remoteHost === 'https://huggingface.co/') {
        throw new Error('hub unavailable')
      }
      return env.remoteHost
    })

    await expect(loadModelWithFallback(load)).resolves.toBe(
      'https://advx.kibotalk.app/models/',
    )
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('does not hide an error when no VPS fallback was configured', async () => {
    useHuggingFaceModels()
    const load = vi.fn().mockRejectedValue(new Error('offline'))

    await expect(loadModelWithFallback(load)).rejects.toThrow('offline')
    expect(load).toHaveBeenCalledTimes(1)
  })
})
