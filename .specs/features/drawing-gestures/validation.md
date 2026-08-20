# drawing-gestures Validation

**Date**: 2026-08-20
**Spec**: `.specs/features/drawing-gestures/spec.md`
**Diff range**: `2817b49..7431870` (40 commits; the last fix round is `67cdda1..HEAD` = T32, T33)
**Verifier**: independent sub-agent, iteration 3 of 3 (author ≠ verifier). Coverage re-derived from
the spec. Iteration 2's report was read and **not inherited**: every AC, every edge case and every
prior mutation was re-traced and re-injected from scratch.

**Verdict: PASS ✅ — SHIP 0.2.0**

All thirteen requirements assert the value the spec defines. All three edge cases are covered and
each is killed by an independent mutation. **Fifty-nine behaviour-level faults were injected in an
isolated worktree; fifty-eight died.** The single survivor is an equivalent mutant (adjudicated
below, M46) with no spec-observable behaviour. The public API surface was diffed symbol by symbol
against `2817b49`: the two declared breaks are the complete set, and no export was removed.

Iteration 2's blocking gap (U5 — the `pricePane` wiring unsensed) is **closed and confirmed closed
by re-injection**: deleting `src/react/surface/useDrawingSeam.ts:82` now fails exactly one test.
Iteration 2's minor gap (the pane reader's missing throw guard) is **closed** and both halves of the
throw/`null` contract are independently sensed.

Three findings remain. **None blocks release** — they are labelled per-item in the Ranked Findings
section, and all three are follow-ups.

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1–T31 | ✅ Done | Re-verified by re-injection, not inherited |
| T32 the seam's pane wiring becomes sensed | ✅ Done | `test/drawingSeam.spec.tsx:431`; mutation M1 kills it and kills **only** it |
| T33 the pane reader gets the throw guard | ✅ Done | `src/drawing/axisLock.ts:55-64`; `test/axisLock.spec.ts:278-279`; M2 and M3 both kill |

`tasks.md` carries zero unchecked boxes.

---

## Spec-Anchored Acceptance Criteria

### P1 — an anchor drag does not pan the chart

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| DRAG-01 WHILE a press has grabbed an anchor, hold `handleScroll` and `handleScale` at `false` | exactly `{handleScroll:false, handleScale:false}` and nothing more | `test/axisLock.spec.ts:107` — `expect(it.calls).toEqual([{ handleScroll: false, handleScale: false }])`; capture-phase variant `:97`; unregressed by the pane guard `:248`; through the seam `test/drawingSeam.spec.tsx:362`; in Chromium `scripts/e2e-demo.mjs:754` `drag.range-unchanged` | ✅ PASS |
| DRAG-02 WHEN released, restore both to `true` | exactly `{true,true}` as the second call | `test/axisLock.spec.ts:120-123` — `expect(it.calls).toEqual([{…false},{ handleScroll: true, handleScale: true }])` | ✅ PASS |
| DRAG-03 IF released outside the container, still restore both | both `true` | `test/axisLock.spec.ts:139` — `expect(it.calls[1]).toEqual({ handleScroll: true, handleScale: true })`, the release dispatched on a sibling outside the container | ✅ PASS |
| DRAG-04 IF the window blurs mid-drag, restore both | both `true` | `test/axisLock.spec.ts:152` — same expression after `window.dispatchEvent(new Event('blur'))` | ✅ PASS |
| DRAG-05 IF the surface unmounts mid-drag, no call to the disposed chart and no listener left | exactly two calls; zero stranded listeners | `test/axisLock.spec.ts:174-178` — `expect(it.calls).toEqual([…2 entries])` + `expect(it.hits).toHaveLength(1)`; listener balance by identity `:367` — `expect(stranded(add, remove)).toEqual([])`; ordering through the seam `test/drawingSeam.spec.tsx:389` — `expect(log.order).toEqual(['lock','release','detach'])` and `:410` — `expect(log.duringDetach).toEqual(['applied 2 -> 2'])` | ✅ PASS |
| DRAG-06 WHEN a press lands anywhere that is not an anchor, leave both untouched | **no `applyOptions` call at all** | `test/axisLock.spec.ts:189` — `expect(it.calls).toEqual([])`; non-left button `:199`; throwing hit-test `:220-221`; press outside the price pane `:237`; throwing pane reader `:278-279`; unnamed pane still locks `:293`; layer with no `anchorAt` `test/drawingSeam.spec.tsx:374`; **the wire itself** `test/drawingSeam.spec.tsx:431` — `expect(log.applied).toEqual([])` for a press on the study pane through the real composition | ✅ PASS |

### P2 — the magnet is a mode the user controls

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| MAGNET-01 a two-state mode `off`/`on`, defaulting to `off` | first read `off`; both directions reachable | `test/drawingRailRegion.spec.tsx:378` — `expect(screen.getByTestId('magnet-probe')).toHaveTextContent('off')`; through the mounted composition `:420`, `:428`, `:434` — `expect(screen.getByTestId('canvas')).toHaveAttribute('data-magnet', 'off'\|'on'\|'off')`; at the surface `test/chartSurface.spec.tsx:836`, `:852` | ✅ PASS |
| MAGNET-02 WHILE `off`, resolve to the pointer's own price, not any bar | the input price, unchanged, with no bar consulted | `test/magnet.spec.ts:67-69` — `expect(price).toBe(103.7)` **and** `expect(watched.reads()).toBe(0)` **and** `expect(converted).toBe(0)`; in Chromium `scripts/e2e-demo.mjs:800` `magnet.off-is-free` | ✅ PASS |
| MAGNET-03 WHILE `on` and within the threshold of O/H/L/C, resolve to that bar value | that exact bar value, nearest wins | `test/magnet.spec.ts:77` — `toBe(110)`; a different quartet member `:83` — `toBe(105)`; the pixel-vs-price discriminator at 4 px/unit `:97` — `expect(price).toBe(107.5)`; through the surface `test/chartSurface.spec.tsx:852` — `toBe(110)`; in Chromium `scripts/e2e-demo.mjs:818` `magnet.on-snaps` | ✅ PASS (⚠ spec-precision 1) |
| MAGNET-04 WHILE `on` with nothing in reach, resolve to the pointer's own price | the input price | `test/magnet.spec.ts:103` — `toBe(102.5)` at `thresholdPx: 1`; non-finite threshold `:162`; non-finite price `:166`; throwing converter `:210` | ✅ PASS |
| MAGNET-05a WHERE no control flipped the mode, behave exactly as `off` | identical to `off` — the pointer's own price | `test/chartSurface.spec.tsx:836` — `expect(log.hosts[0].snapPrice({ time: BARS[0].time, price: 109 })).toBe(109)` with `drawing={{ binding }}` and no `magnet` field; provider default `test/drawingRailRegion.spec.tsx:378` | ✅ PASS |
| MAGNET-05b a toolbar with no magnet group draws no toggle | the toggle absent, the other controls present | `test/drawingRail.spec.tsx:637` — `expect(screen.queryByTestId('drawing-magnet')).toBeNull()` | ✅ PASS |
| MAGNET-06 a mode changed mid-gesture applies to later anchors and moves none already placed | the resolved value unchanged; the next call takes the new mode; no re-attach | `test/drawingSeam.spec.tsx:468-469` — `expect(placed).toBe(109)` then `expect(host.snapPrice({…price: 109})).toBe(110)` across a re-render; live bars `:484`; live threshold `:493`, `:499`; no re-attach `:443`, `:453`; through the composition `test/drawingRailRegion.spec.tsx:420-434` | ✅ PASS |

### P3 — the preview shows what the magnet will do

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| MAGNET-07 WHILE `on`, the preview traces to the snapped position, not the raw pointer position | the traced cursor's price equals the snapped bar value and differs from the pointer's | `scripts/e2e-demo.mjs:837` `magnet.preview-traces-the-snap`. Measured green at HEAD: the trace sits at 112.7117 against the bar's high 112.71, where the same point placed free reads 113.3011. Mutation **E1** (the preview goes back to the raw pointer price) turns it red with the raw value printed | ✅ PASS |

**Status**: ✅ 13/13 assert the spec-defined outcome. 3 spec-precision gaps flagged below — all three
are imprecision in the **spec text**, none is a coverage gap and none changes the verdict.

### Spec-precision gaps (re-derived independently; I reach the same three as iteration 2)

1. **MAGNET-03 does not say whether the threshold is inclusive.** `spec.md:89` says "within the snap
   threshold". `src/drawing/magnet.ts:60` decides `distancePx > thresholdPx → reject`, i.e.
   inclusive at exactly the threshold, and `test/chartSurface.spec.tsx:882-884` pins it — `toBe(95)`
   at a distance of exactly 8, `toBe(86)` at 9, `toBe(95)` at 9 for a host asking for 9. Behaviour
   decided and asserted; the spec sentence is the imprecise artifact.
2. **The tie edge case is written in price units while the rule measures pixels.** `spec.md:121-122`
   says "two bar values equidistant from the pointer"; `src/drawing/magnet.ts:59-61` compares pixel
   distances and breaks the tie on price. The two coincide on a linear scale and part on a
   logarithmic one. AD-010 makes pixels the unit, so this is the sentence, not the code.
3. **Edge case 3 names a mechanism the library cannot use.** `spec.md:124-125` asks the guard to
   match "the existing pane-index guard on placement". That guard is `example/drawing.ts:232`
   (`param.paneIndex !== 0`) — **host** code reading a crosshair/click parameter. A raw `mousedown`
   carries no `paneIndex`, so the delivered guard is DOM containment of
   `PaneHandle.getHTMLElement()` (`src/drawing/axisLock.ts:57-58`). The **outcome** the spec states
   is met and asserted; the mechanism clause describes something the library has no access to.

---

## Edge Cases

- [x] **Zero bars → the pointer's own price.** `test/magnet.spec.ts:109` —
  `expect(snapAnchorPrice(input({ bars: [], price: 103.7 }))).toBe(103.7)`. Killed by M30 and M37.
- [x] **Two equidistant bar values → the HIGHER price.** `test/magnet.spec.ts:127` — `toBe(110)`
  with the higher pair **last**, mirrored at `:138` with the higher pair **first**. Both orderings
  are required: M28 (delete the tie clause) and M53 (invert it) each need the mirror to die.
- [x] **A drag beginning on a pane other than the price pane → the axes untouched.**
  `src/drawing/axisLock.ts:57-58`; `test/axisLock.spec.ts:237` at the module and
  `test/drawingSeam.spec.tsx:431` **through the composition**. Killed by M7 (clause removed), M1
  (wiring removed), M19 (wrong pane index) and, in Chromium, by E3.

---

## Gate Check

| Gate | Command | Result |
| --- | --- | --- |
| Unit | `npm test` | ✅ exit 0 — **103 suites / 1276 tests passed**, 0 failed, 0 skipped |
| Browser | `npm run e2e` | ✅ exit 0 — **48/48 checks passed** |
| Size | `node scripts/size-gate.mjs` | ✅ exit 0 after `npm run build:esm` — 16 measurements under budget, entry `104932 / 104932` |
| Package paths | `node scripts/verify-package-paths.mjs` | ✅ exit 0 — files[] and exports resolve (7 entries) |
| Generated docs | `test/gates/docReference.spec.ts` (inside `npm test`) | ✅ byte-for-byte |

- **Test count before the feature**: 1255 · **after**: 1276 · delta **+21**. No suite deleted, no
  assertion weakened anywhere in scope.
- **Skipped**: none.
- **Note on the size gate**: it reads `dist/`, which is gitignored. Against the stale `dist/` present
  in the working tree it exits **1** with two measurements discarded ("the bundler emitted
  warning(s): Import … will always be undefined"). After `npm run build:esm` it exits 0 with the
  entry at 104932. The gate is build-order dependent, not defective. See Finding 3.

### Scratch baseline

`npm test` in a fresh worktree is **1273 passed / 3 failed** — `test/gates/sizeBudget.spec.ts`
requires `dist/`, which a fresh worktree has not built. Every mutation below is scored against that
baseline of 3.

### CHANGELOG cross-check (numbers, re-measured)

| Claim | Source | Verdict |
| --- | --- | --- |
| entry **104,932 B** | `size-gate.mjs` prints `104932 / 104932` | ✅ |
| **+1,925 B** from 103,007 B | 104932 − 103007 = 1925; 103007 is the previous ledger pin | ✅ |
| "the pane reader's throw guard, at 11 B" | `test/gates/sizeBudget.spec.ts:86` — `RE-PINNED … to 104932 (+11 B)` | ✅ |
| "the pane guard itself before it, at 112 B" | `test/gates/sizeBudget.spec.ts:94` — `RE-PINNED … to 104921 (+112 B)` | ✅ |
| "349 B of that came back out of this feature's own modules" | ledger `RE-PINNED DOWN … to 104618 (-349 B)` | ✅ |
| hard cap **195,761 B** | `size-budget.json:132` `"hardCap": 195761` | ✅ |

### Declared breaking changes — completeness, verified against the generated reference

The public surface was extracted from `docs/reference/**` (the byte-gated projection of
`src/index.ts`) at `2817b49` and at HEAD and diffed symbol by symbol.

- **290 → 295 symbols. Zero removed.** The five additions are `attachAxisLock`, `AxisLockHost`,
  `MagnetMode`, `SnapInput`, `snapAnchorPrice` — all declared under Added.
- **Exactly seven public signatures changed:**

| Symbol | Change | Breaking? | Declared? |
| --- | --- | --- | --- |
| `DrawingToolbarProps` | `onDeleteSelection`, `onClearAll`, `drawingCount` **removed**; `edits`, `magnet` added | **YES** | ✅ `CHANGELOG.md:66-78`, with migration |
| `DrawingToolbar` (value) | destructuring signature follows the above | same break | ✅ same bullet |
| `DrawingSurfaceHost` | `snapPrice` added as a **required** member | **YES, one direction** | ✅ `CHANGELOG.md:79-96`, with a host-double before/after |
| `DrawingLayer` | `anchorAt?` added, optional | no | ✅ under Added |
| `DrawingToolbarLabels` | `magnet?` added, optional | no | ✅ under Added |
| `SurfaceDrawing` | `magnet?`, `snapThresholdPx?` added, optional | no | ✅ under Added |
| `WorkspaceDrawingOptions` | `snapThresholdPx?` added, optional | no | ✅ under Added |

`DrawingRailValue` gained two required members and became `export interface`, but it is **not**
re-exported by `src/index.ts` and does not appear in `docs/reference/` — it is module-local, so it is
not an undeclared break. Same for `CanvasSurfaceProps.snapThresholdPx?` and `DEFAULT_MAGNET_LABEL`.

**The declared breaking set is complete.** `package.json` is `0.2.0`.

---

## Discrimination Sensor

Isolated scratch: `git worktree add --detach <scratch> 7431870`, `node_modules` symlinked, every
mutation applied to the copies only, torn down with `git worktree remove --force` + `git worktree
prune`. **No `git stash` was used.** Pre-sensor baseline `git status --porcelain` was empty; it is
empty again after teardown, `git worktree list` shows only the real tree, and HEAD is unchanged at
`7431870`.

Every mutation was typechecked (`npx tsc --noEmit`) before being run: **all 59 typecheck clean**,
which is the point — this feature's signature defect is exactly the fault a compiler cannot see.

### A. The two claims of the last fix round, attacked directly

| # | File | Fault | Result |
| --- | --- | --- | --- |
| M1 | `src/react/surface/useDrawingSeam.ts:82` | Delete the `pricePane:` wiring (iteration 2's surviving U5) | ✅ **Killed — and by exactly one test**: full run 4 failed vs baseline 3; the single new failure is `test/drawingSeam.spec.tsx:431`, "a press on a study pane makes no call, though the hit-test says yes". T32's claim holds verbatim |
| M2 | `src/drawing/axisLock.ts:56-63` | A throwing `pricePane` falls back to the container instead of refusing | ✅ Killed — `test/axisLock.spec.ts:279` |
| M3 | `src/drawing/axisLock.ts:56-63` | Remove the `try`/`catch` entirely | ✅ Killed **twice** — `test/axisLock.spec.ts:220-221` (hit-test throw) **and** `:278` (pane-reader throw). Both halves of the contract are sensed independently |
| M4 | `src/drawing/axisLock.ts:58` | A `null` pane **refuses** the lock instead of keeping the container | ✅ Killed — 13 cases |
| M7 | `src/drawing/axisLock.ts:58` | Remove the pane containment clause entirely | ✅ Killed — `test/axisLock.spec.ts:237` and `test/drawingSeam.spec.tsx:431` |
| M19 | `src/react/surface/useDrawingSeam.ts:82` | Read pane **index 1** instead of 0 | ✅ Killed |
| M5 | `src/react/surface/useDrawingSeam.ts:93-94` | `layer.detach()` before `unlock?.()` | ✅ Killed **twice** — `test/drawingSeam.spec.tsx:389` and `:410`. **The DRAG-05 assertions were not weakened by moving the presses onto the price pane**: the harness change is mechanical (`pressHost` → `pressPricePane`) and both ordering probes still discriminate |
| M6 | `src/drawing/axisLock.ts:76` | The release re-applies `false` — never restores | ✅ Killed — 8 cases (DRAG-02/03/04/05) |

**Judgement on the `null`-vs-throw distinction: it is right, and it is load-bearing.**
`null` is an answer the port documents — `PaneHandle.getHTMLElement()` returns `null` exactly while
that pane index has no widget (`docs/explanation/port.md:35-37`) — and refusing there would restore
the very defect the file exists to fix (M4 kills 13 cases proving the fallback is depended on). A
throw is a failure to answer, and the only known thrower is `chart.panes()` on a disposed chart;
treating it as `null` would fall straight through to `host.chart.applyOptions(...)` on that same
disposed chart one line below, trading an uncaught error in the reader for an uncaught error a line
later. The docblock at `src/drawing/axisLock.ts:47-53` states exactly this, and M2 and M3 prove both
branches are sensed. One honest caveat, recorded not charged: a `pricePane` that throws for a reason
other than disposal silently costs one lock on a live chart — the same deliberate trade `anchorAt`
already made.

### B. The four historical "green while broken" shapes, all re-injected

| # | File | Fault | Result |
| --- | --- | --- | --- |
| M11 | `src/react/workspace/DrawingRail.tsx:91` | Drop `anchorAt` from the provider's wrapper (the `948f055` defect) | ✅ Killed — `test/drawingRailRegion.spec.tsx:322-324` |
| M12 | `src/react/workspace/DrawingRail.tsx:190` | Never forward the `magnet` group to `DrawingToolbar` (the `b86aee1` defect) | ✅ Killed |
| M34 | `src/drawing/magnet.ts:59` | Measure the snap in **price** units instead of pixels (the `1b1b7a2` fixture defect) | ✅ Killed |
| E1 | `example/drawing.ts:274` | The crosshair preview goes back to the raw pointer price | ✅ Killed — `npm run e2e` 47/48, `magnet.preview-traces-the-snap` FAILS printing the raw value |
| M1 | `src/react/surface/useDrawingSeam.ts:82` | The `pricePane` wiring (the fifth instance) | ✅ Killed — see A |

### C. The hunt for the sixth — every optional member and host-supplied callback on the feature's seams

Enumerated from the diff surface, then deleted or stubbed one at a time.

| # | Seam member / callback | Fault | Result |
| --- | --- | --- | --- |
| M8 | `SurfaceDrawing.magnet?` (CanvasSurface wiring) | Stop forwarding `magnet: drawing.magnet` | ✅ Killed |
| M9 | `CanvasSurfaceProps.snapThresholdPx?` | Stop forwarding it to the surface | ✅ Killed |
| M10 | `WorkspaceDrawingOptions.snapThresholdPx?` | Drop the prop at `ChartWorkspace.tsx:346` | ✅ Killed |
| M13 | `DrawingToolbarLabels.magnet?` default | Drop `magnet: DEFAULT_MAGNET_LABEL` from the chrome defaults | ✅ Killed |
| M14 | price-alert `blur` listener | Never register it | ✅ Killed |
| M15 | `SurfaceDrawing.magnet?` default | Flip the default to `'on'` | ✅ Killed |
| M16 | `DEFAULT_SNAP_THRESHOLD_PX` | 8 → 20 | ✅ Killed |
| M17 | `SurfaceDrawing.snapThresholdPx?` | Ignore the prop, always use the default | ✅ Killed |
| M18 | `snapRef` live read | Freeze mode/bars/threshold at attach time | ✅ Killed |
| M20 | left-button guard | Drop `event.button !== 0` | ✅ Killed |
| M21 | `DrawingToolbarProps.edits?` | Drop the whole group at the rail | ✅ Killed |
| M22 | `IconButton state?` on the toggle | Drop `{kind:'toggle', pressed}` | ✅ Killed |
| M23 | `magnet.onChange` | Invert the toggle direction | ✅ Killed |
| M24 | `labels.magnet ?? DEFAULT_MAGNET_LABEL` | Ignore the host's word | ✅ Killed |
| M25 | `DrawingSurfaceHost.snapPrice` | Hardcode `mode: 'off'` into it | ✅ Killed |
| M26 | `priceToCoordinate` handed to the rule | Always answer `null` | ✅ Killed |
| M31 | `DrawingToolbarProps.magnet?` absence | Draw the toggle even with no group | ✅ Killed |
| M32 | provider `useState<MagnetMode>('off')` | Default to `'on'` | ✅ Killed |
| M35 | `SurfaceDrawing.onCountChange?` | Stop forwarding through the seam | ✅ Killed |
| M36 | `SurfaceDrawing.onToolFinished?` | Stop forwarding through the seam | ✅ Killed |
| M37 | `bars` handed to the rule | Hand it an empty array | ✅ Killed |
| M39 | rail wrapper's `anchorAt` | Always answer yes | ✅ Killed |
| M43 | price-alert `blur` semantics | Discard the level instead of settling | ✅ Killed |
| M44 | price-alert `blur` teardown | Never take the listener back | ✅ Killed |
| M45 | `CanvasSurface` → `onCountChange: drawing.onCount` | Stop forwarding | ⚠️ Survives `npm test` (3/3 baseline) but is **killed by `npm run e2e`** — `drawing.two-spaced-anchors-create-one-drawing` reads "0". Also **pre-existing**: the line is unchanged since `2817b49:src/react/workspace/CanvasSurface.tsx:85`, outside this feature's diff surface |
| M46 | `typeof layer.anchorAt !== 'function'` guard | Attach the lock even for a layer with no hit-test | ❌ **SURVIVED — equivalent mutant.** With the guard gone, `attachAxisLock` is called but its `anchorAt` closure is `layer.anchorAt?.(point) === true`, which is `false` for a layer with none, so no lock is ever taken and no `applyOptions` is made. The only difference is one `mousedown` listener registered and taken back. No spec outcome distinguishes the two. **Not a gap** |
| M47 | `snapPrice`'s pointer `time` | Overwrite it with the first bar's time | ✅ Killed |
| M49 | `edits.count?` | Stop passing the count | ✅ Killed |
| M50 | `edits.onDelete?` | Stop passing it | ✅ Killed |
| M56 | axis-lock teardown | Never remove the `mousedown` listener | ✅ Killed |

**No sixth instance found.** Every optional member and every host-supplied callback introduced or
touched by this feature is sensed by at least one test; the one seam member that jsdom cannot see
(M45) is caught in the browser and is not this feature's code.

### D. Domain-logic mutations (magnet rule and axis lock internals)

| # | File | Fault | Result |
| --- | --- | --- | --- |
| M27 | `magnet.ts:60` | Threshold becomes exclusive (`>` → `>=`) | ✅ Killed |
| M28 | `magnet.ts:61` | Delete the tie rule | ✅ Killed (only by the mirrored ordering at `test/magnet.spec.ts:138`) |
| M29 | `magnet.ts:40` | Ignore the `off` mode | ✅ Killed |
| M30 | `magnet.ts:45` | An unmatched bar time falls back to `bars[0]` | ✅ Killed |
| M33 | `axisLock.ts:18` | `axes()` frees only one of the two options | ✅ Killed — 19 cases |
| M38 | `axisLock.ts:82` | Listen in bubble instead of capture | ✅ Killed |
| M40 | `axisLock.ts:90` | Keep only the last pending release (slot, not Set) | ✅ Killed |
| M41 | `axisLock.ts:90-91` | Set `detached` before releasing | ✅ Killed |
| M42 | `axisLock.ts:27` | Register the release on `document.body` instead of `window` | ✅ Killed |
| M48 | `magnet.ts:32-36` | Drop the converter's throw guard | ✅ Killed |
| M51 | `magnet.ts:54` | `bestPx` starts at 0 instead of `Infinity` | ✅ Killed — 14 cases |
| M52 | `magnet.ts:60` | Keep the farthest candidate | ✅ Killed — 10 cases |
| M53 | `magnet.ts:61` | The tie goes to the LOWER price | ✅ Killed |
| M54 | `magnet.ts:44` | Drop the non-finite price/threshold guard | ✅ Killed |
| M55 | `magnet.ts:55` | Snap to open/close only | ✅ Killed — 7 cases |

### E. Browser-level mutations (the only proof of DRAG-01 and MAGNET-07)

| # | File | Fault | Effect on `npm run e2e` |
| --- | --- | --- | --- |
| E1 | `example/drawing.ts:274` | The preview traces the raw pointer price | ❌→ 47/48, `magnet.preview-traces-the-snap` FAILS: "the trace now sits at 113.30111282090232 — the bar's high is 112.71" |
| E2 | `example/drawing.ts:238` | The committed anchor takes the raw pointer price | ❌→ 47/48, `magnet.on-snaps` FAILS: both points read 113.30111282090232 |
| E3 | `src/react/surface/useDrawingSeam.ts:83` | The seam's hit-test always answers no | ❌→ 47/48, `drag.range-unchanged` FAILS: `after=[1700291600,1700590400,1700892800]` — the chart panned |

**Sensor depth**: P0-full — **59 behaviour mutations**, all typecheck-clean, across the pure domain,
the React seams, the composed workspace and a real Chromium.
**Result**: **58/59 killed**, 1 survivor adjudicated as an equivalent mutant (M46) — ✅ PASS

---

## The `prettier` revert — verified clean

The wholesale reformat of `test/drawingSeam.spec.tsx` was reverted before commit, so it is not in
history. Re-derived from the committed diff `1d11f8b..8e4954b`:

- `git diff --ignore-all-space --stat` returns **the same 69/8 stat** as the plain diff, so every
  changed line carries a non-whitespace change. No formatting churn survived.
- **Zero** `expect(` lines removed; **one** added. `expect(` count 22 → 23, `it(` count 13 → 14.
- No assertion was lost or weakened; the DRAG-05 assertions are byte-identical, only their press
  target moved, and M5 proves they still discriminate.

The repo has no prettier config and no format gate, which is why the reformat had to be hand-reverted
in the first place.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ the throw guard cost 11 B because both foreign reads moved behind one existing `try`, deleting a clause and an `if` from `onDown` |
| Surgical changes | ✅ every file in `67cdda1..HEAD` traces to T32 or T33 |
| No scope creep | ✅ |
| Matches patterns | ✅ the pane reader now carries the same throw contract as its sibling `anchorAt`; the asymmetry iteration 2 filed is closed |
| Spec-anchored outcome check | ✅ 13/13 assert the spec-defined value |
| Per-layer coverage: domain 1:1 with ACs | ✅ `magnet.ts` and `axisLock.ts` |
| Every test maps to a spec requirement | ⚠️ two title mislabels, no unclaimed tests — see Finding 2 |
| Documented guidelines followed | ✅ AD-006, AD-009, AD-010, AD-017 |

**One undeclared behaviour change, recorded and judged benign.** Moving the pane read into
`grabsAnchor` also moved it behind the left-button guard: at `67cdda1` a right-click called
`host.pricePane()`, at HEAD it does not. Strictly fewer foreign reads, no spec outcome depends on it,
and nothing asserts it either way.

---

## Ranked Findings — all follow-ups, none blocks 0.2.0

### Finding 1 — the provisional entry ceiling now behaves as a live budget (Minor · **FOLLOW-UP, does not block**)

- **Evidence**: `test/gates/sizeBudget.spec.ts:48` `PROVISIONAL_ENTRY_LIMIT = 104994`, asserted live
  at `:431` — `expect(BUDGET.entry.limit).toBeLessThan(PROVISIONAL_ENTRY_LIMIT)`. Entry is 104932.
  Margin **62 B**, down from 73 B at iteration 2 and 4,420 B when the marker was written.
- **Judgement asked for, and I do not fully agree with iteration 2.** Iteration 2 called this a
  handoff risk rather than a finding. It is a finding — a documentation-accuracy one, not a size
  one. The docblock at `:41-48` calls the number "the highest the entry limit was ever allowed to
  reach, written down so the descent is checkable", and the prose at `:423-428` says "the growth is
  over and the ratchet returns in its strict form". Both sentences are now falsified by the record
  directly beneath them: this feature re-pinned the entry **fourteen times upward** and once
  downward, and the entry is ascending toward the marker rather than descending from it. A
  governance artifact whose own text contradicts its own ledger is exactly the defect class this
  repo's `danglingRef` and `docReference` gates exist to prevent elsewhere.
- **Why it does not block**: nothing in the release breaks a rule. The limit is pinned at the
  measurement with zero slack, every one of the 15 steps is named in both ledgers, the ratchet
  assertion passes, and the hard cap is at 54% used. No consumer is affected by any of this.
- **Follow-up task**: the owner decides one of two things and writes it down — either the marker's
  prose is corrected to describe what it now is (a live 62 B ceiling), or a real shrinkage is found
  before the next feature touches the entry graph. **`PROVISIONAL_ENTRY_LIMIT` must not be raised**;
  its docblock forbids it and I found no reason to soften that.

### Finding 2 — three stale in-repo citations (Cosmetic · **FOLLOW-UP, does not block**)

- `test/drawingSeam.spec.tsx:248` cites `src/drawing/axisLock.ts:54-56` for the container fallback.
  T33 restructured that function; the fallback is now at `:57-58`, and `54-56` lands on the docblock
  close and the function signature. The comment was accurate when written at `8e4954b` and drifted
  one commit later. `danglingRef.spec.ts` only checks pointers into archived plans, not line
  accuracy, so nothing caught it.
- `test/chartSurface.spec.tsx:855` is titled "MAGNET-05 — the threshold defaults to eight pixels".
  The 8 px default is not MAGNET-05; MAGNET-05 is the mode default and the absent toggle.
- `test/axisLock.spec.ts:284` is titled "a pane the chart cannot name yet costs no lock at all"
  while its assertion at `:293` requires the lock to be **taken**. The intent is right and the
  comment explains it; the title reads as its own opposite.
- **Why it does not block**: comments and test titles only. Zero effect on behaviour, on the
  published package, or on what any assertion proves.

### Finding 3 — `size-gate.mjs` silently depends on a fresh `dist/` (Minor · **FOLLOW-UP, does not block**)

- **Evidence**: run against the `dist/` present in the working tree at the start of this validation,
  `node scripts/size-gate.mjs` exits **1** with `ChartSurface measured=16160` and
  `ChartWorkspace measured=82` discarded because the bundler warned "Import … will always be
  undefined". After `npm run build:esm`, the same command exits 0 with 23745 and 95661.
- **Why it does not block**: the gate failed *safe* — it discarded the measurements rather than
  reporting a false pass, and the entry measurement (104932) was correct in both runs. `npm run e2e`
  builds first, so CI never sees the stale path.
- **Follow-up task**: either have `size-gate.mjs` build first or fail with "run `npm run build:esm`"
  instead of a bundler warning, so the next reader is not told the library has a symbol problem when
  it has a build-order problem.

### Adjudicated and closed — no action

- **M46 is an equivalent mutant, not a surviving fault.** Detail in Sensor section C.
- **M45 is pre-existing and browser-covered.** Detail in Sensor section C.
- **Iteration 1's Gap 5 was answered correctly.** Re-derived independently: `DrawingSurfaceHost` is
  constructed in exactly one place (`src/react/surface/useDrawingSeam.ts:60`) and consumed by the
  binding, so the required `snapPrice` breaks only a host that *fabricates* the object. That is
  precisely what `CHANGELOG.md:79-96` says, with the `Session.reseed` precedent and a before/after
  host double. No code change was owed. I agree with the orchestrator and with iteration 2.

---

## Requirement Traceability Update

| Requirement | Table says | Re-derived |
| --- | --- | --- |
| DRAG-01 … DRAG-05 | Done | ✅ Verified |
| DRAG-06 | Done | ✅ Verified — module **and** composition; iteration 2's unsensed wire is closed (M1) |
| MAGNET-01 … MAGNET-06 | Done | ✅ Verified |
| MAGNET-07 | Done | ✅ Verified — `scripts/e2e-demo.mjs:837`, E1 kills it |

`spec.md:149` reads "13 total, 13 mapped to tasks, 0 unmapped, 13 Done". Re-derived: **13 asserted
against the spec-defined outcome, none resting on an unsensed wire.**

---

## Summary

**Overall**: ✅ Ready — SHIP `0.2.0`

**Spec-anchored check**: 13/13 ACs match the spec-defined outcome; 3 spec-precision gaps, all in the
spec text, none in the code
**Sensor**: 59 mutations, 58 killed, 1 equivalent-mutant survivor
**Gate**: `npm test` 103 suites / 1276 tests · `npm run e2e` 48/48 · `size-gate` exit 0 (entry
104932) · `verify-package-paths` exit 0
**API**: 290 → 295 public symbols, zero removed, 7 signatures changed, 2 breaks — both declared

**What works**: Both of the last round's claims survived independent attack. Deleting the
`pricePane` wiring now fails exactly one test and no more, which is the sharpest possible answer to
iteration 2's blocking gap. The throw contract holds for **both** foreign reads and the `null`/throw
asymmetry is deliberate, documented and separately sensed — removing the guard kills two tests, and
turning a throw into the `null` fallback kills one. The `prettier` revert left no residue: no
whitespace-only line, no assertion lost, and the DRAG-05 probes still discriminate after their press
target moved onto the price pane. The hunt for a sixth vanishing optional member came up empty
across 30 targeted deletions of every optional member and host callback on the feature's seams.

**Issues found**: 3, all follow-ups, none affecting the published package.

**Next steps**: ship. Carry Findings 1–3 into the handoff as tasks for the next feature, with
Finding 1 owed a decision before anything else touches the entry graph.
