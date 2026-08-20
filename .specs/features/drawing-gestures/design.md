# Design: drawing gestures — anchor drag and the magnet

## The tension this design exists to resolve

The spec says "the library SHALL hold the chart's `handleScroll` and `handleScale` at `false`" and
"the library SHALL use that bar value as the anchor's price". Both gestures, today, happen somewhere
the library cannot reach: **the host's binding owns them**.

`src/drawing/drawingLayer.ts` declares a function type and nothing about who implements it. The
example fills it in `example/drawing.ts`, where `onClick` collects anchors and `DrawingManager` drags
them. The proven anchor-drag fix
(`~/dev/cripto_bot_mcp/shooting-for-the-moon-streamer/apps/web/src/config/chartDrawings.ts:233-274`)
lives on that same side, and its trigger is `hitTestAnchor` — an API of
`lightweight-charts-drawing`, a package the library must never import. The manifest declares zero
runtime dependencies and AD-006 says why.

So the design cannot answer "library or host?" with one word. It **splits each gesture at the line
where engine knowledge begins**:

| | The library owns | The binding owns |
| --- | --- | --- |
| Anchor drag | the whole lock: press capture, the `applyOptions` pair, release on `mouseup`/`blur`, the disposal guard | one predicate — *is there an anchor at this point?* |
| Magnet | the mode, the threshold, the bars, the snap rule | calling the resolver at the moment it places an anchor |

Everything engine-agnostic moves into the package, where every host gets it and jsdom can test it.
The engine-specific residue stays a one-line hole in the seam. This is the same shape as the chart
port itself: structure declared, implementation injected.

---

## Component 1 — `src/drawing/axisLock.ts` (new)

A standalone attach function. No React, no drawing engine, no base library import.

```ts
export interface AxisLockHost {
  readonly chart: Pick<ChartLifecycle, 'applyOptions'>;
  readonly container: HTMLElement;
  /** The ONE thing only the binding knows. Point is container-relative. */
  readonly anchorAt: (point: { x: number; y: number }) => boolean;
}

export function attachAxisLock(host: AxisLockHost): () => void;
```

**Behaviour, mapped to the requirements:**

- `mousedown` on the container **in capture phase**, so the lock lands before the base library's own
  bubble-phase pan handler reads the same press (DRAG-01).
- Left button only, and only when `anchorAt` answers true. Any other press returns without calling
  `applyOptions` at all — panning stays the default gesture (DRAG-06).
- On grab: `chart.applyOptions({ handleScroll: false, handleScale: false })`.
- Release listeners go on `window`, not the container, so a button released outside the chart still
  restores (DRAG-03), and `blur` covers the gesture abandoned by a tab switch (DRAG-04). A
  permanently locked axis is worse than the defect being fixed.
- The returned disposer removes every listener and **flips an internal `detached` flag**, so a
  release that arrives after teardown returns without touching a chart the base library has already
  disposed (DRAG-05).
- `anchorAt` is called inside a `try`: a hit-test on a state the engine did not expect costs one
  missed lock, never a crash.

**Why a plain function and not a hook.** It is called from an effect that already exists, its
lifetime is that effect's, and as a function it is testable without a renderer.

## Component 2 — `DrawingLayer.anchorAt?` (seam extension)

```ts
export interface DrawingLayer {
  // ...existing members unchanged
  /** OPTIONAL: a layer that cannot hit-test its anchors simply does not lock the axes. */
  anchorAt?(point: { x: number; y: number }): boolean;
}
```

Optional, like `serialize`/`restore`/`setMarkers` already are. A host on an older binding compiles
and runs unchanged; it just does not get the fix. **This is not a new obligation** — the same rule
the CHANGELOG applies to `Session.reseed`.

## Component 3 — `useDrawingSeam` calls the lock

The mount effect already builds the layer and returns a disposer. It gains:

```ts
const unlock = layer.anchorAt === undefined
  ? null
  : attachAxisLock({ chart, container: host, anchorAt: (p) => layer.anchorAt!(p) });
```

and `unlock?.()` in the cleanup, **before** `layer.detach()`. Ordering matters: the lock must stop
listening while the chart is still alive.

## Component 4 — `src/drawing/magnet.ts` (new)

The rule, pure, with no knowledge of pointers or React.

```ts
export type MagnetMode = 'off' | 'on';

export interface SnapInput {
  readonly mode: MagnetMode;
  readonly bars: readonly Bar[];
  readonly time: UtcSeconds;
  readonly price: number;
  /** Screen distance, in pixels. See below for why not price units. */
  readonly thresholdPx: number;
  readonly priceToCoordinate: (price: number) => number | null;
}

export function snapAnchorPrice(input: SnapInput): number;
```

- `mode === 'off'` returns `price` untouched, before any bar lookup (MAGNET-02).
- Finds the bar at `time`; considers its `open`, `high`, `low`, `close`.
- Converts each candidate and the pointer price to coordinates and keeps the nearest whose distance
  is `<= thresholdPx` (MAGNET-03); returns `price` when none qualifies (MAGNET-04) and when the
  chart holds no bars (edge case 1).
- **A tie goes to the higher price** (edge case 2) — decided rather than incidental.
- A `priceToCoordinate` returning `null` drops that candidate rather than the whole snap.

**Why the threshold is pixels, not price units.** A price-unit threshold means something different
on an instrument trading at 60 000 than on one at 0.4, and something different again after a zoom.
The gesture the user is performing is a screen gesture, so the tolerance is a screen distance. The
port already publishes `priceToCoordinate` on `SeriesHandle`, so no new port surface is needed.
**Default: 8 px.**

## Component 5 — the mode reaches the binding as a bound closure

`DrawingSurfaceHost` gains one member:

```ts
export interface DrawingSurfaceHost {
  readonly chart: WorkspaceChartHandle;
  readonly series: SeriesHandle;
  readonly container: HTMLElement;
  /** The library's snap rule, already bound to the live bars, mode and threshold. */
  readonly snapPrice: (at: { time: UtcSeconds; price: number }) => number;
}
```

The binding calls `host.snapPrice({ time, price })` where it currently uses `price` — in `onClick`
for the anchor, and in `onCrosshair` for the preview, which is the whole of P3 (MAGNET-07).

**Why a closure and not raw data.** The host object is built once per binding, inside an effect that
must not re-run when a bar arrives. Handing over `bars` would force the effect to depend on data
that changes every tick, which re-attaches the drawing layer and throws away every drawing. The
closure is stable and reads live refs — the pattern `eventsRef` already established in
`useDrawingSeam.ts:31`. It also gives MAGNET-06 for free: the closure reads the mode at call time,
so a mode changed mid-gesture applies to the next anchor and moves nothing already placed.

`SurfaceDrawing` gains `magnet?: MagnetMode` and `snapThresholdPx?: number`. Absent means `off`
(MAGNET-01, MAGNET-05); the host renders its own control and owns the label, consistent with AD-008.

## Component 6 — the mode's home is `DrawingRailProvider`

`activeTool` already lives there as `useState` (`src/react/workspace/DrawingRail.tsx:56`), reaches
the surface through `useDrawingRail()` and is rendered by controls the host mounts. The magnet is the
same kind of value, so it goes to the same place rather than inventing a second home:

```ts
interface DrawingRailValue {
  // ...existing
  readonly magnet: MagnetMode;
  readonly setMagnet: (mode: MagnetMode) => void;
}
```

`CanvasSurface` forwards it into `SurfaceDrawing` beside `activeTool`. The host renders its own
toggle from `useDrawingRail()` — the library supplies the state and the mechanism, never the label
or the glyph (AD-008, and the same rule `chrome.labels` follows).

`WorkspaceDrawingOptions` gains `snapThresholdPx?` only. The **mode is not a prop**: a prop would
make the host own a value the library must also mutate, and the two would disagree the moment a
keyboard shortcut arms it.

---

## Data flow

```
host control ──magnet mode──▶ SurfaceDrawing.magnet
                                     │
                              ChartSurface (holds bars)
                                     │  builds a stable closure over refs
                              useDrawingSeam
                                 │        │
              DrawingSurfaceHost │        │ layer.anchorAt
                       .snapPrice│        ▼
                                 │   attachAxisLock ──▶ chart.applyOptions
                                 ▼                       {handleScroll, handleScale}
                          the host's binding
                          onClick ▶ snapPrice ▶ anchor
                          onCrosshair ▶ snapPrice ▶ preview
```

## Requirement coverage

| ID | Where it is satisfied |
| --- | --- |
| DRAG-01 | `axisLock.ts` — capture-phase `mousedown`, `applyOptions(false, false)` |
| DRAG-02 | `axisLock.ts` — `mouseup` restores |
| DRAG-03 | `axisLock.ts` — listener on `window`, not the container |
| DRAG-04 | `axisLock.ts` — `blur` restores |
| DRAG-05 | `axisLock.ts` — `detached` flag + disposer; `useDrawingSeam` unlocks before `detach()` |
| DRAG-06 | `axisLock.ts` — `anchorAt` false returns before any `applyOptions` |
| MAGNET-01 | `SurfaceDrawing.magnet` absent ⇒ `'off'` |
| MAGNET-02 | `snapAnchorPrice` returns the input price when `mode === 'off'` |
| MAGNET-03 | nearest OHLC within `thresholdPx` |
| MAGNET-04 | no candidate within threshold ⇒ input price |
| MAGNET-05 | same default path as MAGNET-01 |
| MAGNET-06 | the closure reads the mode at call time |
| MAGNET-07 | the binding routes `onCrosshair` through the same `snapPrice` |

## Verification plan

- **jsdom (`npm test`)** — `axisLock.spec.ts` drives real `MouseEvent`s against a fake chart and
  asserts the `applyOptions` call log, including the not-an-anchor case and the post-teardown
  release. `magnet.spec.ts` is a table over the snap rule, tie included.
- **Real browser (`npm run e2e`)** — one check per P1/P2 story, as the spec's success criteria
  demand: a 200 px anchor drag with the visible bar range read before and after; an anchor placed
  with the magnet off and again on, reading the resulting price.
- **Size budget** — two new modules, both small and tree-shakeable; the ledger moves by a named
  amount or does not move.

---

## Spec amendments this design requires

Two MAGNET criteria are written as if the library places the anchor. It does not, and cannot without
importing a drawing engine. They should be reworded to name what is actually testable — the
resolver — so the Verifier is not asked to prove something the architecture forbids:

- **MAGNET-03** — "…the library SHALL **resolve the anchor's price to** that bar value" (was "SHALL
  use that bar value as the anchor's price").
- **MAGNET-04** — "…the library SHALL **resolve the anchor's price to** the pointer's own price".

MAGNET-02 gets the same verb for consistency. The user-visible outcome is unchanged, and the e2e
checks still assert it end to end through the example's binding.

## What this design deliberately does not do

- **It does not intercept clicks in the library.** Owning placement would mean owning tool
  vocabulary, anchor counts and selection — the whole engine. The seam exists to refuse that.
- **It does not touch the time axis.** Measured closed in the spec: an off-bar time has no
  coordinate.
- **It does not persist the mode.** Session-scoped, per the spec's Out of Scope.
