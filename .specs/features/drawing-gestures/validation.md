# drawing-gestures Validation

**Date**: 2026-08-20
**Spec**: `.specs/features/drawing-gestures/spec.md`
**Diff range**: `2817b49..67cdda1` (38 commits; the fix round T27-T31 is `58d17e6..67cdda1`)
**Verifier**: independent sub-agent, iteration 2 of 3 (author ≠ verifier; coverage re-derived from the
spec, and the previous FAIL report read but not inherited)

**Verdict: FAIL ❌**

All thirteen requirements now assert the value the spec defines, including MAGNET-07, which had no
evidence at iteration 1. All three edge cases are covered. Seventeen behaviour-level faults were
injected in an isolated worktree and sixteen died. The one survivor is not a weak assertion but a
missing one, and it is the fifth instance of this feature's signature defect: **the library-side
wiring that hands the new pane guard to the lock (`src/react/surface/useDrawingSeam.ts:82`) can be
deleted and `npm test` stays at 1274/1274 while `npm run e2e` stays at 48/48** — with the spec's
third edge case silently reverted to broken. A second, smaller finding: the new published
`pricePane` reader is the only callback in `axisLock.ts` with no throw guard, and a throw from it
was measured escaping the capture-phase handler into the page.

---

## Task Completion

| Task | Status | Notes |
| --- | --- | --- |
| T1-T26 | ✅ Done | Verified at iteration 1 |
| T27 the preview's snap becomes provable | ✅ Done | `scripts/e2e-demo.mjs:837`; M22 re-injected and killed |
| T28 the seam's ordering probe discriminates | ✅ Done | Two independent readings, both die under M20 |
| T29 the axis lock leaves the other panes alone | ⚠️ Partial | Module implemented and sensed; the composition wiring is unsensed (Gap 1) |
| T30 a bar time that matches nothing | ✅ Done | `test/magnet.spec.ts:120`; M21 killed |
| T31 the CHANGELOG stops claiming one break too few | ✅ Done | `CHANGELOG.md:64-96`; accurate on re-derivation |

---

## Spec-Anchored Acceptance Criteria

### P1 — an anchor drag does not pan the chart

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| DRAG-01 WHILE a press has grabbed an anchor, hold both at `false` | exactly `{handleScroll:false, handleScale:false}`, nothing else | `test/axisLock.spec.ts:107` — `expect(it.calls).toEqual([{ handleScroll: false, handleScale: false }])`; capture-phase variant `:97`; unregressed by the new pane guard `:248`; through the seam `test/drawingSeam.spec.tsx:322`; in a real browser `scripts/e2e-demo.mjs:754` `drag.range-unchanged` | ✅ PASS |
| DRAG-02 WHEN released, restore both to `true` | exactly `{true, true}` as the second call | `test/axisLock.spec.ts:120-123` — `expect(it.calls).toEqual([{…false},{ handleScroll: true, handleScale: true }])` | ✅ PASS |
| DRAG-03 IF released outside the container, still restore | both `true` | `test/axisLock.spec.ts:139` — `expect(it.calls[1]).toEqual({ handleScroll: true, handleScale: true })`, release dispatched on a sibling outside the container | ✅ PASS |
| DRAG-04 IF the window blurs mid-drag, restore both | both `true` | `test/axisLock.spec.ts:152` — same expression after `window.dispatchEvent(new Event('blur'))` | ✅ PASS |
| DRAG-05 IF the surface unmounts mid-drag, no call to the disposed chart, no listener left | exactly two calls, zero stranded listeners | `test/axisLock.spec.ts:174-178` — `expect(it.calls).toEqual([…2 entries])` + `expect(it.hits).toHaveLength(1)`; listener balance by identity `:335` — `expect(stranded(add, remove)).toEqual([])`; ordering through the seam `test/drawingSeam.spec.tsx:349` — `expect(log.order).toEqual(['lock', 'release', 'detach'])` and `:370` — `expect(log.duringDetach).toEqual(['applied 2 -> 2'])` | ✅ PASS |
| DRAG-06 WHEN a press lands anywhere that is not an anchor, leave both untouched | **no `applyOptions` call at all** | `test/axisLock.spec.ts:189` — `expect(it.calls).toEqual([])`; non-left button `:199`; throwing hit-test `:220-221`; **a press outside the price pane** `:237` — `expect(it.calls).toEqual([])`; layer with no `anchorAt` `test/drawingSeam.spec.tsx:334` | ✅ PASS (module) / see Gap 1 for the composition |

### P2 — the magnet is a mode the user controls

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| MAGNET-01 a two-state mode `off`/`on`, defaulting to `off` | first read `off`; both directions reachable | `test/drawingRailRegion.spec.tsx:378` — `expect(screen.getByTestId('magnet-probe')).toHaveTextContent('off')`; through the mounted composition `:410-411`, `:420`, `:428`, `:434` — `expect(screen.getByTestId('canvas')).toHaveAttribute('data-magnet', 'off'\|'on'\|'off')`; at the surface `test/chartSurface.spec.tsx:836` / `:852` | ✅ PASS |
| MAGNET-02 WHILE `off`, resolve to the pointer's own price, not any bar | the input price, unchanged | `test/magnet.spec.ts:67-69` — `expect(price).toBe(103.7)` **and** `expect(watched.reads()).toBe(0)` and `expect(converted).toBe(0)`: no bar is consulted at all; browser `scripts/e2e-demo.mjs:800` `magnet.off-is-free` | ✅ PASS |
| MAGNET-03 WHILE `on` and within the threshold of O/H/L/C, resolve to that bar value | that exact bar value, nearest wins | `test/magnet.spec.ts:77` — `toBe(110)`; a different quartet member `:83` — `toBe(105)`; the pixel-vs-price discriminator at 4 px/unit `:97` — `expect(price).toBe(107.5)`; through the surface `test/chartSurface.spec.tsx:852` — `toBe(110)`; browser `scripts/e2e-demo.mjs:818` `magnet.on-snaps` asserts `snapped.toFixed(2) === bar.high.toFixed(2)` | ✅ PASS (⚠ Spec-precision 1) |
| MAGNET-04 WHILE `on` with nothing in reach, resolve to the pointer's own price | the input price | `test/magnet.spec.ts:103` — `toBe(102.5)` at `thresholdPx: 1`; non-finite threshold `:162`; non-finite price `:166`; throwing converter `:210` | ✅ PASS |
| MAGNET-05a WHERE no control flipped the mode, behave exactly as `off` | identical to `off` — the pointer's own price | `test/chartSurface.spec.tsx:836` — `expect(log.hosts[0].snapPrice({ time: BARS[0].time, price: 109 })).toBe(109)` with `drawing={{ binding }}` and no `magnet` field; provider default `test/drawingRailRegion.spec.tsx:378` | ✅ PASS |
| MAGNET-05b a toolbar with no magnet group draws no toggle | the toggle absent, the other controls present | `test/drawingRail.spec.tsx:637` — `expect(screen.queryByTestId('drawing-magnet')).toBeNull()`, control positives `:640-641` | ✅ PASS |
| MAGNET-06 a mode changed mid-gesture applies to later anchors and moves none already placed | the resolved value unchanged; the next call takes the new mode | `test/drawingSeam.spec.tsx:407-408` — `expect(placed).toBe(109)` then `expect(host.snapPrice({…price: 109})).toBe(110)` across a re-render; live bars `:423`; live threshold `:432`, `:438`; no re-attach `:382`/`:392`; through the composition `test/drawingRailRegion.spec.tsx:420-434` | ✅ PASS |

### P3 — the preview shows what the magnet will do

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| MAGNET-07 WHILE `on`, the preview traces to the snapped position, not the raw pointer position | the traced cursor's price equals the snapped bar value and differs from the pointer's | `scripts/e2e-demo.mjs:837` `magnet.preview-traces-the-snap` — `traced.price.toFixed(2) === bar.high.toFixed(2) && traced.price !== freeNear`. Measured green at HEAD: trace 112.7117 vs the bar's high 112.71, against 113.3011 for the same point placed free. Re-injecting M22 turns it red with `the trace now sits at 113.30111282090232` | ✅ PASS |

**Status**: ✅ 13/13 covered against the spec-defined outcome. 3 spec-precision gaps flagged below
(none is a coverage gap).

### Spec-precision gaps

1. **MAGNET-03 is still silent on whether the threshold is inclusive.** `spec.md:89` says "within the
   snap threshold"; `design.md` decides `<= thresholdPx`; `test/chartSurface.spec.tsx:882-884` pins
   it — `toBe(95)` at a distance of exactly 8 with the default threshold, `toBe(86)` at 9, and
   `toBe(95)` at 9 for a host asking for 9. Behaviour decided and asserted; the **spec** is the
   imprecise artifact. Unchanged from iteration 1.
2. **The tie edge case is written in price units while the rule measures pixels.** `spec.md:122-123`
   says "two bar values equidistant from the pointer"; `src/drawing/magnet.ts:59-61` compares pixel
   distances and breaks the tie on price. The two coincide on a linear scale and part on a
   logarithmic one. AD-010 makes pixels the unit, so this is the sentence, not the code.
3. **NEW — the third edge case names a mechanism the library cannot use.** `spec.md:124-125` says
   the guard should match "the existing pane-index guard on placement". A raw `mousedown` carries no
   `paneIndex`; the delivered guard is DOM containment of `PaneHandle.getHTMLElement()`
   (`src/drawing/axisLock.ts:56-57`). The **outcome** the spec states is met — measured in a real
   browser, `panes()[0]` and `panes()[1]` are distinct, disjoint `<TR>` elements — but the spec
   sentence describes an implementation the library has no access to.

### Traceability mislabel (no coverage impact, unchanged from iteration 1)

- `test/chartSurface.spec.tsx:855` is titled "MAGNET-05 — the threshold defaults to eight pixels".
  The 8 px default is not MAGNET-05; MAGNET-05 is the mode default and the absent toggle.
- `test/axisLock.spec.ts:252` is titled "a pane the chart cannot name yet costs no lock at all"
  while its assertion `:261` requires the lock to be taken. The intent ("does not cost you the
  lock") is right and the comment explains it; the title reads as its own opposite.

---

## Edge Cases

- [x] **Zero bars → the pointer's own price.** `test/magnet.spec.ts:109` —
  `expect(snapAnchorPrice(input({ bars: [], price: 103.7 }))).toBe(103.7)`.
- [x] **Two equidistant bar values → the HIGHER price.** `test/magnet.spec.ts:127` — `toBe(110)`
  with the higher pair **last**, mirrored at `:138` with the higher pair **first**. Both are
  required: deleting the tie clause entirely leaves the first ordering green and kills only the
  second (mutation S5).
- [x] **A drag beginning on a pane other than the price pane → the axes untouched.** Implemented in
  the fix round. `src/drawing/axisLock.ts:56-57` refuses when the answered pane does not contain the
  press target; `test/axisLock.spec.ts:237` — `expect(it.calls).toEqual([])` for a press on a study
  pane the hit-test says yes to. The library is live in the browser and the panes are genuinely
  disjoint (probes L1, L2 and the direct DOM measurement below). **But the composition wiring that
  supplies the pane is unsensed — see Gap 1.**

---

## Gate Check

| Gate | Command | Result |
| --- | --- | --- |
| Unit | `npm test` | ✅ exit 0 — **103 suites / 1274 tests passed**, 0 failed, 0 skipped |
| Browser | `npm run e2e` | ✅ exit 0 — **48/48 checks passed** (run at HEAD in the scratch worktree) |
| Size | `node scripts/size-gate.mjs` | ✅ exit 0 — 16 measurements under budget, entry `104921 / 104921` |
| Package paths | `node scripts/verify-package-paths.mjs` | ✅ exit 0 — files[] and exports resolve (7 entries) |
| Generated docs | `test/gates/docReference.spec.ts` (inside `npm test`) | ✅ byte-for-byte; `AxisLockHost.pricePane` is published in `docs/reference/drawing/axisLock.md:25` |

- **Test count before the feature**: 1255 · **after**: 1274 · delta **+19**. No suite deleted, no
  assertion in scope weakened; the fix round added +5 (2 seam, 3 axis lock) and +1 magnet, and one
  e2e check (47 → 48).
- **Skipped**: none.

**Known trap, pre-existing and out of scope:** `test/gates/sizeBudget.spec.ts` fails in a fresh
worktree because `dist/` is absent (3 cases). Reproduced during the sensor run; it is the scratch
baseline, not a regression — every mutation below is scored against 1271 passed / 3 failed there.

### CHANGELOG cross-check (numbers, not prose)

| Claim | Source | Verdict |
| --- | --- | --- |
| entry 104,921 B | `size-gate.mjs` prints `104921 / 104921` | ✅ |
| +1,914 B from 103,007 B | 104921 − 103007 = 1914; 103007 is the previous ledger pin | ✅ |
| "the last of them the pane guard above, at 112 B" | 104809 → 104921; `test/gates/sizeBudget.spec.ts:86-90` names the same 112 B and the two shapes measured (131 B named helper, 112 B inlined) | ✅ |
| "349 B of that came back out of this feature's own modules" | ledger `RE-PINNED DOWN … to 104618 (-349 B)` | ✅ |
| hard cap 195,761 B | `size-budget.json:132` and asserted equal to the measured peer at `test/gates/sizeBudget.spec.ts:441` | ✅ |
| `DrawingSurfaceHost.snapPrice` named as a second, direction-limited break | `CHANGELOG.md:79-96`, with the `Session.reseed` precedent and a before/after host double | ✅ — iteration 1's Gap 5 is answered correctly |
| `AxisLockHost.pricePane` disclosed | `AxisLockHost` is **itself first published in this same unreleased 0.2.0 entry** (`CHANGELOG.md:48-49`, Added; only `v0.1.0` is tagged), and the full signature including `pricePane?` is in the generated reference | ✅ — a separate Added bullet would be redundant; keeping the behaviour under Fixed is right. One nit under Notes |

---

## Discrimination Sensor

Isolated scratch: `git worktree add --detach` at `67cdda1`, `node_modules` symlinked, mutations
applied to the copies only, torn down with `git worktree remove --force`. **No `git stash` was
used.** Pre-sensor baseline `git status --porcelain` was empty; it is empty again after teardown,
`git worktree list` shows only the real tree, and HEAD is unchanged at `67cdda1`.

### The four documented "green while broken" shapes, all re-injected

| # | File | Fault | Killed? |
| --- | --- | --- | --- |
| H1 | `src/react/workspace/DrawingRail.tsx:95` | Drop `anchorAt` from the provider's wrapper (the `948f055` defect) | ✅ Killed — `test/drawingRailRegion.spec.tsx:322-324` |
| H2 | `src/react/workspace/DrawingRail.tsx:180,190` | Never forward the `magnet` group to `DrawingToolbar` (the `b86aee1` defect) | ✅ Killed — `test/drawingRailRegion.spec.tsx:410-411`, `:420` (2 cases) |
| H3 | `src/drawing/magnet.ts:59` | Measure the snap in price units instead of pixels (the `1b1b7a2` fixture defect) | ✅ Killed — `test/magnet.spec.ts:97` (4 cases) |
| M22 | `example/drawing.ts:277` | The crosshair preview goes back to the raw pointer price (the clause with no sensor at iteration 1) | ✅ Killed — `npm run e2e` 47/48, `magnet.preview-traces-the-snap` FAILS: "the trace now sits at 113.30111282090232 — the bar's high is 112.71" |

### The fifth, found by mutating the same seam one level up

| # | File | Fault | Killed? |
| --- | --- | --- | --- |
| U5 | `src/react/surface/useDrawingSeam.ts:82` | Delete `pricePane: () => chart.panes()[0]?.getHTMLElement() ?? null` from the `attachAxisLock` call | ❌ **SURVIVED** — `npm test` 1274/1274, `tsc --noEmit` clean, `npm run e2e` **48/48** |

### The three claims made by the fix round, re-injected independently

| # | File | Fault | Killed? |
| --- | --- | --- | --- |
| M20 | `src/react/surface/useDrawingSeam.ts:93-94` | `layer.detach()` before `unlock?.()` | ✅ Killed — twice: `test/drawingSeam.spec.tsx:349` (`['lock','detach','release']` received) and `:370` (`applied 1 -> 2` received) |
| M21 | `src/drawing/magnet.ts:45` | An unmatched bar time falls back to `bars[0]` | ✅ Killed — `test/magnet.spec.ts:120`, received `105` (that bar's close) against the spec's `103.7` |
| U3 | `src/drawing/axisLock.ts:56-57` | Remove the pane clause entirely | ✅ Killed — `test/axisLock.spec.ts:237` |
| U4 | `src/drawing/axisLock.ts:57` | An unanswered pane (`null`) **disables** the lock instead of falling back to the container | ✅ Killed — 14 cases across `axisLock`, `drawingSeam`, incl. `test/axisLock.spec.ts:261` |

The `applied=1` comment iteration 1 called false is gone. Its replacement
(`test/drawingSeam.spec.tsx:368-369`, "Unlocking AFTER the detach instead reads `applied 1 -> 2`")
is **empirically true**: M20 produced exactly `applied 1 -> 2`.

### Module and composition faults, re-derived

| # | File | Fault | Killed? |
| --- | --- | --- | --- |
| S1 | `axisLock.ts:66` | The release re-applies `false` — never restores | ✅ Killed — 7 cases (DRAG-02/03/04/05) |
| S2 | `ChartSurface.tsx:165` | `SurfaceDrawing.magnet` defaults to `'on'` | ✅ Killed — `test/chartSurface.spec.tsx:836` |
| S3 | `DrawingToolbar.tsx:300` | Draw the toggle even with no magnet group | ✅ Killed — `test/drawingRail.spec.tsx:637` |
| S4 | `useDrawingSeam.ts:60-66` | `snapPrice` freezes mode/bars/threshold at **attach** time | ✅ Killed — 3 cases (MAGNET-06) |
| S5 | `magnet.ts:61` | Delete the tie rule | ✅ Killed — only by the mirrored ordering at `test/magnet.spec.ts:138` |
| S6 | `magnet.ts:40` | Ignore the mode — `off` snaps too | ✅ Killed — 2 cases (MAGNET-02, MAGNET-01) |

### Browser-level probes for the new pane guard (liveness, re-derived not inherited)

| # | Fault | Effect on `npm run e2e` |
| --- | --- | --- |
| L1 | `pricePane` answers a **foreign** element whenever the chart can name pane 0 | ❌→ **47/48.** `drag.range-unchanged` FAILS: `after=[1700291600,…]` — the chart panned. So the guard is **live** in the browser and `panes()[0].getHTMLElement()` is non-null there; it is not inert |
| L2 | `pricePane` points at **pane 1** (the volume lane) | ❌→ **47/48.** Same failure. Pane 1's element does not contain the price pane's press target |
| — | Direct DOM measurement through a scratch-only probe | `{"count":8,"p0":"TR","p1":"TR","same":false,"p0ContainsP1":false,"p0ContainsCanvas1":false,"p1ContainsCanvas0":false}` — the panes are disjoint `<TR>` elements, so pane 0's element genuinely excludes the other panes' targets. Edge case 3 is behaviourally correct in the composition |

**Sensor depth**: P0-full — 17 behaviour mutations across module, composition and browser layers,
plus two liveness probes and one direct DOM measurement.
**Result**: **16/17 killed, 1 survived (U5)** — ❌ FAIL

---

## Additional finding, measured rather than mutated

`host.pricePane?.()` at `src/drawing/axisLock.ts:56` is called **unguarded** inside a capture-phase
`mousedown` handler. Its sibling reader `host.anchorAt` is wrapped in `try/catch` at `:40-45` with
the module's own reasoning — "A hit-test against a state the engine did not expect costs one missed
lock, never a crash" — and that decision has a test: `test/axisLock.spec.ts:221` asserts
`expect(escaped).toEqual([])` for a throwing hit-test. Measured with a scratch-only jsdom probe, a
`pricePane` that throws escapes into the page:

```
ESCAPED= ["Object is disposed"] CALLS= []
```

`attachAxisLock` is a published export for hosts composing their own surface
(`CHANGELOG.md:48-49`), and the in-repo implementation of the callback is `chart.panes()`, which the
base library throws from once the chart is disposed. See Gap 2.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ the pane guard is two clauses and one optional member, 112 B measured against a 131 B alternative that was rejected |
| Surgical changes | ✅ every touched file in `58d17e6..HEAD` traces to T27-T31 |
| No scope creep | ✅ the fix round touches only what the five gaps named |
| Matches patterns | ⚠️ the new optional reader mirrors `anchorAt`'s shape but not its throw contract (Gap 2) |
| Spec-anchored outcome check | ✅ 13/13 assert the spec-defined value |
| Per-layer coverage: domain 1:1 with ACs | ✅ for `magnet.ts` and `axisLock.ts` |
| Every test maps to a spec requirement | ✅ two title mislabels noted, no unclaimed tests |
| Documented guidelines followed | ✅ AD-006 (the guard reads a port type, not the drawing engine), AD-009, AD-010, AD-017 |

---

## Ranked Gaps

### Gap 1 — the pane guard is wired but the wiring is unsensed (Major, blocks PASS)

- **Evidence**: mutation **U5**. Deleting `src/react/surface/useDrawingSeam.ts:82` leaves `npm test`
  at 1274/1274, `tsc --noEmit` silent and `npm run e2e` at **48/48**. `AxisLockHost.pricePane` is
  optional, so the deletion typechecks — the same property that let `anchorAt` be dropped by the
  provider's wrapper in `948f055` and the magnet group be dropped by `DrawingRail` in `b86aee1`.
- **Why the existing tests miss it**: `test/axisLock.spec.ts:227-264` supplies `pricePane` by hand,
  so it proves the module honours a pane it is given, never that the seam gives it one. And the
  guard is inert in **every** React composition test in the repo: each fake chart answers
  `getHTMLElement: () => null` (`test/drawingSeam.spec.tsx:43`, `test/chartSurface.spec.tsx:138`,
  `test/canvasSurface.spec.tsx:93`, and eleven more), while `seamHandles` answers `panes: () => []`
  (`test/drawingSeam.spec.tsx:246`) — so `pricePane` resolves to `null` and falls back to the whole
  container whether the line is there or not. No e2e check presses outside the price pane either,
  and the demo carries 8 panes, so one is available.
- **Impact**: with the line gone, `spec.md:124-125` reverts to broken through `ChartWorkspace` and
  `ChartSurface` — a press on a study pane whose container coordinates happen to satisfy the
  binding's hit-test freezes both axes, which is the defect this feature exists to remove. Nothing
  turns red.
- **Fix task**: extend `seamHandles` in `test/drawingSeam.spec.tsx` to answer a real pane element
  from `panes()` and assert `expect(log.applied).toEqual([])` for a press dispatched outside it,
  paired with the existing positive at `:322`. That case dies under U5. (An e2e check pressing the
  volume lane would also work and would additionally cover the composition end to end.)

### Gap 2 — the new published reader has no throw guard, unlike its sibling (Minor)

- **Evidence**: measured, above — a throwing `pricePane` escapes the capture-phase handler
  (`ESCAPED= ["Object is disposed"]`) while `anchorAt` in the same function does not
  (`src/drawing/axisLock.ts:40-45`, asserted at `test/axisLock.spec.ts:221`).
- **Impact**: an uncaught error out of a browser-dispatched press, reachable for a host that
  composes its own surface with a disposed or half-built chart. No AC requires the guard; the
  module's own written contract does.
- **Fix task**: bring the `pricePane` call inside the same `try`/`catch` reading a throw as "cannot
  answer" (which the code already treats as "the whole container"), and add the mirror of
  `test/axisLock.spec.ts:203-224` for it. Cost is a handful of bytes against 73 B of headroom — see
  the Note below before spending them.

---

## Notes and judgements requested

**The 73 B margin under `PROVISIONAL_ENTRY_LIMIT` (104994) is a risk, not a finding.** Nothing in
this feature breaks a rule: the entry is pinned at its measurement, every step is named in both
ledgers, the ratchet assertion at `test/gates/sizeBudget.spec.ts:424` passes, and the hard cap is
untouched at 47% used. But the marker's own docblock (`:41-48`) calls it a historical record of
"the highest the entry limit was ever allowed to reach", and with 73 B left it now behaves as a
live budget — the next feature that adds a line to the entry graph must either find a real
shrinkage or rewrite a number the docblock says is a fact about the past. Worth stating in the
handoff so the next author meets it deliberately rather than at a red gate. It does not affect this
verdict.

**`AxisLockHost.pricePane` under Fixed rather than Added is correct.** `AxisLockHost` is itself
first published in this same unreleased 0.2.0 entry (`CHANGELOG.md:48-49`; the only tag in the repo
is `v0.1.0`), so the member is not an addition to anything a consumer has ever compiled against,
and the generated reference prints its full signature. One nit: the Fixed bullet's sentence "so is a
press outside the price pane" states package behaviour, and a host calling `attachAxisLock` directly
only gets it by supplying `pricePane` — which the type's own comment explains
(`src/drawing/axisLock.ts:13`) but the entry does not.

**Iteration 1's Gap 5 was rightly answered with prose.** `DrawingSurfaceHost.snapPrice` is
constructed only at `src/react/surface/useDrawingSeam.ts:60` and consumed by the binding; the
rewrite at `CHANGELOG.md:79-96` names it as a break for host-constructors only, cites the
`Session.reseed` precedent, and shows the one-line migration. No code change was owed.

---

## Requirement Traceability Update

| Requirement | Table says | Re-derived |
| --- | --- | --- |
| DRAG-01 … DRAG-05 | Done | ✅ Verified |
| DRAG-06 | Done | ⚠️ Verified at the module; the composition wiring of its new pane clause is unsensed (Gap 1) |
| MAGNET-01 … MAGNET-06 | Done | ✅ Verified |
| MAGNET-07 | Done | ✅ Verified — `scripts/e2e-demo.mjs:837`, M22 killed |

`spec.md:149` reads "13 total, 13 mapped to tasks, 0 unmapped, 13 Done". Re-derived: **13 asserted
against the spec-defined outcome**, with one of them resting on an unsensed wire.

---

## Summary

**Overall**: ❌ Not Ready — one Major, one Minor, both cheap

**Spec-anchored check**: 13/13 ACs match the spec-defined outcome; 3 spec-precision gaps (all in the
spec text, none in the code)
**Sensor**: 17 mutations, 16 killed, 1 survived (U5)
**Gate**: `npm test` 1274 passed · `npm run e2e` 48/48 · size-gate exit 0 (entry 104921) ·
verify-package-paths exit 0 · generated docs byte-clean

**What works**: Every claim the fix round made survived independent re-injection. MAGNET-07 went
from inert to the sharpest check in the browser suite — the preview probe reads the object the
preview was handed, so it reports a price and not a colour, and M22 fails it with the raw pointer
value printed in the message. The seam's ordering probe now records order and is killed twice over,
and its replacement comment was verified true by running the fault. The pane guard is real code
doing real work: it is live in Chromium (L1), the panes are genuinely disjoint (L2 plus a direct DOM
read), a `null` pane falls back to the whole container rather than disabling the lock (U4 kills 14
cases), and neither DRAG-01 nor DRAG-06 regressed. All four of this feature's historical
"green while broken" shapes were re-injected and all four died.

**Issues found**: 2. The fifth instance of the recurring shape is the new pane guard's own wiring —
proven implemented, proven live, and provably untested at the seam.

**Next steps**: one test for Gap 1 and one guard-plus-test for Gap 2, then re-verify. Both are
inside a single task's worth of work.
