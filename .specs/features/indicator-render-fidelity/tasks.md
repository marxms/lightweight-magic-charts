# Indicator render fidelity — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.**

**If the skill cannot be activated, STOP and tell the user.**

---

**Design**: `.specs/features/indicator-render-fidelity/spec.md` + the reviewed designs
**Status**: Draft

---

## Test Coverage Matrix

> Guidelines found: `CONTRIBUTING.md`, `jest.config.js` (no coverage threshold), `.github/workflows/ci.yml`. Same matrix the previous feature confirmed, plus one row: a channel that reaches a canvas is verified by reading the canvas, never by trusting the call that was made.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Architectural gate | unit | Every clause carries a synthetic POSITIVE CONTROL proving it discriminates, in both directions | `test/gates/*.spec.ts`, `test/boundary.spec.ts` | `npm test` |
| Package seam (`src/indicator/`, `src/catalogue/`, `src/render/`, `src/port/`) | unit | 1:1 to spec ACs; every listed edge case | `test/*.spec.ts` | `npm test` |
| React composition (`src/react/`) | unit | Mounted as a HOST mounts it, never through a probe of a hook | `test/*.spec.tsx` | `npm test` |
| Anything that reaches a canvas | e2e | Read the pixels or a legend value — a call that was made is not a thing that was drawn | `scripts/e2e-demo.mjs` | `npm run e2e` |
| Vendor fidelity (`scripts/indicator-proof.mjs`) | integration | Every member the vendor result carries is drawn, enumerated from the result | `scripts/indicator-proof.mjs` | `npm run proof` |
| Byte / comment budget | none | Build gate only | - | `node scripts/size-gate.mjs` |
| Documentation & decision log | none | Build gate only | `docs/**`, `.specs/STATE.md` | `npm run build && npm test` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Unit tests only | `npm test` |
| Full | Anything that can reach the page | `npm run build && npm test && npm run e2e` |
| Build | A byte delta, a published symbol, or phase completion | `npm run build && npm test && node scripts/size-gate.mjs && node scripts/verify-package-paths.mjs` |
| Proof | Anything touching the vendor catalogue | `npm run proof` |

---

## Execution Plan

Every position is forced by a gate. Measured: the combined stack lands at 105734 and the ceiling
admits 104993, so **the four shrinkages and the lane deletion are not optional and must come first** —
without the lane deletion the feature is 125 B short, which is more than the whole shrinkage bank.

### Phase 1: Pay first

One measured candidate per re-pin, so none of these may share a commit.

```
T1 → T2 → T3 → T4
```

### Phase 2: The ceiling leaves `src/`

```
T4 → T5
```

### Phase 3: Room in the composition

```
T5 → T6
```

### Phase 4: The fill

```
T6 → T7 → T8 → T9
```

### Phase 5: The marks

```
T9 → T10
```

### Phase 6: The colours

```
T10 → T11 → T12
```

### Phase 7: The rest, and the generator

```
T12 → T13 → T14
```

### Phase 8: The proof

```
T14 → T15 → T16
```

---

## Task Breakdown

### T1: One row builder for the two that repeat

**What**: Collapse the duplicated `ROW` construction into one factory.
**Where**: `src/react/chrome/primitives.tsx`
**Depends on**: None
**Reuses**: the existing duplicated literals
**Requirement**: enabling — measured −283 B

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Rendered output is unchanged, asserted
- [x] `size-budget.json` re-pinned DOWN with the measured number and a written reason
- [x] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build
**Status**: DONE — measured **-280 B** (entry 104992 -> 104712), not the -283 the design estimated.
Landed in `src/react/theme.ts` as `CENTER_ROW`, not in `primitives.tsx`: the eleven sites are style
declarations across nine files, and `theme.ts` is the leaf every one of them can already reach.

---

### T2: One stack builder for the two that repeat

**What**: Collapse the duplicated `STACK` construction into one factory.
**Where**: `src/react/chrome/primitives.tsx`
**Depends on**: T1
**Reuses**: T1's factory shape
**Requirement**: enabling — measured −145 B

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Rendered output is unchanged, asserted
- [ ] Re-pinned DOWN separately from T1 — one measured candidate per re-pin
- [ ] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build

---

### T3: The scope machine defers through one helper

**What**: Route the repeated deferral in the scope machine through a single helper.
**Where**: `src/port/scopeMachine.ts`
**Depends on**: T2
**Reuses**: the existing deferral sites
**Requirement**: enabling — measured −197 B, `openScope` 4300 → 4103

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Every existing scope-machine assertion passes untouched
- [ ] Re-pinned DOWN separately, with the measured number
- [ ] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build

---

### T4: One accent helper for the repeated colour blend

**What**: Route the repeated accent construction through one helper.
**Where**: `src/react/theme.ts`
**Depends on**: T3
**Reuses**: the existing repeated expression
**Requirement**: enabling — measured −203 B

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Rendered colours are byte-identical, asserted
- [ ] Re-pinned DOWN separately, with the measured number
- [ ] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build

---

### T5: The line ceiling stops living in the package

**What**: Delete `plotsPerLane`, `ResolvedSourceView.truncated`, its label and the branch that reads it; `drawn` becomes every live line.
**Where**: `src/indicator/resolution.ts`
**Depends on**: T4
**Reuses**: `laneOrder`, untouched — LINES is about width, never about which studies are cut
**Requirement**: LINES-01, LINES-02, LINES-04

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] A study wider than the old ceiling resolves every live line
- [ ] The removed member is gone from the derived reference, regenerated in the same commit
- [ ] The two now-false comments are deleted in the same commit — measured, this buys comment slack rather than spending it
- [ ] `size-budget.json` re-pinned DOWN, entry and `ChartWorkspace` together
- [ ] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build

---

### T6: The composition gives back four lines

**What**: Extract the reading closures out of the composed root so the file has room for what follows.
**Where**: `src/react/workspace/ChartWorkspace.tsx`
**Depends on**: T5
**Reuses**: the existing `read` closure and its call site
**Requirement**: enabling — measured +75 B and it returns exactly 4 code lines; without it the file lands at 352/350

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `ChartWorkspace.tsx` is at most 346 code lines, measured by the gate's own counter
- [ ] Behaviour is unchanged, asserted through a mounted workspace
- [ ] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build

---

### T7: An overlay may say what it anchors to

**What**: Add the optional anchor to the overlay contract and resolve it to a series handle at attach time.
**Where**: `src/extension/plugins.ts`
**Depends on**: T6
**Reuses**: `attachOverlay`, `OverlayPrimitive`, and the two living overlay precedents
**Requirement**: FILL-01, FILL-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] The member is OPTIONAL, so every existing overlay keeps compiling and attaching
- [ ] An anchored overlay draws beneath the lines it spans — asserted by reading pixels, not by trusting the call
- [ ] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build

---

### T8: A host overlay reaches a study's pane

**What**: Publish the path that carries a host overlay from the workspace props to the surface, merged with the package's own.
**Where**: `src/react/workspace/CanvasSurface.tsx`
**Depends on**: T7
**Reuses**: `useOverlayFields` and the existing overlay merge
**Requirement**: FILL-01, FILL-02

**Tools**:
- MCP: NONE
- Skill: `ecc:react-patterns`, `ecc:react-testing`

**Done when**:
- [ ] The lane and over-price series id minters are published, so a host can name what it anchors to
- [ ] A host overlay attached to a study pane draws, asserted through a mounted workspace
- [ ] The measured cost is re-pinned with a written reason
- [ ] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build

---

### T9: The host draws the band the package will not name

**What**: The band primitive, in the host: two bounds, interrupted where either is not finite, and bicoloured where the vendor says so.
**Where**: `example/bandOverlay.ts`
**Depends on**: T8
**Reuses**: the vendor's `fills[]` with its `colors`, and the manifest's resolved bounds
**Requirement**: FILL-01, FILL-02, FILL-04, FILL-05

**Tools**:
- MCP: NONE
- Skill: `ecc:e2e-testing`

**Done when**:
- [ ] A fill whose bound is a constant level draws against that level
- [ ] A bar where either bound is non-finite is not painted — measured, 164 of 186 fills have at least one such bar, so this is the common case and not an edge
- [ ] A bicoloured fill keeps its two colours: the Kumo is green above and red below, which the reference collapses and this does not
- [ ] An alpha channel is respected rather than concatenated into an opaque colour, which the reference does on 46% of fills
- [ ] Gate check passes: `npm run build && npm test && npm run e2e`

**Tests**: e2e
**Gate**: full

---

### T10: The marker door stops being a no-op

**What**: Make the engine adapter add the marker plugin, feed the socket, and stop the repo's fake from implementing what the real one does not.
**Where**: `example/engine.ts`
**Depends on**: T9
**Reuses**: `SeriesHandle.setMarkers?`, already on the port
**Requirement**: MARK-01, MARK-02

**Tools**:
- MCP: NONE
- Skill: `ecc:e2e-testing`

**Done when**:
- [ ] The real engine attaches the marker plugin, so the optional call reaches something — measured, today it is swallowed and the published 0.2.1's pattern markers do not draw
- [ ] The repo's fake no longer implements a member the real object lacks, which is why nobody saw this
- [ ] The `socketParity` ledger moves in the same commit
- [ ] Marks are counted on a mounted composition, never through a probe of the port
- [ ] Gate check passes: `npm run build && npm test && npm run e2e`

**Tests**: e2e
**Gate**: full

---

### T11: A bar the indicator colours is coloured

**What**: Carry per-bar colours to the candle payload and feed the socket that was never fed.
**Where**: `src/react/surface/useSeriesData.ts`
**Depends on**: T10
**Reuses**: the candle payload the base library already accepts
**Requirement**: BAR-01, BAR-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] A bar the manifest says is coloured is drawn in that colour, read from the canvas
- [ ] A point with no value is still a declared gap — the colour changes nothing about what a point means
- [ ] The `socketParity` ledger moves in the same commit
- [ ] Gate check passes: `npm run build && npm test && npm run e2e`

**Tests**: e2e
**Gate**: full

---

### T12: The colour a point carries reaches its segment

**What**: Let a point carry a colour and route it through a parallel map the resolution already has room for.
**Where**: `src/domain/types.ts`
**Depends on**: T11
**Reuses**: the readings map, which is the same shape of parallel channel
**Requirement**: POINT-01, POINT-02, POINT-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] The map member is OPTIONAL — measured at +1 B, and mandatory would break the previous feature's zero-host-breakage promise and fail the doc examples
- [ ] `isGap` is unchanged and a point with no value still means absence
- [ ] A point with no colour draws in the series' own colour
- [ ] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build

---

### T13: The last four channels ride the door already paid for

**What**: Background shading, labels, drawn lines and boxes, as host overlays through the anchor seam.
**Where**: `example/channelOverlays.ts`
**Depends on**: T12
**Reuses**: T7's anchor and T9's primitive shape — measured at 0 B in the package
**Requirement**: REST-01

**Tools**:
- MCP: NONE
- Skill: `ecc:e2e-testing`

**Done when**:
- [ ] Each of the four draws, read from the canvas
- [ ] The package gains no byte for them, measured
- [ ] Gate check passes: `npm run build && npm test && npm run e2e`

**Tests**: e2e
**Gate**: full

---

### T14: The generator stops keeping a list

**What**: Enumerate every member of the vendor result, count an object channel like any other, derive the widths from the rows written, and refuse a row wider than its declared width.
**Where**: `scripts/build-indicator-manifest.mjs`
**Depends on**: T13
**Reuses**: the refusal doctrine `renames.json` and `value-changes.json` already carry
**Requirement**: LINES-04, FILL-05, PROOF-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Channels are enumerated from the result, never from a written list of names — measured, the list of nine missed two object-shaped channels and 10 offered rows emit one
- [ ] The declared widths are derived from the rows the generator itself writes, so a wider vendor release cannot under-declare the resource in silence
- [ ] A row that cannot be drawn whole is refused rather than offered
- [ ] Gate check passes: `npm run build && npm test && npm run proof`

**Tests**: integration
**Gate**: proof

---

### T15: A dropped channel cannot pass again

**What**: The proof compares every emitted member against what is drawn, with three plantings proving each clause discriminates.
**Where**: `scripts/indicator-proof.mjs`
**Depends on**: T14
**Reuses**: the six-direction declaration rule already in the proof
**Requirement**: PROOF-01, PROOF-02, PROOF-03, PROOF-04, LINES-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] The comparison is against LIVE plots, not declared — measured at 915 live of 1048, with 133 dead across 32 rows
- [ ] Three plantings turn it red: a dropped channel, an object-shaped channel, and a width narrower than the rows beneath it
- [ ] Stubbing any one clause leaves a different clause red, verified by deletion
- [ ] Gate check passes: `npm run build && npm test && npm run proof`

**Tests**: integration
**Gate**: proof

---

### T16: The page shows the indicator its name promises

**What**: The e2e assertion that Ichimoku draws five lines and a two-coloured Kumo, and that editing a span moves both.
**Where**: `scripts/e2e-demo.mjs`
**Depends on**: T15
**Reuses**: the script's legend-value and canvas-checksum assertions
**Requirement**: FILL-04, LINES-01, LINES-03

**Tools**:
- MCP: NONE
- Skill: `ecc:e2e-testing`

**Done when**:
- [ ] Five lines are read on screen, not three and not one — measured before this feature at one
- [ ] The Kumo is shaded and keeps two colours
- [ ] Editing Leading Span B moves the lines and the shading together
- [ ] An idle re-render does not rewrite the drawn data
- [ ] Gate check passes: `npm run build && npm test && npm run e2e && npm run proof && node scripts/size-gate.mjs`

**Tests**: e2e
**Gate**: full
