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
