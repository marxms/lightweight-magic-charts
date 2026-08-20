# Changelog

All notable changes to this package are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.2.1 — 2026-08-20

The magnet shipped as a mode the user controls, and the cursor was never told. With the magnet off
the anchor landed exactly where it was aimed — measured, and asserted in the browser — while the
crosshair on screen stuck to the candle's close. So the user aimed at one price, saw another, and
got a third, and free placement read as broken when it was working.

### Fixed

- **The crosshair follows the magnet.** Not a regression of `0.2.0`: `CrosshairMode.Magnet` is
  `lightweight-charts`' own default, and nothing in this package or its example had ever set
  `crosshair`, so the cursor had been sticking to the close since the first deploy. What `0.2.0`
  changed is that it gave the anchor a choice and left the cursor out of it, which is what turned a
  quiet default into a visible contradiction. A surface with a drawing layer attached now applies
  `CrosshairMode.Normal` while the magnet is `off` and `CrosshairMode.MagnetOHLC` while it is `on` —
  `MagnetOHLC` and not `Magnet`, because `snapAnchorPrice` chooses among open, high, low and close
  while `Magnet` takes the close alone, and a cursor magnetised to a smaller set is the same
  disagreement in a better disguise. Read in a real browser off `chart.options()`, the resolved
  option rather than the one passed in: `1` before this release with the toggle off, on and off
  again; `0`, `3`, `0` after it.

  **Where a host supplies its own `crosshair`, the library's mode wins** — but only where a drawing
  layer is attached. `ChartEngine` passes options through verbatim and the port publishes no reader,
  so a host's value cannot be read, remembered or given back; honouring one would rest the promise
  on a value the library cannot see. A surface mounted with no drawing binding is left exactly as
  the host configured it, because with no anchor to place there is nothing to disagree about.

No API changed, nothing was added and nothing was removed.

## 0.2.0 — 2026-08-20

Two gestures a chart user arrives already knowing did not work. Resizing a drawing was impossible —
pulling an anchor panned the chart underneath it, so the shape never reached where it was being
taken. And every anchor landed on a bar boundary whether or not that was wanted, with no magnet to
turn off, so freehand placement between bars could not be expressed at all.

### Fixed

- **An anchor drag moves the anchor and nothing else.** While a press holds a drawing anchor the
  chart's `handleScroll` and `handleScale` are held at `false`, and both are restored on release —
  including a release outside the container, a `blur` that abandons the gesture, and a surface that
  unmounts mid-drag, which frees the axes without touching a chart the base library has disposed.
  A press that lands anywhere other than an anchor is left alone, so panning stays the default
  gesture, and so is a press outside the price pane — a study pane sits below it in the same
  container, where the hit-test reads coordinates that are not the pointer's. Proven in a real
  browser: a 200 px horizontal pull leaves the visible bar range byte-identical while the drawing's
  anchors move. Both reads the host supplies are guarded: a hit-test or a pane reader that THROWS —
  `chart.panes()` does once the chart is disposed — costs one missed lock rather than an error in
  the page. A pane the chart cannot name yet answers `null`, which is an answer and not a failure,
  and keeps the whole container.
- **An abandoned price-alert drag gives the axes back.** The drawing lock released on `blur` from
  the day it was written and the alert layer did not, so a tab switch with a level still held wrote
  the lock and never took it back — a frozen chart with a drag in flight, reachable with no drawing
  layer mounted at all. The level SETTLES where it was left rather than being discarded: the pointer
  never left the pane, and reading a lost focus as a level thrown off the pane would delete
  something the user merely stopped touching.

### Added

- **The magnet, as a mode the user controls.** `off` and `on`, **defaulting to `off`** — a library
  that defaults to the behaviour being complained about has not fixed it. With the magnet on, an
  anchor placed within reach of a bar's open, high, low or close resolves to that value; with
  nothing in reach, and with the magnet off, it resolves to the pointer's own price. A tie between
  two bar values goes to the higher price, so the outcome is decided rather than incidental.
  **Price only:** an off-bar time has no coordinate and would not render, which is measured in the
  spec rather than assumed.
- **The reach is a SCREEN distance, eight pixels by default.** A price-unit tolerance means one
  thing at 60 000 and another at 0.4, and something different again after a zoom. The gesture is a
  screen gesture.
- **The rail draws the magnet and the host names it** — the same shape as the cursor, the
  delete-selection and the clear-all controls it already draws, each with its glyph from the package
  and its word from `DrawingToolbarLabels`. A `DrawingToolbar` mounted with no magnet group draws no
  toggle, so a rail that never asked for one keeps the rail it had.
- **`attachAxisLock`** and **`AxisLockHost`** — the whole drag lock except the hit-test, for a host
  that composes its own surface instead of re-deriving it.
- **`snapAnchorPrice`**, **`SnapInput`** and **`MagnetMode`** — the snap rule, pure and testable,
  with no knowledge of pointers or React.
- **`DrawingLayer.anchorAt?`** — the one engine-specific fact the package cannot know: is there an
  anchor at this point? Optional, so a binding written before this release compiles and runs
  unchanged; it simply goes without the lock.
- **`DrawingSurfaceHost.snapPrice`** — the snap rule handed to the binding already bound to the live
  bars, mode and reach, so the binding calls it where it currently uses the raw pointer price.
- **`WorkspaceDrawingOptions.snapThresholdPx`** — the reach, and only the reach. The mode is
  deliberately not a prop: it would hand the host a value the package must also write, and the two
  would disagree the moment a shortcut armed it.
- **`DrawingToolbarLabels.magnet`** — optional, with the published default supplying the word.

### Changed

- **BREAKING — `DrawingToolbarProps` regroups three props into one.** `onDeleteSelection`,
  `onClearAll` and `drawingCount` are now `edits: { onDelete?, onClear?, count? }`. This is the one
  break that reaches a host's PRODUCTION code in this release, and it was forced rather than chosen:
  `test/gates/propCount.spec.ts` caps a component at twelve top-level props and
  `DrawingToolbarProps` sat at exactly twelve, so the magnet group took a slot that had to be freed.
  Breaking by the rule below, which counts narrowing what an exported type accepts. A host migrates
  by moving three arguments into one object.

  ```tsx
  // before
  <DrawingToolbar onDeleteSelection={remove} onClearAll={clear} drawingCount={count} … />
  // after
  <DrawingToolbar edits={{ onDelete: remove, onClear: clear, count }} … />
  ```

One other addition narrows an exported type, and it is named here rather than folded into the
sentence above. **`DrawingSurfaceHost.snapPrice` is a required member**, and by the rule below
narrowing what an exported type accepts is breaking. It is breaking in one direction only: the
package CONSTRUCTS that object — in `src/react/surface/useDrawingSeam.ts`, the only place it is
built — and hands it to the binding, which merely receives it. A host that implements
`DrawingBinding` is therefore untouched, the same direction `Session.reseed` was released under in
0.1.1. A host that FABRICATES a `DrawingSurfaceHost` of its own, which a test double or a wrapping
binding does, adds the member:

```ts
// a host double, before and after
const host = { chart, series, container };
const host = { chart, series, container, snapPrice: ({ price }) => price };
```

`0.2.0` is correct either way: while the version stays in `0.x` a break bumps the minor, and this
release bumps it for the feature regardless. Everything else added here is a new export, a new
optional prop, or a new optional label with a default.

### Size

The entry moves from 103,007 B to **104,932 B** (+1,925 B), re-pinned in both ledgers with a named
reason per step — the last of them the pane reader's throw guard, at 11 B, and the pane guard itself
before it, at 112 B. 349 B of that came back out of this feature's own modules rather than out of
unrelated code, measured one candidate at a time: the snap winner held in two scalars, one factory
for the axis pair, one call for the release listeners, and the snap input built by spread. The hard
cap — `lightweight-charts` under the same probe — is 195,761 B.

## 0.1.1 — 2026-08-17

A chart went blank on the first socket reconnect and stayed blank until the host changed symbol or
timeframe. The state that means "refetch me" was announced and never answered.

### Fixed

- **A stranded scope asks again.** Every reconnect mints a generation, the machine rebases into
  `reset`, and `reset` refuses every later frame. `needsRefetch` reported exactly that and had no
  caller anywhere in the package, so the refusal was permanent. `Session` now carries **`reseed`**,
  and the workspace's own lane and compact cells call it. The repair reuses the live subscription —
  no socket is dropped — and refuses without touching the network when the cursor is not back yet,
  when there is nothing to repair, or when its ceiling of six consecutive failures is spent.
- **A spent stale window says so.** The exhausted refetch loop published `restartScope`, which lands
  in `seeding` — a phase `needsRefetch` does not report. A scope that ran out of attempts went quiet
  and piled frames until the buffer cap fired a gap that never happened. It now lands in `reset`
  naming `stale-history`, which gives that `ResetCause` member its first producer.

### Added

- **`Session.reseed`** — one verdict per repair, because `outcome` describes the first seed and a
  settled promise cannot carry what happens after it.

Neither is breaking by the rule below: a member added to a type the package RETURNS, and which no
host implements, is a new export rather than a new obligation.

## 0.1.0 — 2026-08-14

First release. The chart workspace that lived inside one dashboard became a package that any React
application can mount, and the extraction is what this entry is about.

### Added

- **`ChartWorkspace`** — the whole composition behind a single component: panes, series, indicator
  lanes, drawings, price alerts, tabs and the compact grid.
- **A pure core.** `computeLayout`, the pane budget, the tab reducer and codec, the indicator
  resolution and the catalogue builders are browser-free arithmetic — importing them pulls in
  neither React nor a canvas.
- **`MarketDataPort`** — the data boundary the host implements, and **`lightweight-magic-charts/conformance`**,
  the executable suite an adapter must pass. It ships as a subpath so that importing the workspace
  never carries the suite into a bundle.
- **A chrome contract.** Five slot roles (`Pill`, `IconButton`, `Toggle`, `Tooltip`, `Notice`) a
  host may replace wholesale, and **`WorkspaceChromeLabels`** — every sentence the composition can
  say, in one channel, English by default.
- **`ChartEngine`** — the injection seam. The package never imports the renderer at runtime; the host
  hands one in, which is what keeps the CommonJS build honest against an ESM-only peer.
- **Packaging.** ESM and CommonJS selected by an `exports` map, with `typesVersions` so a consumer on
  `moduleResolution: "node"` — TypeScript 4.9 included — still resolves the declarations.
- **Apache-2.0**, with a `NOTICE` that says plainly what the name might otherwise imply: this package
  is not affiliated with, sponsored by or endorsed by TradingView, Inc.

### Changed

Fourteen differences a user can SEE, relative to the dashboard this came from. None is a bug being
reported as a feature; each is a consequence of a contract drawn during the extraction, and each is
listed so nobody has to rediscover it against a screen. Several are accessible names and
`data-testid` values, which the rule below counts as breaking precisely because a host's own tests
hold on to them.

Fourteen is not a round number picked for this file. It is the size of the behaviour ledger the
source repository keeps for this cutover, and a test fails if this list and that ledger stop
agreeing — so the section cannot quietly report three of fourteen again.

- **The market trigger has no `data-testid` of its own.** It is reached by its accessible name
  instead. The search dialog it opens was never part of this package and still is not: the host owns
  the control's value and its list.
- **The status line no longer names the panes it reports on.** `WorkspaceChromeLabels.status` receives
  a COUNT of visible panes, not their names, so the sentence it can build stops at the number. The
  price pane is outside that count, because it is the anchor that absorbs the leftover height rather
  than a pane competing for it. A host that wants the names has to say them from its own state.
- **A timeframe the catalogue stopped serving falls back to the FIRST served one.** It no longer
  falls back to whatever the host passed as its initial timeframe: the coercion belongs to the setup
  policy, and the policy has no field in which to hold a host preference.
- **A catalogue that shrinks at RUNTIME no longer re-scopes, and no longer warns.** Reconciliation
  happens when a tab is read, not when the catalogue changes under a mounted workspace. The setup is
  the composition's, and the host does not write into it.
- **The empty-window refusal no longer names the interval.** It speaks of the window that was left
  empty — `No bars for <symbol>.` — rather than of the splice that emptied it, because the
  composition restores the scope before it speaks.
- **The price legend names only the market.** The interval left that line and is still said in the
  status line directly below it.
- **Pane labels stack in the TAB's order.** That is the catalogue's order. Previously they stacked in
  whatever order the caller happened to assemble the pane list in.
- **The pane row lost its own key attribute.** It carries the `data-testid` the composition mints
  for it, and that is what identifies a row now.
- **The grid toggle and the add-cell control have no `data-testid` of their own.** Both are reached
  by accessible name.
- **Each half of the line/bars pair GAINED an accessible name of its own** — `Draw <series> as a
  line` and `as bars`. They used to be two buttons saying `line` and `bars` without saying whose.
- **The candle-pattern chips are identified by the pattern's full name, and no longer survive a tab
  switch.** The per-pattern `data-testid` left with the host's chrome. The pattern set is session
  state, deliberately outside the tab contract: a tab carries panes, interval, symbol and the density
  tuning, and nothing else, so switching away and back reopens the section with nothing selected. The
  current interval does survive, because that one IS a tab field.
- **The drawing rail's `data-testid` values are prefixed by the workspace** — `chart-workspace-drawing-…`.
  One prefix, minted once, instead of names each region chose for itself.
- **The full-screen button is rendered BELOW the footer.** It is host chrome, so it now sits inside
  the height budget the composition hands out, rather than in the bar across the top.
- **A pushed live reading repaints the panel, not the whole screen.** The value still arrives from
  the host; what carries it is the panel's own re-render, because the composition's regions are
  memoised and a chrome toggle no longer repaints the reading.

Two of those are the same shape of loss — the status line and the price legend — and `notices.noBars`
and `notices.unverifiedSeam` are a third: the label signature does not carry the datum, so the
sentence cannot name it. Widening a signature is a breaking change to the label contract, so it waits
for a major.

### What counts as a breaking change

Written down here so that a future entry can be read against a rule rather than against taste. While
the version stays in `0.x`, a break bumps the minor; from `1.0.0` it bumps the major.

Breaking:

- removing or renaming an export, or narrowing what an exported type accepts;
- adding a required prop, a required field to a setup object, or a required member to a label group;
- widening a label signature — a host supplying its own function would stop compiling;
- adding a member to `MarketDataPort`, or tightening what the conformance suite demands of one;
- raising the floor of a peer range;
- changing an accessible name, a role or a `data-testid`, because those are what a host's own tests
  hold on to.

Not breaking: a new optional prop; a new optional label with a default; a new export; a change to
the default English wording that no signature carries; anything under `dist/` that the `exports` map
does not name.

### Known limitations

- `src/indicator/coverage.ts` still builds its footer report in Portuguese, because no label channel
  reaches it yet and a consumer asserts that exact text.
- The package declares `react` and `lightweight-charts` as required peers. There is no optional peer
  and no runtime dependency; anything on the public signature is a peer, by design.
