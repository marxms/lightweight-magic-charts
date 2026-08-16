# Changelog

All notable changes to this package are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
