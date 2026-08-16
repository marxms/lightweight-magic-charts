# Layout

Why the code under `src/layout/` is shaped the way it is: the height budget, the pane boxes and the
legend model.

> How this directory is read, and why nothing in it is deleted: [`README.md`](README.md).

## layout/application.ts

### The budget result is declared beside the budget

`StackPane` and `StackApplication` are the RESULT of applying the height budget, and they are
declared where the arithmetic that produces them lives.

These two shapes used to be declared in the render layer, beside the class that writes stretch
factors into a chart. That put the OUTCOME of the budget one layer above the budget itself, and the
cost landed on the composed surface: to read what the layout decided it had to stitch the two layers
together, and whatever the result did not carry it recomputed by calling the arithmetic a second
time. Declaring them in the layout layer inverts the direction — the render layer imports its own
result — so a consumer that already holds a `StackApplication` holds everything the layout decided.

Pure by construction: two type declarations and nothing else, so importing the layout layer still
pulls no chart, no DOM and no React.

### A zero-height container is reported, not applied

The `degenerate` variant exists because a container with no height is a real state, and the one
honest thing to do with it is to report it: writing factors derived from a zero budget puts every
pane on the 2px layout floor, and the recovery on the next resize then reads as a rendering bug.

### Field notes on StackPane and StackApplication

- `StackPane` — one indicator pane, as the caller declares it. The price pane is implicit and never
  listed.
- `StackPane.lastUsedAt` — higher is more recent. The lowest is evicted first when even shrinking
  cannot clear the floor.
- `StackPane.visible` — the consumer's own on/off. An invisible pane is collapsed and costs no
  budget.
- `StackApplication.collapsed` — collapsed for either reason: switched off by the consumer, or
  evicted by the floor.
- `StackApplication.order` — indicator panes, price excluded, in the order they now occupy below it.
- `StackApplication.ordered` — whether the reorder pass RAN. False means the pane widgets had not
  caught up with the model, the stretch factors were still written, and the caller should apply
  again on the next frame.

## layout/computeLayout.ts

### The height budget

**Why a budget and not direct heights — and it was MEASURED, not reasoned.** The base library's
`setHeight` does not set a height: it converts the request to a stretch factor and rewrites the
stretch factor of every OTHER pane to absorb the delta. Called in a loop it therefore undoes itself
— three requests for 90px produced `[236,122,122,89]`. And a factor is a RATIO, so a pixel target
does not survive a resize: the same factors at a larger container give `[457,137,137,138]` instead
of the `[599,90,90,90]` the user asked for. The only thing that works is to derive every factor in
ONE pass from a pixel budget and recompute on every resize.

**Why a price floor.** Nothing in the base library protects the price pane. With a 420px container
and three 90px indicators, the price collapses to 119px; keep going and it reaches the 2px layout
floor. Indicators hold their target while the only pane the user came for starves. So crossing the
floor is a decision, and the decision is stated.

**Why shrink before evict (the registered parity delta, 2026-08-11).** The first version answered a
crossed floor by collapsing the least recently used indicator outright. The prototype it replaced
never did that — its stretch factors compressed every pane together and nothing disappeared — and
the user feels the difference: fewer panes here, all of them there. The declared policy is now
two-staged: first every indicator pane shrinks PROPORTIONALLY, down to a per-pane legibility floor;
only when the budget cannot hold even that floor does the LRU eviction fire. Both stages are
reported — `scaled` for the shrink, `evicted` for the collapse — so neither reads as a rendering
bug.

The stage 2 gate is decided FIRST: eviction fires only when even every pane AT its legibility floor
cannot clear the price floor. Anything less starved than that is stage 1's (shrink) to solve.

### Where the legibility floor lives

The legibility floor is a PANE fact, and it now lives beside the other answer to "how low may a pane
go" — the clamp on a stored height, in `src/pane/budget.ts`. It was declared in the layout folder,
one folder away from that clamp, and the distance is what let the two drift without anyone reading
them together.

### Factors in pixels

Factors are expressed in PIXELS. That is not a shortcut: when the factors sum to the budget, the
base library's `stretchPixels = totalPaneHeight / totalStretch` is exactly 1, so every pane renders
at precisely the number it was given and the arithmetic is inspectable. The price pane is included
as the residual — it is the one pane that never declares a target.

### Deterministic eviction order

Least recently used first, so eviction order is deterministic. Ties break on id, because a layout
that depends on array order is a layout that changes when a menu is reordered.

### Shrink never grows

A pane already sized below the legibility floor keeps its own target as its floor: shrinking must
never GROW a pane the consumer sized deliberately.

### Stage 1 proportional shrink

The price is pinned AT its floor and the indicators share exactly what remains, every pane by the
SAME factor — except that no pane crosses its own legibility floor: a pane that would is pinned
there and the deficit is re-spread over the rest. Each round pins at least one pane, so the loop is
bounded by the pane count.

The other branch is the easy one: when the targets fit over the floor — or when nothing is left to
grant — everyone keeps their pixels and the price takes the residual.

### The reported shrink factor

The factor DIVULGED is the deepest one actually applied — a pinned pane sits higher, at its floor,
and reporting its gentler ratio would understate what the user is seeing.

### Emission order

Factors are emitted in the caller's original order, not in recency order: eviction is about WHICH
panes survive, never about where the survivors sit.

### renderHeights transcribed

`renderHeights` is the base library's layout pass, transcribed, so `computeLayout` can be checked
against the arithmetic it will actually meet rather than against its own idea of it.

Two properties that bite and are easy to forget: the LAST pane is never sized by its own factor (it
absorbs `total - accumulated`, so all rounding error lands there), and every pane is floored at 2px
— so with many collapsed panes the heights can sum to MORE than the budget.

### The zero stretch case

A zero total makes `stretchPixels` Infinity, and `0 * Infinity` is NaN — which then survives
`Math.max(NaN, 2)` and reaches the renderer as a height. Reachable whenever the price residual is 0
and a surviving pane declares a zero target, which nothing forbids. Every pane goes to the floor
instead: with no stretch to distribute, the floor is the only defined answer.

### Why collapsed panes sink

Collapsed panes sink to the end of the stack, preserving relative order within each group. This is
not cosmetic. A separator binds the two panes adjacent to it and, on drag, clamps BOTH to a 30px
minimum — so a collapsed neighbour is resurrected by the first pixel of drag and the pane being
dragged is rewritten to roughly half, in one jump. Hiding the row with CSS does not help: the layout
model still counts the pane and still hands its separator a live handle. Sinking is what guarantees
no separator ever has a collapsed partner.

### Field notes on the budget types

- `LayoutBudget.indicatorFloorPx` — when even every pane AT this floor cannot clear the price floor,
  eviction takes over.

## layout/legendModel.ts

### The legend prints what was measured

Which numbers the legend says is a MODEL decision, not a render one. The legend component positions
text and paints; nothing in it chooses WHICH reading appears, under which unit, or whether a pane
deserves a label. Those choices used to live inside a memo of the composed component, and that is
where the most expensive distinction in this library is at risk of being lost.

**The distinction: the legend prints what was MEASURED, never what was PLOTTED.** A mirrored series
is drawn below the reference line — the plotted value is negative on purpose — and its legend still
says the positive magnitude that was measured, because the negation is a DRAWING decision. Anyone
who wanted to "simplify" by reading the point the series carries would produce a legend reporting a
quantity nobody measured. The readings arrive here already loaded and never mirrored, and that is
why this module takes `readingsByPane` instead of the points.

**Each pane in its own unit.** An oscillator bounded at a hundred, an accumulation in the thousands,
a rate near zero and a count in the billions can be on screen at the same time, and one shared
format would make the legend disagree with the axis it names. The format comes from the pane; the
companion that asked for its own scale takes ITS format, for the same reason it was given the scale.

That is also why `LegendEntry.value` arrives already formatted by the PANE's format: a legend
formatting unlike its own axis lies.

### Too short to label

A pane too short has nowhere to fit a label, and drawing one would put it over the neighbour.
`MIN_LABELLED_PANE_PX` is the rule that leaves a collapsed pane anonymous instead of turning it into
a strip with text on top of it.

### Why LegendPaneView is local

`LegendPaneView` is the minimum the model needs to know about a drawn pane. It is declared here and
not imported from the React layer: this layer may not look upwards, and a whole `PaneView` would
bring height and recency along, which are budget business and not legend business.

### No empty lines

The legend's lines come out in the order they stack: the price first, then the panes in the order
the host declared. A pane with no box, or with a box too short, produces no line — and produces no
EMPTY line, which would be a blank label floating over the neighbour.

### Clamping the read index

The read index is clamped at both ends: it comes from a search that may not find the bar under the
cursor, and a window that shrank leaves the last known index past the end.

### A zero open has no change

A zero open has no defined percentage change, and dividing by it would produce an infinity printed
on screen as though it were a reading.

### Why the OHLC initials stay untranslated

The initials are a chart-reading convention and stay untranslated: in several languages the words
for high and low start with the same letter, which would put the same label on two different
readings.

### An em dash and never zero

An em dash and never zero: a zeroed rate is a tradable reading, and printing zero for a bar nobody
measured is the chart asserting what the data never said.

## layout/paneBoxes.ts

### Pane boxes before the DOM

This is the geometry of the first paint, and that of every test that runs without a layout engine.
It is DERIVED from the layout the stack has just applied, never guessed: the factors it wrote are
pixels, so accumulating them in the order the panes now occupy is the same arithmetic the base
library is about to run.

**Why this is the layout layer and not the component's.** The derivation lived inside the composed
surface, and from there it stitched TWO layers together: it took the budget's result — which was
declared in the render layer, a floor above whoever produces it — and re-ran the height arithmetic,
which belongs to this one. With the result brought down here, the two halves sit in the same layer
and the derivation now READS `StackApplication` instead of reassembling it: `priceHeightPx` and
`factors` are already what the budget decided, and nothing here recomputes any budget at all.

**`renderHeights` STAYS**, and it is not this layer's height calculation — it is the BASE library's
layout pass, transcribed, and what it answers is "what the base is going to draw with these
factors". Without it, the factors would be read as if the panes received the whole budget; they
receive what is left after the time axis takes its band, and the error ACCUMULATES downward until
the last pane's legend is drawn over the time stamps. That is the observable failure this module
exists in order not to commit, and deleting the call is committing it.

### The time axis band

`TIME_AXIS_PX` is the band the shared time axis takes at the FOOT of the surface, and it has a name
for a reason. The budget buys the whole surface, but the base library spends part of it on the time
axis row BEFORE dividing what remains among the panes. An estimate that ignores this rations the
panes over a budget larger than the one they actually receive. The value is `timeVisible` at the
default font — the measuring pass corrects the rest.

### Comparing boxes by content

Two box maps are compared by CONTENT and not by identity, because the caller uses the answer to
decide whether to swap state: a new map holding the same numbers on every measurement would repaint
every legend on every event. Key order does not count — a map does not promise it, and a pane's
position is in `top`, not in the iteration index.

### Deriving the boxes

`anchorDisplayId` undoes a rename: the stack files pane 0 under the library's own price id whatever
happens to be drawn in it, so with price withheld the handle called `price` is really the first
listed pane's. Reading the box back without undoing that would look for the anchor's legend under a
name nothing renders.

A pane with a zero factor gets no box AND does not displace the ones below it: it is collapsed, it
left the flow, and reserving a place for it would push every following legend one strip down.

### Reading the result, not recomputing it

The factors are READ from the result, not recomputed: `priceHeightPx` is the residual the budget
granted the anchor, and `factors` is what it granted each pane. A pane the order cites and the map
does not know is worth zero — it was evicted, and evicted is collapsed.
