# Design QA — cross-platform session prototypes and production

## Scope

QA first covered the throwaway HTML prototypes created for the 2026-07-25 product decisions, then repeated the same checks against the production components in `packages/pages` and `packages/ui`. Production captures use deterministic conversation/session data so model downloads and microphone access do not change the visual state under test.

## Source truth

- Visual direction: `prototypes/product-style-direction.html`
- Session reference capture: `/private/tmp/kibotalk-reference-session.png`
- Desktop reference capture: `/private/tmp/kibotalk-reference-desktop.png`
- Settings reference capture: `/private/tmp/kibotalk-reference-settings.png`
- Product decisions: `docs/brainstorm/2026-07-25-cross-platform-session-ui-decisions.md`

## Implemented prototype captures

| Surface | File | Viewport | Capture |
|---------|------|----------|---------|
| Web A · focus stage | `prototypes/web-session-focus.html` | 1440 × 1000 | `/private/tmp/kibotalk-web-focus.png` |
| Web B · split workbench | `prototypes/web-session-split.html` | 1440 × 1000 | `/private/tmp/kibotalk-web-split.png` |
| Web C · stage + rail | `prototypes/web-session-rail.html` | 1440 × 1000 | `/private/tmp/kibotalk-web-rail.png` |
| Web A+B · equal-height workbench, expanded | `prototypes/web-session-hybrid.html` | 1440 × 1000 | `/private/tmp/kibotalk-web-hybrid-expanded-v2.png` |
| Web A+B · single-stage collapsed state | `prototypes/web-session-hybrid.html` | 1440 × 1000 | `/private/tmp/kibotalk-web-hybrid-collapsed-v2.png` |
| Web A+B · aligned skeleton | `prototypes/web-session-hybrid.html` | 1440 × 1000 | `/private/tmp/kibotalk-web-hybrid-skeleton-v2.png` |
| Web A+B · mobile suggestion stage | `prototypes/web-session-hybrid.html?viewport=mobile` | 430 × 1000 | `/private/tmp/kibotalk-web-hybrid-mobile-v2.png` |
| Web A+B · mobile transcript layer | `prototypes/web-session-hybrid.html?viewport=mobile` | 430 × 1000 | `/private/tmp/kibotalk-web-hybrid-mobile-transcript-v2.png` |
| Desktop floating | `prototypes/desktop-floating-responsive.html` | 1440 × 1000 | `/private/tmp/kibotalk-desktop-floating.png` |
| Desktop hover-only resize outline | `prototypes/desktop-floating-responsive.html` | 1440 × 1000 | `/private/tmp/kibotalk-desktop-airi-hover-v2.png` |
| Desktop narrow, straight stickies | `prototypes/desktop-floating-responsive.html` | 1440 × 1000 | `/private/tmp/kibotalk-desktop-straight-resized-v2.png` |
| Desktop aligned skeleton | `prototypes/desktop-floating-responsive.html` | 1440 × 1000 | `/private/tmp/kibotalk-desktop-skeleton-v2.png` |
| Settings / i18n | `prototypes/settings-i18n-session.html` | 1440 × 1000 | `/private/tmp/kibotalk-settings-i18n-v2.png` |
| Web A narrow preset | `prototypes/web-session-focus.html?viewport=mobile` | 430 × 1000 | `/private/tmp/kibotalk-web-focus-mobile.png` |
| Web B narrow preset | `prototypes/web-session-split.html?viewport=mobile` | 430 × 1000 | `/private/tmp/kibotalk-web-split-mobile-v2.png` |
| Web C narrow preset | `prototypes/web-session-rail.html?viewport=mobile` | 430 × 1000 | `/private/tmp/kibotalk-web-rail-mobile.png` |

Combined same-viewport comparison: `/private/tmp/kibotalk-visual-comparison.png`.

Current feedback before/after and mobile-state comparison: `/private/tmp/kibotalk-prototype-feedback-comparison.png`.

## Production captures

| Surface | Production component | Viewport | Capture |
|---------|----------------------|----------|---------|
| Web A+B · expanded | `SessionPage` | 1440 × 1000 | `/private/tmp/kibotalk-production-session.png` |
| Web A+B · collapsed | `SessionPage` | 1440 × 1000 | `/private/tmp/kibotalk-production-session-collapsed.png` |
| Web A+B · mobile suggestions | `SessionPage` | 430 × 1000 | `/private/tmp/kibotalk-production-session-mobile.png` |
| Web A+B · mobile transcript | `SessionPage` | 430 × 1000 | `/private/tmp/kibotalk-production-session-mobile-transcript.png` |
| Settings | `SettingsPage` | 1440 × 1000 | `/private/tmp/kibotalk-production-settings.png` |
| History detail | `HistoryPage` | 1440 × 1000 | `/private/tmp/kibotalk-production-history.png` |
| Desktop Island · default | `IslandPage` | 420 × 640 | `/private/tmp/kibotalk-production-island.png` |
| Desktop Island · minimum | `IslandPage` | 360 × 420 | `/private/tmp/kibotalk-production-island-minimum.png` |
| Desktop Island · tall / three rounds | `IslandPage` | 420 × 840 | `/private/tmp/kibotalk-production-island-tall.png` |
| Desktop Island · content below | `IslandPage` | 420 × 640 | `/private/tmp/kibotalk-production-island-below.png` |

Same-viewport combined inputs used for the final visual judgment:

- Web reference above production: `/private/tmp/kibotalk-production-session-comparison.png`
- Settings reference above production: `/private/tmp/kibotalk-production-settings-comparison.png`

## Comparison history

1. Baseline comparison confirmed the new pages retain the existing warm off-white canvas, white rounded panels, yellow active controls, bright yellow reply paper, soft paper elevation, and dark translucent Island.
2. The first settings capture wrapped the stopped / active labels vertically. The state control was changed to a full-width horizontal segmented row and re-captured.
3. The first narrow split capture compressed the status label. Icon-only stop sizing and toolbar gaps were tightened; the second capture keeps status plus all four required controls visible.
4. All sticky rounds are now straight. Desktop round count is derived from actual rendered content, width, and height, so furigana wrapping can reduce a narrow window from three rounds to two without clipping.
5. The A+B candidate keeps A's centered suggestion stage and turns B's transcript column into a collapsible left panel. Both desktop columns are exactly 703 px high and scroll independently; collapsing removes the transcript from layout instead of leaving a vertical rail.
6. Desktop resize markers now follow AIRI's eight invisible edge/corner hit zones. A continuous subtle outline replaces the yellow edge bars and four corner dots; the Island drag affordance uses Lucide's official four-way `Move` icon.
7. Web and desktop skeletons use the final three-candidate structure: identical card padding, three target/meaning pairs, and the same dashed separators. After accounting for ruby line boxes, measured heights differ by 0.17 px (Web) and 0.05 px (desktop).
8. Every candidate-card prototype now renders Japanese kanji readings with `ruby` and highlights grammatical particles. Legacy visual-direction and sticky-style pages were aligned too.
9. The transcript toggle remains visible in both states and uses an active fill when open. The visible “草稿中” label was removed, desktop stop now sits directly beside pause, and the resize outline is fully hidden whenever the pointer leaves the window.
10. Production Web was widened to the confirmed A+B proportions: a fixed 320 px transcript column and a fluid suggestion stage with 576 px reply paper. This removed the narrower pre-QA workbench while preserving equal-height independent scrolling.
11. Production mobile opens on suggestions. Opening the transcript keeps the same active “对话记录” button in its header; pressing it again returns to suggestions.
12. Production Island now uses conservative height bands: one round below 620 px, two rounds from 620 px, and three from 820 px. At the minimum 360 × 420 size, a container-query compact treatment preserves all three current candidates and meanings without overlapping the Island.
13. The production window outline is transparent at rest, `rgba(255,255,255,0.34)` on hover, and transparent again after pointer leave.

## Interaction verification

Playwright Chromium exercised:

- Web pause, stop confirmation, narrow preset, and split suggestion / conversation switching.
- Desktop Island drag and release flip, resize behavior, hide / restore from the menu bar, AI toggle, stop confirmation, and stopped state.
- Settings immediate Chinese → Japanese UI switch, active-session locking, theme state, and quit dialog.
- A+B equal column heights, suggestion-only scrolling without outer-page movement, expanded → collapsed → expanded using the persistent horizontal toggle, and skeleton switching.
- A+B 430 px mobile preset, horizontal-overflow check, single-column suggestion state, and transcript layer constrained to the content area.
- Furigana and particle markup on Web A / B / C / A+B, desktop floating, product direction, and sticky-style prototypes.
- Desktop eight resize zones, absence of corner marker pseudo-elements, outline hidden → hover visible → pointer-leave hidden, straight sticky bounds after narrowing to 360 px, pause/stop adjacency, and four-way drag icon.

Result: the focused A+B / desktop regression passed. The A+B stage has a 701 px client height and 1057 px scroll height without moving its sibling or outer container; mobile content is 372 px wide; the 360 px desktop state keeps two complete rounds in bounds. `node --check`, `git diff --check`, and the combined same-viewport visual comparison also passed.

Production regression result:

- 1440 px A+B columns are both 830 px high; outer page scroll and horizontal overflow remain zero.
- Production reply papers have no transform; Japanese fixtures rendered six ruby elements plus highlighted particle spans.
- 430 px mobile starts with the transcript closed, opens it with one click, retains two DOM instances of the same toggle while overlaid, and closes it with the visible active instance. Horizontal overflow and outer scroll remain zero.
- Settings exposes exactly six categories and contains neither a translation-language field nor model text.
- Default 420 × 640 Island shows two complete rounds; 360 × 420 shows one compact complete round; 420 × 840 shows three. Above and below orientations keep transcript before notes and never overlap the controls.
- Full `pnpm typecheck`, targeted storage/pipeline, prompt, LLM and API tests, `pnpm build`, and `git diff --check` passed after the production fixes.

## Final result

**Passed for production.** No vertical collapsed rail, mismatched A+B column height, outer-scroll spacing drift, mobile horizontal overflow, sticky rotation, visible-at-rest resize border, card/control overlap, fake translation-language setting, model selector, candidate selection, or “换一批” action remains in the confirmed prototypes or production surfaces.
