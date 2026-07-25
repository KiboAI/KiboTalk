import { describe, expect, it } from 'vitest'
import { speakerEmbeddingFromModelOutput } from '../src'

describe('speaker model output', () => {
  it('reads WavLM-style embeddings output', () => {
    expect(
      speakerEmbeddingFromModelOutput({
        embeddings: { data: new Float32Array([1, 2]) },
      }),
    ).toEqual(new Float32Array([1, 2]))
  })

  it('reads WeSpeaker last-hidden-state output', () => {
    expect(
      speakerEmbeddingFromModelOutput({
        last_hidden_state: { data: new Float32Array([3, 4]) },
      }),
    ).toEqual(new Float32Array([3, 4]))
  })

  it('rejects an output without an embedding tensor', () => {
    expect(() => speakerEmbeddingFromModelOutput({})).toThrow(
      'Speaker model returned no embedding tensor',
    )
  })
})
