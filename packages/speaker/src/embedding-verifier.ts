import type { Embedding, SpeakerVerifier, VerifyResult } from './types'
import type { Speaker } from '@kibotalk/conversation'
import type { EmbeddingStorage } from './storage'
import { cosineSimilarity } from './cosine-sim'
import { prepareEnrollmentAudio, trimSpeakerAudio } from './audio-quality'

/**
 * A function that turns a PCM chunk (16kHz mono Float32Array) into a speaker
 * embedding vector. Injected so this package stays free of the model runtime
 * (the product wires WeSpeaker via @huggingface/transformers in a Web Worker).
 */
export type EmbedAudio = (pcm: Float32Array) => Promise<Float32Array>

export type EmbeddingVerifierOptions = {
  embedAudio: EmbedAudio
  storage: EmbeddingStorage
  /** Model-calibrated cosine-similarity at/above which a chunk is `user`. */
  threshold: number
  /** Injectable id generator for deterministic tests. */
  generateId?: () => string
}

const defaultGenerateId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

/**
 * Real speaker verification built on an injected embedding function.
 *
 * `enroll` concatenates capture chunks, removes outer silence, validates the
 * spoken duration, and persists one user embedding. `verify` applies the same
 * outer-silence trim before cosine comparison.
 *
 * The model runs out-of-process (Web Worker in the playground); this class only
 * orchestrates embedding + comparison + persistence, so it is unit-testable in
 * Node with a mock `embedAudio` and `InMemoryEmbeddingStorage`.
 */
export class EmbeddingSpeakerVerifier implements SpeakerVerifier {
  private embedAudio: EmbedAudio
  private storage: EmbeddingStorage
  private threshold: number
  private generateId: () => string

  constructor(opts: EmbeddingVerifierOptions) {
    this.embedAudio = opts.embedAudio
    this.storage = opts.storage
    this.threshold = opts.threshold
    this.generateId = opts.generateId ?? defaultGenerateId
  }

  async enroll(audioStream: AsyncIterable<ArrayBuffer>, passphrase: string): Promise<Embedding> {
    const chunks: Float32Array[] = []
    for await (const chunk of audioStream) {
      chunks.push(new Float32Array(chunk))
    }
    if (chunks.length === 0) throw new Error('enrollment received no audio')
    const pcm = new Float32Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
    let offset = 0
    for (const chunk of chunks) {
      pcm.set(chunk, offset)
      offset += chunk.length
    }
    const embedding = await this.embedAudio(prepareEnrollmentAudio(pcm))
    const result: Embedding = {
      vector: embedding,
      createdAt: Date.now(),
      passphrase,
    }
    await this.storage.save(result)
    return result
  }

  async loadEmbedding(): Promise<Embedding | null> {
    return this.storage.load()
  }

  async saveEmbedding(embedding: Embedding): Promise<void> {
    await this.storage.save(embedding)
  }

  async verify(audioChunk: ArrayBuffer, embedding: Embedding): Promise<VerifyResult> {
    const pcm = new Float32Array(audioChunk)
    const trimmed = trimSpeakerAudio(pcm)
    const chunkEmb = await this.embedAudio(trimmed.length > 0 ? trimmed : pcm)
    const similarity = cosineSimilarity(chunkEmb, embedding.vector)
    const speaker: Speaker = similarity >= this.threshold ? 'user' : 'other'
    const confidence = similarity >= this.threshold ? similarity : 1 - similarity
    return { speaker, confidence, similarity }
  }

  /** Update the cosine-similarity threshold at runtime (playground tuning). */
  setThreshold(threshold: number): void {
    this.threshold = threshold
  }
}
