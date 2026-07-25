---
module: app-shared
tags: [realtime-stt, turn-gate, websocket, duplicate-replies]
problem_type: state-machine
---

# Realtime STT completions must be FIFO and pass through TurnGate

## Symptoms

- One utterance can append the same transcript more than once and repeatedly
  trigger equivalent reply cards.
- A short VAD pause creates a formal turn even though the configured `pauseMs`
  has not elapsed.
- One recoverable `TRANSCRIPTION_FAILED` event makes unrelated pending turns
  fail and presents the realtime connection as unavailable.

## Root causes

The realtime client kept a list of `waitCompleted()` callers but resolved every
waiter when the next `completed` event arrived. Completion events correspond to
Manual commits in order, so each event belongs to exactly one waiter.

The realtime session also committed each VAD `speech-ready` fragment directly
to the pipeline. Silero's `minSilenceDurationMs` is an acoustic segmentation
threshold, not the product turn boundary. This bypassed the segment
aggregator's longer `pauseMs`.

Finally, `TRANSCRIPTION_FAILED` is a per-commit error. Treating it like a socket
failure rejected all waiters and incorrectly degraded the whole connection.

## Fix

- Resolve or reject only the oldest completion waiter for each completed commit.
- Keep connection-level errors as fail-all events.
- Commit VAD fragments to realtime STT for low-latency text, then feed the
  finalized text and speaker result into a local TurnGate. Only a TurnGate flush
  calls `ingestFinalizedTurn`.
- Hold the TurnGate timer while the next speech fragment is active, then resume
  it at `speech-end`.
- Drop successful empty transcripts. Preserve an explicit failed transcript as
  one `sttFailed` turn so the UI can report it without inventing text.
- Keep the batch aggregator ready during a realtime session so a development
  fallback does not discard later turns.

## Regression evidence

The original implementation failed focused tests because the first completed
event settled two waiters and one transcription error rejected both. The fixed
implementation passes:

```bash
pnpm --filter @kibotalk/app-shared exec vitest run \
  test/realtime-stt-client.test.ts test/realtime-turn.test.ts
pnpm --filter @kibotalk/audio exec vitest run test/aggregator.test.ts
```

The important invariant is:

> VAD fragments may produce realtime partial/final text, but only TurnGate
> flushes produce formal conversation turns and LLM requests.
