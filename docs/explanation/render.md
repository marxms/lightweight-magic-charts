# Render layer

The reasoning behind `src/render/`: the pane stack, the series factory and the overlay bridge.

> How this directory is read, and why nothing in it is deleted: [`README.md`](README.md).

## render/overlayBridge.ts

### The overlay bridge

`Overlay` is bridged onto the base library's series-primitive contract here, and this is the only
file in the package that knows the base library has primitives at all. An overlay author writes
`draw(target, projection)` against this package's own two abstractions and never meets
`CanvasRenderingTarget2D`, `IPrimitivePaneView` or `PrimitivePaneViewZOrder` — which is what makes an
overlay portable and makes `attachOverlay(new MyOverlay(...))` the whole of the extension story
(no registry, no import for side effect).

The three base-library layers are mapped as `behind -> bottom` and `ahead -> top`; `behind` is under
the price action, `ahead` is over it.

### Anchoring is the point

The projection handed to `draw` reads price coordinates from the series the primitive is attached to,
and time coordinates from the chart's one time scale. Both defects reported against the prototype's
first heatmap follow from getting this wrong:

- a custom series on an overlay price scale is given the converter of ITS OWN scale, which auto-scales
  to its own extent, so the two axes slid apart on any zoom;
- series paint in creation order, so it covered the candles.

A primitive with `zOrder: 'behind'` on the candle series has neither problem by construction.

### Media pixels vs bitmap pixels

`widthPx`/`heightPx` and every coordinate a `Projection` returns are MEDIA pixels, because that is the
space the base library's converters answer in. The context is in BITMAP space. The two ratios
(`hRatio`, `vRatio`) are the bridge, and an overlay that forgets to multiply draws at 1/dpr scale on a
retina display — so the names carry the space, and the rule is stated once, in `toRenderTarget`.

### Live projection not a snapshot

The projection is built once per attachment and read LIVE. The scale converters are re-read on every
call rather than captured: `barSpacing` changes with every zoom, and a projection that snapshotted it
would draw this frame with the last frame's geometry. A getter is what keeps `Projection.barSpacing` a
plain readonly property to the caller while still being current.

### One piece of attachment state

`OverlayPrimitive` holds the projection and nothing else. Holding the attachment as well was
redundant — it was set and cleared in lockstep with the projection, so the extra `attachment === null`
clause in `renderer` could never be the one that fired. A mutation test proved it: breaking that
clause changed no behaviour, which is the definition of a check that is not checking anything.

### One view object per primitive

One view object is built for the lifetime of the primitive: the base library caches on array identity,
so returning a fresh array per frame would invalidate that cache on every frame.

`OverlayPrimitive` is structurally a series primitive. Every member of that contract is optional in
the base library, so the class declares the four it actually needs and nothing else. `updateAllViews`
is empty on purpose: the renderer reads through to the live projection, so there is nothing to
invalidate.

### Null renderer once detached

`null` is the contract's way of saying "there is nothing to draw", and it is the honest answer once
detached: drawing against a stale projection is how an overlay ends up painted at coordinates from a
scope that no longer exists.

### Attach and detach

`attachOverlay` attaches to whatever the overlay should be anchored to — the candle series for
anything that lives on the price scale — and gives the detach back, symmetric with `subscribe`.
It is idempotent: calling the returned function twice detaches once.

## render/paneStack.ts

### The pane stack policy

One chart instance, panes stacked, crosshair and time axis shared.

WHAT THIS IS NOT. It is not a pane implementation. The base library's v5 already has native panes
(`addPane`, `panes`, `moveTo`, `setStretchFactor`, `setPreserveEmptyPane`) and they already share the
crosshair and the time axis, because they belong to the same chart. Re-implementing any of that would
be building in parallel to the primitives instead of on top of them — and that is exactly where the
defensible scope of the package shrank.

WHAT IT IS. The POLICY the base library has none of, and the three pieces of it are the three things
that were measured to go wrong without it: one pass, a floor then shrink then eviction, and collapsed
panes sinking. Each has its own section below.

### One pass

`setHeight` does not set a height — it converts the request to a stretch factor and rewrites every
OTHER pane's factor to absorb the delta, so a loop of per-pane calls undoes itself: three requests of
90px produced `[236,122,122,89]`. Every factor is derived from the budget in a single pass by
`computeLayout` and written once.

The price pane is part of that same pass. Factors are pixels that sum to the budget, so the base
library's `stretchPixels` is exactly 1 and each pane renders at the number it was given.

### Floor then shrink then eviction

Nothing in the base library protects the price pane: at 420px with three 90px indicators it collapses
to 119px and keeps going. Crossing the floor first shrinks every indicator proportionally down to a
legibility floor (the registered parity delta — the prototype compressed, it never hid); only past
that floor is the least recently used indicator collapsed. And the consumer is TOLD, `scaled` and
`evicted` both.

### Collapsed panes sink

The stack applies the sinking; the layer that decides it is layout, and the measurement behind it —
what a separator does to a collapsed neighbour on the first pixel of drag — is in
[`layout.md`](layout.md#why-collapsed-panes-sink).

### Forwarded not declared

`StackApplication` and `StackPane` are FORWARDED, not declared. Both shapes are DECLARED one layer
down, in the layout layer that computes them; the re-export only keeps the class and the vocabulary of
its own signature reachable from one module, for callers that already import the stack. The dependency
runs one way — render to layout — and never back.

### Why collapsed stretch is not zero

`COLLAPSED_STRETCH` is not zero. A pane at stretch 0 contributes nothing to `totalStretch`, and a
stack whose factors sum to 0 makes the base library's `stretchPixels` division degenerate. A hair
above zero (0.0001) collapses to the 2px layout floor while keeping the arithmetic defined.

`COLLAPSED_STRETCH_CEILING` is ten times that: anything above it reads as "a real pane", whatever
rounding the base library did on the way.

### Preserve empty pane

`ensure` adopts pane 0 for the price and creates one for every other id. It is idempotent, so a caller
may call it for the same id on every render without growing the stack.

`preserveEmptyPane` matters more than it looks: a pane whose series are all hidden is otherwise
destroyed, and destroying one renumbers every pane below it. Every index this class holds would then
point one place too high, silently.

### The price pane is implicit

The price pane is index 0 and stays there. It is the one pane that declares no target height — it
receives the residual — so it is not a member of the list a caller passes in, and `apply` throws when
it is listed.

That throw answers a caller error, not a data condition: the price pane has no target height to
declare, and letting it through would enter it into the eviction sort as an ordinary pane. Loud beats
a silent filter, which would leave the caller believing it had configured something.

### The rainbow strip

`applyRowVisibility` takes collapsed panes OUT OF THE FLOW — the fix for the "rainbow strip".

A pane collapsed by stretch factor does NOT disappear: the base library's layout floor is 2px, and the
separator that precedes the pane adds another 1px, so every "hidden" pane leaves a ~3px coloured
sliver stacked at the bottom of the chart — N collapsed slots render as a strip of them. Panes live in
a `<table>`, so the honest fix (ported from the prototype's `applyRowVisibility`) is to take the row
out of the flow entirely, and the separator row that belongs to it with it.

The separator that PRECEDES a pane belongs to it. The first pane has none, and a real pane row is
never mistaken for one: separators are the only ~1px rows in the table, which is why the test is a
`getBoundingClientRect().height <= 2`. The price pane is the anchor and is never collapsed by this
class.

EVENT-DRIVEN by contract: the caller runs this after `apply` (and after the paint that reconciles the
pane widgets), never on a clock. Collapse is judged by the stretch factor THIS class wrote — the
model, not a measured height — so a pane created collapsed is hidden on its very first paint: empty
slots are born collapsed.

The return value says whether every managed pane had a widget to resolve; `false` tells the caller the
GUI has not caught up with the model yet and one retry after the next paint is warranted.

### Reorder or refuse

`reorder` applies the sunk order, or refuses to apply any of it.

`moveTo` asserts its target against the count of pane WIDGETS, which lags the model by a paint. A
half-applied sequence is worse than none — `moveTo` renumbers everything below it, so stopping midway
leaves the stack in an order nobody chose. The readiness of every pane is therefore read first, and
the whole pass is skipped when any widget is missing.

Stretch factors are NOT part of this bail-out: they are written straight into the model, which exists
from the moment `addPane` returns. Withholding them would leave the stack at its default factors until
a retry arrived, for no gain.

## render/seriesFactory.ts

### Creation once at mount

CREATE THE CHART, THE PANES, THE SERIES, THE TWINS AND THE SCALES — once, at mount.

This is the only part of the surface that talks to the base library, and it talks through the port.
While it lived inside a React effect, "what exists on the chart" was only readable by mounting a
component; here it is a function that takes declarations and returns handles.

### Every pane is created

This is the file's most expensive invariant. The stack models an invisible pane as COLLAPSED, never as
absent: destroying a pane renumbers every pane below it, so a surface that created and destroyed panes
as the user toggles them would hold indices that silently point one row too high. Creation is once
only; toggling rewrites the stretch factor and nothing else.

### Own format own margins

Panes do not share a unit, and the consequence of a single format is specific: the base library takes
the MAXIMUM axis width across every pane and applies the result to ALL of them, so one unformatted
pane widens the candle axis too, and the right-hand column then reads as a nonsensical range. That is
why the format comes down to the scale here, and not in a global chart option.

Indicator panes get a larger top margin than the price pane's — `{ top: 0.24, bottom: 0.12 }` against
`{ top: 0.12, bottom: 0.12 }`: the legend sits in that corner, and without the slack the first plotted
point is drawn underneath its own label.

Inside a pane, the pane's unit goes on the pane's axis. Every series of it shares that unit, which is
the whole basis on which the host decided they could share an axis.

### Where a companion sits

The bottom sixth, on a scale of its OWN — `{ top: 0.84, bottom: 0 }`.

A series declared in the price pane shares the pane and must not share the AXIS: a quantity in the
millions, on the candles' scale, flattens the price action into a line at the top. The own scale keeps
the candle axis intact, and these margins keep it out of their way.

`priceScaleId` names a SCALE and not a series, so giving an id to each own-scale companion is what
keeps two of them from sharing the same range — and omitting it entirely is what puts a study on the
candles' scale, where an overlay lives.

### The hidden twin

The hidden twin is born together with the series, in the other shape (line pairs with histogram, and
a shape with no pair gets none). Created NOW because a pane's series exist for the chart's whole
life — switching a series' shape later becomes a visibility flip, never a creation, which would
renumber panes.

### Seven handles born together

`ChartCreation` returns everything the creation produces in a single object. Seven handles that are
born together and die together: whoever receives them separately has to check seven nulls, and the
order in which they become ready turns into an unwritten guarantee.

### The attribution logo

The base library is Apache-2.0 and its licence requires this mark to stay on screen. It is set HERE,
inside the package that depends on it, so that a consumer assembling its own options cannot omit it by
accident.

### The adopted pane zero

Pane 0 is ADOPTED, never created — and what lives in it is this surface's decision. The anchor does
NOT go through `ensure`: `ensure` calls `addPane` for everything that is not the base library's price
id, which would leave pane 0 empty and put the anchor one row below.

### The reference line

It is the one thing about a pane a host can redeclare after mount, and that is why it is reconciled
from outside.
