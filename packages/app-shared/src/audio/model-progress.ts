/** Subset of transformers.js's `ProgressInfo` union that carries per-file download progress. */
export type ModelProgressEvent = {
  status: string
  file?: string
  /** 0–100, only present on `status: 'progress'` events. */
  progress?: number
}

/**
 * Aggregates transformers.js's per-file `progress_callback` events (a model
 * load can touch several files — config, tokenizer, weights) into one 0–1
 * fraction, and forwards it to `onFraction`.
 */
export function createProgressAggregator(onFraction: (fraction: number) => void): (event: ModelProgressEvent) => void {
  const fractionByFile = new Map<string, number>()

  return (event) => {
    if (!event.file) return
    if (event.status === 'progress') fractionByFile.set(event.file, Math.min(1, Math.max(0, (event.progress ?? 0) / 100)))
    else if (event.status === 'done') fractionByFile.set(event.file, 1)
    else return

    const fractions = [...fractionByFile.values()]
    onFraction(fractions.reduce((sum, f) => sum + f, 0) / fractions.length)
  }
}
