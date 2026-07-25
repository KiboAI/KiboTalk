---
module: speaker
tags: [speaker-verification, enrollment, hysteresis, wespeaker]
problem_type: model-decision-pipeline
---

# Speaker verification needs quality gates and hysteresis

## Symptoms

- The enrolled user is intermittently labeled as `other`, especially on short
  or noisy VAD fragments.
- One ambiguous score becomes a speaker-change TurnGate flush, which can split
  one sentence into multiple STT and LLM requests.
- A model load or inference error is presented as positive evidence for
  `other`.
- Weak enrollment audio is accepted and only fails later during live use.

## Root cause

Cosine similarity is a raw model score, not a calibrated probability. Applying
one threshold independently to every small VAD fragment makes labels chatter
near the boundary. The old error path also returned `other`, conflating
“verification unavailable” with “verified non-target”.

Enrollment previously accepted silence, very short captures, and arbitrary
outer silence. A single weak embedding then became the permanent reference.

## Fix

- Enrollment trims outer silence and rejects low-level or sub-2.5-second
  effective speech. The UI explains whether the recording was too quiet or too
  short in the active UI language.
- Verification trims outer silence before embedding.
- A speaker change now uses a 0.05 hysteresis margin around the configured
  threshold. Scores inside the band retain the stable speaker, so one ambiguous
  fragment cannot immediately split the turn.
- Verification exceptions retain the stable/manual speaker and show an error;
  they no longer default to `other`.
- Production uses revision-pinned WeSpeaker ResNet34-LM Q8 with its calibrated
  threshold `0.49`; WavLM's former `0.8` threshold is never reused across
  models.
- Stored embeddings live in a model-revision-specific database namespace.
  Upgrades never reinterpret an incompatible 512-dimensional WavLM vector as a
  256-dimensional WeSpeaker vector.
- Sessions with separate microphone and system-audio tracks bypass the model:
  mic is `user`, system audio is `other`.

## Verification

```bash
pnpm --filter @kibotalk/speaker test
pnpm --filter @kibotalk/app-shared typecheck
pnpm --filter @kibotalk/playground exec tsc --noEmit
pnpm --filter @kibotalk/desktop verify:speaker -- \
  /path/to/enrollment.wav /path/to/same.wav /path/to/different.wav
```

Hysteresis reduces label chatter; it does not replace dataset calibration.
Threshold and margin must be evaluated on held-out target/non-target recordings
grouped by language, duration, device, and noise.
