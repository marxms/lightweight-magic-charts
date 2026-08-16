# Overlays

Why the code under `src/overlays/` is shaped the way it is: the density field, the trough profile and
the tuning that bounds them.

> How this directory is read, and why nothing in it is deleted: [`README.md`](README.md).

## overlays/densityField.ts

### The density field and the three drawing rules

A density field drawn behind the price action, on the candles' own price scale.

**Generic by construction.** What arrives here is a grid: per time slice, a set of price bands with
a weight each. Where the weight came from is the consumer's business and is not nameable from inside
this package — the boundary guard is the sensor for that, and this file is exactly the kind of file
that would fail it if the port were written around one particular meaning.

The drawing is the prototype's, ported, including the three things it learned the expensive way:

- **Column edges are snapped and shared.** The right edge of a column is the left edge of the next,
  so columns tile with neither a gap nor an OVERLAP. Overlap was the real defect: the fills are
  translucent, so an overlapping pixel composites its alpha twice and reads as a bright seam — the
  reported "whitish border".
- **One gradient per column, not one rectangle per cell.** Merging same-coloured neighbours into
  flat rectangles was the earlier performance trick and banding was its price. A gradient is
  smoother AND cheaper: a single fill per column.
- **Off-screen columns cost one conversion.** The official example maps every bar every frame.

The overlay draws `behind` the price action; drawing it in front was one of the two defects reported
against the prototype.

### Why faint clusters were invisible

The two knobs — `floor` and `gamma` — exist because faint clusters were invisible without them.

One large cluster crushes everything sharing its slice into the bottom of the normalised range — and
the bottom of the range is where a fixed `alpha = 0.62 * n**1.5` curve was steepest against them,
mapping a cell at 20% of the peak to `5.5%` alpha. Legible dimness and true absence looked identical.

Neither knob changes the DATA: both are monotonic in the normalised weight, so the ranking of cells
is untouched. They change only what is visible.

### Counted, not timed

`DensityFrameStats` counts frames rather than timing them. A frame count is deterministic and can be
asserted in a test; a millisecond reading is neither, and it would put a clock dependency in a
package that has none.

### The median gap

`toDensityColumns` derives each band's half-height from the MEDIAN gap between adjacent prices in
that slice.

The median, not the minimum or the mean: a grid with one doubled step (a hole, a rounding artefact
at a price boundary) would otherwise either shrink every band or inflate it, and both read as a
measurement the data never made. Slices with no positive weight are dropped rather than emitted
empty, and the result is sorted by time so the renderer's neighbour-sharing holds.

### useBitmapSpace is not a hook

The `biome-ignore` on the draw call answers a FALSE POSITIVE, and the reason stays written at the
site. `useBitmapSpace` is a method of the draw target of the base library's canvas API, not a React
hook: the rule matches on the name's PREFIX, and this class imports no React, is not a component and
never takes part in a render.

### Two stops per cell

Two gradient stops per cell — its top and its bottom — so a cell is a plateau and the transition to
the next one is the ramp between them.

## overlays/densityTuning.ts

### One declaration of the bounds

The prototype declared the tuning bounds twice — on the slider, and again in the schema that clamps
a restored workspace — with a comment asking the reader to keep the two in step. That is a defect
waiting for a careless edit: widen the slider alone and a saved file can hold a value the UI can
reach; NARROW it alone and a restored file holds a value the UI can never leave, because the slider
has no position that represents it. One declaration, read by the control and by the clamp, removes
the possibility instead of documenting it.

It sits beside the overlay rather than inside it because it is a rule about the VALUE, not about
drawing: the control that produces a tuning and the store that restores one both need it, and
neither of them draws anything.

### Why the type is re-exported

`export type { DensityTuning }` is re-exported from here on purpose. This is the module about the
VALUE — what it may be and how any value at all is made representable — so whoever needs the value
should not have to reach the module that DRAWS in order to name its type. Without this line, a
consumer of the rule would import the drawing layer just to write a signature.

## overlays/troughProfile.ts

### The trough never covers the live edge

A distribution profile drawn in a trough along one edge, never over the live edge.

**What changed from the prototype, and why.** The prototype anchored the profile at the container's
right edge and drew inward, which is where the newest bar and the price line live: the profile
covered the very thing the chart exists to show. The trough here is clamped against the live bar, so
it fills whatever room the right margin gives it and STOPS — and when there is no room it draws
nothing rather than covering the edge. Side, width and opacity are the consumer's to choose, and so
is the up/down colour pair, because fixing the western convention is wrong in half the world.

The level line is the same rule made explicit: it spans the plot as a level should, and SKIPS the
live column. Two rectangles instead of one, and the live bar stays visible.

### Spreading weight across the buckets

Weight is SPREAD across the buckets a bar spans, in proportion to the overlap, instead of being
dumped on the close. Dumping on the close is the common shortcut and it invents a spike at every
closing price — a feature of the shortcut, read by the eye as a feature of the market.

`buildProfile` returns `null` rather than an empty profile when there is nothing to build: bars
without volume, a degenerate price range, or no positive weight at all. An empty profile would
render as an absence of distribution, which is a claim the data did not make.

### The doji epsilon

A doji spans zero price; charging its whole weight to one bucket is right, and the epsilon
(`step * 0.001`) is what keeps the division defined while doing it.

### Growing the band outward

The band is grown outward from the control level, always taking the heavier of the two neighbours.

**Termination is by INDEX, not by `covered`.** An exhausted side reports -1, which loses every
comparison, so each pass always moves the side that still has room — and the loop condition is
exactly "at least one side has room". Relying on `covered` to reach the target instead would spin
forever on a run of zero-weight buckets, which is a real shape (a quiet price band).

### Resolving the direction pair

`troughStyleFor` applies the consumer's declared convention to the trough — the one place in the
render layer that draws direction, and therefore the one that has to be able to read the flip.

The COLOUR channel is what this resolves. The non-chromatic channel is already structural: the up
share grows from the outer edge and the down share continues beyond it, so the two are separated by
POSITION within the bucket whatever the two colours are — including when they are the same one.

### Why the default pair is written out

`DEFAULT_TROUGH_STYLE` is the western pair, ALREADY RESOLVED — and it is written out rather than
computed for a measured reason. This used to read `troughStyleFor(directionConvention({ … }))`,
evaluated at module scope, and a module-scope call is a call nothing can shake out: importing the
trough style dragged the convention validator, the resolver and the hex parser in with it, 88% of
the bytes for a value that never varies. The two triples in the file are exactly what that call
produced — `#26a69a` -> `38,166,154` and `#ef5350` -> `239,83,80` — and `test/troughProfile.spec.ts`
pins the equality against the call itself, so the literal cannot drift away from the convention.

The geometry is still referenced, not copied: duplicating those five numbers would be a second
declaration of one fact, which is the defect `densityTuning` exists to avoid. `troughStyleFor`
remains the way a consumer resolves any OTHER convention, including the eastern flip.

### Behind and clamped

The overlay draws behind the price action. A distribution is context for the candles, so it goes
under them — and `behind` plus the live-edge clamp are the two independent reasons it can never hide
a bar.

### Without a live edge the trough is unclamped

`setLiveEdge` takes the time of the newest bar. Without it there is nothing to protect and the
trough takes its full width — which is correct for a chart showing only history, and wrong to GUESS
for a live one.

### The lint false positive

The `biome-ignore` on the draw call answers a FALSE POSITIVE, and the reason stays written at the
site. `useBitmapSpace` is a method on the base library's canvas API draw target, not a React hook:
the rule matches on the name PREFIX, and this class does not import React, is not a component and
never takes part in a render.

### The live edge clamp

`outer` is the container edge the trough hangs from; `inner` is the boundary it grows to. The clamp
moves `inner` back toward `outer`, never past the live column — so the trough SHRINKS into the
margin instead of sliding over the newest bar.

### Why the available width is signed

The available width is SIGNED, not `Math.abs`. A live edge sitting past the container edge pushes
`inner` beyond `outer`, and an absolute value would turn that overflow back into room — drawing the
trough on the far side of the edge it was clamped away from, which is the opposite of the rule.

Below `MIN_TROUGH_PX` there is no trough left to draw, only a smear against the edge.

### Buckets lose a bitmap row

Each bucket's height is one bitmap pixel short: adjacent buckets otherwise share a row and the
translucent fills composite twice there, drawing a ladder of bright lines through the profile.

### Growth runs inward

Growth runs from the outer edge inward. On the right that puts the up share against the edge and the
down share beyond it; on the left the two swap, so both starts are stated.

### No hairlines

A zero-width segment is not rounded up to one pixel. A bucket that is entirely one direction would
otherwise still show a hairline of the other, which is a reading the data does not support — and at
these opacities a hairline is exactly what the eye picks up.

### The control line steps over the live column

The control line is a level, so it spans the plot — MINUS the live column, which it steps over.
Split into the two segments either side of the newest bar rather than stopping short of it: a level
that ends halfway across reads as a level that expired, and this one has not.
