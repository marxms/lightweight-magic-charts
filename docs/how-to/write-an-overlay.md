# Draw something of your own over the chart

**The question:** I want a shaded band between two prices — my value area, my risk envelope, my
anything. There is no prop for it. How do I draw it?

You write an `Overlay` and attach it. Extension here is **injection of an instance**, never
registration by name: there is no `register('my-overlay', factory)` to call, because a registry needs
an import for side effects and that kills tree-shaking for everyone. The argument is in
[`../explanation/extension.md`](../explanation/extension.md); this page is the overlay.

An overlay is four members:

| Member | Called when | What it is for |
| --- | --- | --- |
| `zOrder` | read once | `'behind'` paints under the candles, `'ahead'` over them |
| `attached(host)` | on attach | keep the host: it carries `requestRedraw` and the live `projection` |
| `draw(target, projection)` | every frame | the only place you touch a canvas |
| `detached()` | on detach | drop what you kept. Not optional |

## Step 1 — write the overlay

`projection` converts your numbers into pixels, and it answers `null` when a value is **off scale** —
never a clamped edge coordinate. That is deliberate: a clamped value draws a band pinned to the top
of the pane and looks like data. `null` means "not visible", and skipping is the correct response.

`target.useBitmapSpace` lends you the canvas for exactly one draw. Do not keep `ctx` — it is valid
inside the callback and nowhere else — and do not resize, clear or transform the surface; you are one
of several painters on it.

```ts
import type { Overlay, OverlayHost, Projection, RenderTarget } from 'lightweight-magic-charts';

export function priceBand(low: number, high: number, fill: string): Overlay {
  let host: OverlayHost | null = null;

  return {
    zOrder: 'behind',

    attached: (given: OverlayHost) => {
      host = given;
      // Ask for the first frame yourself: attaching does not imply a redraw.
      host.requestRedraw();
    },

    detached: () => {
      host = null;
    },

    draw: (target: RenderTarget, projection: Projection) => {
      const top = projection.priceToY(high);
      const bottom = projection.priceToY(low);
      // Off scale is `null`. Skipping is right; clamping would draw a band that is not there.
      if (top === null || bottom === null) return;

      target.useBitmapSpace(({ ctx, widthPx, vRatio }) => {
        ctx.save();
        ctx.fillStyle = fill;
        ctx.fillRect(0, top * vRatio, widthPx, (bottom - top) * vRatio);
        ctx.restore();
      });
    },
  };
}
```

The `hRatio` and `vRatio` in that scope are the device pixel ratios. `priceToY` answers in CSS
pixels and the canvas is in device pixels, so a band drawn without the multiply is right on a
standard display and half-height on a retina one — which is the bug that only appears on someone
else's laptop.

## Step 2 — attach it, and detach it

`attachOverlay` takes anything that can hold a primitive — the price series handle does — and returns
the function that removes it. Call that function; an overlay that outlives its chart keeps a redraw
subscription alive.

```ts
import { attachOverlay, type DetachOverlay, type Overlay, type SeriesHandle } from 'lightweight-magic-charts';

declare const series: SeriesHandle;
declare const overlay: Overlay;

export function mount(): DetachOverlay {
  const detach = attachOverlay(series, overlay);
  // Whatever owns the chart owns this call — an effect cleanup, a dispose, an unmount hook.
  return detach;
}
```

Inside React, that is one effect, and the dependency list matters: rebuild the overlay on every
render and it detaches and reattaches on every keystroke.

```tsx
import { attachOverlay, type Overlay, type SeriesHandle } from 'lightweight-magic-charts';
import { useEffect, useMemo } from 'react';

declare function priceBand(low: number, high: number, fill: string): Overlay;

export function useBand(series: SeriesHandle | null, low: number, high: number): void {
  const overlay = useMemo(() => priceBand(low, high, 'rgba(76,141,255,0.18)'), [low, high]);
  useEffect(() => {
    if (series === null) return;
    return attachOverlay(series, overlay);
  }, [series, overlay]);
}
```

## Step 3 — redraw when your data changes

Nothing polls. The chart redraws on its own movement — pan, zoom, new bar — and your `draw` runs with
it. When it is *your* input that changed and the chart did not move, say so:

```ts
import type { OverlayHost } from 'lightweight-magic-charts';

declare let host: OverlayHost | null;

export function levelChanged(): void {
  host?.requestRedraw();
}
```

Call it once per change, not per frame. `requestRedraw` schedules; it does not paint.

## What an overlay may not do

- **Keep the canvas.** `ctx` is lent for one draw. Holding it paints into a surface the chart has
  since resized, and the symptom is a smear that survives a zoom.
- **Clamp an off-scale value.** `null` is an answer. Drawing at the edge instead invents a level.
- **Assume it is alone.** Several overlays share one surface, in `zOrder` groups. `save()` and
  `restore()` around your own state is what keeps the next painter's fill colour its own.
- **Draw text without a colour from the theme.** The reader may be in either scheme; take the
  colour from `chrome.theme` rather than hard-coding one — see
  [`replace-chrome.md`](replace-chrome.md).

For every signature named here, see
[`../reference/extension/plugins.md`](../reference/extension/plugins.md).
