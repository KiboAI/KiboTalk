# AGENTS.md

Guidance for AI coding agents working in this repo. Read before making changes.

## What this is

KiboTalk — "Live Reply Coach" MVP: a live foreign-language conversation coach.
Speaker verification splits user vs counterpart; after **either** speaker's
turn is ingested we always request reply suggestions. The LLM returns exactly
3 candidates or `[]` (skip). Empty / failed / in-flight keeps the previous
committed cards. User mid-utterance stalls (after pause) get full-sentence
completions; other turns almost always get 3. Same card schema for both.

**Language axes** (spec §1.4, ADR 0003): `conversationLang` (ja|en|zh) is what
both speakers use in-session (STT hint + `targetText`); persisted product
`uiLang` (ja|en|zh) controls the UI and is frozen into internal `meaningLang`
for candidate `meaning` when a session starts (it may equal conversation).
Level is one global `beginner|intermediate|advanced` value (`level`).
Prefs are session-out only; each session freezes a snapshot. Japanese-only
`segments` (furigana / particles); rename is `meaning` not `meaningZh`.

Authoritative spec: `docs/spec/live-reply-coach-mvp.md`. ADRs in
`docs/adr/`. Past fixes & known pitfalls in `docs/solutions/` (read the
relevant one before touching a documented area). Prompt / schema vieval
benchmark reports in `docs/prompt-evals/` (read the latest before changing
reply prompts). When implementation and spec diverge, align per spec or
update the spec — don't silently drift.

## Architecture

Client orchestration + thin proxy (ADR 0001). The browser runs the pipeline;
`apps/api` is a stateless Hono proxy that hides provider keys and forwards STT/LLM.

**STT** (ADR 0004): **realtime only** via `WS /stt-realtime` (DashScope
`qwen3-asr-flash-realtime`). Local VAD + speaker verification own turn
boundaries (`pauseMs`); upstream uses Manual commit (no server VAD). Timeline
may show partial drafts; formal turns + LLM fire only on finalized transcript.

```
apps/
  api/        Hono proxy: /stt-realtime (WS), /llm (SSE). Keys server-side only.
  playground/ Vite + React dev panel (Chinese UI) for testing each layer
              (声纹页 covers enrollment + free-speech verify / threshold tuning).
  web/        PWA shell (not yet built).
packages/
  audio/      VAD state machine + encodeWav. Silero via transformers.js.
  llm/        LLM client (xsai).
  prompts/    Reply-suggestion prompts (Velin TSX → markdown).
  speaker/    Speaker verification (wespeaker-voxceleb-resnet34-LM Q8, WASM + IndexedDB);
              `verify` returns raw `similarity` plus label `confidence`.
  stt/        DashScope realtime mapper helpers (server-side); `apps/api` relays
              `WS /stt-realtime` only.
  pipeline/   Conversation store + turn state machine.
  ui/         shadcn/ui primitives on Tailwind v4 (shared).
  app-shared/ Shared client types/config shell.
```

## Tech stack — do not bypass these

These are spec-named choices. **Do not rewrite or substitute them** with hand-rolled equivalents:

- **LLM → `xsai`** (`@xsai/stream-text`). Never hand-roll fetch/SSE for LLM. An official `xsai` skill is installed at `.agents/skills/xsai/` — read its `SKILL.md` + `references/` before touching `packages/llm`.
- **Prompts → Velin** (`@velin-dev/core-react`). Render TSX components to markdown strings; don't template with raw string concat.
- **STT → DashScope realtime** via `packages/stt` mapper helpers, reached through the `apps/api` `WS /stt-realtime` relay. **Never browser-direct** to upstream (ADR 0004).
- **VAD → Silero** via `@huggingface/transformers`. v6.2 needs a 64-sample context prepended to each 512-sample chunk (576 input), carried across calls; v5 takes 512 raw. See `apps/playground/src/audio/silero-vad.ts`.
- **Speaker → `onnx-community/wespeaker-voxceleb-resnet34-LM` (Q8)** via transformers.js in a Web Worker; embeddings persist in IndexedDB.
- **Python deps → `uv`**: repo-local `.venv` (gitignored); install with `uv pip install -r <path>/requirements.txt`, never bare `pip`. Keep helper scripts in the repo so GitHub workflows can run them; invoke with `.venv/bin/python`.

## Audio pipeline specifics

- **Sample rate**: 16 kHz mono PCM everywhere (VAD, realtime STT uplink, speaker embeddings).
- **VAD chunk size**: 512 samples (32 ms) per `processAudio` call (`packages/audio/src/vad.ts` `newBufferSize`). Silero v6.2 prepends 64-sample context → 576 input; v5 takes 512 raw. See `docs/solutions/silero-vad-v6-context-frame.md`.
- **Speaker embeddings**: computed in a Web Worker (`apps/playground/src/audio/speaker-worker.ts`), persisted in IndexedDB. Don't run the WASM model on the main thread.
- **Segment aggregation / TurnGate** (`packages/audio/src/aggregator.ts`): sits between VAD (+ speaker verification) and realtime `append`/`commit` → `ingestFinalizedTurn`. Merges same-speaker fragment transcripts and flushes on `pauseMs`, `maxMs` (speech only), or speaker change. Spec §2.4 / ADR 0004. Pipeline fires LLM per finalized turn and does NOT wait on pause itself.

## Conventions

- **Keys in env, never client.** All provider keys/config live in `.env` (see `.env.example`), loaded by `apps/api`. Naming: `<SCOPE>_<PROVIDER>_<FIELD>` (e.g. `LLM_OPENROUTER_API_KEY`, `STT_DASHSCOPE_API_KEY`).
- **Pure functions; no new classes** unless the framework/API requires it. Imports at top. TS unions: exhaustive `switch`.
- **Full words.** No obscure abbreviations; only use ones common in software.
- **Smallest correct diff.** Only change what was asked. No drive-by refactor, tests, or docs unless asked. When you touch code, small progressive refactors alongside the change are welcome.
- **Reuse and extend** existing functions/modules; do not duplicate similar logic. Before implementing a feature (a selector, a hook, a helper, a card), grep the repo for it first — chances are someone already wrote it. The moment you notice a second copy of something, extract it into a shared module/component and have both callers use it. Examples already in the repo: `SttProviderSelect` + `useSttProviders` + `sttUrl` (`apps/playground/src/SttProviderSelect.tsx`, used by both the VAD panel and the direct-API panel), `padBuffer` / `encodeWav` (`packages/audio`), `createSegmentAggregator` (`packages/audio/aggregator`).
- **No backward-compatibility guards.** If a rename/breakage is needed, do it directly and update callers in the same change.
- **Playground UI is Chinese** — labels, examples, and sample content in Chinese.
- **Tailwind v4 + shadcn/ui** for all UI (playground included). Shared primitives in `packages/ui`（Button、Card、Badge、Input、Textarea、Label、Tabs、Separator、Accordion、Collapsible、Dialog、DropdownMenu、Popover、Progress、ScrollArea、Select、Sheet、Skeleton、Slider、Switch、Tooltip、Toaster）。缺组件先 `shadcn add` 进该包并导出；**改样式改源组件 / token，不要平行重造**。
- **Shared playground config lives in one Zustand store** (`apps/playground/src/config-store.ts`, `useConfig`) — the React analog of a Pinia store. VAD/merge/speaker knobs, language prefs (`uiLang` / `conversationLang` / `level` / `languagesConfirmed`, persisted; `meaningLang` is derived from `uiLang` in the session snapshot), and selectors (VAD model, STT provider) are shared across the VAD panel and the live session: change one on a tab and it's already aligned on the other. Subscribe per-field (`useConfig(s => s.field)`); in async callbacks read `useConfig.getState()`. Stage-grouped field components live in `apps/playground/src/components/ConfigFields.tsx` (`VadParamsFields`, `MergeParamsFields`, `LanguagePrefsFields`, `VadModelSelect`, `TranscribeProviderSelect`, `NumberField`) — reuse these instead of re-declaring the same knobs.

## Commands

```bash
pnpm install
pnpm dev:api          # Hono proxy (loads .env from repo root)
pnpm dev:playground   # Vite dev panel
pnpm dev:web          # PWA shell
pnpm dev:ui           # Storybook 组件/Token/生产页面预览（apps/ui-kit）
pnpm build            # turbo build (all)
pnpm test             # turbo test (vitest per package)
pnpm typecheck        # turbo typecheck
pnpm eval             # vieval reply-prompt ablation → .vieval/reports/ (gitignored)
pnpm eval:report      # analyze report tree
```

Per-package: `pnpm --filter @kibotalk/<pkg> <script>` (e.g. `pnpm --filter @kibotalk/playground exec tsc --noEmit`).

## Prompt / LLM benchmarks (vieval)

- Harness: root `vieval.config.ts`, cases in `evals/`, variants in `evals/lib/variants.ts`.
- Machine artifacts land under `.vieval/reports/` (gitignored). They are **not** a substitute for a written report.
- **After every benchmark run** (`pnpm eval` or any vieval experiment on prompts/schema), add or update a human report under `docs/prompt-evals/` following `docs/prompt-evals/README.md`:
  - how each tested prompt/schema variant was designed;
  - metrics tables and outcomes;
  - conclusions / what (not) to ship to production.
- Do not change production prompts in `packages/prompts` based only on chat summaries — cite the report (and preferably the run id under `.vieval/reports/`).

## Testing & debugging practices

- Vitest per package; keep runs targeted for speed (`pnpm exec vitest run <path>`).
- For a reported bug, **reproduce with a test-only repro first** before changing production code. If a unit test can't reproduce it, use the smallest higher-level automated test that can.
- Prefer runtime evidence (logs, reproduction) over code-only reasoning when debugging. Don't "fix" with 100% confidence from reading code alone — confirm with a run.
- When debugging, instrument with logs, reproduce, analyze, then fix; remove instrumentation only after a post-fix run proves success.
- Known pitfalls and past fixes live in `docs/solutions/` (one file per issue, YAML frontmatter: `module`/`tags`/`problem_type`). Read the relevant solution before touching a documented area; add a new solution when you solve a non-obvious bug.
- Prompt eval history: `docs/prompt-evals/` (see above).

## Before finishing a change

- Run `code-simplifier` / `deslop` on the changes when readability or logic changed.
- Run targeted tests or `pnpm typecheck` when logic changed.
- Don't commit unless asked. When asked, use conventional commits (`feat(scope):`, `fix(scope):`, etc.), English subject; split unrelated changes into separate commits.
- Leave no debug instrumentation (console logs, fetch-to-localhost probes) in committed code.
