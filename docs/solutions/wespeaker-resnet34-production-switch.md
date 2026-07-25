---
module: speaker-verification
tags: [wespeaker, resnet34, q8, migration, packaging]
problem_type: production-model-migration
---

# A speaker-model switch must migrate the whole contract

## Problem

Changing only the model ID from WavLM to WeSpeaker would leave four incompatible
assumptions in production:

- WavLM's fixed threshold `0.8`;
- 512-dimensional persisted enrollment embeddings;
- a worker that only reads the WavLM `embeddings` output name;
- desktop and VPS bundles containing FP32 `model.onnx`.

Any one of these can surface as incorrect speaker labels or “voice unavailable.”

## Production decision

The 2026-07-26 Mini LibriSpeech benchmark used 26 speakers and 104 balanced
trials, split by speaker into calibration and held-out evaluation halves.
WeSpeaker ResNet34-LM Q8 at threshold `0.49` produced held-out FAR / FRR
`3.85% / 0%`; WavLM FP32 at its calibrated threshold produced
`11.54% / 23.08%`. WeSpeaker processed the 78 unique files in about 4.5 seconds
versus 31.3 seconds for WavLM.

Production therefore pins:

- model: `onnx-community/wespeaker-voxceleb-resnet34-LM`;
- revision: `6a61a1833ff2583aabeba044f5c8221f00b67ceb`;
- dtype: Q8 (`onnx/model_quantized.onnx`);
- threshold: `0.49`, with the existing `0.05` hysteresis margin.

## Responsibility boundaries

- `packages/speaker` remains model-agnostic core logic: audio quality,
  embedding comparison, hysteresis, and generic IndexedDB storage.
- `packages/app-shared/src/speaker-embedding-storage.ts` owns the current
  model-revision-specific storage namespace and explicit cross-version cleanup.
- `packages/app-shared/src/audio/speaker-worker.ts` owns Transformers.js model
  loading and uses the shared output adapter for `embeddings` or
  `last_hidden_state`.
- `apps/desktop/scripts` owns download, bundle layout, and runtime smoke tests.
- User-triggered “delete voiceprint” and “reset personal data” clear both the
  current namespace and known legacy namespaces.

Existing WavLM enrollments are not converted. The product sees no enrollment in
the new namespace and asks the user to record a fresh, model-compatible
voiceprint.

## Verification

```bash
pnpm --filter @kibotalk/speaker test
pnpm --filter @kibotalk/app-shared test
pnpm --filter @kibotalk/desktop download-models
pnpm --filter @kibotalk/desktop verify:speaker -- \
  /path/to/enrollment.wav /path/to/same.wav /path/to/different.wav
pnpm typecheck
pnpm test
pnpm build
```
