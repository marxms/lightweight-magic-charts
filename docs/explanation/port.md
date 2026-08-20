# The port layer

Why the data seam is shaped the way it is: the structural chart port, the frame vocabulary, the scope
machine and the seeding transaction.

> How this directory is read, and why nothing in it is deleted: [`README.md`](README.md).

---

## src/port/chartApi.ts

### The chart port declared not imported

This is the base library's surface, DECLARED here rather than imported.

It lives beside `MarketDataPort` because it is the same kind of thing, and the file that used to hold
it said so in its own first paragraph while sitting in the render layer: the render layer talks to
the base library through a port, exactly as the core talks to a feed through `MarketDataPort`. A
module that describes itself as a port belongs in the port layer.

WHY NOT `import type { IPaneApi } from 'lightweight-charts'`. `RenderTarget`, `Projection` and
`Overlay` are this package's OWN abstractions, and an overlay author writes against them without ever
meeting the base library. Declaring the shapes we actually call keeps that true one level down. The
package then imports nothing at runtime and nothing at compile time either, which is why the boundary
guard's strongest clause holds without an exemption.

The cost of a structural port is silent drift: the real API could change shape and nothing here would
notice. That cost is PAID, not accepted — `test/renderBoundary.spec.ts` pins every one of these
against the real `lightweight-charts` declarations, so a drift fails the suite instead of failing a
consumer at their call site.

Everything in the file is the MINIMUM. A method that is not called does not belong in a port: it
would narrow what a consumer can pass in exchange for nothing.

### getHTMLElement is the GUI catch up read

`PaneHandle.getHTMLElement()` returns `null` exactly when this pane's index has no widget yet, which
makes it the public read of "the GUI has caught up with the model". `moveTo` asserts against the
count of WIDGETS, and `addPane` grows the model synchronously while the widget list is reconciled on
the next paint.

### One chart N panes

`PaneChartHandle` is the chart seen as a pane container.

ONE chart, N panes — that is the whole of "shared crosshair and shared time axis". The base library's
v5 panes already share both because they belong to the same chart instance; the alternative that
people actually ship, N chart instances kept in step by forwarding visible-range and crosshair
events, is what this port refuses to make expressible. There is no `create` here: a `PaneStack` is
handed a chart, so it cannot make a second one.

### Overlays anchor on the candle series price scale

`PriceConverter` is a series' own price converter.

This is the anchor every overlay reads coordinates from: an overlay priced off the CANDLE series
shares the candles' price scale by construction and cannot drift from it under any zoom or drag. The
prototype learned this the hard way — its first heatmap was a custom series on an overlay price
scale, which auto-scales to its own extent and therefore had a price axis of its own.

### HorzScaleItem is a union not a number

`HorzScaleItem` is the base library's horizontal-scale item, expressed as a structural union.

WE ONLY EVER PRODUCE SECONDS, and the temptation was to say so — `timeToCoordinate(time: number)`.
It does not type-check, and the reason is worth keeping: a real time scale accepts a branded
timestamp OR a calendar day OR a string, and a port that accepts only a number is NARROWER in a
parameter position, so the real scale is not assignable to it in either direction.
`test/renderBoundary.spec.ts` is what said so — the first version of this port was written with
`number` and the pin refused it, which is the whole reason that file exists.

### The composed surface still does not import the base library

It could: the peer is declared and the boundary guard now carries an allowlist. It does not, and the
reason is mechanical rather than stylistic — `lightweight-charts@5` is `"type": "module"` with an
`exports` map that offers only the `import` condition, and this package emits CommonJS. A `require()`
of it from our own `dist` is a resolution failure in Node and a bundler-specific accident everywhere
else. The one import that would buy ergonomics is the one import that cannot be made safely, so the
render layer keeps talking through a port and the consumer writes the ten-line adapter.

`SeriesHandle`, `PriceScaleHandle`, `PriceLineHandle` and `ChartLifecycle` are MIRRORS: the real
declarations satisfy them unchanged, and `test/renderBoundary.spec.ts` pins that. `addSeries` is the
single member an adapter has to TRANSLATE, because the base library identifies a series kind by an
imported value and a value is exactly what a port cannot carry. That is also why `SeriesShape` is a
TOKEN: the port stays a type, and the consumer resolves the token to a value.

### autoScale is the vertical half of refit

`PriceScaleHandle.applyOptions({ autoScale })` is the scale's VERTICAL autoscale — the member without
which "refit" only reaches half the chart.

`timeScale().fitContent()` belongs to the HORIZONTAL axis: it does not touch the price range. The
base library starts with this option on and turns it OFF on the user's first drag over the price axis
(`handleScale.axisPressedMouseMove.price`, on by default) — from there on `Pane._internal_recalculate`
returns on its first line for that scale and the range stays where it was, market after market.
Reasserting it is what the base library itself does on a double-click of the axis, and without it
declared here the surface would have no way to ask for that through the port.

TYPE WIDENING, not new vocabulary: the option already exists in the base library — it is the same
manoeuvre that gave `point`/`paneIndex` to `CrosshairParam` — and `test/renderBoundary.spec.ts` is
still what proves the real scale satisfies this shape.

### lineWidth is an ordinal union

`PriceLineOptions.lineWidth` is NOT `number`. The base library's `LineWidth` is `1 | 2 | 3 | 4`, and
a port that said `number` here was rejected by the pin: our options object would then be unassignable
to the real one, so the very first `createPriceLine` call at a consumer would fail to compile. The
pin caught it before the port was published rather than at somebody else's call site.

### lineStyle and the Partial applyOptions

The base library's `LineStyle` enum is a value; its members are these ordinals, which is why
`PriceLineOptions.lineStyle` is typed as a plain `number` rather than as a name this port cannot
import.

`PriceLineHandle.applyOptions` takes a `Partial`, because re-styling a live line must not force its
price to be restated.

### SeriesHandle hosts primitives as unknown

`SeriesHandle extends PrimitiveHost<unknown>` rather than the overlay type: this module sits UNDER
the overlay bridge and naming `OverlayPrimitive` here would invert that. Method parameters are
bivariant, so the bridge's `PrimitiveHost<OverlayPrimitive>` is still satisfied by this handle.

### Nullable coordinate conversions

`coordinateToPrice` turns pixels back into a price and returns `null` off-scale, for the same reason
`priceToCoordinate` is nullable: a clamped edge price would let a drag that left the pane keep
writing a level, silently pinned to the boundary as though the user had chosen it.

### setMarkers is optional and called through

`SeriesHandle.setMarkers` is OPTIONAL, because the base library ships it as a standalone plugin
(`createSeriesMarkers`), not as a series method — so a raw series does not carry it and an engine
adapter has to ADD it. The surface calls it through `?.`, which makes "the engine did not wire
markers" a silent absence of marks rather than a crash.

### Crosshair and click carry point and paneIndex

`CrosshairParam` is what the crosshair reports; `time` is `unknown` because only the host knows its
horizontal scale.

`point` and `paneIndex` are the SAME two members `ChartClickParam` declares, and for the same reason:
without the cursor's position there is no way to draw the preview of a stroke between one click and
the next — the host would have to pierce the port and talk to the real chart. Both are optional and
the base library's payload already carries them, so this widens the type without widening the
contract: nothing here comes to know what a drawing tool is.

`ChartClickParam` is what a chart CLICK reports — the minimum a drawing layer needs to place an
anchor. Its `point` is LOCAL TO THE PANE the click landed on, not chart-relative: the base library
binds its handler to each pane's own canvas. `paneIndex` is therefore the only honest guard against
pricing an indicator-pane click off the anchor's scale.

### SeriesMarkerPoint narrows the marker plugin shape

`SeriesMarkerPoint` is one mark on one bar — the shape `createSeriesMarkers` accepts, narrowed to
what a pattern needs. Its `time` is the bar's own horizontal-scale value, exactly as the host feeds
`Bar.time`.

### Workspace time scale and optional click

`WorkspaceChartHandle.timeScale()` declares the time-scale members the composed components call: show
the whole seeded window, and turn a pixel back into a horizontal-scale value (a drawing layer placing
an anchor past the last bar). The real time scale satisfies both structurally — pinned in
`renderBoundary` like every mirror. `coordinateToTime` is optional so a minimal test double stays
minimal.

`subscribeClick` / `unsubscribeClick` are OPTIONAL for a different reason than `SeriesHandle.
setMarkers`: here the real chart HAS the member — the option exists so a fake engine that never
clicks does not have to fake it. An adapter over the real library forwards both untouched.

### ChartEngine owns the options object

`ChartEngine` is the one thing the consumer injects that is not data: how to make a chart.

`options` is passed through VERBATIM to the base library's `createChart`. It is built by this package
— including `attributionLogo: true`, which the base library's licence requires and which a consumer
assembling its own options object is free to forget.

---

## src/port/frames.ts

### Three channel shapes not one protocol

Production already runs three genuinely different channels, and forcing gap detection and resync onto
a channel that is idempotent by construction is cost with no benefit. The shape is DECLARED by the
adapter, and the library then applies only that shape's policy:

| shape | what a frame carries | policy |
| --- | --- | --- |
| `delta` | every frame appends one bar; a lost frame is permanent loss | contiguity required |
| `snapshot` | every frame carries the whole state of the scope | no gap detection |
| `seeded-delta` | seeded by an initial load, kept by membership deltas | expires by freshness |

### Every frame carries its scope

Every `Frame` variant carries `scope`. That is deliberate and it is load-bearing.

In the client this replaces, the reducer held no scope at all, so a frame from a scope it had already
left was applied in silence — I1 was upheld only because one transport remembered to detach its
message handler on teardown. A guarantee that depends on every adapter remembering something is not
a guarantee. Here the discard is structural.

`open` is the one variant with NO `seq`: it is last-writer-wins and sits outside gap detection.

### baselineTime is the seam anchor

On a `snapshot` frame, `baseline` is the live cursor the snapshot establishes and `baselineTime` is
the TIME of the last closed bar it counts. `baselineTime` is the seam anchor: the client decides
whether history reaches the live edge by BAR TIME, never by sequence. It is absent when `baseline`
is 0 — nothing has closed, so there is no seam to verify.

### I11 accumulation turns a snapshot channel into a delta

`resolveChannelShape` enforces I11 at the only place it can be: where the shape is decided.

Accumulating snapshots into a per-bar series turns an idempotent channel into a lossy one — each
accumulated frame becomes a bar, and a frame that never arrives becomes a permanent hole rather than
a value the next frame corrects. So the RESULTING channel is a delta and must be policed as one,
whatever the source channel called itself.

### The live envelope keeps the payload opaque

`LiveEnvelope` is a pushed snapshot of the LIVE edge, and `LiveTip` is the tip it folds into.

WHAT THIS IS FOR. Some producers push the last value per series rather than a series, so the division
of labour is fixed: history supplies the bars, the push updates the TIP. Reconstructing a series out
of a scalar would be the chart asserting measurements it never received.

THE PAYLOAD STAYS OPAQUE, and that is the whole reason this is expressible here at all. A wire format
belongs to whoever emits it, and naming one here would put an emitter's field names in this package
permanently. So the envelope carries the payload untouched and the PROJECTION is handed in.

`LiveEnvelope.gen` is the producer's boot generation: a different one re-baselines rather than being
read as stale. `LiveTip` is keyed by `SeriesId` because that is the identity this package already
uses for a line — a second key type would be a second vocabulary for the same thing. `LiveTip.gen`
is the generation of the envelope currently applied, and `null` means nothing has been applied yet.
`EMPTY_LIVE_TIP` is a constant, so a consumer that resets an already-empty tip pays nothing for it.

### Identity is the contract and order is part of the clause

`applyLiveEnvelope` is pure and returns the SAME REFERENCE when nothing is applied.

IDENTITY IS THE CONTRACT, not an optimisation. Consumers discard by identity, so returning a fresh
object with equal contents would make every rejected envelope cost a render — and a rejected envelope
is the common case on a lane carrying several scopes at once.

ORDER MATTERS AND IS PART OF THE CLAUSE. The scope refusal runs BEFORE the projection, so a payload
addressed to a scope this consumer is no longer looking at is never even parsed. That is why the
projection is injected rather than folded in: a projection that ran first would have to be total over
every payload the lane carries, including the ones meant for somebody else.

The three steps, in order: the lane is multiplexed by scope, so demultiplexing is the consumer's job
and it happens first; within the same generation a duplicate or out-of-order sequence is discarded
and never downgrades the tip; a DIFFERENT generation rebases, because the producer restarted and its
sequence began again, so a low number there is fresh rather than stale. Values are replaced wholesale
and never merged — on a snapshot channel the envelope IS the state of its scope.

---

## src/port/ports.ts

### History and live are separate ports

`HistoryPort` and `LivePort` are SEPARATE on purpose (ISP). A history-only adapter — a backtest, a
test fixture, a replay harness — implements one without stubbing the other. An adapter that has to
stub half an interface will stub it badly.

`MarketDataPort` is the intersection for an adapter that does both, and `isHistoryPort` /
`isLivePort` are narrowing helpers so a consumer can accept the smaller port without an `any`.

### The closure is the token

`Unsubscribe` is a closure, and the closure IS the token.

There is no subscriber identifier in a string anywhere in this surface. A caller that holds the
returned function can cancel; a caller that does not, cannot. Nothing to look up, nothing to leak,
nothing to get wrong by passing the wrong id.

### Exhausted is out of band

`HistoryResult.exhausted` is reported OUT OF BAND, because an empty array is ambiguous between "there
is a gap here" and "this is the beginning of recorded history", and those two require opposite
responses.

`HistoryRequest` asks for a SEMI-OPEN window `[from, to)` — `to` is never included — and `barCount`,
when present, takes PRIORITY over the window: "the last N bars ending before `to`".

---

## src/port/scopeMachine.ts

### The scope state machine

This is where I1..I14 stop being a table.

Pure and synchronous: every operation takes a state and returns a new one. Nothing here touches a
socket, a clock or the DOM, which is what lets the conformance suite drive an adapter through
reconnects, gaps and scope changes without any of them actually happening.

```
SEEDING --fetch+seam ok--> LIVE --seq != baseline+1--> RESET
   |                         |  \--amend---------------^
   |                         \-----gen changed--------> (rebase, back to SEEDING)
   \--scope changed--------> DISCARDED
```

The invariants the appliers carry inline:

- I1 — a frame for another scope is DISCARDED, never applied. Structural, not a courtesy of whichever
  transport happened to detach its handler in time.
- I3 — a non-contiguous sequence is a RESET, never a partial application. Applying the bar and
  leaving the hole would make the series look complete while it is not.
- I5 — an open bar NEVER advances the baseline. It has no seq and it is last-writer-wins; letting it
  move the cursor would make the next real close read as a gap.
- I6 — newer appends, equal replaces, older is REJECTED and never silently reordered. When the
  sequence was contiguous but the bar is out of order this is NOT a gap: advance the cursor and drop
  the bar, rather than declaring a resync the server cannot help with.
- I7 — after `discardScope`, no frame and no in-flight fetch may reach the consumer.
- I12 — nothing is applied before the seam is verified. Buffer, in arrival order.

`restartScope` is the reset valve: a scope whose data cannot be repaired incrementally starts over,
keeping only its `discarded` counter. `needsRefetch` reports exactly one phase, `reset` — which is
why the I10 landing state below matters as much as it does.

### SeamState is declared not inferred

`SeamState` makes explicit whether the seam CAN be proven, instead of inferring it from a null.

The first version derived this from `baselineTime !== null` inside `seedHistory`, and that is
precisely how the defect this whole port exists to close crawled back in: a producer that sends a
cursor without an anchor made the check silently vacuous, and the window was accepted whatever it
contained. A missing anchor is a DECLARED inability to prove the seam — never permission to skip
proving it.

| value | meaning |
| --- | --- |
| `none` | baseline is 0: nothing has closed, so there is no seam. Vacuously fine. |
| `anchored` | cursor and anchor both present: the seam is checkable, and IS checked. |
| `unanchored` | cursor without anchor: NOT checkable. The consumer is told, never told nothing. |

The rest of `ScopeState` reads the same way: `gen` is null until the first frame names a generation;
`baselineTime` is the time of the last closed bar the baseline counts, and null when there is no
anchor; `seam` is to be read before trusting `bars` after a seed; `buffered` is held while the seam
is unverified (I12) and never applied out of order; and `discarded` counts refused frames for
observability — a rising count with no reset means a wrong-scope feed.

### The buffer cap is a refusal to grow without bound

`MAX_BUFFERED_FRAMES` is 4096. A buffer this deep means the history fetch is not coming back.
Resetting is honest; growing without bound is how a tab ends up holding a session's worth of frames
it will never apply.

### I10 a generation change lands in reset

A different generation invalidates the cursor, in EVERY channel shape.

It lands in `reset`, not in `seeding`. The first version used `seeding`, which reads right — the
scope does need re-seeding — but `needsRefetch` only reports `reset`, so a rebase left the scope
silently stranded: frames piled into the buffer, `bars` froze, and nothing ever asked for the
refetch. That is not a corner case: the adapter mints a fresh generation on EVERY socket reconnect,
so every reconnect stranded the scope until the 4096-frame cap fired a false gap.

`reset` is the state that already means "your data is invalid, refetch" — which is exactly what a
generation change says. Reusing it keeps one signal instead of two.

The rebase also runs BEFORE anything else in `applyFrame`, so no frame from a new generation is
measured against an old cursor. The rebased state then applies that frame as its first.

### I9 is gated on phase not on a zero baseline

A frame at or behind the cursor within the same generation is a NO-OP. The same reference goes back,
so a consumer memoising on identity does not repaint.

The guard is gated on PHASE, not on `baseline > 0`. `baseline: 0` is a legitimate value — "nothing
has closed yet" — not a sentinel for "no snapshot received", and the first version conflated the two,
so the identity guarantee silently did not apply to a zero-baseline channel.

On a `snapshot` channel the frame IS the state: every snapshot carries the complete scope, so it
restores the scope by itself, including out of a reset — there is nothing to refetch.

### seeded-delta is not a snapshot channel

Treating the two identically was a conflation. A `seeded-delta` scope's seed is the initial LOAD; the
snapshot frame carries series values and never the membership set. So it advances the cursor and the
series without taking the scope live — a scope that lost its membership to a generation change still
needs the load, and saying otherwise would let it go live holding an empty member set.

### A snapshot on a delta channel carries no history

On a delta channel the snapshot establishes the cursor and the seam anchor, and nothing else. It
carries no closed history — history is a cacheable, pageable resource and does not belong on the
low-latency lane.

### unanchored is not none

A cursor without an anchor is `unanchored`, NOT `none`. The distinction is the whole point: `none`
means "no seam exists"; `unanchored` means "a seam exists and I cannot prove it". Collapsing the two
is what let a stale window pass as verified.

### Reset is terminal until a refetch

The first version fell through, so a contiguous append arriving after a reset was APPLIED — it
recorded bars and advanced the cursor while the phase still said `reset` and `needsRefetch` still
said true. Data written under a label that denies it is worse than data refused: the consumer reseeds
anyway and cannot tell which bars were already there. Refuse, and count it, so the refusal is
visible. `applyOpen` refuses for the same reason: a scope awaiting a refetch draws nothing.

### A stranded scope asks again

`reset` announced a refetch that nobody performed. `needsRefetch` was exported, documented and
asserted by the conformance suite, and it had **zero callers** in `src/` — so the state that means
"your data is invalid, refetch" was a message with no reader. Because the adapter mints a fresh
generation on every socket reconnect, a chart went blank on the first reconnect and stayed blank
until the host changed symbol or timeframe, which is the only other thing that opens a new session.

`resumeScope` is the way back, and it is deliberately not `restartScope`. `restartScope` returns
`createScopeState`, which zeroes `baseline`, `baselineTime`, `seam` and `gen`. Reseeding from there
would throw away the cursor the reconnect snapshot has just established — the I14 defect this port
exists to close — and, with `seam` back to `none`, `seedHistory` would skip the anchor proof
entirely and report a `verified` seam it never checked. It lands in `seeding` rather than fetching
out of `reset`, because frames that arrive while the repair is in flight must be held in arrival
order (I12), and `reset` refuses them.

The repair is asked for, never taken. `reseed` lives on the session and the package's own bindings
call it; the machine does not fetch on its own. Three alternatives were knocked down:

- **The machine repairs itself when it enters `reset`.** Rejected on ownership: `fetchBars` is the
  host's backend, which the README assigns to the host and puts under *what the library will never
  do*. Spending a request is not "the same answer for every adapter" — rate limits, cost, auth and
  paging are all the host's. It also breaks third-party harnesses without a diff to point at: the
  conformance harness stages `setHistory` as *what the NEXT `fetchBars` resolves with*, and an
  unrequested fetch consumes the slot the adapter author staged for the next assertion.
- **The binding reopens the session.** Rejected because it drops a socket that has just come back,
  loses the bars closing during the teardown (I12 exists to capture exactly those), and resets
  `discarded`, which `rebase` and `restartScope` preserve on purpose as the wrong-feed sensor.
- **Expose the phase and let the host decide.** Rejected because the host already receives the whole
  `ScopeState` through `onState` and this package's two first-party consumers both dropped it. A
  signal with no reader is what produced this defect; a second one would not fix it.

Two bounds keep the repair from becoming the worse failure. Only one repair runs at a time, because
two windows in flight can land out of order and walk the bars backwards — corruption the blank chart
never had. And repairs stop after `MAX_CONSECUTIVE_REPAIRS`, which is 6: a history endpoint sitting
permanently behind the live edge would otherwise turn the repair into one fetch per frame. The bound
is a COUNT and not a delay because nothing in this layer may name a timer, so backoff is not
available here; a host that wants to pace retries owns the port and can.

### I4 an amend resets

A correction to an already-closed bucket is not applicable in place. The bucket may be anywhere in
the window and any in-place patch would be a guess about which one.

### applyMember was the only applier without a phase guard

I12, for the shape it exists to serve. The guard was missing, and its absence let a `seeded-delta`
scope go live off a single membership delta with no initial load ever applied — and, worse, let a
`member` frame flip a RESET scope back to `live` without any refetch, in any shape. `applyMember` was
the only applier without a phase guard.

### seedHistory I13 presence and I14 cursor survival

`seedHistory` applies the fetched history and releases the buffer — the second half of the seed
transaction.

I13 — the window must CONTAIN a bar at `baselineTime`. Not "reaches past it": the window may carry a
declared gap, and in that case a newer bar being present says nothing about the seam bar having
arrived. Presence is the only honest test.

I14 — the baseline is NOT reset here. This is the defect the whole phase exists to close: the client
this replaces rebuilt its state from the history window and pinned the cursor back to 0, throwing
away the baseline the snapshot had just established, and then needed a second round trip to get it
back. The window replaces the bars; the CURSOR survives untouched.

The verdict it returns says which of the three happened: `verified` (the window contains the anchor,
or there was no seam to check — safe to go live), `stale` (the window does not reach the live edge;
refetch, and never accept the next delta, I13), `unverifiable` (the producer sent a cursor with no
anchor — live, but the seam is UNPROVEN and said so).

### A stale window must not clear the buffer

On a stale window the state is returned UNCHANGED — still `seeding`, buffer intact.

The first version reset here, and `toReset` clears the buffer, so a refetch that then succeeded went
live having silently dropped every bar that closed during the failed attempt: exactly the loss this
transaction exists to prevent, produced by the fix for it. A stale window means the HISTORY was
behind; it says nothing about the frames, whose cursor never moved.

---

## src/port/seedTransaction.ts

### The seed transaction is one transaction not two effects

WHAT WAS WRONG. Seeding from history and subscribing to the live channel used to be independent
effects with independent triggers, and seeding reset the sequence cursor to zero. Two consequences,
one loud and one silent:

- loud — a seed landing after the snapshot threw away the baseline, so the next close read as a gap
  and forced a resubscribe to get the cursor back. A round trip to undo our own work.
- silent — if the history window was taken BEFORE bucket B closed, the client accepted B+1 as
  contiguous (B+1 === baseline+1 is perfectly true) and bucket B never entered the series. No error,
  no gap, no resync. That is the actual defect.

THE ORDER, and why each step is where it is:

1. subscribe FIRST — closes the window: a close during step 3 arrives as a frame and is buffered,
   instead of falling in the gap between two independent calls.
2. snapshot gives baseline B and anchor T — and START BUFFERING, applying nothing (I12).
3. fetch history.
4. does the window contain a bar at T? — the seam check (I13). This is the step that turns "should be
   fine" into proven.
5. release the buffer from B+1 — cursor never reset (I14).

Cancellable as a UNIT: abort tears down the subscription and the in-flight fetch together, so there
is no state in which one of the two halves survives the other.

### seeded-unverified is reported not folded into seeded

`SeedOutcome` carries `seeded-unverified` for the case that is seeded and live, but where the seam
could NOT be proven — the producer sent a cursor with no anchor (an older server, say). It is
reported rather than folded into `seeded`, because "checked and fine" and "could not check" are
different facts and a consumer may reasonably treat them differently.

At the return site the same argument runs again: the consumer is TOLD the seam could not be proven,
which is what a producer that sends a cursor without an anchor leaves us with. Saying nothing would
be indistinguishable from having checked, and that silence is the defect.

### openScope owns the AbortController

`openScope` opens a scope: subscribe, buffer, fetch, verify, release. The returned `unsubscribe` is
safe to call at any point, including while the fetch is in flight — that is I7, and it is the reason
the `AbortController` is owned here rather than by the caller. Here too the closure IS the token, and
it is idempotent, so calling it twice is not an error.

Step 1 subscribes BEFORE any fetch, so everything that closes from here on is captured. I7 then holds
on the frame path too: after unsubscribe nothing reaches the consumer, even if the transport is late.
Step 3's in-flight fetch shares the transaction's signal, so aborting the scope aborts the request —
there is no path where the response outlives the subscription. Steps 4 and 5 run the seam check and
then release the buffer with the cursor intact.

`SessionOptions.history` is the window requested from history, where `barCount` takes priority over
`[from, to)`; `maxRefetch` is how many times a stale window may be refetched before giving up.

### A stale window is refetched without publishing

I13 — the window does not reach the live edge. Refetch; never accept the next delta as contiguous
just because its sequence number happens to line up.

The stale verdict is NOT published: `seedHistory` returns the state untouched on a stale window, so
the machine stays in `seeding` with its buffer intact and keeps collecting whatever closes while we
go back for a better window. Publishing a reset here is what threw those frames away. Only when the
last attempt is spent does the session strand the scope and report `stale-history`.

### A stale window strands the scope out loud

The spent loop used to publish `restartScope`, which lands in `seeding` — and `needsRefetch` reports
only `reset`. So a scope that ran out of attempts went quiet in a phase that claims nothing is
wrong, kept a live subscription, and piled frames into the buffer until `MAX_BUFFERED_FRAMES` fired
a `gap` that never happened. That is the same stranding I10 documents, reached by a second road, and
it was invisible for the same reason: the phase did not match the situation.

`strandScope` lands it in `reset` naming `stale-history`, which gives that `ResetCause` member its
first producer — it had been declared and never emitted — and makes both roads to a stranded scope
report identically. One announcement, one repair path, one thing to remember.
