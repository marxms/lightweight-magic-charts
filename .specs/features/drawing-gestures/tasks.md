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
T10 → T11
T11 → T12
```

### Phase 5: The ledger

```
T12 → T13
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

### T7: Export the new public surface

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
- [ ] Each symbol is importable from the package root
- [ ] `test/boundary.spec.ts` passes
- [ ] `node scripts/verify-package-paths.mjs` exits 0
- [ ] Gate check passes: `npm test`
- [ ] Test count: baseline tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat: publish the axis lock and the snap rule`

---

### T8: The mode's home in the rail provider

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
- [ ] `useDrawingRail().magnet` is `'off'` on first render
- [ ] `setMagnet('on')` flips it and re-renders consumers
- [ ] The provider renders no control and no label of its own
- [ ] `test/gates/memoisation.spec.tsx` and `test/gates/wording.spec.ts` still pass
- [ ] `test/drawingRail.spec.tsx` extended for the default and the flip
- [ ] Gate check passes: `npm test`
- [ ] Test count: baseline + ≥2 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(drawing): the rail provider holds the magnet mode`

---

### T9: Forward the mode from the workspace to the surface

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
- [ ] The mode reaches `ChartSurface` from `useDrawingRail()`
- [ ] `test/gates/socketParity.spec.ts` passes — no field declared and never passed
- [ ] `test/gates/setupFanOut.spec.ts` passes
- [ ] `test/canvasSurface.spec.tsx` extended for the forwarding
- [ ] Gate check passes: `npm test`
- [ ] Test count: baseline + ≥1 test passes (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(drawing): the workspace forwards the magnet mode to the surface`

---

### T10: Fill the host's half of both gestures

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
- [ ] `anchorAt` returns true only when the package reports an anchor under the point, and never throws out
- [ ] The click anchor's price is `host.snapPrice(...)`, not the raw pointer price
- [ ] The crosshair preview uses the same call, so the dashed trace sits where the anchor will land
- [ ] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs && node scripts/verify-package-paths.mjs`

**Tests**: none
**Gate**: build

**Commit**: `feat(example): the demo binding hit-tests anchors and snaps through the seam`

---

### T11: The host's magnet control

**What**: The example renders its own magnet toggle wired to `useDrawingRail().setMagnet`.
**Where**: `example/App.tsx`
**Depends on**: T10
**Reuses**: the existing `drawing={{ ... }}` prop and the chrome toggle primitive the demo already mounts
**Requirement**: MAGNET-01, MAGNET-05
**Skills**: none

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] The toggle reads and writes the library's mode — it holds no copy of its own
- [ ] It carries a `data-testid` the e2e scene can drive
- [ ] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs && node scripts/verify-package-paths.mjs`

**Tests**: none
**Gate**: build

**Commit**: `feat(example): the demo offers the magnet as a control the host owns`

---

### T12: Prove both gestures in a real browser

**What**: Two e2e scenes — a 200 px anchor drag that leaves the visible bar range unchanged, and an anchor placed with the magnet off then on.
**Where**: `scripts/e2e-demo.mjs`
**Depends on**: T11
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
          T10 → T11
          T11 → T12
Phase 5:  T12 → T13
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
| T11: host control | 1 file | ✅ Granular |
| T12: e2e scenes | 1 file | ✅ Granular |
| T13: ledgers | 1 file | ✅ Granular |

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
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |

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
| T11 | Example / host binding | none | none | ✅ OK |
| T12 | Real-browser behaviour | e2e | e2e | ✅ OK |
| T13 | Docs and ledgers | none | none | ✅ OK |
