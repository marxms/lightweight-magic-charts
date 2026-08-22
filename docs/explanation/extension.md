# Extension boundary

Why the extension surface is shaped the way it is: injection of instances, and the registry that was
refused.

> How this directory is read, and why nothing in it is deleted: [`README.md`](README.md).

## extension/plugins.ts

### Instance injection not a registry

The boundary is this: consumers inject INSTANCES, and nothing is ever registered by name.

The rejected alternative is `register(name, factory)`. A registry has to be populated, and populating
one means importing a module for its side effect. That is incompatible with `sideEffects: false` in
`package.json`, so every consumer loses tree-shaking and ships the whole catalogue whether they draw
it or not.

Instance injection has no such cost — and it is also the only model under which "the proprietary
indicators live in another repository" is true BY CONSTRUCTION rather than by convention: this
library cannot import what it cannot name.

### The canvas is lent

`RenderTarget` hands the canvas over for the duration of one draw, through
`useBitmapSpace(fn)`.

It is deliberately a callback rather than a returned context. The host controls when the bitmap is
valid, and an overlay that stashed the context would draw onto a surface that has already been
resized or destroyed.

The scope handed to the callback carries `ctx`, `widthPx`, `heightPx`, `hRatio` and `vRatio`, so an
overlay never has to reach outside the lent scope to learn the device pixel ratio.

### Off scale is null never clamped

`Projection.priceToY` and `Projection.timeToX` both return `null` when the value is off-scale.

They do NOT return a clamped edge coordinate. A clamped coordinate would silently draw an
out-of-range value at the boundary as though it had been measured there — the drawing looks
plausible and asserts something the data never said. `null` forces the overlay to decide, in the
open, what to do with a value it cannot place.

### Behind the price action

`Overlay.zOrder` is `'behind' | 'ahead'`. `behind` puts the overlay under the price action, which
is where a density field belongs.

### An overlay may name its anchor

`Overlay.anchor` is a `seriesStyleKey` — the `pane:series` pair the surface files a created series
under. It decides ONE thing: whose price scale `Projection.priceToY` reads. Absent, the overlay
anchors to the pane-zero series, which is the candles when a price pane is drawn; that is the
behaviour every overlay had before the member existed, which is why the member is optional.

It exists because an overlay that shades between two of a STUDY's lines has to measure on the
study's axis, and a study in its own lane is on a different one from the candles. Anchoring it to
pane zero would place the shading at the right times and the wrong prices.

The anchor also has to be a series that HAS data: the base library answers `null` from
`priceToCoordinate` while a series has no first value, so an empty lane slot projects nothing. The
first drawn plot of the study is the one guaranteed to have a reading.

Layering is not affected. A `behind` overlay maps to the base library's bottom layer, which is
painted for every source in the pane before any series is — so a fill anchored to one line still
sits under all of them, including the lines it knows nothing about.

### Series arrive as instances

`SeriesProvider` is a computed series: the consumer builds it and hands the instance over. The
library never imports, names or enumerates one — the same rule as
[instance injection](#instance-injection-not-a-registry), applied to computed values rather than
to drawing.

### Symmetric attachment

`OverlayHostApi.attachOverlay` returns its own `DetachOverlay`, exactly like `subscribe` does.
Attachment is symmetric: whoever attached holds the only handle needed to undo it,
so there is no detach-by-identity lookup to get wrong and no registry to leak entries into.
