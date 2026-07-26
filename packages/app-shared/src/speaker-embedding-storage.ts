import { IndexedDbEmbeddingStorage } from '@kibotalk/speaker'
import {
  SPEAKER_MODEL_DTYPE,
  SPEAKER_MODEL_ID,
  SPEAKER_MODEL_REVISION,
} from './audio/speaker-model-contract'

const LEGACY_SPEAKER_EMBEDDING_DATABASES = ['kibotalk-speaker']

/**
 * Embeddings are only valid for the exact model revision and numeric format
 * that produced them. Changing either creates a new namespace and naturally
 * sends upgraded users through enrollment again.
 */
export const CURRENT_SPEAKER_EMBEDDING_DATABASE = [
  'kibotalk-speaker',
  SPEAKER_MODEL_ID.replace('/', '--'),
  SPEAKER_MODEL_REVISION,
  SPEAKER_MODEL_DTYPE,
].join(':')

export function createCurrentSpeakerEmbeddingStorage(): IndexedDbEmbeddingStorage {
  return new IndexedDbEmbeddingStorage(CURRENT_SPEAKER_EMBEDDING_DATABASE)
}

/**
 * User-initiated voiceprint deletion/reset clears both the current model's
 * namespace and known legacy namespaces. Model migration stays out of the
 * generic speaker core and never attempts to reinterpret incompatible vectors.
 */
export async function clearSpeakerEmbeddingData(): Promise<void> {
  await Promise.all([
    createCurrentSpeakerEmbeddingStorage().clear(),
    ...LEGACY_SPEAKER_EMBEDDING_DATABASES.map((database) =>
      new IndexedDbEmbeddingStorage(database).clear(),
    ),
  ])
}
