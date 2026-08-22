# React surface

The long-form reasoning behind `src/react/surface/` — the composed drawing surface, its prop groups,
and the hooks it is cut into.

> How this directory is read, and why nothing in it is deleted: [`README.md`](README.md).

---

## react/surface/ChartSurface.tsx

### The composed surface

The workspace's drawing surface is ONE chart, the native v5 pane stack, and our layout policy on
top. **This is the composed interface, and it lives here on purpose.** An earlier cut put only the
browser-free primitives in this package — the layout budget, the density field, the profile — and
left the composition in the consuming application. The result was a shell: panes stacked with no
legend, one axis serving every unit, and none of the header, menu, drawing or tabs. Everything in
this module is generic; what the host injects is its own catalogue (`PaneSpec`/`SeriesSpec`), its
own readings, its colour convention, and the chart engine.

**Why the height arrives as a prop and is never measured from the viewport.** The prototype's root
is `height: 100vh` and it hands the base library `autoSize: true`. Embedded as a section of somebody
else's page that is wrong twice over: it claims a viewport it does not own, and `autoSize` against a
flex parent with no resolved height reports zero, which puts every pane on the 2px floor. Here the
host declares the budget, the budget is what `PaneStack` divides, and a zero budget is REPORTED
through `onLayout` rather than rendered.

**Why every pane is created, including the hidden ones.** `PaneStack` models an invisible pane as
COLLAPSED, not as absent, and a toggle only ever rewrites stretch factors — see
[`render.md`](render.md#every-pane-is-created) for what destroying one would cost.

**Why each pane carries its own format and its own scale margins.** Panes do not share a unit — an
oscillator bounded at 100, a running total in the thousands, a rate near 0.00008 and a count in the
billions can all be on screen at once — and one shared `toFixed(2)` produces a specific failure: the
base library takes `Math.max` over every pane's axis width and applies the single result to ALL of
them, so one unformatted pane widens the candle pane's axis too, and the shared right-hand column
then reads as one nonsensical range. `PaneSpec` has declared a `format` all along; this is where it
reaches the axis. `referenceLine` lands here for the same reason: a signed histogram without a
marked zero, or a ratio without a marked parity, is a shape with no eye-line to read it against.

### SeriesReader re-export

`SeriesReader` IS DECLARED WHERE IT IS CONSUMED — in `surface/useSeriesData.ts`, which is what calls
the function — and re-exported from `ChartSurface.tsx` because the name has been public for as long
as the surface has existed. A second declaration of the same signature would diverge from the first
the day one of the two gained a parameter, and the silent side is the one nobody notices.

### What the chart draws

One prop group per SUBSYSTEM, and it is the same cut as the modules in `react/surface/`: what fails
together travels together. The surface was born with twenty-eight loose props, and twenty-eight
names at a JSX site are not an interface — they are a list nobody can read all the way through, in
which a new prop never costs anything and is therefore never discussed. The ceiling of twelve exists
to make that cost visible, and grouping is the way to pay it without losing a single value.

The `SurfaceLayout` group is the space budget and the report of what was done with it: `heightPx` is
the budget the host offers, and it is NEVER the viewport. `SurfaceLabels` exists because the canvas
has no readable content of its own, so it is labelled and described. `SurfaceAppearance` holds what
is an appearance choice and nothing more — none of its fields changes what is drawn.
`ChartSurfaceProps.engine` is how to make a chart, the one value the port cannot carry (see
`port/chartApi.ts`); `convention` is which colour means up and what else carries direction, never
hard-coded here; `overlays` are attached to the anchor series, so they share its price scale by
construction. `seriesStyleKey` is the public spelling of a `seriesStyles` key — one function, so
host and surface cannot disagree.

`priceCaption` is what the price legend calls the market it is drawing: the host names it, and this
never guesses. `priceMarkers` are marks drawn on the price series (candle patterns), sorted
ascending by time — the base library asserts on that and the surface passes them through, it does
not re-sort.

The default budget is `{ priceFloorPx: 180, defaultPaneHeightPx: 90 }`.

### Omitting the price pane

`SurfaceData.pricePane` is the price pane's own spec, and omitting it draws no price at all.

Pane 0 is not inherently the price pane — it is the first pane, and the one `PaneStack` hands the
residual budget to. With price withheld (a host migrating one pane at a time, with another chart
still drawing candles) pane 0 goes to the first listed pane instead, which then plays the anchor's
role: it absorbs the residual and is the pane the floor protects.

### The shape pair at mount

`SurfaceData.seriesStyles` maps series -> chosen shape, keyed by `seriesStyleKey(paneId, seriesId)`.

Every line/histogram pane series is created TWICE at mount — its declared shape and a hidden twin in
the other one — so switching style is a visibility flip, never an `addSeries` at runtime (which
would renumber panes). An entry naming the twin's shape shows the twin; any other value (or none)
shows the declaration.

### Dataset identity

`SurfaceData.datasetId` is the bar set's IDENTITY — and the only thing that tells "another market"
from "one more bar".

`bars` arrives as a new array in both cases: when the host switches instrument (an entirely
different window, in another price range) and when a live candle closes (the SAME window, one item
longer). The surface has no way to decide which is which — comparing times gets it wrong at the
moment the window slides — and getting it wrong has a price both ways: not rescaling leaves the
chart on the previous instrument's window; always rescaling destroys the zoom the user chose, on
every tick.

The one who knows is the host: it is the one that switched the scope. This string changed = set
REPLACED, and the scale is redone once. Same = set extended, and the window is the user's. Omitted,
the scale is done only when the first window arrives.

`SurfaceData.autoFit` is the neighbouring choice: keep the whole content on screen at every bar
update. Off by default, because the window is the user's as soon as they move it. On, it gives that
up in exchange for never losing sight of the most recent candle.

`PaneView.lastUsedAt` is higher for more recent, and decides which pane the price floor evicts
first.

### Grid lines

`SurfaceAppearance.gridLinesVisible` defaults to visible; a consumer painting a full-bleed
background field turns them off so the rules do not read as part of the data. The lib takes a
boolean and stays ignorant of WHY — it has no notion of heatmaps or density.

It is applied reactively, not at mount time: the consumer toggles its background field while the
chart is alive, and grid rules drawn over a full-bleed field read as data that is not there.

### Declarative price levels

`SurfaceAlerts` is the user's own price levels, DECLARATIVELY.

`PriceAlertLines` has been published since the render layer landed and no consumer could build one:
it needs a `SeriesHandle`, and the handle belongs to the chart this surface creates and never hands
out. Passing the levels instead of the handle keeps the state where React can see it — and keeps the
drag, which is a gesture on THIS canvas, on the side that owns the canvas.

`onChange` fires when a level is dragged to a new price; the host is the owner of the list.
`onCrossed` fires once per crossing, never once per bar, because `observePrice` reports side
TRANSITIONS.

### The drawing seam prop group

`SurfaceDrawing` is the drawing seam. The layer needs the chart, the anchor series and the canvas
host — all owned by this surface — so the surface attaches it and the CONSUMER implements it (see
`drawingLayer.ts` for why the implementation is not this package's). It requires the price pane:
drawings are priced off the candles' scale.

`activeTool` is the armed tool, owned by the host exactly as the toolbar's `activeToolId` is.
`onToolFinished` fires when a creation gesture completed — the host disarms the tool, like every
charting app does.

### Destructured at the door

The prop groups are destructured at the door, and these are the fields that go into every dependency
list — never the groups. A literal written by the caller has a new identity on every render of its
own, and depending on the group would re-run every effect per host render. It is the chrome
provider's lesson, applied to the only other interface in the package big enough to need it.

### The seven handles

The seven handles are published as ONE value of state.

Every effect below the mount reads one or more of them and gives up on null. That used to work
because the mount effect is declared FIRST and React runs effects in declaration order — a guarantee
made of position, which does not survive the mount moving to its own file. Declared as a dependency
instead, it survives any order. See also
[Why seven refs do not work](#why-seven-refs-do-not-work).

### The pane list is fixed at mount

The pane list is fixed at mount (see [The composed surface](#the-composed-surface)): the mount
effect reads it through a ref so a re-render with a new `lastUsedAt` never rebuilds the stack. The
same holds for everything else the mount effect touches — it runs exactly once, and a stale closure
there would be a chart built from the first render's props for the rest of its life.

`onLayout` is held by ref for the neighbouring reason, never as a dependency: a host writing
`onLayout` inline hands over a new function on every render, and as a dependency that would re-run
the entire layout pass on every render of the host.

### Which pane occupies pane 0

`PaneStack` files pane 0 under the library's own price id whatever is drawn in it, so with price
withheld the handle named `price` is in fact the first listed pane's. Reading a measured box back
out means undoing that rename, or the anchor's legend would be looked up under a name nothing
renders. That is what `anchorDisplayId` is.

The geometry hook returns `measure` for the budget application, `hovered` — the store only the
legend subscribes to — and `publishHovered`, the callback the mount hands to the base library's
crosshair.

Overlays ride the anchor series' price scale, so they cannot drift from it under any zoom.

The legend receives the MEASURED geometry when there is DOM, and the one derived from the layout
when there is not. Which of the two counts is a geometry question, so it is answered in
`ChartSurface` and the legend receives a single map.

### Width observed, height declared

`autoSize` is off because it governs BOTH dimensions and the height must stay authoritative — it is
the budget the pane layout is computed from, and a parent flex box momentarily reporting 0 would
drive every pane to the 2px floor. But turning it off also dropped the width tracking that came with
it, so the canvas kept whatever width it was born with: the surface stopped filling its container,
and switching to the grid layout left the focus chart painted OVER the cells instead of shrinking
beside them.

Observing width alone restores the fill without handing the height back. Zero-width observations are
ignored for the same reason `autoSize` was refused; the callback is batched through a frame because
a synchronous `applyOptions` inside the callback re-enters the observer. The frame reads the
SYNCHRONOUS view of the handles, for the same reason as the alert drag: the frame runs later, and
what counts is the chart as of then.

The surface is the positioned box, because the legend is laid out against ITS top edge. The budget
is spent there, on the whole surface, so the legends cannot push the canvas past it.

### The surface may shrink in both axes

The root box declares `minWidth: 0` for the same reason it declares `minHeight: 0`, and the width
half was missing until the compact grid proved it.

As a flex item, this box defaults to a minimum of its own content, and its content is a canvas the
base library sized to the room it had a moment ago. That makes the minimum a RATCHET: once the
canvas is wide, the surface cannot be asked to be narrow, so a sibling column that appears later
has nothing to be given. Measured on the deployed build, with the compact grid switched on: the
surface kept 1058 px of a 1100 px row and the grid was left 0 px wide, cells mounted and drawing
into canvases 0 px across.

`minWidth: 0` is what lets the row take width back. The observer in "Width observed, height
declared" then re-measures and the canvas follows — the two clauses are halves of one mechanism,
and neither works alone.

### The canvas and assistive technology

The canvas is invisible to assistive technology — no nodes, no text, no focus. The role and the
description are what make the state readable at all. `role="img"` stays on the CANVAS host and not
on the box around it: `role="img"` prunes its subtree, and the legend text is the one part of this
surface a screen reader can actually read.

---

## react/surface/SurfaceLegend.tsx

### Why the legend is its own component

Crossing a bar changes one text, and only the legend's text. While the bar under the crosshair was
surface state, that change re-rendered the component that composes SIX subsystems in order to update
one label. Subscribing here, the one that re-renders is this component: the producer notifies, React
reconciles this subtree, and the surface is not touched.

### It composes and does not draw

The drawing stays in `WorkspaceLegend`; what lives in `SurfaceLegend` is the decision of WHICH bar
the legend speaks for and the model derived from it. It is the boundary that keeps `WorkspaceLegend`
ignorant of the crosshair, of the bars and of the catalogue.

`boxes` is where each pane sits: measured from the DOM when it exists, derived from layout when not.
`pricePane` omitted means no price drawn, and no price line. `hovered` is the bar under the
crosshair as an external store, subscribed HERE and nowhere above.

The third argument to `useSyncExternalStore` is the server snapshot, and it is the same value:
in a render with no DOM there is no crosshair at all and the legend speaks for the last bar.

`indexByTime` exists so the crosshair's answer becomes a lookup instead of a scan.

### The bar the legend speaks for

The bar the legend speaks for is the one under the crosshair, or the LAST one at rest.

At rest the prototype prints em-dashes. A chart whose numbers only appear on hover is a chart that
says nothing in a screenshot, and the last bar is the reading a reader is actually after.

---

## react/surface/chartHandles.ts

### Why seven refs do not work

The mount creates seven things at once: the chart, the pane stack, the candles, the anchor series,
the series map, the price scales and the alert layer. Every effect that comes after reads one or
more of them and gives up when it finds null.

While everything lived in a single file, "the handles already exist when this effect runs" was true
by POSITION: the mount is declared first, and React runs effects in the order they were declared.
The moment the mount moves out into one file and a subsystem into another, the order inverts — a
child's cleanup and effect run BEFORE the parent's — and the guarantee vanishes without anything
turning red. A ref is also not reactive: whoever reads `ref.current` inside an effect with an empty
dependency array reads the first commit's value and never again.

Published as STATE, the seven become a DECLARED dependency: an effect that needs them puts them in
the array and React re-runs it when they arrive. It costs one extra render on mount — one only,
because publication happens once — and zero per frame, because the object's identity does not change
while the chart is the same one.

### And why a synchronous view also exists

Teardown is not a reactive question: in strict mode's double cycle React runs the mount, then the
cleanup, then the mount again — all in the SAME commit, before any state update has been applied. A
cleanup that read the state would read `null` and leave the first chart alive forever. The
synchronous view holds the value publication wrote at the very instant it scheduled it, and it is
the only way for teardown — and for any work scheduled for a future frame — to see the chart that
counts NOW.

`LiveHandles` is that synchronous view, and it is never read during the render: that is the state's
job. `PublishHandles` publishes on mount and zeroes on teardown — one writer only, so the two views
never disagree.

### One declaration, two layer names

The render layer calls `ChartCreation` "what the creation produced"; the surface calls it "the
handles the surface holds". They are the same object, and redeclaring the shape in
`chartHandles.ts` would be the second declaration of one fact — which is how the producer and the
consumer of the same object start disagreeing about it.

---

## react/surface/useChartMount.ts

### The mount runs exactly once

The surface mount is the effect that creates everything, subscribes the crosshair and publishes the
handles.

Everything it touches arrives through a latest-read ref, and not through a captured prop, because
one more dependency here would not re-run an effect: it would create a second chart. A stale closure
in this place would be a chart built with the first render's props for the rest of its life, and
that is why the inputs are refs and the list is empty.

Everything the base library hears at mount happens in a single call, in the render layer. What is
left in this hook is the React half: keeping the handles, subscribing the crosshair, and declaring
what the unmount undoes.

THE PUBLICATION GOES LAST, when everything already exists. An effect that depends on the handles
never sees half a chart.

### What the mount does not do

It does not remove the chart. The cleanup here unsubscribes the crosshair and empties the
collections THIS mount filled, and stops. Removing the chart belongs to the unmount, which is
declared last on purpose: React destroys the cleanups in the order the effects were declared, and
the mount is necessarily the first, so a `remove` here would tear the chart down BEFORE the overlay
primitives and the drawing layer let go of it.

Emptied are the two collections THIS MOUNT created, and not whatever state points at when the
cleanup runs: a remount publishes a new object, and clearing the new one would erase the chart that
has just been born.

The `eslint-disable-next-line react-hooks/exhaustive-deps` covers exactly that: mount-only, because
the chart instance outlives every prop and data and layout are separate effects. The inputs are refs
and callbacks of stable identity, so the list is what it looks like — this effect runs once.

### The mount spec is derived, never retyped

`ChartMountSpec` is what creation needs to know, read at the instant of the mount and never after.
It is DERIVED from the factory's input, never retyped: it is that input minus the two things only
the mount knows — the host element and the pane list. Redeclaring the six fields would be the second
declaration of one contract, and the day the factory gained a seventh this list would stay silent.

### Positional, not an options object

`useChartMount` takes positional parameters and not an options object. A literal per render plus the
destructuring inside cost output bytes in an entry that already runs at the ceiling, and this hook
has a single caller — the readability an object would buy is paid for here by the parameter names.

`hostRef` is the host element. `specRef` and `panesRef` are LATEST-READ refs and never props,
because this effect must not re-run. `onHoveredTime` receives the bar under the cursor — it changes
once per bar CROSSED and not per pixel moved, and the values themselves are read in the render.

THIS MOUNT CANCELS NOBODY'S FRAME. It used to cancel the re-measurement's repair frame, which is
scheduled in another effect — two distant blocks joined by a ref, correct only while they lived in
the same file. Whoever schedules now returns the disposer, and cancels in its own scope.

---

## react/surface/useChartTeardown.ts

### Declared last on purpose

React destroys effect cleanups in THE ORDER THE EFFECTS WERE DECLARED. The effect that CREATES the
chart is necessarily the first one — everything else hangs off it — so, while `chart.remove()` lived
inside it, it was the FIRST thing of the unmount: the overlay primitives and the drawing layer
detached, right after, from a chart that no longer existed.

And detaching from a dead chart is not harmless. Unhooking a primitive makes the base invalidate the
WHOLE chart, and that invalidation is scheduled on a frame — which runs later, when the canvases
have already been discarded, and blows up from inside the frame itself, out of reach of any
`try/catch` in the unmount.

A separate hook, and not a guard in each consumer, because the guard would have to exist inside the
drawing package too, which is not ours. The ORDER is React's, and this is where it is declared:
nothing on this surface touches the chart after this line.

**This used to be a comment, and became an assertion.** While everything lived in a single file, the
guarantee was the block's position in the text and the only proof was the prose explaining it.
`useChartTeardown` being the LAST hook of the surface is now checked by test, and so is the order in
which the door is crossed.

### Zeroed before removing

The cleanup reads the SYNCHRONOUS view, never the state: in strict mode's double cycle the cleanup
runs in the same commit as the mount, before publication has been applied, and the state would still
say `null`.

The handles are ZEROED BEFORE REMOVING, and that order closes a real window: between the removal and
the next publication, any read would find handles pointing at an already destroyed chart — the very
defect teardown exists in order not to commit, reintroduced by propagation.

---

## react/surface/useDrawingSeam.ts

### Attached once per binding

The drawing seam is the one place in the package where the consumer hands in an implementation. The
layer needs three things only this surface has: the chart, the anchor series and the canvas element.
That is why the surface is what ATTACHES it, and the consumer is what IMPLEMENTS it.

It attaches ONCE PER BINDING, and the events reach the host by REFERENCE. The layer holds the user's
drawings; reattaching because of a new callback identity would lose them, and a host that writes
`onDrawingCountChange` inline hands in a new function on every render.

`DrawingSeamEvents.onToolFinished` fires when a creation gesture finished — the host disarms the
tool, as every charting app does.

### No candles, no drawing

A drawing is priced by the candle scale, so with the price pane withheld there is nothing honest to
pin the layer to — and mounting with no binding at all, with the tool already armed, is inert by
construction and not an exception to handle.

### The push is deduplicated

The push is deduplicated against what the attach already delivered. The layer hears each armed tool
ONCE, which lets an implementation reset gesture state on every call without losing any. `undefined`
in what-was-sent means "there is no layer to hear it", and never a valid tool value — that is why it
is not `null`, which is the value for "no tool armed".

The tool armed BEFORE the layer attached still arrives: state is pushed on attach, not assumed lost.

---

## react/surface/useLayoutApply.ts

### The orphaned frame

`useLayoutApply` applies the budget: height for the chart, target heights for the stack, and the
re-measured geometry.

The orphaned frame is the defect this file exists in order not to have. Re-measurement schedules
work for the next frame, and while everything lived in a single file the cancellation of that frame
lived in the MOUNT's cleanup: two distant blocks, joined by a ref, and correct only because they
were in the same file. Separated, the mount's cleanup runs FIRST — it is the first effect declared —
and the pending frame outlives it to run against an already-removed chart.

The fix is one of shape, not of guard: re-measurement RETURNS A DISPOSER. Whoever schedules is
whoever cancels, in the same scope, and there is no longer a ref that a third party has to remember
to clear. The disposer is cancelled in this effect's cleanup and nowhere else; without that line the
frame the measurement scheduled would outlive the effect and run against a removed chart.

The pane widgets are reconciled on the next frame, so the geometry is read AFTER it — and not on a
clock, which is what the prototype needed only because it never had this event.

### The layout report arrives by reference

`onLayout` is a prop, and a host that writes it inline — the common case — hands over a new function
on every render. As a dependency, that would re-run `stack.apply` on every host render: a whole
layout pass, plus a re-measurement, per keystroke in a text box anywhere on the page. By reference,
the report keeps arriving and stops being a trigger.

`useLayoutApply` is POSITIONAL for the same reason as the mount: a single caller, and an options
literal per render costs output bytes in an entry that runs at the ceiling. `measure` returns a
disposer — that is the signature that closes the orphaned frame. `onApplied` is the local state that
keeps the result; `onLayoutRef` is the report to the host, by reference. `LayoutPaneView` is what
the budget needs to know of a pane: the target, the recency and the consumer's switch.

### The anchor is withheld from apply

The anchor is withheld from `apply` exactly as the price pane is: it declares no target, takes the
residual, and is the pane the floor protects. Listing it would put it in the eviction ordering and
let the pane the chart is anchored on be the collapsed one.

---

## react/surface/usePriceAlertLayer.ts

### Three effects, one module

Reconciling levels, dragging one of them and announcing the crossing are the same feature seen from
three sides: the drag produces the list the reconciliation receives back, and the crossing is a
reading of the same lines object. Splitting them would be three owners of a single state.

The last close is the reading a level is judged against — crossings only, never a level of.

`usePriceAlertLayer` is positional, like the mount and the layout application: a single caller, and
no pair of parameters of the same type that could be swapped silently. `hostRef` is the canvas
element the gesture happens over. `handles` comes in as a declared dependency because the
reconciliation and the observation are reactive; `live` is the synchronous view, and exists for the
gesture's listeners.

The change callback is held BY REFERENCE: reporting a finished drag must not re-run the effect that
installs the listeners, or a host with an inline function would rewire them on every render —
mid-gesture.

### The drag goes on capture

The drag goes on capture, and that is the line the whole feature depends on. The chart registers its
own panning handler on THIS same element and wins in the bubble phase. Capture is what lets a click
that lands on a level move the level instead of the framing; a click that lands anywhere else is not
interrupted, so panning keeps working where it should. Swapping capture for bubble breaks nothing
visible on mount: it breaks the drag, and only when somebody tries to drag.

The move and up listeners go on WINDOW, not on the host: a drag that leaves the canvas must still
track and still end, and a mouseup released outside would otherwise leave the chart pinned with
panning disabled. The listeners are wired ONCE — the inputs are refs of stable identity, and the
linter refuses refs in the dependency list.

And the listeners READ THE SYNCHRONOUS VIEW, never `handles`. They are wired once and run during a
gesture. A chart swapped in mid-drag would be read by the old listener if it had captured the
object; the synchronous view always asks which chart is the one of NOW.

### Reconciled only when the set differs

The declared levels are reconciled onto the drawn ones, and rebuilt only when the SET differs: a
drag emits the levels it just produced, which comes back as a new prop, and a rebuild on every one
of those would destroy the line under the pointer mid-gesture.

---

## react/surface/useReferenceLines.ts

### The eye-line is reconciled, not created once

A histogram hides the absence of a reference line because it already draws from a zero base; a LINE
pane has no such cue, which is why a crowding ratio forces the issue — without a mark at parity a
reader cannot tell one crowded side from the other. The line is anchored to the pane's FIRST series
so it belongs to that price scale and to no other; a pane with no series has no scale to hang it on.

Panes and series are created once, at mount, because destroying a pane renumbers every pane below
it. The reference line is different in kind: a host may hand the same pane to a study bounded at
0..100 and then to a signed one, and the eye-line that was right at 50 is then wrong at 50 — a
dashed line at a level nothing means reads as deliberate, which is the worst way for it to be wrong.
So the line is RECONCILED against the declaration on every change: removed when the pane stops
declaring one, replaced when the value moves, and left strictly alone otherwise.

`DASHED` is the base library's `LineStyle.Dashed` as an ordinal, because the enum is a value we
cannot import. `PaneReference` is one pane's eye-line resolved to the series that carries it, with
`price` undefined meaning none declared.

### The key is the dependency

What the effect watches is the DECLARATION, NEVER the `panes` array. A host that rebuilds the pane
objects on every render — to rename a series, say — would make this effect tear down and redraw a
line that did not change; in a chart that re-renders on every cursor movement, that is one
remove/create pair per pixel flown over. So the declaration is reduced to a KEY, and the key is
sorted: reordering the stack moves no pane's eye-line.

That is the deliberate deviation, and it is the reason this hook exists: `panes` is what the
function READS, and the key is what decides whether the result CHANGED. Declaring `panes` would
recompute the list on every render of the host and return a new identity — precisely the
remove/create pair per pixel flown over. The key is derived from `panes` by a pure function in the
same render, so it never goes stale: every change of declaration shows up in it, and the test
asserts both sides of that. This is what the `biome-ignore` on `useExhaustiveDependencies` records.

**And the key memoizes, it does not write to a ref during the render.** The previous form kept
`{ key, list }` in a ref and OVERWROTE it in the component body when the key differed — a render
that writes to a ref and reads the result in the same render is the pattern React's documentation
marks as unsupported, because the render may be discarded or repeated and the ref does not go back.
`useMemo` says exactly the same thing with the mechanism React does support: it recomputes when the
key changes, and returns the SAME reference while it does not.

### The colour comes by ref

The colour comes by ref, and the reason is to preserve what already held. The effect watches the
DECLARATION; the theme's colour was never in its dependencies, so switching themes never redrew an
existing line. Declaring it now would tear down and recreate every eye-line on every theme switch —
a change of behaviour this task did not ask for.

---

## react/surface/useSeriesData.ts

### Framing lives inside the effect that writes

The base library frames what the series hold at the INSTANT of the call. Framing before writing
frames the previous market: the user switches asset and sees the old asset's window, with the new
candles squeezed against the floor. While it all lived in a single file this was guaranteed by
POSITION — the framing block was the last of the data effects, and the comment said out loud that
its position in the file WAS the guarantee. Position does not survive an extraction: someone need
only declare this hook before another that writes data, and the order inverts with nothing going
red. Here it is one line after the other, inside the same body, and the order is the program's.

The framing runs AFTER every `setData`, in the same body. With no bars there is nothing to frame,
and marking it as framed at that point would make the first real window arrive in silence.

### The two scales

This is where an earlier fix stopped halfway. `fitContent()` belongs to the TIME axis. The PRICE
axis has its own autoscale, and the base library turns it off permanently on the user's first drag
over it (`PriceScale._internal_scaleTo` -> `setMode({ autoScale: false })`, and the gesture ships
enabled from the factory). With the scale disarmed, `Pane._internal_recalculate` returns on its
first line and the range stays where it was. Reasserting `autoScale` is what the base library itself
does on the axis double-click, and it goes BEFORE `fitContent`: reframing time recalculates, riding
along, every scale ARMED at the instant it is applied.

### What this module does not carry

The alert-crossing notification was driven by `bars` and so it looked like a data effect; it is not.
It reads the alerts layer, talks to the owner of the levels and fails together with the drag in
capture, not with `setData`. It left here and went to the alerts side, where it fails together with
what it is.

### Raw readings and the declared drawing

`SeriesReader` returns one series' RAW readings, one entry per bar, `null` where nothing was
measured. Raw: the host looks a number up, and that is all. Everything the `SeriesSpec` declares
about how that number is DRAWN — carried across a gap, mirrored below the reference line, coloured
by sign — is applied in this package, because those flags are this package's vocabulary and
splitting their meaning across the boundary is how two implementations of the same flag start
disagreeing.

Inside the write effect, mirroring, sign colouring and bar-direction colouring are DOMAIN vocabulary
and are applied by `domain/readings.ts`. What is left in the hook is the writing. The twin carries
the SAME readings, so flipping style never waits for a data pass.

`SeriesDataPaneView` is what the data path needs from a pane: its declaration, and nothing more.
`ReadingsByPane` is readings already carried, by pane, in the series' declaration order.

### An options object, unlike the mount

`SeriesDataInput` is an options object, unlike the mount and the layout application — and the reason
is measured in risk, not in bytes. These are ten values, six of them optional and two of them
adjacent `string`s (the two directional colours): in a positional list, swapping two of them
compiles clean and draws the market inverted. The fields are destructured on entry and it is each
one of them that goes into the dependency lists, never the object — a literal written at the call
site has a new identity on every render, and depending on it would re-run every data write per host
render.

`panes` is the host's panes without the price one — the list the shape pair walks. `pricePane`
omitted means no price drawn; present, it goes in front so it is read along with the rest.
`datasetId` is the dataset's IDENTITY: changed = dataset replaced, and the scale is redone once.

The price pane is withheld from `panes` because it is withheld from the LAYOUT — it takes the
residual instead of a target height. Its series still have to be read, drawn and reported, so the
two lists are separated in `dataPanes` rather than by asking the host to send price twice.
`fittedRef` holds the identity of the dataset the current window frames; it is a ref, and so outside
the deps.

### UNFITTED

`UNFITTED` means "no dataset framed yet" — a value that NO `datasetId` can equal, `undefined`
included. With `null` or `undefined` as the initial state, a host that declares no identity would
never frame the first window, and a chart that opens showing a handful of the 800 candles it fetched
looks broken.

### The legend speaks of the measured numbers

`useSeriesData` writes everything the chart draws and returns the CARRIED readings for the legend.
The legend speaks of the MEASURED numbers, not the plotted ones — what was mirrored below the
reference line is drawn with the sign flipped and is still read with the sign the host measured.
That is why what leaves here are the carried readings, and not the points.

### The shape pair applies to the pair only

The shape pair decides which of the two members is on screen. It is applied to the PAIR only: a
shape with no twin (candles, area) has nothing to flip, and an entry naming anything but the twin's
shape leaves the declaration in force — a stored style from an older catalogue must not blank a
series.

Pattern marks ride the candle series. An absent prop means the feature is unused, never a clear.

### A study marks its own series

`seriesMarkers` is keyed by `seriesStyleKey`, so a study's arrows and dots land on the study's own
series rather than on the candles. That is a correction, not a preference: the vendor's own reference
implementation pins every mark to the price pane, so an oscillator's signal lands on a scale it was
never measured against.

The effect depends on the MAP and not on the bars. Measured on this catalogue, the worst frame
carries about 7,400 marks across six chosen studies; a dependency on the window would resend every
one of them on every tick, where a dependency on the map resends them only when they change.

The door is optional on the port, and MARK-02 makes that a behaviour rather than an oversight: an
engine that does not implement `setMarkers` draws the study's lines and offers no marks. The
measured hazard is the opposite one — an engine that appears to implement it. `ISeriesApi` in
`lightweight-charts@5` has no such member (it lives on `ISeriesMarkersPluginApi`), so a host that
returns the raw series has a door that swallows every call in silence. A test double that implements
what the real object lacks turns that silence green, which is how the 0.2.1 pattern marks shipped
without drawing.

---

## react/surface/useSurfaceGeometry.ts

### The geometry does not run on a clock

Two things live in one module because both are the same question asked of the browser instead of of
the model: the real geometry of the rows and the real position of the pointer. Neither is derivable
from what the surface declared.

The prototype re-read the boxes on a 400 ms timer because the base library emits no layout event.
The timer was never the mechanism — it is a stand-in for the two things that actually move a pane:
our own budget application, and the user dragging a separator. Both are events, and both subscribe
here.

`SurfaceGeometry.boxes` are the boxes measured off the DOM, empty until the pane widgets exist.
`measure` re-measures and hands back a disposer. `publishHovered` is the producer handed to the
mount as the cursor's callback, with stable identity.

### One exit, one disposer

`measure` has one exit only, and one disposer only. `0` is never a valid frame identifier, so
cancelling with it is a non-event — which lets this path always return the same shape without a
second function for the case where nothing was scheduled.

When no widgets exist yet the fallback is kept rather than blanking the legends: boxes are only
committed when at least one was read.

### Collapsed panes leave the flow

Collapsed panes leave the FLOW before anything is measured: a pane at the 2px floor plus its 1px
separator is the "rainbow strip" of slivers, and boxes read with those rows still in the table would
place every legend a strip too low. It is driven by the same two events as the measure itself
(`apply`, and the user releasing a separator drag) — never a clock.

When the pane widgets have not caught up with the model yet, exactly one retry rides the next paint
— and THIS call owns it, so this call is what hands back the way to cancel it. The retry uses the
synchronous view and not the captured `stack`: the frame runs LATER, and by then the stack the
closure holds may belong to a chart that has already been removed.

### The separator drag is bound imperatively

The other thing that moves a pane is the user dragging a separator. It is bound imperatively on the
canvas host rather than as a JSX handler, because a `div` carrying a mouse handler is a static
element pretending to be interactive — the chart is what handles the gesture, and this only reads
the result of one that already happened.

The PREVIOUS measurement's disposer is called before the next one schedules its own, which is what
keeps at most one frame in flight down this path.

### The cursor becomes an external store

`hoveredTime` was surface state, and the "once per bar" granularity was a side effect of the bailout
`useState` gives for free when the value does not change. Except that every bar CROSSED re-rendered
the WHOLE surface — the component that composes six subsystems — to update text only the legend
shows. Published as a store, whoever re-renders is whoever subscribes, and whoever subscribes is the
legend.

`HoveredTimeStore` is the pair `useSyncExternalStore` consumes, and both functions have stable
identity. The cell is a primitive value, and the one `getSnapshot` returns without touching a thing.

### The bailout is replicated by hand

`useSyncExternalStore` has no `useState` bailout: it compares the snapshot with `Object.is` and
re-renders whenever it changes. So the producer compares BEFORE notifying — same time, nobody is
told — and it is that line that gives back "once per bar" instead of "once per pixel". Without it,
every pixel moved under the cursor would become a render of the legend.

### The snapshot is a primitive

`getSnapshot` has to return the SAME reference while nothing has changed, or React warns and, at
worst, blows the update depth. A number satisfies that by construction; a `{ time, x, y }` built at
read time would break the guarantee in the very commit where somebody found it useful to expose the
coordinate alongside.

### Framing is fitContent and nothing after it

Framing by LOGICAL INDEX was tried here, to keep the future room out of the opening view. It was
wrong, and only the deploy could say so: on every interval change the candles were drawn squeezed
into the first column, while `fitContent` filled the width on the same changes, same data, same
build.

The isolation that settled it: forcing `fitContent` fixed all four changes; putting the logical range
back after `fitContent` broke them again. So the index is not addressing the point set the way the
call implies, and no ordering rescues it.

`fitContent` frames the room along with the candles, which is why the room is kept to a TENTH of the
history. Ninety per cent of the width stays price, and the ten per cent is generous to draw into —
twelve columns had read as much too short in live use, and the whole history as half a screen of
emptiness.

Three framing rules were written before this one, all of them refinements of a mechanism that was
itself the defect. The rules were correct and the mechanism was not, which is why unit tests kept
passing.

### A partial load is not the dataset

The opening view used to be framed once per dataset: the identity changed, the surface framed, and it
recorded the identity as done.

That is a RACE, and it lost. Switching interval changes the identity immediately, but the history for
the new interval arrives over the wire a moment later. The framing therefore ran against whatever had
landed at that instant — sometimes one bar — and then marked the dataset as framed, so the full
history that arrived next never got a view of its own. The right half of the chart stayed blank, for
good.

Reported twice from live use, and missed twice by an end-to-end probe: on a machine where history
happened to arrive first, the same test passes. A race measured only end-to-end is a race measured
badly.

So the surface remembers the identity AND the bar count it framed with, and frames again when the
count grew by more than ONE.

The threshold was first written as "the load has doubled", and that was wrong in a way only the live
deploy showed. With fit-to-screen ON there is an earlier `return true`, so the threshold never
decides anything and nothing looks broken. With it OFF — which is exactly what a user does when they
want the view to stay put — the threshold is the whole rule, and history arriving in two waves
(500 then 800) never doubles. The view stayed framed for the first wave and the rest of the screen
stayed blank.

One is the right number because it is not a tuning choice: a closing bar adds exactly one, and
anything else is a load arriving. The second half of the rule is not decoration — reframing on every
tick would yank the view out from under the very user who turned the button off.

"Anything else" is deliberate, and it took a third measurement to get there. The rule was first
written as growth only, and the deploy showed a chart framed for 800 bars with THREE in it — two lit
columns out of 1144. The identity changes one render before the bars do, so the framing is made for
the interval being LEFT, and the arriving interval starts small underneath a range sized for the old
one. Shrinking is a load arriving just as much as growing is.
