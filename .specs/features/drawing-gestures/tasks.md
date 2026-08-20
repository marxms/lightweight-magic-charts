# Drawing gestures Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/drawing-gestures/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase, project guidelines and spec — confirm before Execute. Guidelines found:
> `CONTRIBUTING.md` ("The gates" — the suite *is* the gate script), `jest.config.js` (node default,
> jsdom opted into per file), `test/gates/*.spec.ts` (16 deterministic gates). No coverage threshold
> is configured; the repo's standard is a named behavioural suite per module plus the gate ledger.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Pure library module (`src/drawing/*.ts`, no React) | unit | All branches; 1:1 to spec ACs; every listed edge case | `test/<module>.spec.ts` (node env) | `npm test` |
| Surface hook / component (`src/react/**`) | unit | Every AC the hook or component is responsible for, driven through the rendered tree | `test/<name>.spec.tsx` (`@jest-environment jsdom` docblock) | `npm test` |
| Public entry (`src/index.ts`) | unit | Export exists and is reachable; boundary gate stays green | `test/boundary.spec.ts` | `npm test` |
| Type-only seam (`drawingLayer.ts` interfaces) | unit | Structural pins hold (`test/renderBoundary.spec.ts`) | `test/renderBoundary.spec.ts` | `npm test` |
| Example / host binding (`example/**`) | none | build gate only — the example is the host, proven end to end by e2e | - | build gate only |
| Real-browser behaviour | e2e | One check per P1 and P2 story, per the spec's Success Criteria | `scripts/e2e-demo.mjs` | `npm run e2e` |
| Docs and ledgers (`docs/**`, `CHANGELOG.md`) | none | build gate only — `commentBudget` and `danglingRef` gates verify anchors | - | build gate only |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks with unit tests only | `npm test` |
| Full | After tasks with e2e | `npm test && npm run e2e` |
| Build | After config, docs, example or ledger-only tasks | `npm run build && npm test && node scripts/size-gate.mjs && node scripts/verify-package-paths.mjs` |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks
within a phase execute in order.

### Phase 1: Ground — the docs anchors, then the two pure modules

`commentBudget.spec.ts` fails any `docs/<file>.md#<anchor>` in `src/` that does not resolve to a real
heading, so the prose lands **before** the code that cites it.

```
T1 → T2
T1 → T3
```

### Phase 2: The seam

```
T2 → T4
T3 → T4
T4 → T5
T5 → T6
T6 → T7
```

### Phase 3: The workspace chain

```
T7 → T8
T8 → T9
```

### Phase 4: The host and the browser

```
T9 → T10
T10 → T21
T21 → T11
```

### Phase 5: The ledger

```
T12 → T13
```

### Phase 6: Hardening, from the batch-1 adversarial review

Inserted AHEAD of the blocked T11 deliberately. `attachAxisLock` and `snapAnchorPrice` are already
published with reference pages of their own, so F2 and F3 are unvalidated public API today and must
not accumulate more surface on top of them. Every task here traces to a finding that survived an
independent refutation attempt; F1 is absent because `948f055` already fixed it.

```
T14 → T15
T15 → T16
T14 → T17
T17 → T18
T18 → T19
T19 → T20
```

### Phase 7: The feature pays its own byte bill, and hardens

The entry sits at 104967 against `PROVISIONAL_ENTRY_LIMIT = 104994`
(`test/gates/sizeBudget.spec.ts:48`) — 26 bytes. That number is not a re-pin target: its docblock
calls it "the highest the entry limit was ever allowed to reach, written down so the descent is
checkable", so raising it would erase the marker rather than move a budget. The bytes come back out
of the modules THIS feature added, not out of unrelated code.

```
T24 → T25
T24 → T26
```

### Phase 8: Wire the control, prove it in a browser, close the ledgers

```
T26 → T22
T22 → T12
T12 → T13
T12 → T23
```

---

## Task Breakdown

### T1: Write the two explanation sections the new modules cite — DONE

**What**: Add `## The axis lock is the library's half of the drag` and `## The magnet is a rule, not a placement` to the drawing explainer, each stating what the library owns and what the binding owns.
**Where**: `docs/explanation/drawing.md`
**Depends on**: None
**Reuses**: the existing heading style in `docs/explanation/drawing.md`
**Requirement**: DRAG-01, MAGNET-01
**Skills**: none

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Both headings exist and slugify to the anchors the later tasks write in `src/`
- [x] Each section names the split: engine-agnostic half in the package, hit-test in the binding
- [x] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs && node scripts/verify-package-paths.mjs`

**Tests**: none
**Gate**: build

**Commit**: `docs: name the two halves of a drawing gesture`

---

### T2: The snap rule — DONE

**What**: `MagnetMode` and `snapAnchorPrice` — pure, pixel-threshold, tie goes to the higher price.
**Where**: `src/drawing/magnet.ts`
**Depends on**: T1
**Reuses**: `Bar` and `UtcSeconds` from `src/domain/types.ts`; `PriceConverter` from `src/port/chartApi.ts`
**Requirement**: MAGNET-02, MAGNET-03, MAGNET-04
**Skills**: none

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `mode: 'off'` returns the input price without reading `bars`
- [x] `mode: 'on'` returns the nearest of open/high/low/close within `thresholdPx`
- [x] No candidate within threshold returns the input price
- [x] Zero bars returns the input price
- [x] Equidistant candidates resolve to the higher price
- [x] A `priceToCoordinate` returning `null` drops that candidate, not the snap
- [x] `test/magnet.spec.ts` written, one case per bullet above
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + ≥6 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(drawing): the magnet snaps to a bar value within a screen distance`

---

### T3: The axis lock — DONE

**What**: `attachAxisLock` — capture-phase press, the `applyOptions` pair, release on `mouseup`/`blur`, disposer that survives teardown.
**Where**: `src/drawing/axisLock.ts`
**Depends on**: T1
**Reuses**: the proven fix at `~/dev/cripto_bot_mcp/shooting-for-the-moon-streamer/apps/web/src/config/chartDrawings.ts:233-274`; `ChartLifecycle` from `src/port/chartApi.ts`
**Requirement**: DRAG-01, DRAG-02, DRAG-03, DRAG-04, DRAG-05, DRAG-06
**Skills**: none

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `mousedown` is registered in capture phase on the container
- [x] A press where `anchorAt` answers true calls `applyOptions({ handleScroll: false, handleScale: false })`
- [x] `mouseup` restores both to `true`
- [x] Release listeners are on `window`, so a `mouseup` outside the container still restores
- [x] `blur` restores both
- [x] A press where `anchorAt` answers false makes **no** `applyOptions` call at all
- [x] A non-left button makes no call
- [x] After the disposer runs, a late `mouseup` makes no call and no listener remains
- [x] `anchorAt` throwing costs one missed lock, not an exception out of the handler
- [x] `test/axisLock.spec.ts` written (`@jest-environment jsdom`), one case per bullet above
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + ≥9 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `fix(drawing): an anchor drag holds the axes instead of panning the chart`

---

### T4: Open the seam for both halves — DONE

**What**: Add optional `anchorAt` to `DrawingLayer` and required `snapPrice` to `DrawingSurfaceHost`.
**Where**: `src/drawing/drawingLayer.ts`
**Depends on**: T2, T3
**Reuses**: the optional-member precedent of `serialize`/`restore` in the same file
**Requirement**: DRAG-06, MAGNET-05
**Skills**: none

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `DrawingLayer.anchorAt?(point): boolean` declared optional, so an existing binding still compiles
- [x] `DrawingSurfaceHost.snapPrice(at): number` declared
- [x] `test/renderBoundary.spec.ts` still pins the port and passes
- [x] Gate check passes: `npm test`
- [x] Test count: baseline tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(drawing): the seam carries the anchor hit-test and the snap rule`

---

### T5: Wire the lock and the closure into the seam hook — DONE

**What**: Call `attachAxisLock` when the layer implements `anchorAt`, unlock before `detach()`, and build the stable `snapPrice` closure over live refs.
**Where**: `src/react/surface/useDrawingSeam.ts`
**Depends on**: T4
**Reuses**: the `eventsRef` live-ref pattern already in the file (`useDrawingSeam.ts:31`)
**Requirement**: DRAG-05, MAGNET-06
**Skills**: ecc:react-patterns

**Tools**:
- MCP: NONE
- Skill: `ecc:react-patterns`

**Done when**:
- [x] The mount effect attaches the lock only when `layer.anchorAt` is defined
- [x] Cleanup unlocks **before** `layer.detach()`
- [x] The effect's dependency list does **not** gain bars, mode or threshold — a new bar must not re-attach the layer
- [x] `snapPrice` reads mode, threshold and bars at call time, so a mode changed mid-gesture applies to the next anchor only
- [x] `test/drawingSeam.spec.tsx` extended for each bullet above
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + ≥4 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(drawing): the surface attaches the axis lock and binds the snap rule`

---

### T6: Publish the magnet on the surface prop group — DONE

**What**: `SurfaceDrawing` gains `magnet` and `snapThresholdPx`; the surface passes bars, mode and threshold to the seam hook.
**Where**: `src/react/surface/ChartSurface.tsx`
**Depends on**: T5
**Reuses**: the destructured-at-the-door convention (`ChartSurface.tsx:140`)
**Requirement**: MAGNET-01, MAGNET-05
**Skills**: ecc:react-patterns

**Tools**:
- MCP: NONE
- Skill: `ecc:react-patterns`

**Done when**:
- [x] `magnet` absent behaves exactly as `'off'`
- [x] `snapThresholdPx` absent defaults to 8
- [x] Both are destructured at the door, never passed as a group into a dependency list
- [x] `test/gates/propCount.spec.ts` still passes (the fields go inside the existing group)
- [x] `test/chartSurface.spec.tsx` extended for the default and the on case
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + ≥2 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(drawing): the surface accepts the magnet mode and its threshold`

---

### T7: Export the new public surface — DONE

**What**: Export `MagnetMode`, `snapAnchorPrice`, `attachAxisLock` and `AxisLockHost` from the entry point.
**Where**: `src/index.ts`
**Depends on**: T6
**Reuses**: the grouped-export layout around `src/index.ts:193-210`
**Requirement**: MAGNET-01
**Skills**: none

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Each symbol is importable from the package root
- [x] `test/boundary.spec.ts` passes
- [x] `node scripts/verify-package-paths.mjs` exits 0
- [x] Gate check passes: `npm test`
- [x] Test count: baseline tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat: publish the axis lock and the snap rule`

---

### T8: The mode's home in the rail provider — DONE

**What**: `DrawingRailProvider` holds `magnet` state and exposes `magnet` + `setMagnet` on `DrawingRailValue`, defaulting to `'off'`.
**Where**: `src/react/workspace/DrawingRail.tsx`
**Depends on**: T7
**Reuses**: the `activeTool` / `arm` state pair in the same provider (`DrawingRail.tsx:56`)
**Requirement**: MAGNET-01, MAGNET-06
**Skills**: ecc:react-patterns

**Tools**:
- MCP: NONE
- Skill: `ecc:react-patterns`

**Done when**:
- [x] `useDrawingRail().magnet` is `'off'` on first render
- [x] `setMagnet('on')` flips it and re-renders consumers
- [x] The provider renders no control and no label of its own
- [x] `test/gates/memoisation.spec.tsx` and `test/gates/wording.spec.ts` still pass
- [x] `test/drawingRailRegion.spec.tsx` extended for the default and the flip — the provider's own
      suite, where `DrawingRailProvider` already lives; `test/drawingRail.spec.tsx` is the toolbar's
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + 3 tests pass (1234 -> 1237, no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(drawing): the rail provider holds the magnet mode`

---

### T9: Forward the mode from the workspace to the surface — DONE

**What**: `CanvasSurface` passes `magnet` into `SurfaceDrawing`; `WorkspaceDrawingOptions` gains `snapThresholdPx`.
**Where**: `src/react/workspace/CanvasSurface.tsx`
**Depends on**: T8
**Reuses**: the existing `drawing={{ ... }}` block (`CanvasSurface.tsx:82-86`)
**Requirement**: MAGNET-01, MAGNET-05
**Skills**: ecc:react-patterns

**Tools**:
- MCP: NONE
- Skill: `ecc:react-patterns`

**Done when**:
- [x] The mode reaches `ChartSurface` from `useDrawingRail()`
- [x] `test/gates/socketParity.spec.ts` passes — no field declared and never passed
- [x] `test/gates/setupFanOut.spec.ts` passes — it counts `useWorkspaceSetup` selectors, and the
      fifth read here is off `useDrawingRail()`, which that gate does not measure
- [x] `test/canvasSurface.spec.tsx` extended for the forwarding
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + 2 tests pass (1237 -> 1239, no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(drawing): the workspace forwards the magnet mode to the surface`

---

### T10: Fill the host's half of both gestures — DONE

**What**: The demo binding implements `anchorAt` via the package's `hitTestAnchor`, and routes the click anchor and the crosshair preview through `host.snapPrice`.
**Where**: `example/drawing.ts`
**Depends on**: T9
**Reuses**: the proven fix's hit-test call; the existing `onClick` and `onCrosshair` handlers in this file
**Requirement**: DRAG-01, MAGNET-03, MAGNET-07
**Skills**: none

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `anchorAt` returns true only when the package reports an anchor under the point, and never throws out
- [x] The binding SELECTS on the press, in capture: `hitTestAnchor` answers only for an already
      selected drawing, so without it the hit-test is null on every press and the lock never fires
- [x] The click anchor's price is `host.snapPrice(...)`, not the raw pointer price
- [x] The crosshair preview uses the same call, so the dashed trace sits where the anchor will land
- [x] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs && node scripts/verify-package-paths.mjs`

**Tests**: none
**Gate**: build

**Commit**: `feat(example): the demo binding hit-tests anchors and snaps through the seam`

---

### T21: The labels contract names the magnet — DONE

**What**: `DrawingToolbarLabels` gains `magnet: string`, defaulted in the chrome labels object so a host that overrides nothing still gets a word.
**Where**: `src/react/chrome/labels.ts`
**Depends on**: T10
**Reuses**: the existing `drawingToolbar` group and its default object
**Requirement**: MAGNET-01
**Skills**: none

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `DEFAULT_WORKSPACE_CHROME_LABELS.drawingToolbar.magnet` supplies a default word
- [x] A host overriding through `chrome.labels` overrides only that field — `WorkspaceLabelOverrides` stays per-group `Partial`
- [x] `src/react/chrome/labels.ts` stays under 350 code lines
- [x] `test/chrome.spec.tsx` extended for the default and the override
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + ≥2 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(chrome): the drawing toolbar labels name the magnet`

---

### T11: The rail draws the magnet — DONE

**What**: `DrawingToolbar` renders the magnet as a two-state toggle beside delete-selection and clear-all. To make room under the 12-prop ceiling, the three drawing-edit props group into one `edits` group.
**Where**: `src/react/DrawingToolbar.tsx`
**Depends on**: T21
**Reuses**: the `action()` helper and `IconButton` the rail already draws its three fixed controls with; `ChromeState { kind: 'toggle', pressed }`, which `chromeState.ts` already maps to `aria-pressed`
**Requirement**: MAGNET-01, MAGNET-05
**Skills**: `ecc:react-patterns`

**Tools**:
- MCP: NONE
- Skill: `ecc:react-patterns`

**Done when**:
- [x] `onDeleteSelection`, `onClearAll` and `drawingCount` group into one `edits` group: 12 → 10 top-level props
- [x] A `magnet?: { mode; onChange }` group is added: 11 declared, under the ceiling, and `test/gates/propCount.spec.ts` keeps its EMPTY baseline — do not touch `LIMIT`
- [x] The toggle carries `aria-pressed` reflecting the mode, and its accessible name comes from `labels.magnet` — no sentence enters `src/react`, so `test/gates/wording.spec.ts` stays green
- [x] The glyph is passed as a positional argument exactly as `⌫` and `🗑` are
- [x] **A `DrawingToolbar` mounted with no `magnet` group draws NO toggle** — this is MAGNET-05's second clause and it must have its own test
- [x] Every existing call site of the three regrouped props is updated
- [x] `test/drawingRail.spec.tsx` extended for the pressed state, the wiring and the absent group
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + ≥3 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Measured, and it changed the shape.** The magnet group's field names are `mode` and `onChange`
as specified; the `edits` group's are `onDelete`, `onClear` and `count` rather than the three old
prop names. The rename is not cosmetic: the entry's own ratchet
(`test/gates/sizeBudget.spec.ts:404`) forbids the limit reaching `PROVISIONAL_ENTRY_LIMIT` = 104994,
and the first shape measured 105005. The lean shape measures 104967.

**Commit**: `feat(drawing): the rail draws the magnet, and the host names it`

---

### T22: The rail region wires the mode to the toggle

**What**: `DrawingRail` passes the mode and setter straight from `useDrawingRail()` into the toolbar's magnet group, and passes the regrouped `edits`.
**Where**: `src/react/workspace/DrawingRail.tsx`
**Depends on**: T26
**Reuses**: the region already calls `useDrawingRail()` and already renders the toolbar
**Requirement**: MAGNET-01, MAGNET-06
**Skills**: `ecc:react-patterns`

**Tools**:
- MCP: NONE
- Skill: `ecc:react-patterns`

**Done when**:
- [ ] The toggle holds no copy of the mode — it reads and writes the provider's state
- [ ] `src/react/workspace/ChartWorkspace.tsx` is NOT touched; it sits at 347 of 350 code lines
- [ ] **Asserted through the REAL composition, not a probe.** `test/drawingRailRegion.spec.tsx:174-184` already mounts `<DrawingRailProvider><DrawingRail/></DrawingRailProvider>`; extend THAT harness. Two independent specialist reviews found this defect precisely because every existing magnet test either mounts `DrawingToolbar` in isolation with a hand-built group, or reads the context through a bespoke probe that skips `DrawingRail`
- [ ] The toggle is found by role, pressed, and the mode observed to change — a test that only asserts the prop was passed would have missed nothing and caught nothing
- [ ] `test/drawingRailRegion.spec.tsx` extended
- [ ] Gate check passes: `npm test`
- [ ] Test count: baseline + ≥2 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(drawing): the rail region wires the magnet toggle to the mode`

---

### T12: Prove both gestures in a real browser

**What**: Two e2e scenes — a 200 px anchor drag that leaves the visible bar range unchanged, and an anchor placed with the magnet off then on.
**Where**: `scripts/e2e-demo.mjs`
**Depends on**: T22
**Reuses**: the `check()` helper, `freshPage`, `canvasChecksum` and the existing scene structure
**Requirement**: DRAG-01, MAGNET-02, MAGNET-03
**Skills**: ecc:e2e-testing

**Tools**:
- MCP: NONE
- Skill: `ecc:e2e-testing`

**Done when**:
- [ ] `drag.range-unchanged` — anchor pressed and moved 200 px; the visible bar range read before and after is identical
- [ ] `drag.anchor-moved` — the same gesture changes the drawing, so the check cannot pass by doing nothing
- [ ] `magnet.off-is-free` — an anchor placed between two bar values reads a price equal to neither
- [ ] `magnet.on-snaps` — an anchor placed near a high reads exactly that high
- [ ] Gate check passes: `npm test && npm run e2e`
- [ ] e2e count: 41 baseline + 4 checks pass

**Tests**: e2e
**Gate**: full

**Commit**: `test(e2e): the anchor drag holds the range and the magnet snaps`

---

### T13: Close the ledgers

**What**: CHANGELOG entry, size-budget ledger update, and the spec's traceability table marked Done.
**Where**: `CHANGELOG.md`
**Depends on**: T12
**Reuses**: the 0.1.1 entry's structure and the "not breaking by the rule below" convention
**Requirement**: all
**Skills**: none

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] The entry names the defect fixed and the mode added, and states why neither is breaking
- [ ] The size budget moved by a named amount in both ledgers, or did not move
- [ ] `.specs/features/drawing-gestures/spec.md` traceability shows 13/13 mapped, Status Done
- [ ] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs && node scripts/verify-package-paths.mjs`

**Tests**: none
**Gate**: build

**Commit**: `docs: record the drag fix and the magnet`

---

### T14: The disposer releases a live gesture before it stops listening — DONE

**What**: Invoke `pendingRelease` while `detached` is still false, so a disposer that runs on a live chart restores the axes; keep the guard for events arriving after teardown.
**Where**: `src/drawing/axisLock.ts`
**Depends on**: None
**Reuses**: the existing `release` closure and `detached` flag
**Requirement**: DRAG-02
**Skills**: none

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Reproduce first: press an anchor, run the disposer with the chart still alive, and assert the CURRENT code leaves `handleScroll`/`handleScale` at `false` — the test must fail before the fix
- [x] After the fix the same sequence records `[LOCKED, FREE]`
- [x] DRAG-05 still holds: a release arriving AFTER teardown makes no call on the disposed chart
- [x] Confirm and note in the docblock that `useChartTeardown` runs the seam cleanup while the chart is still alive — if it does not, say so and stop
- [x] `test/axisLock.spec.ts` extended for both directions
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + ≥2 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `fix(drawing): the axis lock frees a live chart when the seam re-binds`

---

### T15: Overlapping presses cannot orphan a listener pair — DONE

**What**: Hold the pending releases in a `Set` rather than one slot, so a second qualifying press cannot strand the first press's `mouseup`/`blur` pair past the disposer.
**Where**: `src/drawing/axisLock.ts`
**Depends on**: T14
**Reuses**: the same `release` closure
**Requirement**: DRAG-05
**Skills**: none

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Reproduce first: two qualifying `mousedown`s with no release between them, then dispose; assert the CURRENT code leaves a `window` listener pair attached — the test must fail before the fix
- [x] After the fix, `window` listener count returns to its pre-attach value immediately after `dispose()`, asserted by spying `window.addEventListener`/`removeEventListener`
- [x] No `applyOptions` call reaches the chart after teardown on any of these paths
- [x] `test/axisLock.spec.ts` extended
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + ≥2 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `fix(drawing): overlapping presses cannot strand a release listener`

---

### T16: The lock's coordinate contract becomes assertable — DONE

**What**: Stub the container rect with non-zero `top`/`left` and dispatch presses carrying real `clientX`/`clientY`, then assert `anchorAt` received the container-relative point.
**Where**: `test/axisLock.spec.ts`
**Depends on**: T15
**Reuses**: the rect-stubbing pattern at `test/priceAlertLayer.spec.tsx:160,171`
**Requirement**: DRAG-01, DRAG-06
**Skills**: none

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] The recorded hit equals the offset point, not `{x: 0, y: 0}`
- [x] Prove the assertion discriminates: dropping `- rect.left` / `- rect.top` in `axisLock.ts` fails this test; transposing x and y fails it. Restore the source afterwards and verify with `git status --porcelain`
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + ≥1 test passes (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `test(drawing): the axis lock's container-relative point is asserted`

---

### T17: The snap rule refuses an unmeasurable threshold — DONE

**What**: Return the pointer price when `price` or `thresholdPx` is not finite, and drop a candidate whose coordinate is not finite rather than only when it is `null`.
**Where**: `src/drawing/magnet.ts`
**Depends on**: T14
**Reuses**: the same guard `src/alerts/priceAlerts.ts:45` already applies, with its control-positive test
**Requirement**: MAGNET-04
**Skills**: none

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Reproduce first: `thresholdPx: NaN` with a pointer far from every bar value currently snaps to the highest OHLC — the test must fail before the fix
- [x] After the fix a non-finite `thresholdPx` or `price` returns the pointer's own price
- [x] A candidate whose `priceToCoordinate` returns `NaN` or `Infinity` is dropped, and the snap survives it
- [x] `test/magnet.spec.ts` extended
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + ≥3 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `fix(drawing): an unmeasurable threshold places at the pointer, never at a bar`

---

### T18: The magnet fixtures discriminate the scale and the tie rule — DONE

**What**: Add a non-unity price-to-pixel slope so "the threshold is pixels, not price units" can fail, and reorder the tie fixture so the tie rule cannot be deleted green.
**Where**: `test/magnet.spec.ts`
**Depends on**: T17
**Reuses**: the existing table structure in the same file
**Requirement**: MAGNET-03
**Skills**: none

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] A case with slope ≠ -1 exists; verified discriminating with `priceToCoordinate: (p) => 400 - 4 * p`, pointer `107.5`, `thresholdPx: 8` — real code answers `107.5`, the price-unit mutant answers `110`
- [x] The tie fixture is `{open: 110, high: 110, low: 100, close: 100}` at `price: 105`, so deleting the tie rule answers `100` where the real code answers `110`
- [x] Prove BOTH mutants die: apply each to `magnet.ts`, watch the suite fail, restore, and verify with `git status --porcelain`
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + ≥2 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `test(drawing): the magnet fixtures pin the pixel scale and the tie`

---

### T19: The three places that still teach a three-member host — DONE

**What**: Name all four members of `DrawingSurfaceHost` in the how-to, the example's engine comment and the reference generator's prose, then regenerate the reference page.
**Where**: `docs/how-to/bind-drawing.md`
**Depends on**: T18
**Reuses**: the generated page's own Exports table, which already lists `snapPrice`
**Requirement**: MAGNET-03, MAGNET-07
**Skills**: none

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] `docs/how-to/bind-drawing.md`, `example/engine.ts` and `scripts/reference-prose.mjs` all name `chart`, `series`, `container` and `snapPrice`
- [x] `node scripts/gen-reference.mjs` run, and `docs/reference/drawing/drawingLayer.md` no longer contradicts its own Exports table
- [x] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs && node scripts/verify-package-paths.mjs`

**Tests**: none
**Gate**: build

**Commit**: `docs: the drawing host carries four members, not three`

---

### T20: The two axis locks, measured together — DONE

**What**: Determine whether a price-alert drag and an anchor drag can hold the same `handleScroll`/`handleScale` pair at once, and pin the answer with a test.
**Where**: `test/priceAlertLayer.spec.tsx`
**Depends on**: T19
**Reuses**: `src/react/surface/usePriceAlertLayer.ts:73,83`, which writes the same pair with its own paired lock
**Requirement**: DRAG-02
**Skills**: `ecc:react-patterns`

**Tools**:
- MCP: NONE
- Skill: `ecc:react-patterns`

**Done when**:
- [x] Establish reachability FIRST: both handlers register `mousedown` in capture on the same element, and the alert layer calls `stopPropagation` — not `stopImmediatePropagation` — which does not stop a second listener on that same element. Prove by test whether both locks can engage on one press
- [x] If they can: the alert's `mouseup` must not free the axes while an anchor drag is still held. Fix it and assert the sequence
- [x] If they cannot: write the test that proves they cannot, and record why in the docblock, so the next reader does not re-derive it
- [x] Either way the outcome is a named, tested answer — not an assumption
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + ≥1 test passes (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `test(surface): the two axis locks are measured to overlap benignly`

**SPEC_DEVIATION — commit type only.** The planned message was
`fix(surface): the two axis locks agree on who frees the chart`. The measurement came back
"they overlap, and the overlap is harmless", so no source changed and there is nothing to
label `fix`. The task's own third bullet anticipates this branch — a tested answer with the
reasoning in the docblock — and that outcome is a `test` commit.

**Measured answer:** both locks DO engage on one press (`stopPropagation` does not silence a
sibling listener on the same element). Both write the same pair and both releases hang off the
same `window` mouseup, so the terminal state is FREE whichever runs first. The hazard the task
named — the alert freeing the axes while an anchor drag is still held — does not occur.

**Surfaced, NOT fixed (own defect, own task):** the axis lock releases on `blur` and the alert
layer does not, so a tab switch mid-gesture frees the axes while an alert drag is in flight.
Reachable with no drawing layer present, so it belongs to the alert layer, not to this task.

---

### T23: The alert drag survives a tab switch

**What**: The price-alert layer releases its axis lock on `blur`, as the drawing axis lock already does.
**Where**: `src/react/surface/usePriceAlertLayer.ts`
**Depends on**: T12
**Reuses**: the `blur` release the drawing lock already uses (`src/drawing/axisLock.ts`), and this layer's own paired lock at `usePriceAlertLayer.ts:73` and `:83`
**Requirement**: DRAG-02
**Skills**: `ecc:react-patterns`

**Tools**:
- MCP: NONE
- Skill: `ecc:react-patterns`

**Done when**:
- [ ] Reproduce first. Already done read-only against this layer's own harness: press a level at y=100, then `window.dispatchEvent(new Event('blur'))`, and the chart's `applyOptions` log ends at `{handleScroll: false, handleScale: false}` with `levels` reporting `[]` — the lock is written, never released, and the drag never settles. Re-establish that failing test in the suite before fixing
- [ ] After the fix the same sequence restores both options and the drag ends
- [ ] The listener is removed by the effect's cleanup, so no `blur` handler outlives the mount
- [ ] Reachable with NO drawing layer mounted — the test proves it, so the defect is filed where it belongs
- [ ] `test/priceAlertLayer.spec.tsx` extended
- [ ] Gate check passes: `npm test`
- [ ] Test count: baseline + ≥2 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `fix(surface): an abandoned alert drag gives the axes back`

---

### T24: The feature's own modules give the bytes back — DONE

**What**: Shrink `magnet.ts`, `axisLock.ts` and `useDrawingSeam.ts` without changing one observable behaviour, until the entry has room for the rest of the feature.
**Where**: `src/drawing/magnet.ts`
**Depends on**: None
**Reuses**: the candidates a five-lens sweep already proposed for these three files — the winner kept in two scalars instead of a `Candidate` object (~107 B); the two finiteness guards routed through the `measurable()` predicate the module already defines (~26 B); one `axes()` factory replacing four hand-written `{handleScroll, handleScale}` literals (~77 B); one `listen()` call registering and revoking the release pair (~40 B); `host.container` read once instead of three times (~15 B); `SnapInput` built by spread instead of five hand-copied fields (~62 B)
**Requirement**: none — this funds the rest
**Skills**: none

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Every candidate is MEASURED with `npm run build:esm && node scripts/size-gate.mjs`, one at a time, and the ones that measure at or near zero are reverted rather than kept. Estimates count for nothing
- [x] `npm test` stays at 103 suites / 1260 tests with **no test edited, weakened, skipped or deleted** — this is a refactor, and a test that had to change means behaviour changed
- [x] **No fix is undone.** `magnet.ts`'s finiteness guards and `axisLock.ts`'s release-before-deaf ordering and release `Set` each exist because an adversarial review found a real defect. Read the docblocks; they say what each guard prevents
- [x] The entry measures **at least 130 B below** its current 104967, leaving room for T25, T26, T22 and T23 with margin
- [x] Both ledgers move DOWN, named: `size-budget.json` and `MEASURED_AT_PIN` in `test/gates/sizeBudget.spec.ts`. A descending re-pin is what the ratchet is for
- [x] Report the measured delta per candidate in the commit body — the ones that measured nothing are the useful finding
- [x] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs && node scripts/verify-package-paths.mjs`

**Tests**: unit
**Gate**: build

**Commit**: `perf(drawing): the gesture modules give back the bytes the control needs`

---

### T25: The snap rule survives a converter that throws — DONE

**What**: Guard `input.priceToCoordinate` the way `attachAxisLock` already guards `host.anchorAt`, so a host converter that throws degrades to the pointer's own price instead of escaping the gesture.
**Where**: `src/drawing/magnet.ts`
**Depends on**: T24
**Reuses**: the `try { … } catch { return false; }` shape and its written rationale at `src/drawing/axisLock.ts:30-38` — "a hit-test against a state the engine did not expect costs one missed lock, never a crash"
**Requirement**: MAGNET-04
**Skills**: none

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Reproduce first: a `priceToCoordinate` that throws currently propagates out of `snapAnchorPrice` — the test must fail before the fix
- [x] After the fix, a throwing converter returns `input.price`, matching every other unmeasurable-input path in the module
- [x] A converter that throws on ONE candidate only drops that candidate, and the snap survives
- [x] `snapAnchorPrice` is a published export, so this is a public-API robustness fix and the docblock says so
- [x] `test/magnet.spec.ts` extended
- [x] Gate check passes: `npm test`
- [x] Test count: baseline + ≥2 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `fix(drawing): a converter that throws costs one candidate, never the gesture`

---

### T26: The magnet label stops being an avoidable break

**What**: `DrawingToolbarLabels.magnet` becomes optional, with the toolbar falling back to the published default.
**Where**: `src/react/DrawingToolbar.tsx`
**Depends on**: T24
**Reuses**: `DEFAULT_DRAWING_TOOLBAR_LABELS`, which already exists as the whole-object default
**Requirement**: MAGNET-01
**Skills**: none

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `magnet` is `readonly magnet?: string` and the toolbar falls back to the default word
- [ ] A host that hand-builds a full `DrawingToolbarLabels`, or supplies `DrawingVocabulary.labels` (whose `Pick` carries the FULL type, not a `Partial`), compiles again without adding a field
- [ ] The `edits` regroup stays breaking — that one IS forced by `test/gates/propCount.spec.ts` at 12/12 — so T13's CHANGELOG entry narrows to it alone
- [ ] The measured byte cost is named; if it exceeds the slack T24 banked, say so and stop rather than spending the margin the browser proof needs
- [ ] `test/chrome.spec.tsx` and `test/drawingRail.spec.tsx` extended for the omitted-label path
- [ ] Gate check passes: `npm test`
- [ ] Test count: baseline + ≥2 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(drawing)!: the magnet label is optional, narrowing the break to edits`

---

## Phase Execution Map

Phases run in sequence. Within a phase, tasks run in order; the arrows are the dependency graph.

```
Phase 1:  T1 → T2
          T1 → T3
Phase 2:  T2 → T4
          T3 → T4
          T4 → T5
          T5 → T6
          T6 → T7
Phase 3:  T7 → T8
          T8 → T9
Phase 4:  T9 → T10
          T10 → T21
          T21 → T11
Phase 5:  T12 → T13
Phase 6:  T14 → T15
          T15 → T16
          T14 → T17
          T17 → T18
          T18 → T19
          T19 → T20
Phase 7:  T24 → T25
          T24 → T26
Phase 8:  T26 → T22
          T22 → T12
          T12 → T13
          T12 → T23
```

Execution is strictly sequential — there is no intra-phase parallelism.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: docs sections | 1 file | ✅ Granular |
| T2: snap rule | 1 module | ✅ Granular |
| T3: axis lock | 1 module | ✅ Granular |
| T4: seam members | 1 file, 2 cohesive members | ✅ Granular |
| T5: seam hook wiring | 1 hook | ✅ Granular |
| T6: surface prop group | 1 component | ✅ Granular |
| T7: exports | 1 file | ✅ Granular |
| T8: rail provider state | 1 provider | ✅ Granular |
| T9: workspace forwarding | 1 component | ✅ Granular |
| T10: binding halves | 1 file | ✅ Granular |
| T21: labels field | 1 file | ✅ Granular |
| T11: rail toggle | 1 component | ✅ Granular |
| T22: region wiring | 1 component | ✅ Granular |
| T23: alert blur release | 1 hook | ✅ Granular |
| T24: byte recovery | 3 cohesive modules | ⚠️ OK — one concern, measured |
| T25: converter guard | 1 module | ✅ Granular |
| T26: optional label | 1 component | ✅ Granular |
| T12: e2e scenes | 1 file | ✅ Granular |
| T13: ledgers | 1 file | ✅ Granular |
| T14: disposer release order | 1 module | ✅ Granular |
| T15: listener set | 1 module | ✅ Granular |
| T16: coordinate assertion | 1 test file | ✅ Granular |
| T17: finiteness guard | 1 module | ✅ Granular |
| T18: magnet fixtures | 1 test file | ✅ Granular |
| T19: host member docs | 1 file + generated output | ✅ Granular |
| T20: the two locks | 1 test file | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (no inbound arrow) | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T1 | T1 → T3 | ✅ Match |
| T4 | T2, T3 | T2 → T4, T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 | ✅ Match |
| T6 | T5 | T5 → T6 | ✅ Match |
| T7 | T6 | T6 → T7 | ✅ Match |
| T8 | T7 | T7 → T8 | ✅ Match |
| T9 | T8 | T8 → T9 | ✅ Match |
| T10 | T9 | T9 → T10 | ✅ Match |
| T21 | T10 | T10 → T21 | ✅ Match |
| T11 | T21 | T21 → T11 | ✅ Match |
| T22 | T26 | T26 → T22 | ✅ Match |
| T24 | None | (phase head) | ✅ Match |
| T25 | T24 | T24 → T25 | ✅ Match |
| T26 | T24 | T24 → T26 | ✅ Match |
| T23 | T12 | T12 → T23 | ✅ Match |
| T12 | T22 | T22 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | None | (phase head) | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | T15 | T15 → T16 | ✅ Match |
| T17 | T14 | T14 → T17 | ✅ Match |
| T18 | T17 | T17 → T18 | ✅ Match |
| T19 | T18 | T18 → T19 | ✅ Match |
| T20 | T19 | T19 → T20 | ✅ Match |

No dependency points at a later phase.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Docs | none | none | ✅ OK |
| T2 | Pure library module | unit | unit | ✅ OK |
| T3 | Pure library module | unit | unit | ✅ OK |
| T4 | Type-only seam | unit | unit | ✅ OK |
| T5 | Surface hook | unit | unit | ✅ OK |
| T6 | Surface component | unit | unit | ✅ OK |
| T7 | Public entry | unit | unit | ✅ OK |
| T8 | Workspace component | unit | unit | ✅ OK |
| T9 | Workspace component | unit | unit | ✅ OK |
| T10 | Example / host binding | none | none | ✅ OK |
| T21 | Surface component (chrome) | unit | unit | ✅ OK |
| T11 | Surface component | unit | unit | ✅ OK |
| T22 | Workspace component | unit | unit | ✅ OK |
| T23 | Surface hook | unit | unit | ✅ OK |
| T24 | Pure library module | unit | unit | ✅ OK |
| T25 | Pure library module | unit | unit | ✅ OK |
| T26 | Surface component | unit | unit | ✅ OK |
| T12 | Real-browser behaviour | e2e | e2e | ✅ OK |
| T13 | Docs and ledgers | none | none | ✅ OK |
| T14 | Pure library module | unit | unit | ✅ OK |
| T15 | Pure library module | unit | unit | ✅ OK |
| T16 | Pure library module (test hardening) | unit | unit | ✅ OK |
| T17 | Pure library module | unit | unit | ✅ OK |
| T18 | Pure library module (test hardening) | unit | unit | ✅ OK |
| T19 | Docs and ledgers | none | none | ✅ OK |
| T20 | Surface hook | unit | unit | ✅ OK |
