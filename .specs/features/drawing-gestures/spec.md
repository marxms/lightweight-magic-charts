# Drawing gestures: anchor drag and the magnet

## Problem Statement

Two gestures a chart user arrives already knowing do not work. Resizing a drawing is impossible —
pulling an anchor pans the chart underneath it, so the shape never reaches where it is being taken.
And every anchor lands on a bar boundary whether or not that is wanted, because the anchor takes the
crosshair's bar time; there is no magnet to turn off, so freehand placement between bars cannot be
expressed at all.

## Goals

- [x] An anchor drag moves the anchor and nothing else: zero chart pan while a drag is in flight.
- [x] A host can offer the two placement modes a chart user expects, and the library can express both:
      free (the pointer's own price) and magnetic (snapped to a named price of the nearest bar).
      **Price only** — the time axis is quantised to bars by the base library and stays that way.
- [x] Both proven in a real browser by `npm run e2e`, not only in jsdom.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Snapping to other drawings' anchors | A second magnet source with its own precedence rules; the bar is the one users ask for first |
| Touch and pen gestures | The reported defect is pointer-only; a touch drag has its own capture model and deserves its own spec |
| Persisting the magnet choice across reloads | Persistence is the host's, through the existing tab store; the library holds the mode for the session |
| Snapping the drawing's *shape* (angles, ratios) | A different feature (constrain-while-drawing), unrelated to where an anchor lands |
| Fixing snap inside `lightweight-charts-drawing` | Measured: `snapToBar` and `snapThreshold` occur 0 times in its shipped bundle. Upstream is not the lever |
| Free placement along the TIME axis | Measured impossible with `Time` anchors: an off-bar time has no coordinate, so the drawing would not render. Expressing it would mean re-anchoring every drawing on fractional logical indices — a different feature, with its own persistence and timeframe-change semantics |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| An anchor can hold a time that is not a bar's time | **MEASURED — it cannot.** Free placement applies to PRICE only; the time axis stays quantised to bars | Probed against `lightweight-charts` in isolation, 10 bars one hour apart: `timeToCoordinate(bar)` = 258 px, `timeToCoordinate(bar + 30min)` = `null`, `timeToCoordinate(bar + 60s)` = `null`, and `coordinateToTime` at x, x+10 and x+20 all answer the same bar time. An off-bar anchor has no coordinate, so it would not render | y |
| The magnet is OFF by default | Off | The reported pain is being stuck ON with no way out; a library that defaults to the complained-of behaviour has not fixed it | n |
| What the magnet snaps to | The nearest bar's open, high, low or close — whichever is nearest in price | This is what TradingView's magnet does, and it is the behaviour the report names by comparison | n |
| Where the mode lives | **DECIDED — library state on the drawing seam; the library DRAWS the control and the host NAMES it** | The rail already draws three fixed controls it authors entirely — cursor, delete-selection, clear-all — each with its glyph from the library and its word from `DrawingToolbarLabels`. The magnet is that same shape. Publishing `useDrawingRail` instead would freeze ten members of `DrawingRailValue` as public API to hand a host one boolean, and the hook throws outside a provider the host cannot mount. See AD-017 | y |
| Axis lock trigger | The anchor hit-test the package already exposes | The package publishes no drag-start event; `_isDragging` is private and `drawing:updated` arrives only after the first movement | n |
| How the snap threshold is expressed | **DESIGN — screen pixels, default 8** | A price-unit tolerance means something different at 60 000 than at 0.4, and different again after a zoom. The gesture is a screen gesture. `SeriesHandle.priceToCoordinate` is already on the port, so no new port surface | y |
| How the engine-specific half reaches the library | **DESIGN — one optional predicate, `DrawingLayer.anchorAt`** | The lock is engine-agnostic except for the hit-test. Importing `lightweight-charts-drawing` to get it would break the zero-dependency manifest and AD-006 | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: An anchor drag does not pan the chart ⭐ MVP

**User Story**: As someone adjusting a drawing, I want to pull an anchor and have only the anchor
move, so that I can resize a shape at all.

**Why P1**: Without it the drawing tools ship unusable for editing. It is a defect, not an absence.

**Acceptance Criteria**:

1. WHILE a pointer press has grabbed a drawing anchor, the library SHALL hold the chart's
   `handleScroll` and `handleScale` at `false`.
2. WHEN the press that grabbed an anchor is released, the library SHALL restore `handleScroll` and
   `handleScale` to `true`.
3. IF the press is released outside the chart container, THEN the library SHALL still restore both
   options.
4. IF the window loses focus while an anchor drag is in flight, THEN the library SHALL restore both
   options.
5. IF the surface unmounts while an anchor drag is in flight, THEN the library SHALL NOT call the
   disposed chart, and SHALL leave no listener attached.
6. WHEN a press lands anywhere that is not an anchor, the library SHALL leave `handleScroll` and
   `handleScale` untouched, so panning stays the default gesture.

**Independent Test**: arm nothing, create a two-anchor drawing, press an anchor and drag 200 px; the
drawing's anchor moves and the visible bar range is unchanged.

---

### P2: The magnet is a mode the user controls

**User Story**: As someone drawing on a chart, I want to choose between free placement and snapping
to the bar, so that I can mark an exact level or an arbitrary one.

**Why P2**: The gesture works today; what is missing is the choice. It ships after the defect above.

**Acceptance Criteria**:

1. The library SHALL expose the magnet as a two-state mode, `off` and `on`, defaulting to `off`.
2. WHILE the magnet is `off`, WHEN an anchor is placed, the library SHALL resolve the anchor's
   price to the pointer's own price, not to the price of any bar.
3. WHILE the magnet is `on`, WHEN an anchor is placed within the snap threshold of a bar's open,
   high, low or close, the library SHALL resolve the anchor's price to that bar value.
4. WHILE the magnet is `on`, IF no bar value lies within the snap threshold, THEN the library SHALL
   resolve the anchor's price to the pointer's own price.
5. WHERE no control has flipped the mode, the library SHALL behave exactly as `off`; a
   `DrawingToolbar` mounted without a magnet group SHALL draw no toggle.
6. WHEN the magnet mode changes mid-gesture, the library SHALL apply the new mode to anchors placed
   after the change and SHALL NOT move anchors already placed.

**Independent Test**: with the magnet off, place an anchor between two bars' closes and read a price
that equals neither; turn it on, place near a high, and read exactly that high.

---

### P3: The preview shows what the magnet will do

**User Story**: As someone drawing with the magnet on, I want the dashed preview to already sit where
the anchor will land, so that the commit holds no surprise.

**Why P3**: The gesture is correct without it; this removes the gap between what is shown and what is
recorded.

**Acceptance Criteria**:

1. WHILE the magnet is `on`, the preview SHALL trace to the snapped position rather than the raw
   pointer position.

---

## Edge Cases

- IF the chart holds zero bars THEN the magnet SHALL place at the pointer's own price, because there
  is no bar value to snap to.
- IF two bar values are equidistant from the pointer THEN the library SHALL choose the higher price,
  so the outcome is defined rather than incidental.
- WHEN an anchor drag begins on a pane other than the price pane, the library SHALL leave the axes
  untouched, matching the existing pane-index guard on placement.

---

## Requirement Traceability

| Requirement ID | Story | Tasks | Status |
| --- | --- | --- | --- |
| DRAG-01 | P1: anchor drag does not pan | T1, T3, T10, T12, T16 | Done |
| DRAG-02 | P1: anchor drag does not pan | T3, T14, T20 | Done |
| DRAG-03 | P1: anchor drag does not pan | T3 | Done |
| DRAG-04 | P1: anchor drag does not pan | T3 | Done |
| DRAG-05 | P1: anchor drag does not pan | T3, T5, T15 | Done |
| DRAG-06 | P1: anchor drag does not pan | T3, T4, T16 | Done |
| MAGNET-01 | P2: the magnet is a mode | T1, T6, T7, T8, T9, T21, T11, T26, T22 | Done |
| MAGNET-02 | P2: the magnet is a mode | T2, T12 | Done |
| MAGNET-03 | P2: the magnet is a mode | T2, T10, T12, T18, T19 | Done |
| MAGNET-04 | P2: the magnet is a mode | T2, T17, T25 | Done |
| MAGNET-05 | P2: the magnet is a mode | T4, T6, T9, T11, T26 | Done |
| MAGNET-06 | P2: the magnet is a mode | T5, T8, T22 | Done |
| MAGNET-07 | P3: the preview shows the magnet | T10, T19 | Done |

**ID format:** `[CATEGORY]-[NUMBER]`

**Coverage:** 13 total, 13 mapped to tasks, 0 unmapped, 13 Done

---

## Success Criteria

- [x] A 200 px anchor drag leaves the visible bar range byte-identical, asserted in `npm run e2e`.
- [x] With the magnet off, an anchor's price differs from every bar value of the bar under it.
- [x] With the magnet on, an anchor placed within the threshold of a high reads exactly that high.
- [x] The size budget moves by a named amount in both ledgers, or does not move.
- [x] `npm test` and `npm run e2e` both green, with at least one new e2e check per P1 and P2 story.
