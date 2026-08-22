# Indicator render fidelity: what the vendor emits is what the chart draws

## Problem Statement

The adopted catalogue offers 320 indicators and draws **121 of them canonically**. The other 199 are
amputated in silence: 108 lose their fills, 77 lose their markers, 52 lose their per-bar colouring, and
89 have plots truncated by a lane ceiling of three. The Ichimoku Cloud is the visible case — five plots
become three, and the two that fall are exactly the Kumo boundaries, so the cloud that IS the indicator
never appears.

The previous feature's proof passed all 320 because it verifies the vendor→domain conversion and never
the domain→screen rendering. The manifest records every drop honestly; nothing fails on them.

The owner's requirement is one sentence: **be canonical to the reference implementation in every case.**
What the vendor's own demo draws, this demo draws.

## Goals

- [ ] Every indicator the catalogue offers draws every channel the vendor emits for it — measured against the manifest, not asserted
- [ ] No plot is truncated: a study's line count comes from the study, not from one number the host wrote for all of them
- [ ] The proof fails when any emitted channel is dropped, so a silent amputation cannot pass again
- [ ] `src/` gains no third-party byte and no business word; the arithmetic and the vocabulary stay in the host

## Out of Scope

| Feature | Reason |
| --- | --- |
| Widening `SeriesShape` for bands | `lightweight-charts` has no band-between-two-lines series, so a shape would have to be faked anyway. The published overlay seam already draws on the canvas with a price→pixel projection, and `DensityFieldOverlay` and `TroughProfileOverlay` are its living precedents |
| Re-deriving any vendor arithmetic | Measured at ~1e-13 against this repo's own hand-written implementations. The numbers are not the defect; the rendering is |
| Raising `PROVISIONAL_ENTRY_LIMIT` | Never raised, not raised here. Growth is paid for with measured shrinkage, one candidate per re-pin |
| Rendering channels the vendor does not emit | Fidelity means matching the reference, not exceeding it |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| What "canonical" means | What the vendor EMITS, not what its demo manages to paint | Owner's words were emphatic — in every case — and then measurement found the reference wrong in three places, so following it literally would ship a worse chart. It is the best witness to what the PineScript means, not the authority when it loses the channel itself | y |
| The reference's three measured defects | Corrected here, not reproduced | It concatenates an alpha hex into `rgba(...)`, which carries 35% where `transp: 90` asks 10%; it ignores `fills[].colors`, which 83 of the 180 fills the offered rows emit carry; and it silently drops the fills bound to an `hline_*`. Owner decided: correct. NOT by `fills[].colors`: Ichimoku emits TWO fills, `#43A047 transp 90` and `#F44336 transp 90`, each in its own `options.color` and NEITHER carrying a `colors` array — so what would lose the Kumo's green-above/red-below is collapsing the two fills into one, not ignoring a per-bar array. Measured both ways: ignoring `fills[].colors` leaves the e2e at 96/96 and kills one unit test; collapsing the two fills turns the e2e red with the bearish region reading 0 px | y |
| Where a fill is drawn | An overlay the host attaches, not a new series shape | The base library has no band series; the overlay seam is published, tested, and keeps the vocabulary in the host | n |
| Where markers are drawn | Through `SeriesHandle.setMarkers?`, already on the port | The port already carries the door and its docblock already says an adapter has to add the plugin. 77 indicators sit behind a door nobody opened | n |
| How a study declares its line count | From the manifest, per study | Measured distribution runs 1 to 56 plots; one number for all of them truncates 89 | n |
| Per-bar colour | The domain carries it per point | `Point` has no colour and `SeriesSpec.color` is one colour for the whole series, so 45,209 emitted colours have nowhere to land | n |
| Order of work | fills, then line count, then markers, then bar colours, then the rest | By indicator count affected: 108, 89, 77, 52, 34 | y |
| Input validation & bounds | N/A because this feature renders what the previous one already validated and stored | The channels arrive from the vendor through an adapter whose narrowing is already asserted | n |
| Failure / partial-failure states | An indicator whose channel cannot be drawn is not offered | The whole point: a partial draw is the defect being removed | n |
| Idempotency / retry | N/A because rendering is a pure function of bars, settings and the vendor result | Nothing here crosses a network or retains state between draws | n |
| Auth boundaries & rate limits | N/A because this feature adds no callable surface and no network call | Rendering only | n |
| Concurrency / ordering | Overlays draw after the series they annotate, and z-order is declared | The overlay seam already carries `zOrder` and `BaseZOrder` | n |
| Data lifecycle / expiry | N/A because nothing new is persisted | Values persist through the previous feature's channel, unchanged | n |
| Observability | N/A because the package emits no telemetry by contract | An undrawable indicator is refused at manifest time, which is louder than a log | n |
| External-dependency failure | Unchanged from the previous feature: the library loads on demand and a failure mounts an empty catalogue | Already asserted | n |
| State-transition integrity | Changing a parameter redraws every channel, not only the plots | A fill that keeps the old bounds after an edit is a new way to lie | n |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: The cloud that is the indicator gets drawn ⭐ MVP

**User Story**: As a user, I want the Ichimoku Kumo and the Bollinger band to be filled, so that the
indicator on my screen is the indicator its name promises.

**Why P1**: 108 of 320 offered indicators drop a fill, and the fill is the reading for the most-used
of them.

**Acceptance Criteria**:

1. WHEN an offered indicator emits a fill between two of its plots THEN the chart SHALL draw that fill between those two drawn lines  <!-- event-driven -->
2. WHEN a fill's bound is a constant level rather than a plot THEN the chart SHALL draw the fill against that level  <!-- event-driven -->
3. The fill SHALL be drawn beneath the lines it spans, so a boundary is never hidden by its own shading  <!-- ubiquitous -->
4. WHEN a parameter that moves a fill's bounds is edited THEN the fill SHALL be redrawn against the new bounds in the same frame as the lines  <!-- event-driven -->
4a. WHEN nothing has changed THEN an idle re-render SHALL NOT rewrite the drawn data — measured before this feature at 111 writes on mount and 148 more on an idle re-render, against a series count this feature takes from 43 to 505  <!-- event-driven -->
5. IF a fill's bounds cannot both be resolved THEN that indicator SHALL NOT be offered, rather than being drawn without it  <!-- unwanted-behavior -->

**Independent Test**: Offer Ichimoku, read the canvas where the Kumo sits between Leading Span A and B, and assert the shading is present and bounded by the two lines; edit the Leading Span B length and assert the shaded region moves.

---

### P1: A study's line count is the study's, not the host's ⭐ MVP

**User Story**: As a user, I want every line an indicator computes to be drawn, so that a five-line
indicator is not silently a three-line one.

**Why P1**: 89 of 320 have more than three plots and are cut by one number the host wrote for all of
them. The measured distribution runs from 1 to 56.

**Acceptance Criteria**:

1. WHEN a study declares more lines than the host's default lane width THEN the workspace SHALL draw every one of them  <!-- event-driven -->
2. The package SHALL take a study's line count from that study rather than from a single value applied to all studies  <!-- ubiquitous -->
3. WHEN a study is drawn THEN the number of lines on screen SHALL equal the number of its plots that produce a finite value, counted on the bitmap — one hue per plot position, each of them zero before the study is picked  <!-- event-driven -->
3a. WHEN the committed catalogue is proved THEN every live plot of every offered row SHALL have a declared slot to be drawn into — the necessary condition for clause 3 at catalogue scale, and an INEQUALITY on purpose: measured at 949 live plots of 1026 declared over the 310 offered rows, 77 dead across 23 rows, so judging the drawing by the declared count would be red on 23 rows for ever, and sizing the resource by the live count would drop what a longer window brings alive  <!-- event-driven -->
4. IF a study's lines cannot all be drawn THEN it SHALL NOT be offered  <!-- unwanted-behavior -->

**Independent Test**: Offer Ichimoku and assert five drawn lines, not three; offer the 56-plot entry and assert 56.

---

### P2: The marks the vendor emits reach the bars

**User Story**: As a user, I want the arrows and dots an indicator places on bars, so that a signal
indicator signals.

**Why P2**: 77 indicators emit 11,531 markers and the port already carries `setMarkers?` with a
docblock saying an adapter has to add the plugin. The door exists and nobody opened it — and measured,
it is worse than unused: `ISeriesApi` in the installed base library has no such member, the demo engine
returns the raw series, and the optional call is swallowed. **The candlestick pattern markers in the
published 0.2.1 do not draw, and nothing is red.** The test therefore counts marks in the mounted
composition, never through a probe of the port.

**Acceptance Criteria**:

1. WHEN an offered indicator emits markers THEN the chart SHALL place them on the bars they name  <!-- event-driven -->
2. WHERE the host's engine does not implement the optional marker door the workspace SHALL draw the study's lines and offer no markers, rather than failing to draw  <!-- optional-feature -->

**Independent Test**: Offer a marker-emitting indicator and assert the marker count on screen matches the count the manifest declares.

---

### P2: A bar the indicator colours is coloured

**User Story**: As a user, I want per-bar colouring to survive, so that an indicator whose whole output
is the colour of the candle is not invisible.

**Why P2**: 52 indicators emit 45,209 bar colours. `Point` carries no colour and `SeriesSpec.color` is
one colour for a whole series, so they have nowhere to land.

**Acceptance Criteria**:

1. WHEN an offered indicator emits a colour for a bar THEN the chart SHALL draw that bar in that colour  <!-- event-driven -->
2. The colour a point carries SHALL NOT change what the point means: a point with no value stays a declared gap  <!-- ubiquitous -->

**Independent Test**: Offer a bar-colouring indicator, read the canvas at a bar the manifest says is coloured, and assert the colour matches.

---

### P3: The remaining channels

**User Story**: As a user, I want background shading, labels, drawn lines and boxes to appear, so that
the last 34 indicators are whole too.

**Acceptance Criteria**:

1. WHEN an offered indicator emits background shading, a label, a line or a box THEN the chart SHALL draw it  <!-- event-driven -->

---

### P1: The colour a point carries reaches the line ⭐ MVP

**User Story**: As a user, I want a line that changes colour with its own signal to change colour on
my screen, so that an indicator whose output IS the colour is not a flat line.

**Why P1**: Measured after the seven-channel inventory was written, and larger than any of them:
plot points arrive as `{time, value, color?}` and **147 of 320 indicators emit 54,009 coloured
points**. The adapter discards every one in silence. A hand-written list of seven names missed the
biggest channel, which is why PROOF-02 compares every emitted member rather than a list.

**Acceptance Criteria**:

1. WHEN a vendor plot point carries a colour THEN the chart SHALL draw that point's segment in that colour  <!-- event-driven -->
2. The colour a point carries SHALL NOT change what the point means — a point with no value stays a declared gap  <!-- ubiquitous -->
3. WHEN a point carries no colour THEN the chart SHALL draw it in the series' own colour  <!-- event-driven -->

**Independent Test**: Offer an indicator the manifest says emits point colours, read the drawn segments at two indices the manifest says differ, and assert the two colours differ.

---

### P1: A silent drop cannot pass the proof again ⭐ MVP

**User Story**: As the maintainer, I want the proof to fail when a channel is dropped, so that the
gap that let 199 amputated indicators pass 320/320 cannot reopen.

**Why P1**: The proof verified vendor→domain and never domain→screen. Every drop was recorded honestly
in the manifest and nothing failed on it.

**Acceptance Criteria**:

1. WHEN the manifest records a dropped channel for an offered indicator THEN the proof SHALL fail, naming the indicator and the channel  <!-- event-driven -->
2. WHEN an offered indicator is drawn THEN the proof SHALL compare EVERY member the vendor's result carries against what is drawn, enumerated from the result itself rather than from a written list of channel names  <!-- event-driven -->
2a. WHEN a channel arrives as an object rather than an array THEN it SHALL be counted the same as any other — measured: the generator tested `Array.isArray` against a hand-written list of nine names, and 10 offered rows emit a `plotCandles` or a `tables` the manifest therefore declares they do not  <!-- event-driven -->
3. The proof SHALL assert the above against three synthetic plantings — a dropped channel, an object-shaped channel, and a declared width narrower than the rows written under it — so each clause discriminates rather than passing over an empty set  <!-- ubiquitous -->

**Independent Test**: Plant a dropped fill on an offered row and assert the proof turns red naming it.

---

## Edge Cases

- IF a fill bound resolves to a non-finite value on some bars THEN the fill SHALL be interrupted there rather than spanning the gap
- WHEN a study with more lines than the lane can show is drawn THEN the lane SHALL grow rather than the study being cut
- IF two overlays claim the same z-order THEN the order SHALL be stable across redraws
- WHEN an indicator emits a marker on a bar outside the loaded window THEN that marker SHALL be dropped without affecting the rest
- WHEN the entry bundle is measured after this feature THEN it SHALL remain below `PROVISIONAL_ENTRY_LIMIT`

---

## Requirement Traceability

| Requirement ID | Story | Tasks | Status |
| --- | --- | --- | --- |
| FILL-01 | P1: The cloud that is the indicator | T8, T9, T10 | Done |
| FILL-02 | P1: The cloud that is the indicator | T9, T10 | Done |
| FILL-03 | P1: The cloud that is the indicator | T8, T10, T20 | Done |
| FILL-04 | P1: The cloud that is the indicator | T17 | Done |
| FILL-05 | P1: The cloud that is the indicator | T10, T15 | Partial |
| FILL-06 | P1: The cloud that is the indicator | T17 | Done |
| LINES-01 | P1: A study's line count is the study's | T5, T7 | Done |
| LINES-02 | P1: A study's line count is the study's | T5 | Done |
| LINES-03 | P1: A study's line count is the study's | T7, T16, T17, T23 | Done |
| LINES-04 | P1: A study's line count is the study's | T5, T15 | Done |
| POINT-01 | P1: The colour a point carries | T13 | Done |
| POINT-02 | P1: The colour a point carries | T13 | Done |
| POINT-03 | P1: The colour a point carries | T13 | Done |
| PROOF-01 | P1: A silent drop cannot pass again | T15, T16, T21 | Done |
| PROOF-02 | P1: A silent drop cannot pass again | T15, T16 | Done |
| PROOF-03 | P1: A silent drop cannot pass again | T15, T16 | Done |
| PROOF-04 | P1: A silent drop cannot pass again | T15, T16 | Done |
| MARK-01 | P2: The marks reach the bars | T11, T18, T19 | Done |
| MARK-02 | P2: The marks reach the bars | T11, T19 | Done |
| BAR-01 | P2: A bar the indicator colours | T12 | Done |
| BAR-02 | P2: A bar the indicator colours | T12 | Done |
| REST-01 | P3: The remaining channels | T14 | Done |

**Coverage:** 22 total, 22 mapped to tasks, 0 unmapped

MARK-01 REOPENED IN T18. T11 counted marker pixels on `realtime-volume-bars`, which emits the same
two hues from its markers AND from its point colours; when T13 made point colours draw, the count
stopped being able to fall to zero and deleting the marker plugin left the scene green. T18 drives a
study whose marker colours appear in no other channel of its own result, and re-runs both controls.
T19 gives `example/studyMarks.ts` the suite it never had — every rule it declares, each proved to
discriminate on its own — and implements the edge case below about a marker outside the window.

LINES-03 CLOSES IN T17, AT TWO DIFFERENT STRENGTHS, AND T23 SAYS SO IN THE CLAUSE. T7 gave every
resolved line a declared series to be drawn into and asserted the correspondence with a narrow width
planted as a positive control; T16 pinned the live count against the declared resource over the
proof's own window; and T17 reads the five lines off the bitmap, one hue per plot position, each of
them zero before the pick.

The EQUALITY is a pixel measurement and exists for Ichimoku. The catalogue-wide clause is an
INEQUALITY — every live plot fits the declared resource — and it is written as clause 3a rather than
folded into clause 3, because the two are different assertions and the spec used to word only the
strong one. Verifying the equality for all 310 offered rows means rendering all 310 in a browser and
counting hues that repeat every six plot positions; the widest row declares 56. The inequality is
the strongest catalogue-scale form of the clause that does not need that, and it carries its own
planted positive control (`auto-support: 40 live against a declared 20` under a narrowed width).

LINES-04 CLOSES IN T15. T5 removed the only place inside the package where a study's lines could be
cut, leaving the clause with no producer there; T15 put the single refusal point in the manifest
generator — a row wider than the resource declared for it is not written — and made it a function of
(rows, widths) so the proof can call it with the widths the committed file declares.

FILL-05 stays PARTIAL, and it is the one non-offering clause without a discriminating control. T10
measured 247 of 247 bounds resolving over the whole registry, so the set is empty; T15's refusal
covers a row that is too WIDE and a row that carries a channel nothing draws, not a row whose fill
bound cannot resolve. Closing it needs a third refusal clause and a planting of its own, and neither
is in this `tasks.md`.

---

## Success Criteria

- [ ] The manifest records zero dropped channels for every offered indicator, enumerated from the vendor result rather than from a list of names
- [ ] A line whose points carry colours draws in those colours, and the Kumo keeps its two
- [ ] Ichimoku draws five lines and a filled Kumo, and editing Leading Span B moves both
- [ ] The proof turns red when a channel is planted as dropped
- [ ] `node scripts/size-gate.mjs` exits 0 with the entry below the untouched provisional ceiling
- [ ] `package.json` still declares zero runtime dependencies and exactly two peers
- [ ] `npm test`, `npm run e2e` and `npm run proof` all green
