import { AutoModel } from '@huggingface/transformers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const forward = vi.fn(async () => ({
  stateN: { data: new Float32Array(0) },
  output: { data: new Float32Array([0]) },
}))

vi.mock('@huggingface/transformers', () => ({
  AutoModel: {
    from_pretrained: vi.fn(async () => forward),
  },
  Tensor: class {
    data: unknown

    constructor(_type: string, data: unknown) {
      this.data = data
    }
  },
}))

describe('Silero model lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reuses the model loaded during preload when live inference starts', async () => {
    const { createSileroInfer, preloadSileroModel, SILERO_VARIANTS } = await import(
      '../src/audio/silero-vad'
    )
    const variant = SILERO_VARIANTS[0]!

    await preloadSileroModel(variant)
    await createSileroInfer(variant)

    expect(AutoModel.from_pretrained).toHaveBeenCalledTimes(1)
  })
})
