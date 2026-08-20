# Drawing

Why the drawing seam is shaped the way it is, and why the memory behind it is bounded.

> How this directory is read, and why nothing in it is deleted: [`README.md`](README.md).

## drawing/drawingLayer.ts

### The drawing seam

An INTERFACE, deliberately without an implementation.

The verdict on `lightweight-charts-drawing` (v0.1.1, single maintainer, no LICENSE file in the
tarball) was to keep it OUT of this package's publication path. But the composed surface owns the
chart, the anchor series and the canvas host, and a drawing layer cannot exist without all three — so
the surface hands them over through this seam and the CONSUMER brings the implementation, exactly as
it already brings the `ChartEngine`. The library defines what a drawing layer IS; which package (if
any) provides one is the app's dependency decision, taken in the app.

**Why events flow through callbacks and not through return values.** The two things a host UI needs —
the drawing count for its rail, and "the creation gesture finished, disarm the tool" — happen on the
layer's own schedule (a click, a package event), not on the host's render schedule. Callbacks are the
only shape that carries that without polling.

What each member of the seam is:

- `DrawingSurfaceHost` is everything the surface owns that a drawing layer needs to attach to.
  `series` is the anchor (price) series: drawings are priced off ITS scale, so they can never drift
  from it.
- `DrawingLayerEvents.onCountChange` fires whenever the number of drawings changes — add, remove,
  clear. `onToolFinished` fires when a creation gesture completes, so the host can disarm the tool
  like every chart app.
- `DrawingLayer` is what the host may ask of an attached layer. Every member must be safe to call at
  any time. `setActiveTool(null)` disarms; arming resets any half-collected creation gesture.
- `DrawingBinding` is the injectable factory. It is called once per chart mount, and `detach` is
  called on unmount.

### The snapshot is opaque on purpose

`DrawingSnapshot` is the drawings' state, OPAQUE to this library: it carries it, it never interprets
it.

Only the implementation the app injects knows the package that draws, and therefore the shape of what
it exports. Typing this here would leak that shape into the seam — exactly the coupling the seam
exists to prevent.

### The pair that makes a drawing survive a remount

`serialize` and `restore` are that pair.

Drawing state lives inside the layer, and a layer dies with the mount that created it — so any host
that destroys and rebuilds the tree (a fullscreen dialog, a route change) erases the user's work
without ever calling "clear". With the pair, the host takes the snapshot before letting go and hands
it back on the next mount.

OPTIONAL ON PURPOSE: a layer that cannot serialize is still a valid layer (the inert one is one of
them), and the host has to treat the absence as "no drawings kept", never as an error. `serialize`
returning `null` says the same thing. `restore` takes what `serialize` returned, and an
unrecognisable state degrades to "no drawings".

## drawing/drawingMemory.ts

### Drawings that outlive a mount

Kept per market and BOUNDED.

**Why module scope at all.** A host that opens the workspace full screen destroys the embedded
instance and mounts another. Anything held inside the component tree dies with it, and the module is
the only scope that survives both mounts.

**Why per market.** A drawing is anchored to time and price, and replaying those anchors over another
market would draw noise with the appearance of the user's own work.

**Invariant.** The map has a ceiling and evicts the least recently used entry. An app can be restarted
by a deploy; a package installed in someone else's browser cannot, so an unbounded module-scope cache
here is worse than it is in an app.

What each member is:

- `DrawingMemory.live` — the layer mounted right now, when there is one. A fresher source than the
  snapshot.
- `DrawingMemory.snapshot` — the last snapshot taken on teardown. `null` means nothing kept.
- `rememberedMarkets()` — which markets are remembered right now, oldest first.
- `clearDrawingMemory()` — releases every entry. For a host retiring the workspace, and for a test
  that must not leak.

### Why eight markets

`MAX_DRAWING_MEMORY = 8`. Eight covers the watchlist somebody actually cycles through in one session;
past that, the oldest is the one nobody came back to.

### Reading counts as use

INVARIANT: reading COUNTS as use. A `Map` iterates in insertion order, so re-inserting on read is what
makes the eviction least-recently-USED instead of least-recently-created — without it the market
somebody keeps returning to is the one that gets discarded. The `delete` followed by `set` in
`drawingMemoryFor` is that re-insertion; collapsing it back into a plain `get` silently reintroduces
the defect.

### The key is the instrument not the view

Drawings are filed under the instrument on its exchange, and deliberately NOT under the timeframe.

A line's anchors are TIMES, and every timeframe of one instrument shares its times. Filing by view
would throw the line away the moment the user checked it on another interval — which is the opposite
of what a drawing is for.

Venue and market are in the key because the same ticker on two exchanges is two instruments. Replaying
one over the other draws lines at prices that never traded there, and a different price range does not
put them slightly off — it puts them off the chart.

## The axis lock is the library's half of the drag

Lives in `src/drawing/axisLock.ts`.

Pulling an anchor used to pan the chart underneath it, which made resizing a shape impossible: the
base library's pan handler and the drawing engine's own drag handler hear the SAME press, in bubble
phase, and both act on it. The lock exists to stop that. While a press is holding an anchor, the
chart's `handleScroll` and `handleScale` are held at `false`; the release puts both back to `true`.

**Where the split falls.** The drawing engine publishes no drag-start and no drag-end event —
`_isDragging` is private, and `drawing:updated` only arrives after the first movement — so the
trigger has to be the anchor hit-test the engine already offers. That hit-test is the ONLY
engine-specific fact in the whole gesture, and importing the engine to reach it would break the
zero-dependency manifest this package publishes. So the mechanism lives in the package, where every
host gets it and a headless test can drive it: the capture-phase press, the `applyOptions` pair, the
release, the disposal guard. The binding keeps one predicate, `DrawingLayer.anchorAt` — *is there an
anchor at this point?* A layer that cannot answer simply does not get the lock, and panning stays
what it always was.

**Why the press is captured, and only a left button on an anchor locks.** Capture phase is the only
place the lock can land BEFORE the base library reads the same press in bubble. And a press that
lands anywhere else must leave both options untouched: panning is the correct default gesture, and a
lock that fired on every press would trade one unusable chart for another.

**Why the release listeners go on `window` and not on the container.** The drag that ends outside
the chart is the common one, not the exotic one — the pointer leaves the pane and the button comes
up over the page. A listener bound to the container would never hear it, and the axes would stay
locked for good. `blur` is on the same footing: a gesture abandoned by a tab switch has to release
too. A permanently frozen chart is worse than the defect being fixed.

**Why the disposer flips a flag instead of only removing listeners.** A gesture can outlive the
component that started it. Going full screen unmounts this surface while the button is still down,
and the `mouseup` lands afterwards against a chart the base library has already disposed, which
answers by throwing. Unlocking a dead chart means nothing, so the orphaned gesture just dissolves.

## The magnet is a rule, not a placement

Lives in `src/drawing/magnet.ts`.

Every anchor used to land on a bar value whether or not that was wanted, and there was no way to
refuse. The magnet is the choice that was missing: `off` resolves an anchor to the pointer's own
price, `on` resolves it to the nearest of the bar's open, high, low and close when one of those sits
within the threshold. Off is the default, because a library that ships defaulting to the
complained-of behaviour has not fixed anything.

**PRICE ONLY.** Measured against the base library in isolation: an off-bar time has no coordinate,
so an anchor holding one would not render at all. The time axis stays quantised to bars, and free
placement is a statement about price.

**Where the split falls.** The package owns the rule and nothing else. `snapAnchorPrice` is a pure
function of the mode, the bars, a time, a price, a screen threshold and a price-to-coordinate
converter; it never touches a pointer, a chart or a drawing. The binding owns the MOMENT — it calls
`DrawingSurfaceHost.snapPrice` where it commits an anchor, and again where it traces the dashed
preview, so what is shown is already what will be recorded. Owning placement in the library would
mean owning tool vocabulary, anchor counts and selection, which is the whole engine the seam exists
to refuse.

**Why the threshold is a screen distance, not a price distance.** A tolerance expressed in price
means one thing on an instrument trading at 60 000 and something else entirely at 0.4, and something
else again after a zoom. The gesture the user is performing is a screen gesture, so the tolerance is
a screen distance: eight pixels by default. `SeriesHandle.priceToCoordinate` is already on the chart
port, so pixels cost no new port surface.

**Where the control lives, and why the rail draws it.** The rail already authors three fixed
controls end to end — cursor, delete-selection and clear-all — each with its glyph from the library
and its word from `DrawingToolbarLabels`. The magnet is that same shape, so it goes in the same
place: `DrawingToolbar` draws a two-state `IconButton`, `ChromeState { kind: 'toggle' }` turns the
mode into `aria-pressed`, and `labels.magnet` supplies the name. Publishing `useDrawingRail` instead
would have frozen ten members of `DrawingRailValue` as public API to hand a host one boolean, and
that hook throws outside a provider a host cannot mount. A `DrawingToolbar` mounted with no `magnet`
group draws no toggle at all, which is how a host that never asked for the magnet keeps the rail it
had. See AD-017.

**What the ceiling cost, and what it bought.** `DrawingToolbarProps` sat at exactly twelve top-level
props, which is the ceiling `test/gates/propCount.spec.ts` holds. The magnet did not get a
thirteenth: `onDeleteSelection`, `onClearAll` and `drawingCount` became one `edits` group — twelve
down to ten — and the magnet took a slot that had to be freed rather than granted. The gate forced a
better shape than the one being asked for, which is the gate working.

**Why a tie goes to the higher price.** Two candidates equidistant from the pointer have to resolve
somewhere, and "whichever the loop saw first" is an outcome nobody decided. The higher price wins,
written down here so the next reader can rely on it instead of measuring it.

**Why the mode reaches the binding as a bound closure rather than as data.** The host object is built
once per binding, inside the effect that attaches the layer. Handing that effect the bars would make
it depend on data that changes on every tick, and re-running it re-attaches the layer — which throws
away every drawing the user has made. The closure is stable and reads live refs instead, the same
shape the seam already uses for its events. It also settles what happens when the mode changes
mid-gesture: the closure reads the mode at CALL time, so the change applies to the next anchor and
moves nothing already placed.
