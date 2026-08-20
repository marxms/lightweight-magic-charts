# drawing-gestures Validation

**Date**: 2026-08-20
**Spec**: `.specs/features/drawing-gestures/spec.md`
**Diff range**: `2817b49..1605923` (33 commits: spec, design, tasks and 30 implementation commits)
**Verifier**: independent sub-agent (author ≠ verifier); coverage re-derived from the spec, not inherited

**Verdict: FAIL ❌**

Twelve of the thirteen requirements are proven against the value the spec defines, and the
discrimination sensor killed 25 of 28 injected faults — including all three of the defect shapes
this feature has a documented history of. One requirement, **MAGNET-07**, has no discriminating
evidence anywhere: its implementation can be reverted and `npm test` (1269) and `npm run e2e`
(47/47) both stay green. One of the spec's three listed edge cases is untested. The traceability
table's claim of 13/13 Done does not survive re-derivation.

---

## Task Completion

All 26 task headings in `tasks.md` are marked DONE. Two of them — T10 and T19, the only two tasks
carrying MAGNET-07 — declare `Tests: none` / `Gate: build`, which is why the requirement reaches
`Done` in the traceability table with nothing asserting it. See Gap 1.

---

## Spec-Anchored Acceptance Criteria

### P1 — an anchor drag does not pan the chart

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| DRAG-01 WHILE a press has grabbed an anchor, hold `handleScroll`/`handleScale` at `false` | both exactly `false`, nothing else written | `test/axisLock.spec.ts:83` — `expect(it.calls).toEqual([{ handleScroll: false, handleScale: false }])`; capture-phase variant `test/axisLock.spec.ts:73`; through the seam `test/drawingSeam.spec.tsx:309`; in a real browser `scripts/e2e-demo.mjs:754` `drag.range-unchanged` paired with `:759` `drag.anchor-moved` | ✅ PASS |
| DRAG-02 WHEN the press is released, restore both to `true` | both exactly `true` | `test/axisLock.spec.ts:96-99` — `expect(it.calls).toEqual([{…false},{ handleScroll: true, handleScale: true }])` | ✅ PASS |
| DRAG-03 IF released outside the container, still restore both | both `true` | `test/axisLock.spec.ts:115` — `expect(it.calls[1]).toEqual({ handleScroll: true, handleScale: true })` (release dispatched on a sibling node outside the container) | ✅ PASS |
| DRAG-04 IF the window loses focus mid-drag, restore both | both `true` | `test/axisLock.spec.ts:128` — `expect(it.calls[1]).toEqual({ handleScroll: true, handleScale: true })` after `window.dispatchEvent(new Event('blur'))` | ✅ PASS |
| DRAG-05 IF the surface unmounts mid-drag, do not call the disposed chart and leave no listener | no third `applyOptions` call; zero stranded listeners | `test/axisLock.spec.ts:150-154` — `expect(it.calls).toEqual([…2 entries])` + `expect(it.hits).toHaveLength(1)` after a post-dispose `mouseup` and press; listener balance `test/axisLock.spec.ts:272` — `expect(stranded(add, remove)).toEqual([])` matched by type **and identity** | ✅ PASS |
| DRAG-06 WHEN a press lands anywhere that is not an anchor, leave both untouched | **no `applyOptions` call at all** | `test/axisLock.spec.ts:165` — `expect(it.calls).toEqual([])`; non-left button `:175`; throwing hit-test `:196-197`; layer with no `anchorAt` `test/drawingSeam.spec.tsx:321` — `expect(log.applied).toEqual([])` | ✅ PASS |

### P2 — the magnet is a mode the user controls

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| MAGNET-01 a two-state mode `off`/`on`, defaulting to `off` | first read is `off`; both directions reachable | `test/drawingRailRegion.spec.tsx:378` — `expect(screen.getByTestId('magnet-probe')).toHaveTextContent('off')`; flip `:384`; both directions through the mounted composition `:420`, `:428`, `:434` — `expect(screen.getByTestId('canvas')).toHaveAttribute('data-magnet', 'off'\|'on'\|'off')` | ✅ PASS |
| MAGNET-02 WHILE `off`, resolve to the pointer's own price, not any bar | the input price, unchanged | `test/magnet.spec.ts:67-69` — `expect(price).toBe(103.7)` **plus** `expect(watched.reads()).toBe(0)` and `expect(converted).toBe(0)` (the strongest reading: no bar is consulted at all); in a real browser `scripts/e2e-demo.mjs:800` `magnet.off-is-free` | ✅ PASS |
| MAGNET-03 WHILE `on` and within the threshold of O/H/L/C, resolve to that bar value | that exact bar value, nearest wins | `test/magnet.spec.ts:77` — `expect(snapAnchorPrice(input({ price: 109 }))).toBe(110)`; a different quartet member `:83` `toBe(105)`; the pixel-vs-price discriminator at a 4 px/unit scale `:97` `expect(price).toBe(107.5)`; through the surface `test/chartSurface.spec.tsx:852` `toBe(110)`; browser `scripts/e2e-demo.mjs:818` `magnet.on-snaps` asserts `snapped.toFixed(2) === bar.high.toFixed(2)` | ✅ PASS (⚠ see Spec-precision 1) |
| MAGNET-04 WHILE `on` with nothing in reach, resolve to the pointer's own price | the input price | `test/magnet.spec.ts:103` — `expect(snapAnchorPrice(input({ price: 102.5, thresholdPx: 1 }))).toBe(102.5)`; non-finite threshold `:151` `toBe(400)`; non-finite price `:155` `toBeNaN()`; throwing converter `:199` `toBe(103.7)` | ✅ PASS |
| MAGNET-05a WHERE no control has flipped the mode, behave exactly as `off` | identical to `off` — the pointer's own price | `test/chartSurface.spec.tsx:836` — `expect(log.hosts[0].snapPrice({ time: BARS[0].time, price: 109 })).toBe(109)` with `drawing={{ binding }}` and no `magnet` field at all; provider default `test/drawingRailRegion.spec.tsx:378`; before any interaction through the workspace `test/canvasSurface.spec.tsx:370` — `expect(captured.at?.(2.9)).toBe(2.9)` | ✅ PASS |
| MAGNET-05b a `DrawingToolbar` mounted without a magnet group draws no toggle | the toggle is absent; the other fixed controls are not | `test/drawingRail.spec.tsx:637` — `expect(screen.queryByTestId('drawing-magnet')).toBeNull()`, with control positives `:640-641` `expect(screen.getByTestId('drawing-delete')).toBeInTheDocument()` | ✅ PASS |
| MAGNET-06 a mode changed mid-gesture applies to later anchors and moves none already placed | the already-resolved value is unchanged; the next call takes the new mode | `test/drawingSeam.spec.tsx:378-379` — `expect(placed).toBe(109)` and `expect(host.snapPrice({ time: BARS[0].time, price: 109 })).toBe(110)` across a re-render; no re-attach `:363` `expect(log.attaches.count).toBe(1)`; through the composition `test/drawingRailRegion.spec.tsx:417-435` | ✅ PASS |

### P3 — the preview shows what the magnet will do

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| MAGNET-07 WHILE `on`, the preview SHALL trace to the snapped position rather than the raw pointer position | the preview cursor's price equals the snapped price, not the pointer's | **no evidence** — the only implementation is `example/drawing.ts:263-268`; its two tasks (T10, T19) both declare `Tests: none`; the sole browser check that touches the preview, `scripts/e2e-demo.mjs:502` `drawing.preview-visible-between-clicks`, is documented at `scripts/e2e-demo.mjs:210-211` as "not WHERE the preview is, only WHETHER something newly blue got painted", and runs with the magnet off | ❌ GAP |

**Status**: ❌ 12/13 covered against the spec-defined outcome; **1 requirement (MAGNET-07) has no
evidence**; 2 spec-precision gaps flagged below.

### Spec-precision gaps

1. **MAGNET-03 does not define whether the threshold is inclusive.** "within the snap threshold" is
   silent on `distance == thresholdPx`. `design.md:115` decides it (`<= thresholdPx`) and
   `test/chartSurface.spec.tsx:882` pins it — `expect(…snapPrice({ price: 87 })).toBe(95)`, a
   distance of exactly 8 on a 1 px/unit scale with the default threshold of 8, paired with `:883`
   `toBe(86)` at 9. The behaviour is decided and asserted; the **spec** is the imprecise artifact.
   The sensor confirms the boundary is sensed: M14 (`>` → `>=`) is killed by that case.
2. **The tie rule is written in price units while the rule measures in pixels.** The edge case says
   "IF two bar values are equidistant from the pointer"; `magnet.ts:59-61` compares *pixel*
   distances and breaks the tie on price. The two coincide on a linear scale and part company on a
   logarithmic one. Not a defect — AD-010 makes pixels the unit — but the spec sentence names the
   wrong quantity.

### Traceability mislabels (no coverage impact)

- `test/chartSurface.spec.tsx:855` is titled "MAGNET-05 — the threshold defaults to eight pixels".
  The default threshold is not MAGNET-05; MAGNET-05 is the mode default and the absent toggle. The
  case is valuable (it is the only assertion of the 8 px default and of the inclusive boundary) but
  files under the wrong requirement.

---

## Edge Cases

- [x] **Zero bars → the pointer's own price.** `test/magnet.spec.ts:109` —
  `expect(snapAnchorPrice(input({ bars: [], price: 103.7 }))).toBe(103.7)`.
- [x] **Two equidistant bar values → the HIGHER price.** `test/magnet.spec.ts:116` —
  `expect(snapAnchorPrice(input({ bars: [tied], price: 105 }))).toBe(110)` with the higher pair
  **last**, mirrored at `:127` with the higher pair **first**. Both orderings are required and both
  are present; the sensor confirms neither one alone would do (M4 survives ordering 1 and dies on
  ordering 2; M4b the reverse).
- [ ] **An anchor drag beginning on a pane other than the price pane → the axes are untouched.**
  **NOT COVERED.** `attachAxisLock` carries no pane guard (`src/drawing/axisLock.ts:47-48`
  branches only on `event.button` and `anchorAt`), the listener is bound to the whole surface host
  (`src/react/surface/useDrawingSeam.ts:49,79`), and the pane-index guard the spec points at exists
  only on placement in the example (`example/drawing.ts:217`, `:246`), not on the drag. No test, no
  e2e check and no task mentions it — `grep -rn "pane other"` finds the string only in `spec.md:124`.

---

## Gate Check

| Gate | Command | Result |
| --- | --- | --- |
| Unit | `npm test` | ✅ exit 0 — **103 suites / 1269 tests passed**, 0 failed, 0 skipped |
| Browser | `npm run e2e` | ✅ exit 0 — **47/47 checks passed** |
| Size | `node scripts/size-gate.mjs` | ✅ exit 0 — 16 measurements under budget, entry `104809 / 104809` |
| Package paths | `node scripts/verify-package-paths.mjs` | ✅ exit 0 — files[] and exports both resolve (7 entries) |
| Generated docs | `node scripts/gen-reference.mjs` | ✅ 53 pages rewritten, `git status --porcelain` still empty — `docs/reference/**` is byte-identical to the current exported surface |

- **Test count before the feature**: 1255 (STATE.md handoff, measured at `b75e0a5`)
- **Test count after**: 1269 — delta **+14** net across the range; no suite was deleted and no
  assertion in scope was weakened.
- **Skipped**: none.

**Known trap, pre-existing and out of scope:** `test/gates/sizeBudget.spec.ts` fails in a fresh
worktree because `dist/` is absent (3 cases). Reproduced during the sensor run and confirmed
unrelated to this feature — it is item 2 of the STATE.md "Open, not blocking" list.

---

## Discrimination Sensor

Isolated scratch: `git worktree add --detach` at HEAD, mutations applied to the copies only, torn
down with `git worktree remove --force`. **No `git stash` was used.** Pre-sensor baseline
`git status --porcelain` was empty; it is empty again after teardown, and HEAD is unchanged at
`1605923`.

### Composition-level faults — the three defect shapes this feature has a history of

| # | File | Fault | Killed? |
| --- | --- | --- | --- |
| M1 | `src/react/workspace/DrawingRail.tsx:190` | Drop `magnet={{ mode, onChange }}` at the `DrawingToolbar` call site (re-injects the `b86aee1` defect) | ✅ Killed — `test/drawingRailRegion.spec.tsx:410` |
| M2 | `src/react/workspace/DrawingRail.tsx:95` | Drop `anchorAt` from the provider's wrapper object (re-injects the `948f055` defect) | ✅ Killed — `test/drawingRailRegion.spec.tsx:322` |
| M3 | `src/drawing/magnet.ts:59` | Measure the snap in **price units** instead of pixels (re-injects the `1b1b7a2` fixture defect) | ✅ Killed — `test/magnet.spec.ts:97` |
| M18 | `src/react/workspace/CanvasSurface.tsx:90` | Drop `magnet: drawing.magnet` from `SurfaceDrawing` | ✅ Killed |
| M13 | `src/react/surface/ChartSurface.tsx:165` | Default `SurfaceDrawing.magnet` to `'on'` instead of `'off'` | ✅ Killed |
| M17 | `src/react/DrawingToolbar.tsx:300` | Draw the magnet toggle even with no magnet group (MAGNET-05b) | ✅ Killed |
| M19 | `src/react/surface/useDrawingSeam.ts:62-64` | `snapPrice` reads mode/bars/threshold at **attach** time, not call time (MAGNET-06) | ✅ Killed |

### Module-level faults

| # | File | Fault | Killed? |
| --- | --- | --- | --- |
| M4 | `magnet.ts:61` | A tie takes the **last** candidate, not the higher price | ✅ Killed |
| M4b | `magnet.ts:60-61` | A tie takes the **first** candidate (nearest-wins), not the higher price | ✅ Killed |
| M5 | `axisLock.ts:62,72` | `mousedown` flipped from **capture** to bubble | ✅ Killed — `test/axisLock.spec.ts:64` |
| M6 | `axisLock.ts:26` | Remove the `blur` release | ✅ Killed |
| M7 | `usePriceAlertLayer.ts:107` | Remove the `blur` release | ✅ Killed — `test/priceAlertLayer.spec.tsx:406` |
| M8a | `axisLock.ts:56` | Restore only `handleScroll`, never `handleScale` | ✅ Killed |
| M8b | `usePriceAlertLayer.ts:85` | Restore only `handleScroll`, never `handleScale` | ✅ Killed |
| M9 | `axisLock.ts:70-71` | Set `detached` **before** freeing pending releases (the T14 regression) | ✅ Killed |
| M10 | `magnet.ts:40` | `snapAnchorPrice` ignores the mode — `off` snaps too | ✅ Killed |
| M11 | `axisLock.ts:48` | Drop the `anchorAt` guard — every left press locks the axes (DRAG-06) | ✅ Killed |
| M12 | `axisLock.ts:39` | Hit-test the **page** point, not the container-relative one | ✅ Killed — `test/axisLock.spec.ts:314` |
| M14 | `magnet.ts:60` | Threshold boundary `>` → `>=` | ✅ Killed — `test/chartSurface.spec.tsx:882` |
| M15 | `magnet.ts:44` | Drop the non-finite price/threshold refusal (**T24 byte-recovery regression probe**) | ✅ Killed |
| M16 | `magnet.ts:58` | Candidate guard drops only `null`, keeps `NaN`/`Infinity` (**T24 probe**) | ✅ Killed |
| M20 | `useDrawingSeam.ts:90-91` | `unlock?.()` **after** `layer.detach()` instead of before | ❌ **SURVIVED** |
| M21 | `magnet.ts:45` | An unmatched bar time falls back to `bars[0]` instead of the pointer price | ❌ **SURVIVED** |

### Browser-level faults — re-derived independently, not taken from the author's table

| # | Fault | Effect on `npm run e2e` |
| --- | --- | --- |
| E1 | Drop `anchorAt` from the provider wrapper | ❌→ **46/47.** `drag.range-unchanged` FAILS: `before=[1700115200,1700417600,1700720000] after=[1700291600,1700590400,1700892800]` — the chart panned. `drag.anchor-moved` stays green, so the pair isolates correctly. |
| E3 | `attachAxisLock` also `stopPropagation()`/`preventDefault()`s the press | ❌→ **46/47.** `drag.anchor-moved` FAILS (anchors byte-identical before and after the pull) while `drag.range-unchanged` stays green — the mirror image of E1. The two checks are genuinely independent. |
| E2 | `snapAnchorPrice` ignores the mode | ❌→ **45/47.** Both `magnet.off-is-free` and `magnet.on-snaps` FAIL. |
| M23 | `example/drawing.ts:222` — the **click anchor** goes back to the raw pointer price | ❌→ **46/47.** `magnet.on-snaps` FAILS: "both read 113.30… — the bar's high is 112.71". |
| M22 | `example/drawing.ts:266` — the **crosshair preview** goes back to the raw pointer price | ✅→ **47/47, and `npm test` green.** **SURVIVED.** |

**Sensor depth**: P0-full (28 mutations across module, composition and browser layers)
**Result**: **25/28 killed, 3 survived** — ❌ FAIL

---

## Ranked Gaps

### Gap 1 — MAGNET-07 is unproven end to end (Blocker)

- **Evidence**: mutation **M22**. Reverting `example/drawing.ts:266` so the crosshair preview uses
  the raw pointer price instead of `host.snapPrice(...)` leaves `npm test` green in every drawing
  suite and `npm run e2e` at **47/47**. The whole of story P3 is inert to the test suite.
- **Root cause**: MAGNET-07's only implementation lives in `example/drawing.ts`, which no unit test
  loads; its two tasks (T10 at `tasks.md:415`, T19 at `tasks.md:726`) both declare `Tests: none`;
  and the one browser check that observes the preview is a colour-presence probe by design
  (`scripts/e2e-demo.mjs:210-211`), not a position probe. `spec.md:145` marks the requirement Done.
- **Fix task**: add a browser check that reads the preview's traced price, the same way
  `magnet.on-snaps` reads the placed anchor's price — extend the `__lmcDrawingProbe` in
  `example/drawing.ts:161-178` with a read-only `previewCursor()`, then assert with the magnet on
  that the crosshair-hovered preview cursor equals the bar's high while the pointer price does not.
  M23 already proves that shape of check discriminates. Alternatively, make the preview path
  library-owned so jsdom can reach it.
- **Note**: the placement half of the same seam **is** sensed (M23 killed), so this is a genuine
  single-clause gap and not an unwired seam.

### Gap 2 — the seam's ordering probe does not discriminate the ordering it claims to prove (Major)

- **Evidence**: mutation **M20**. Swapping `src/react/surface/useDrawingSeam.ts:90-91` to run
  `layer.detach()` before `unlock?.()` leaves `test/drawingSeam.spec.tsx:324-342` green.
- **Root cause**: the probe's `detach()` dispatches a `mouseup` on `window`
  (`test/drawingSeam.spec.tsx:268`) and then records `applied=${log.applied.length}`. In the
  mutated ordering the lock is *still listening*, so that very `mouseup` performs the release and
  bumps the count to 2 **before** the length is read. Traced directly: `DURING_DETACH ["applied=2"]`
  under the fault. The comment at `:334-336` asserts that `applied=1` would signal a silent
  disposer — `applied=1` is unreachable in either ordering.
- **Impact**: T5's Done-when "Cleanup unlocks **before** `layer.detach()`" (`tasks.md:265`) and the
  design invariant at `design.md:89` are unverified. Low runtime risk (the chart is alive in both
  orderings, since `chart.remove()` runs in a later cleanup), but the test advertises a proof it
  does not deliver.
- **Fix task**: make the probe record ordering rather than a derived count — e.g. have `detach()`
  push a marker into a shared log and have the release push its own, then assert the sequence
  `['release', 'detach']`; or assert the `window` `mouseup` listener is already unregistered at the
  moment `detach()` runs.

### Gap 3 — the spec's third edge case has no evidence at all (Major)

- **Evidence**: "an anchor drag beginning on a pane other than the price pane" (`spec.md:124-125`)
  appears nowhere outside the spec. `attachAxisLock` has no pane guard
  (`src/drawing/axisLock.ts:47-48`) and is bound to the whole surface host, not the price pane
  (`src/react/surface/useDrawingSeam.ts:49,79`). The pane-index guard the edge case says it matches
  exists only on placement, in the example (`example/drawing.ts:217`, `:246`).
- **Fix task**: either add a case to `test/axisLock.spec.ts` pinning what the library does for a
  press below the price pane's height, or amend the spec to say the guard is the binding's
  `anchorAt` and delete the edge case — but do not leave it claimed and untested.

### Gap 4 — an unmatched bar time is uncovered (Minor)

- **Evidence**: mutation **M21**. Making `src/drawing/magnet.ts:45` fall back to `input.bars[0]`
  when no bar matches `input.time` leaves every test green. Every existing call site passes a time
  that matches (`test/magnet.spec.ts` uses `TIME`; `test/drawingSeam.spec.tsx` and
  `test/chartSurface.spec.tsx` all use `BARS[0].time`), and the zero-bars case at
  `test/magnet.spec.ts:109` passes `bars: []`, where `bars[0]` is also `undefined`.
- **Impact**: snapping to the wrong bar's values is a user-visible defect, and the "no bar at this
  time" branch is the one that guards it. The spec names only the zero-bars case, so this is also a
  spec-precision gap.
- **Fix task**: add a case with a non-empty `bars` array and a `time` that matches none of them,
  asserting `toBe(input.price)`.

### Gap 5 — the CHANGELOG's "one break" claim is narrower than the diff (Minor)

- **Evidence**: `CHANGELOG.md:62-77` declares the `DrawingToolbarProps` → `edits` regrouping as
  "the one break in this release", and closes "Nothing else here is breaking by the rule below".
  But `DrawingSurfaceHost` gained a **required** member, `snapPrice`
  (`src/drawing/drawingLayer.ts:12-14`), and the rule at `CHANGELOG.md:222-224` counts "narrowing
  what an exported type accepts" as breaking. A consumer that *implements* `DrawingBinding` is
  unaffected — the library supplies the object — but one that *constructs* a `DrawingSurfaceHost`
  (a wrapping binding, a test double built from the how-to snippet) stops compiling. T19 exists
  precisely because three places in the repo still taught a three-member host (`tasks.md:710`).
- **Assessment**: **not a version error.** The project's own rule (`CHANGELOG.md:209`) says a break
  in `0.x` bumps the minor, which `0.2.0` does either way, and the new member is disclosed in full
  under Added (`CHANGELOG.md:53-54`). The inaccuracy is the sentence, not the release.
- **Fix task**: reword to name `DrawingSurfaceHost.snapPrice` as a second, migration-free break for
  host-constructors, or state explicitly that the library-supplied direction is exempt (the
  precedent `Session.reseed` set at `CHANGELOG.md:110-111`).

**Verified clean, contrary to the brief's suspicion:** `src/index.ts` is purely additive across the
range (5 new exports, 0 removals — `git diff 2817b49..HEAD -- src/index.ts` shows `+8/-0`), and
the only public-surface deletions anywhere in `src/` are the three `DrawingToolbarProps` fields
that the CHANGELOG declares. `DrawingRailValue` became module-exported but is **not** re-exported
from the entry, so `useDrawingRail` stays unpublished as AD-017 requires.

---

## T24 Byte-Recovery Regression Check

T24 claimed −349 B with no test edited. Confirmed it undid no fix, by reading and by mutation:

| Claim | Evidence | Sensor |
| --- | --- | --- |
| `magnet.ts` still refuses a non-finite price/threshold | `src/drawing/magnet.ts:44` — `if (!measurable(input.price) \|\| !measurable(input.thresholdPx)) return input.price;` | M15 killed |
| `magnet.ts` still drops candidates on `Number.isFinite` | `src/drawing/magnet.ts:23` — `Number.isFinite(px)`; applied at `:58` | M16 killed |
| `axisLock.ts` frees pending releases **before** going deaf | `src/drawing/axisLock.ts:70-71` — `for (const release of [...pendingReleases]) release();` then `detached = true;` | M9 killed |
| `axisLock.ts` still holds them in a `Set` | `src/drawing/axisLock.ts:34` — `const pendingReleases = new Set<() => void>();`, iterated over a snapshot at `:70` | M5/M9 killed; `test/axisLock.spec.ts:272` matches listeners by identity, not by name |

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ two new modules, 74 + 66 lines |
| Surgical changes | ✅ every touched file traces to a task |
| No scope creep | ⚠️ the price-alert `blur` fix (T23, commit `1605923`) is a separate defect folded into this feature; it is disclosed in the CHANGELOG and independently tested (`test/priceAlertLayer.spec.tsx:393-425`), so it is documented rather than smuggled |
| Matches patterns | ✅ closure-over-refs mirrors `eventsRef`; optional seam members mirror `serialize`/`restore` |
| Spec-anchored outcome check | ❌ MAGNET-07 has no asserted value |
| Per-layer coverage: domain 1:1 with ACs | ✅ for `magnet.ts` and `axisLock.ts` |
| Every test maps to a spec requirement | ✅ suite titles carry requirement IDs; one mislabel noted (`chartSurface.spec.tsx:855`) |
| Documented guidelines followed | ✅ AD-006 (zero runtime deps — neither new module imports the drawing engine), AD-009 (the gesture split), AD-010 (pixels not price units), AD-017 (the rail draws, the host names) |

---

## Requirement Traceability Update

| Requirement | Table says | Re-derived |
| --- | --- | --- |
| DRAG-01 … DRAG-06 | Done | ✅ Verified |
| MAGNET-01 … MAGNET-06 | Done | ✅ Verified |
| MAGNET-07 | Done | ❌ **Needs Fix** — no evidence; M22 survives both gates |

`spec.md:149` reads "13 total, 13 mapped to tasks, 0 unmapped, 13 Done". Re-derived: **12 Done,
1 unproven**. `spec.md:17` ("Both proven in a real browser") holds for P1 and P2 and not for P3.

---

## Summary

**Overall**: ❌ Not Ready

**Spec-anchored check**: 12/13 ACs match the spec-defined outcome; 1 with no evidence; 2
spec-precision gaps
**Sensor**: 25/28 mutations killed; 3 survived (M20, M21, M22)
**Gate**: `npm test` 1269 passed · `npm run e2e` 47/47 · size-gate exit 0 (entry 104809) ·
verify-package-paths exit 0 · `gen-reference.mjs` byte-clean

**What works**: The axis lock is the strongest-sensed code in the range — capture phase, the
container-relative point contract, both release events, the disposer's free-then-deaf ordering and
the `Set` of pending releases each have a case that dies when the behaviour is inverted. The
magnet's pixel threshold, its inclusive boundary, both tie orderings and all four unmeasurable
readings (`null`, `NaN`, `Infinity`, throw) are pinned to values a reader can check by hand. Every
one of the three historical "green while broken" defects was re-injected and every one was caught —
including through the composition, which is where they escaped the first time. The two DRAG-01
browser checks were independently shown to fail for opposite reasons.

**Issues found**: 5, ranked above. One blocker: MAGNET-07 can be deleted without turning anything
red.

**Next steps**: route Gaps 1-3 to fix tasks; Gaps 4-5 are cheap and can ride along. Re-verify after.
