type TensorData = { data: Float32Array }

export type SpeakerModelOutput = {
  embeddings?: TensorData
  last_hidden_state?: TensorData
}

/**
 * Normalizes the output names used by supported speaker-embedding models.
 * WavLM exposes `embeddings`; WeSpeaker exposes `last_hidden_state`.
 */
export function speakerEmbeddingFromModelOutput(
  result: SpeakerModelOutput,
): Float32Array {
  const output = result.embeddings ?? result.last_hidden_state
  if (!output) {
    throw new Error('Speaker model returned no embedding tensor')
  }
  return new Float32Array(output.data)
}
