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

Every position is forced by a gate. Measured after Phase 1-3: the entry sits at **103921** against a
ceiling that admits **104993**, so the bank the shrinkages built — **-1071 B**, better than the -1040
projected — is what the render stack's +835 spends.

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

### Phase 4: The host's resource matches the catalogue

The package resolving a line is not the chart drawing it. Without this the five-line study still draws
one, and the last task cannot read what it asserts.

```
T6 → T7
```

### Phase 5: The fill

```
T7 → T8 → T9 → T10
```

### Phase 6: The marks

```
T10 → T11
```

### Phase 7: The colours

```
T11 → T12 → T13
```

### Phase 8: The rest, and the generator

```
T13 → T14 → T15
```

### Phase 9: The proof

```
T15 → T16 → T17
```

### Phase 10: The four gaps the Verifier measured

Written after `.specs/features/indicator-render-fidelity/validation.md` returned FAIL on four
surviving mutants. Every one of them is an EVIDENCE gap, not a behaviour gap: the shipped chart is
right and four of the things it does can be deleted with every gate green. The order is a chain
because each fix is committed onto a green tree, not because one needs another's code.

```
T17 → T18 → T19 → T20 → T21 → T22 → T23 → T24
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
- [x] Rendered output is unchanged, asserted
- [x] Re-pinned DOWN separately from T1 — one measured candidate per re-pin
- [x] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build
**Status**: DONE — measured **-148 B** (entry 104712 -> 104564), against the -145 estimated. Six
sites, `STACK` beside `CENTER_ROW` in `src/react/theme.ts`.

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
- [x] Every existing scope-machine assertion passes untouched
- [x] Re-pinned DOWN separately, with the measured number
- [x] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build
**Status**: DONE — measured **-197 B** (entry 104564 -> 104367) and `openScope` **4300 -> 4103**,
both exactly the design's numbers. Two of the three doors and the buffer cap had no assertion at
all; `test/scopeDeferral.spec.ts` closes that.

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
- [x] Rendered colours are byte-identical, asserted
- [x] Re-pinned DOWN separately, with the measured number
- [x] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build
**Status**: DONE — the pair is at SIX sites, not five, and measures **-275 B** (entry 104367 ->
104092) against the -203 estimated. Every site pinned in BOTH states.

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
- [x] A study wider than the old ceiling resolves every live line
- [x] The removed member is gone from the derived reference, regenerated in the same commit
- [x] The two now-false comments are deleted in the same commit — measured, this buys comment slack rather than spending it
- [x] `size-budget.json` re-pinned DOWN, entry and `ChartWorkspace` together
- [x] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build
**Status**: DONE — measured **-216 B** (entry 104092 -> 103876) and comment slack 1 -> **2**, so the
deletion bought budget as predicted. LINES-01 and LINES-02 close here. LINES-04 does NOT: removing
the cut leaves the package with no place that can under-draw a study, so the only refusal point left
is the manifest generator, which is T14 — recorded as PARTIAL in `spec.md`.

**OPEN, and outside this task's `Where`**: the package now resolves every live line, but
`example/panes.ts` still mints ONE over-price slot per lane and `WorkspaceLanes.plots` is still one
number for every lane. A resolved line with no series id to be drawn under is still not on screen.
No task in this file names that host-side widening; T16 cannot read five lines without it.

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
- [x] `ChartWorkspace.tsx` is at most 346 code lines, measured by the gate's own counter
- [x] Behaviour is unchanged, asserted through a mounted workspace
- [x] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build
**Status**: DONE — `ChartWorkspace.tsx` 347 -> **345** and the cost is **+45 B**, not the +75 the
design measured: it measured a PAIR of closures and only `read` exists yet. `readColors` arrives
with the point-colour channel and lands in the same module. Re-pinned UP against this feature's own
bank, which stands at -1071 B.

---

### T7: The host's slots match what the catalogue declares

**What**: The generator emits the widths it derives from the rows it writes, and the host mints its over-price slots and its lane width from them.
**Where**: `example/panes.ts`
**Depends on**: T6
**Reuses**: the manifest the previous feature already generates and commits
**Requirement**: LINES-01, LINES-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] The manifest carries the two widths, each derived from the rows written under it rather than typed by hand
- [x] The host mints one over-price slot per declared line, and its lane width from the declared own-pane width — measured, it mints ONE today, which is why a five-line study drew one line
- [x] A resolved line that has no series id to be drawn into turns a test red, because the package resolving a line is not the same as the chart drawing it
- [x] Gate check passes: `npm run build && npm test && npm run e2e && npm run proof`

**Tests**: e2e
**Gate**: full
**Status**: DONE — the manifest derives `widths: { overPrice: 56, ownPane: 14 }` from the rows it
writes, and `demoPanes(widths)` mints 6 x 56 over-price slots against the ONE per lane it minted
before. Measured on the page: Ichimoku's legend went from a single nameless reading to
`149.98 · 153.67 · 149.69 · 134.61` with the Lagging Span mute, which is five resolved lines in five
slots. Entry unchanged at **103921** — the whole task is host-side.

**Two deviations, both measured.** The slots carry `label: ''`, as `laneDraft` labels a lane's: with
`'Study'` on 336 of them the price legend renders 341 chips on one `nowrap` line. That filters the
mute placeholders out of the legend, so the two e2e checks that counted em dashes FALLING now count
drawn readings RISING — the stronger instrument, and the one the reviewed design asked for. It also
leaves a drawn over-price line showing a bare number: naming it needs `workspacePricePane`, measured
at +151 B, which is no task in this file.

**And the committed manifest does not load under jest** — `esModuleInterop` is off, so the adapter's
default import of a `.json` resolves to `undefined` and `MANIFEST_ROWS` is empty there. Pre-existing,
and why `test/hostSlots.spec.ts` reads the artefact off disk the way the gates do.

---

### T8: An overlay may say what it anchors to

**What**: Add the optional anchor to the overlay contract and resolve it to a series handle at attach time.
**Where**: `src/extension/plugins.ts`
**Depends on**: T7
**Reuses**: `attachOverlay`, `OverlayPrimitive`, and the two living overlay precedents
**Requirement**: FILL-01, FILL-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] The member is OPTIONAL, so every existing overlay keeps compiling and attaching
- [x] An anchored overlay draws beneath the lines it spans — asserted by reading pixels, not by trusting the call
- [x] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build
**Status**: DONE — measured **+30 B** (entry 103921 -> 103951), exactly the design's number; the
variant with an explicit `undefined` ternary measured +54 and was refused. `ChartWorkspace`
94685 -> 94715, `ChartSurface` 23786 -> 23815 of its 23840.

**What "reading pixels" turned into here, and why.** `test/overlayAnchor.spec.tsx` mounts
`ChartSurface` and drives the primitive through the two calls the base library drives it through —
`paneViews()` then `renderer().draw(target)` — over the recording context `test/renderFakes.ts`
already exists for. Every fake series converts price by its OWN factor, so the `y` of the rectangle
that comes out NAMES the scale it was measured on: 42 anchored to `ind1p2`, 30 to `ind1p1`, 18 to
`ovl1p2`, 66 unanchored. A test that asserted `attachPrimitive` was called on the right handle would
pass against an implementation that then projected through the wrong one. The four anchored cases
were RED before the resolution landed and returned 66 — the pane-zero answer — which is the defect
in its exact shape. Real canvas bytes are T10 and T17, where a fill exists to read.

---

### T9: A host overlay reaches a study's pane

**What**: Publish the path that carries a host overlay from the workspace props to the surface, merged with the package's own.
**Where**: `src/react/workspace/CanvasSurface.tsx`
**Depends on**: T8
**Reuses**: `useOverlayFields` and the existing overlay merge
**Requirement**: FILL-01, FILL-02

**Tools**:
- MCP: NONE
- Skill: `ecc:react-patterns`, `ecc:react-testing`

**Done when**:
- [x] The lane and over-price series id minters are published, so a host can name what it anchors to
- [x] A host overlay attached to a study pane draws, asserted through a mounted workspace
- [x] The measured cost is re-pinned with a written reason
- [x] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build
**Status**: DONE — measured **+149 B** (entry 103951 -> 104100), the design's +63 and +86 exactly.
`ChartWorkspace` 94715 -> 94801; `ChartSurface` does not move, because the merge with
`useOverlayFields` lands one region above it. `ChartWorkspace.tsx` 345 -> **347** of 350: an import,
the member, and the JSX prop folded onto the line beside `snapThresholdPx`.

`test/workspaceOverlays.spec.tsx` mounts `<ChartWorkspace>` and reads the rectangle each overlay
paints: anchored to the lane it lands at 20, unanchored at 44, and with no host array nothing is
attached at all. Two host overlays side by side keep their own scales.

**The comment budget is spent.** Measured `1816/9082 = 0.19996` — the whole repository has room for
ONE more comment line per five code lines from here. The reasoning for this seam is in
`docs/explanation/react-workspace.md#the-host-draws-what-the-package-will-not-name`, with a single
pointer line in `src/`, and `scripts/reference-prose.mjs` gained the `catalogue/lanes` entry the
generator refuses to write a page without.

---

### T10: The host draws the band the package will not name

**What**: The band primitive, in the host: two bounds, interrupted where either is not finite, and bicoloured where the vendor says so.
**Where**: `example/bandOverlay.ts`
**Depends on**: T9
**Reuses**: the vendor's `fills[]` with its `colors`, and the manifest's resolved bounds
**Requirement**: FILL-01, FILL-02, FILL-04, FILL-05

**Tools**:
- MCP: NONE
- Skill: `ecc:e2e-testing`

**Done when**:
- [x] A fill whose bound is a constant level draws against that level
- [x] A bar where either bound is non-finite is not painted — measured, 164 of 186 fills have at least one such bar, so this is the common case and not an edge
- [x] A bicoloured fill keeps its two colours: the Kumo is green above and red below, which the reference collapses and this does not
- [x] An alpha channel is respected rather than concatenated into an opaque colour, which the reference does on 46% of fills
- [x] Gate check passes: `npm run build && npm test && npm run e2e`

**Tests**: e2e
**Gate**: full
**Status**: DONE — **0 B in the package**, which is the point of the seam: `example/bandOverlay.ts`
holds the primitive, the five-rule bound resolver and the colour composition, and reaches the canvas
through T8's anchor and T9's channel. e2e **76/76**, up from 71.

Read off the real bitmap by `cloud.kumo-is-shaded`: **13,459 bullish pixels and 8,425 bearish**,
against **0 and 0** before the pick. The five lines are under it.

**Two of the brief's numbers did not reproduce, and the measurement wins.**
- The resolver is **247/247 over the whole registry**, exactly as briefed, and **14** bound
  references name an `hlines` entry rather than a plot.
- Per-bar colour is **86 of 186** as briefed, of which **76** actually change colour.
- Interrupted fills measure **171 of 186** on this fixture, not 164 — same conclusion, common case.
- The alpha defect is NOT "46% painted opaque black". Measured on the offered rows at their own
  defaults, **0 of the 16 fills that carry `transp` have an `rgba` base**, so the reference's
  concatenation never produces invalid CSS here. What it produces is the WRONG ALPHA:
  `'#43A047' + (90).toString(16)` is `#43A0475a`, a valid hex8 carrying 35% where PineScript's
  `transp: 90` means 10% — the Kumo comes out three and a half times too opaque and buries the
  candles. The invalid-CSS path is latent, not live, and the test says so in its own control.

---

### T11: The marker door stops being a no-op

**What**: Make the engine adapter add the marker plugin, feed the socket, and stop the repo's fake from implementing what the real one does not.
**Where**: `example/engine.ts`
**Depends on**: T10
**Reuses**: `SeriesHandle.setMarkers?`, already on the port
**Requirement**: MARK-01, MARK-02

**Tools**:
- MCP: NONE
- Skill: `ecc:e2e-testing`

**Done when**:
- [x] The real engine attaches the marker plugin, so the optional call reaches something — measured, today it is swallowed and the published 0.2.1's pattern markers do not draw
- [x] The repo's fake no longer implements a member the real object lacks, which is why nobody saw this
- [x] The `socketParity` ledger moves in the same commit
- [x] Marks are counted on a mounted composition, never through a probe of the port
- [x] Gate check passes: `npm run build && npm test && npm run e2e`

**Tests**: e2e
**Gate**: full
**Status**: DONE — measured **+187 B** (entry 104100 -> 104287): the design's +141 for
`SurfaceData.seriesMarkers` plus the review's +46 for the channel that feeds it. `ChartWorkspace`
94801 -> 94987, `ChartSurface` 23840 -> **23946**, which is a raise of a band-C row and the second
this row has ever taken. `ChartWorkspace.tsx` 347 -> **348** of 350, the `seriesMarkers` key folded
onto the `priceMarkers` line to keep the two remaining.

**The no-op is confirmed and closed, and the sensor was made to discriminate before it was trusted.**
On the real engine, in a browser, `realtime-volume-bars` paints **17,274 and 9,974 marker pixels**
against **0 and 0** before the pick — and taking `withMarkers` back out of `example/engine.ts` puts
both back to **0** and turns `marks.reach-the-bars` red. e2e 76 -> **79**.

**The fakes stopped implementing what the real object lacks.** `markerDoor` is now a CHOICE in both
engine doubles and defaults to open only where a test is about marks; a new case in each suite mounts
an engine WITHOUT the door and asserts MARK-02 — the lines still draw and no mark is offered.

`socketParity` never went red, because the socket and its channel share this commit. The gate's
baseline is empty and shrink-only, so they could not have been split.

---

### T12: A bar the indicator colours is coloured

**What**: Carry per-bar colours to the candle payload and feed the socket that was never fed.
**Where**: `src/react/surface/useSeriesData.ts`
**Depends on**: T11
**Reuses**: the candle payload the base library already accepts
**Requirement**: BAR-01, BAR-02

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] A bar the manifest says is coloured is drawn in that colour, read from the canvas
- [x] A point with no value is still a declared gap — the colour changes nothing about what a point means
- [x] The `socketParity` ledger moves in the same commit
- [x] Gate check passes: `npm run build && npm test && npm run e2e`

**Tests**: e2e
**Gate**: full
**Status**: DONE — measured **+163 B** (entry 104287 -> **104450**), against +118 in the design and
+126 in the review: both priced the socket alone and this is the socket plus the channel that fills
it, which `socketParity` will not let land separately. `ChartWorkspace` 95150, `ChartSurface`
**24067**, `ChartWorkspace.tsx` **349** of 350. e2e 79 -> **82**.

Read off the bitmap: **1,865 candle pixels** in `buying-selling-volume`'s own `#9C27B0` where there
were **0**. It is drawn in a lane of its own and still repaints the price, which is what
`barcolor()` means and why the channel is ONE array against the bars rather than a map per study.

**Two deviations, both reasoned.**
- The channel lives in `WorkspaceStudies`, not in `WorkspaceDataSource` where the review put it.
  The values are a function of the RESOLUTION — which study landed where, and what it computed —
  and `WorkspaceDataSource` is assembled before any resolve exists. Putting it there would make the
  host rebuild the lane mapping from outside, which is the class of bug the phase-1 design measured
  in `studyIdentity`.
- BAR-02 is asserted at the unit layer, not on the canvas: the clause is about what a POINT means,
  and a declared gap is an absence of ink. `test/chartSurface.spec.tsx` reads the payload and finds
  one plotted point where the reader answered `[55.4, null]`, with the candles still carrying the
  colour — the two channels independent rather than one.

**The comment budget is at zero.** `1820/9100 = 0.20000` exactly, repository-wide.

---

### T13: The colour a point carries reaches its segment

**What**: Let a point carry a colour and route it through a parallel map the resolution already has room for.
**Where**: `src/domain/types.ts`
**Depends on**: T12
**Reuses**: the readings map, which is the same shape of parallel channel
**Requirement**: POINT-01, POINT-02, POINT-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] The map member is OPTIONAL — measured at +1 B, and mandatory would break the previous feature's zero-host-breakage promise and fail the doc examples
- [x] `isGap` is unchanged and a point with no value still means absence
- [x] A point with no colour draws in the series' own colour
- [x] Gate check passes: `npm run build && npm test && node scripts/size-gate.mjs`

**Tests**: unit
**Gate**: build
**Status**: DONE — measured **+371 B** (entry 104450 -> **104821**), against +397 in the design and
+390 in the review. The difference is measured and deliberate: `alignColors` archives **nothing**
for a line whose points carry no colour — 173 of the 320 — instead of an array of nulls, so the
common case costs one `null` return rather than one array per drawn line per resolve.
`ChartWorkspace` 95292, `ChartSurface` **24138**, `ChartWorkspace.tsx` still **349** of 350 because
the reader folds onto the two lines that already existed. Slack against the untouched ceiling:
**172 B**.

The chain is `Point.color?` -> `alignColors` -> `SourceResolution.colors?` -> `SeriesColorReader`
-> the fifth argument of `plottedPoints`. Both new map members are OPTIONAL; `docExamples` and
`docReference` are green in the same commit.

**One thing outside the `Where`, and it is the producer half.** `example/indicators.ts` `toPoints`
built `{time, value}` and dropped the vendor's `color` on the floor — that IS the amputation. Two
lines there make the channel live end to end; without them the package would carry a channel with
no producer and every clause below would pass over an empty set.

**BAR-02's sentence, asserted for POINT-02 at both ends.** `isGap` on a point that carries a colour
and no value, and the absence of ink at that index — and the colour that survives is the one aligned
to the bar that HAS a reading, not the next one in the list, which is what an implementation that
filtered before colouring would draw.

---

### T14: The last four channels ride the door already paid for

**What**: Background shading, labels, drawn lines and boxes, as host overlays through the anchor seam.
**Where**: `example/channelOverlays.ts`
**Depends on**: T13
**Reuses**: T7's anchor and T9's primitive shape — measured at 0 B in the package
**Requirement**: REST-01

**Tools**:
- MCP: NONE
- Skill: `ecc:e2e-testing`

**Done when**:
- [x] Each of the four draws, read from the canvas
- [x] The package gains no byte for them, measured
- [x] Gate check passes: `npm run build && npm test && npm run e2e`

**Tests**: e2e
**Gate**: full
**Status**: DONE — **0 B in the package**, measured: entry stays at **104821** with the whole channel
in `example/channelOverlays.ts`. That is the seam's second demonstration; the anchor and the overlay
path cost 30 B and 86 B when the fill needed them, and these four reuse both. e2e 82 -> **94**,
suites 116 -> **117**, tests 1416 -> **1435**.

Read off the real bitmap, each with a control that reads zero before the pick:
- `bgColors` — `kdj`, **50,147 and 40,432** px in its own green and red, one full-height column per bar
- `labels` — `pivot-hh-hl-lh-ll`, **2,913** px of text
- `lines` — `triangular-momentum-osc`, **919 and 846** px
- `boxes` — `hema-trend-levels`, **8,787 and 11,871** px

**The tolerance was measured, not copied.** The fill's scene reads at 6 and the marks' at 2; these
read at **4**, and the number is forced from below: a canvas keeps colour PREMULTIPLIED and
`getImageData` divides the alpha out again, so `rgba(0,128,0,0.3)` comes back as 127 and an EXACT
match counts 0 of its 50,000 pixels. Measured at tolerance 0 the green column reads 0 and the red
one reads 40,416 — the rounding, not the drawing.

**One hue was dropped from a control, and the reason is measured.** `pivot-hh-hl-lh-ll` also labels
in `rgba(0,128,128,0.5)`, and the chrome already carries **17** pixels within four of that teal
before any study is picked. A control on it could never read zero, so it asserts nothing and is not
read.

**Two layers per slot, not one.** Shading and boxes go BEHIND — a box drawn over the plot it frames
buries it — and labels and lines go AHEAD, because text under a line is text nobody can read. The
reference makes the same split and `Overlay.zOrder` already carried both values.

`test/channelOverlays.spec.ts` (19 cases) answers what pixels cannot localise: a column that spans
the pane instead of the bar, a box read as top-left-plus-size instead of two opposite corners, a
line extended along the horizontal instead of its own slope, a label hung on the wrong side of the
price it names. All four would light a pixel count exactly as well. `test/renderFakes.ts` gained
stroke and text recorders for it.

**Numbers corrected against the design by measurement**: 13,572 background items on 20 rows (all
`rgba`), 1,023 labels on 7 rows of which **4** carry no bubble colour at all (the design said 5),
151 lines on 4 rows with **0 of 151** carrying an `extend`, and 99 boxes on 3 rows of which 34 have
no border to draw.

---

### T15: The generator stops keeping a list

**What**: Enumerate every member of the vendor result, count an object channel like any other, derive the widths from the rows written, and refuse a row wider than its declared width.
**Where**: `scripts/build-indicator-manifest.mjs`
**Depends on**: T14
**Reuses**: the refusal doctrine `renames.json` and `value-changes.json` already carry
**Requirement**: LINES-04, FILL-05, PROOF-01

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] Channels are enumerated from the result, never from a written list of names — measured, the list of nine missed two object-shaped channels and 10 offered rows emit one
- [x] The declared widths are derived from the rows the generator itself writes, so a wider vendor release cannot under-declare the resource in silence
- [x] A row that cannot be drawn whole is refused rather than offered
- [x] Gate check passes: `npm run build && npm test && npm run proof`

**Tests**: integration
**Gate**: proof
**Status**: DONE — **0 B in the package** (entry stays 104821); this is all generator and proof.
`npm test` 117 -> **118** suites and 1435 -> **1446** tests, proof **29/29**, e2e **94/94**.

**The catalogue goes from 320 offered to 310, and that is the task, not a side effect.** The ten
withdrawn rows each emit a channel nothing draws, enumerated from the result: `plotCandles` on
`madrid-trend-squeeze` (2,970 drawable candles), `linear-regression-candles`, `market-shift-levels`,
`matrix-series`, `modified-heikin-ashi`, `super-supertrend`, `banker-fund-flow`; `tables` on
`ml-adaptive-supertrend`, `ml-rsi`, `supertrend-ai-clustering`. Every one carries real content —
measured item by item, none is an empty channel. Offering them is exactly the partial draw this
feature exists to remove, and the spec says so twice: "an indicator whose channel cannot be drawn is
not offered", and "a row that cannot be drawn whole is refused rather than offered".

**The vanished-id refusal needed one clause, and the reason is the block's own.** It exists because
the generator can see that an id left the LIBRARY and cannot see whether it was renamed or removed.
That ambiguity does not exist for a row still in the registry that a rule here turned down: the
reason is written, printed as a `WITHDRAWING` line, and in the diff. Without the clause no rule in
this generator could ever be tightened without hand-editing a ledger to restate what the generator
already said.

**One mechanism, two risks, and the vacuity is asserted.** `refusalsOf(rows, widths)` is a function
of both rather than a step inside the derivation, because over the generator's own output its set is
EMPTY BY CONSTRUCTION — a maximum is not exceeded by what it is the maximum of. That emptiness is
pinned by a test, so a derivation that stopped being a maximum says so; and the same function is
what T16 calls with the widths the COMMITTED file declares, where a narrowed width is a study
drawing four of its twenty lines in silence.

**`dropped` became `channels`.** It recorded counts of what was NOT drawn; every one of those seven
channels is now drawn, so the same numbers are the row's declaration of what to draw and PROOF-02
can compare against them. Nothing in the host ever read `dropped` — `ManifestRow` never declared it.
Measured on the 310: fills 104, markers 72, barColors 48, bgColors 20, lines 4, labels 4, boxes 3.

`test/manifestChannels.spec.ts` drives the module through `node` the way `sizeBudget.spec.ts` drives
the size probe. **The object clause was verified by deletion**: written back as
`Array.isArray(v) ? v.length : 0`, the object case reads `[]` and turns red while the other ten stay
green.

---

### T16: A dropped channel cannot pass again

**What**: The proof compares every emitted member against what is drawn, with three plantings proving each clause discriminates.
**Where**: `scripts/indicator-proof.mjs`
**Depends on**: T15
**Reuses**: the six-direction declaration rule already in the proof
**Requirement**: PROOF-01, PROOF-02, PROOF-03, PROOF-04, LINES-03

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [x] The comparison is against LIVE plots, not declared — measured at 915 live of 1048, with 133 dead across 32 rows
- [x] Three plantings turn it red: a dropped channel, an object-shaped channel, and a width narrower than the rows beneath it
- [x] Stubbing any one clause leaves a different clause red, verified by deletion
- [x] Gate check passes: `npm run build && npm test && npm run proof`

**Tests**: integration
**Gate**: proof
**Status**: DONE — proof **29/29 -> 33/33**, `npm test` 1446 unchanged, entry unchanged at **104821**.
Stage 12 is four checks: the declaration comparison, the nothing-draws clause, the live-line count,
and the three-way discrimination.

**The live/declared numbers are re-measured and the design's do not reproduce, because they were
taken on a different artefact.** The design measured **915 live of 1048 across 320 rows at 240
bars**; on the 310-row manifest T15 wrote, over the proof's own 1,024-bar fixture, it is **949 live
of 1,026 declared — 77 dead across 23 rows**. The conclusion is the same and stronger: judging the
drawing by the DECLARED count would be red on 23 rows for ever. `auto-support` reproduces the
review's warning exactly — 40 of 56 at 1,024 bars against 24 of 56 at 240 — which is why the
resource is sized by the declared number and the drawing judged by the live one. Both numbers are
in the assertion, with the window.

**Three plantings, three clauses, one comparison.** `driftOf` has ONE definition and two callers —
the 310-row sweep and the plantings — because a planting walking its own copy of the comparison is
a second declaration of one fact, and the day one copy is corrected the other keeps printing PASS.
- a fill the result carries and the row does not declare → caught by the DECLARATION clause alone
- an object-shaped `plotCandles` → caught by the NOTHING-DRAWS clause alone, and under
  `Array.isArray` by neither
- the real catalogue judged against a resource one line short → refuses 1 row, the widest first

**Verified by deletion, three times, each leaving a different direction red:**
- blinding `channelsOf` to an unknown channel → `object-shaped→red false`, the other two still true
- `refusalsOf` refusing nothing for width → `narrow-width→red false`, the other two still true
- silencing the declaration comparison → `dropped-channel→red false`, the other two still true

Each stub left the discrimination check red — a different check from the sweep clause that was
stubbed — so no one clause is carrying the other two, which is the failure shape this repository
has recorded twice.

---

### T17: The page shows the indicator its name promises

**What**: The e2e assertion that Ichimoku draws five lines and a two-coloured Kumo, and that editing a span moves both.
**Where**: `scripts/e2e-demo.mjs`
**Depends on**: T16
**Reuses**: the script's legend-value and canvas-checksum assertions
**Requirement**: FILL-04, LINES-01, LINES-03

**Tools**:
- MCP: NONE
- Skill: `ecc:e2e-testing`

**Done when**:
- [x] Five lines are read on screen, not three and not one — measured before this feature at one
- [x] The Kumo is shaded and keeps two colours
- [x] Editing Leading Span B moves the lines and the shading together
- [x] An idle re-render does not rewrite the drawn data
- [x] Gate check passes: `npm run build && npm test && npm run e2e && npm run proof && node scripts/size-gate.mjs`

**Tests**: e2e
**Gate**: full
**Status**: DONE — e2e 94 -> **96**, suites 118 -> **119**, tests 1446 -> **1449**, proof 33/33,
entry 104821 -> **104853** (+32 B), slack **140 B**. `ChartWorkspace.tsx` still **349** of 350.

**FIVE LINES, COUNTED ON THE BITMAP.** `Conversion Line 2910px · Base Line 2699px · Lagging Span
2744px · Leading Span A 2060px · Leading Span B 1652px`, each hue reading ZERO before the pick. The
colour is the HOST'S — `example/panes.ts` cycles `OVERLAY_COLORS` by plot position — so five
distinct hues is five distinct lines. **The legend cannot do this job**: it shows four, because the
Lagging Span is displaced 26 bars back and has no value at the right edge to print, so a
legend-only count would read four for ever and could not tell that from a line that failed to draw.

**Editing Leading Span B moves both.** 52 -> 26: the line moves **1,652 -> 2,098 px** and the Kumo
bounded by it moves **13,459/8,425 -> 3,803/1,883 px**. A fill still drawn against the OLD bounds
would leave the second pair alone while the first moved, which is the exact shape of the defect.

**FILL-04a needed a fix, and the fix is measured by deletion.** `test/idleRedraw.spec.tsx` counts
payloads on a mounted workspace with a counting engine.
- The first measurement was of the HARNESS, not the code: sampling the counter at the first write
  reads **37** and sampling it once the mount settles reads **111**. Without `settled()` the suite
  would report a rewrite that never happened. This is written into the suite.
- A host that memoises its prop groups is already saved by `React.memo` on the composition — with
  or without the fix. **The re-render that matters is the one the composition does to ITSELF.**
  Measured by deletion, with the readers built inline: adding ONE horizontal price line takes the
  write count **111 -> 148**, and a second line adds the same again. A horizontal line has nothing
  to do with a series payload, and this feature took the series count from 43 to 505.
- The fix is one `useMemo` over both readers, +32 B, and it holds the file at 349 lines because it
  replaces the line that was already there.
- The control positive is asserted too: a change of market still rewrites. An effect that never
  fired again would satisfy the clause perfectly and freeze the chart on its first window.

**A host that hands over inline prop groups is beyond what the composition can fix** — `resolved` is
a function of the `studies` object it was given. That is documented rather than asserted.

---

### T18: The marker sensor counts a hue only markers can write

**What**: Repoint `marks.reach-the-bars` at a study whose marker colours appear in no other channel of its own result, so deleting the marker plugin takes the count to zero again.
**Where**: `scripts/e2e-demo.mjs`
**Depends on**: T17
**Reuses**: `hueCount`, `pickStudy`, and `SeriesMenu`'s own `domId` narrowing
**Requirement**: MARK-01

**Tools**:
- MCP: NONE
- Skill: `ecc:e2e-testing`

**Done when**:
- [x] The study the scene drives is chosen by MEASUREMENT over every marker-emitting row, not by taste
- [x] Deleting `withMarkers` from `example/engine.ts` turns `npm run e2e` red
- [x] Deleting `alignColors` from `src/indicator/availability.ts` leaves the marker scene GREEN, so the point-colour channel cannot satisfy it
- [x] Gate check passes: `npm run build && npm test && npm run e2e`

**Tests**: e2e
**Gate**: full
**Status**: DONE — 0 B. `scripts/e2e-demo.mjs` is not in the bundle; entry still **104853 / 104853**.

**The disarming is reproduced, then removed.** The scene drove `realtime-volume-bars`, which emits
`#00FF00`/`#FF0000` TWICE: once as markers and once as `plots.plot0`/`plots.plot1` point colours —
measured on the vendor result, `plot0` entirely `#00FF00` and `plot1` entirely `#FF0000`. From T13,
when point colours started drawing, `up > 0 && down > 0` could no longer fall to zero, and T11's own
deletion control had stopped being red without anybody re-running it.

**The replacement was measured, not chosen.** All 72 marker-emitting rows were computed at their own
defaults over the proof's fixture, every colour string in the result was collected with `markers`
excluded, and the marker colours were intersected against it and against the host's two palettes.
SIX rows come back clean; `t3-psar` is the one with the most drawable marks — 259, `arrowUp`
`#00E676` below the bar and `arrowDown` `#FFEB3B` above it — and it is the strongest of the six for
this clause because it DOES emit point colours (`#EF5350`, `#64B5F6`), so the control below is not
vacuous.

**Both directions are measured on the real bitmap.**
- Baseline: `up 393, down 426` against `0, 0` before the pick.
- `return created;` in `example/engine.ts:124` (the T11 control): **up 0, down 0 — RED, 95/96.**
- `alignColors` returning `null` (sensor M1): **up 392, down 426 — GREEN, 96/96.** The one pixel is
  antialias; the point-colour channel writes neither hue.
