# lightweight-magic-charts

A React chart workspace you mount as one component. Hand it a catalogue of what may be drawn, a data
port and a height budget, and you get stacked panes with legends, tabs, a series menu, a drawing rail,
price alerts, density overlays and a compact grid — laid out, keyboard-reachable and labelled, without
configuring anything visual.

It is **not** an indicator catalogue, **not** an exchange client and **not** a design system. Those
three are yours, and the line between them and this package is the first thing to read: see
[The ownership boundary](#the-ownership-boundary).

**[See it running →](https://marxms.github.io/lightweight-magic-charts/)** — the example below, built
from the published version rather than from the default branch, so what the page renders is what
`npm install` hands you.

## Install

```sh
npm install lightweight-magic-charts lightweight-charts react
```

### Peer dependencies

Two, both required, and there is no runtime dependency at all — anything on the public signature is a
peer by design.

| Peer | Range | Why it is a peer |
| --- | --- | --- |
| `react` | `>=18.0.0 <20` | one React instance per application; two would break hooks |
| `lightweight-charts` | `>=5.2.0 <6` | the renderer you inject through `ChartEngine`. This package never imports it at runtime |

An install outside either range is refused by npm with the range named. That refusal is measured
rather than promised, by `test/gates/packaging.spec.ts` — which runs in the monorepo this package was
extracted from, because it also checks the declarations against a consumer that lives there. In this
repository the suite skips it and CI proves the narrower claim instead: that every path `files[]` and
`exports` promise resolves to something that exists.

### Entry points

```ts
import { ChartWorkspace } from 'lightweight-magic-charts';
import { CONFORMANCE_CASES } from 'lightweight-magic-charts/conformance';
```

The conformance suite leaves by its own subpath so that mounting the workspace never carries it into
a bundle. ESM and CommonJS are both published and selected by the `exports` map; declarations resolve
under `moduleResolution: "node"` down to TypeScript 4.9 — the last of those three is the clause the
extracted checkout cannot re-measure on its own, for the reason given under the peers above.

## Minimal working example

This is `example/App.tsx`, verbatim — the same file the runnable example mounts. It is a HOST's
mount: the library composes, lays out and labels; the host supplies the vocabulary (`panes`,
`studies`) and the numbers (`data`).

```tsx
import { ChartWorkspace, resolutionPolicy, resolveSources } from 'lightweight-magic-charts';
import type { Bar } from 'lightweight-magic-charts';
import type { ReactElement } from 'react';

import { DEMO_CATALOGUE } from './catalogue';
import { DEMO_DRAWING_VOCABULARY, demoDrawingBinding } from './drawing';
import { demoEngine } from './engine';
import { DEMO_PANES, STUDY_CAPACITY } from './panes';
import { DEMO_DENSITY, demoPort, demoRead } from './port';
import { DEMO_STUDY_CATALOGUE, demoLookup } from './studies';
import { STUDY_PARAM_SECTIONS } from './studyForm';

/**
 * The drop-in, mounted the way a HOST mounts it.
 *
 * IT USED TO MOUNT THE MINIMUM, and that was the right file for a contract test and the wrong one
 * for a published page. `0.1.0` shipped showing three required prop groups and nothing else: an
 * empty volume lane, a studies panel with nothing in it, no density, no trough. Every absence was
 * correct behaviour for what it was given, which is precisely why it read as broken — the page
 * demonstrated the library's floor and was presented as its shape.
 *
 * What it shows now is the seam, in both directions: the library composes, lays out, labels and
 * keyboard-reaches; the host supplies the vocabulary (`panes`, `studies`) and the numbers (`data`).
 * Nothing below computes a chart, and nothing below styles one.
 */
/**
 * `lanes` IS THE TOTAL STUDY CAP, not the number of lanes left over after the overlays.
 * `resolveSources` starts with `laneOrder(active, policy.lanes)`, which truncates the chosen list
 * to that many entries — overlays included. Set to 2 while the panel offered `capacity: 6`, it let
 * a visitor pick six studies and silently resolved the first two. The two numbers are one number,
 * so they are written as one.
 */
const POLICY = resolutionPolicy({ lanes: STUDY_CAPACITY, plotsPerLane: 3 });

export function App(): ReactElement {
  return (
    <ChartWorkspace
      catalogue={DEMO_CATALOGUE}
      panes={DEMO_PANES}
      data={{
        port: demoPort,
        engine: demoEngine,
        symbol: 'DEMO-USD',
        read: demoRead,
        density: DEMO_DENSITY,
      }}
      layout={{ heightPx: 620 }}
      /**
       * THE HOST'S OWN SECTION, and it is a module-scope constant for a measured reason: a
       * `sections` array built in this render would hand `SeriesMenu` a new `Body` every time, and
       * a new `Body` is a new element type — a remount, and the caret dies on the first character
       * typed into it. One section, declared once, never reordered.
       */
      chrome={{ sections: STUDY_PARAM_SECTIONS }}
      drawing={{ vocabulary: DEMO_DRAWING_VOCABULARY, binding: demoDrawingBinding }}
      studies={{
        catalogue: DEMO_STUDY_CATALOGUE,
        // RESOLVED BY THE HOST, on demand. The library hands over the chosen ids and the bars in
        // view; what those ids mean is the host's dictionary, and `resolveSources` is the helper
        // the package publishes for exactly this call rather than a private one it keeps.
        resolve: (ids: readonly string[], bars: readonly Bar[]) =>
          resolveSources(ids, demoLookup, bars, POLICY),
        capacity: STUDY_CAPACITY,
        // Without lanes there is nowhere for an own-pane study to go, and picking one would look
        // like nothing happening.
        lanes: { plots: 3, colors: ['#f5a623', '#4c9aff', '#c792ea'], heightPx: 120 },
      }}
    />
  );
}
```

The catalogue is the one piece of authored data the mount needs. This is `example/catalogue.ts`,
verbatim:

```ts
import type { WorkspaceSetupPolicy } from 'lightweight-magic-charts';

import { DEMO_STUDY_IDS } from './studies';

/**
 * What this build offers: two panes, two intervals, and a coercion function for whatever a
 * previous visit stored. Titles are not identifiers — `price` is displayed as `Price action`,
 * so the only way to render that string is to have read `title`.
 *
 * THE OVERLAYS ARE ON, and that is a correction rather than a preference. The first published page
 * had `showDensity` and `showProfile` off and `coerceIndicators` returning an empty array, so the
 * density field, the volume trough and every study were unreachable — a visitor met the drop-in's
 * minimum and had no way to learn the rest existed. Defaults on a REFERENCE page are the feature
 * list; off, they are a feature list of nothing.
 */
export const DEMO_CATALOGUE: WorkspaceSetupPolicy = {
  catalogue: [
    { id: 'price', defaultVisible: true, heightPx: 320, title: 'Price action' },
    { id: 'volume', defaultVisible: true, heightPx: 110, title: 'Traded volume' },
  ],
  servedTimeframes: ['1h', '4h'],
  gridFallback: ['1h'],
  maxGridCells: 4,
  density: { floor: 0.1, gamma: 1 },
  showDensity: true,
  showProfile: true,
  autoFit: true,
  /**
   * KEEPS WHAT THIS BUILD STILL OFFERS, drops the rest. Returning `[]` unconditionally — which is
   * what the first version did — is indistinguishable from "the stored payload was invalid", so a
   * visitor's chosen studies vanished on every reload with nothing saying why.
   */
  coerceIndicators: (raw) =>
    Array.isArray(raw) ? raw.filter((id): id is string => DEMO_STUDY_IDS.includes(id as string)) : [],
};
```

The other two siblings are the adapters every host writes once: `example/port.ts` implements
`MarketDataPort` over a deterministic in-repository generator, and `example/engine.ts` implements
`ChartEngine` over `lightweight-charts`. Both are yours to own — see the boundary below.

### Run it

```sh
npm run example
```

One command, no backend and no credential. It builds the ESM output, bundles the page with esbuild
and serves it on <http://127.0.0.1:5173>; nothing is written to disk. The candles come from a pure
function of the bar index rather than from a clock or a random source, so every load draws the same
240 hourly bars — a reference that changed per visit would be no reference at all.

One thing on that page is the library telling the truth rather than failing, and it is worth
recognising before you meet it in your own mount: a notice saying the history-to-live seam could
not be proven, because this port has no live channel. What it no longer shows is an empty *Traded
volume* pane — that lane was empty because a
catalogue entry with no authored series is drawn as a titled empty pane. Pass `panes` and it fills.

## The ownership boundary

**This is the package's central decision, and it is invisible from the type signatures alone.** The
split is not "library renders, host styles". It is: *the host owns the vocabulary and the platform;
the library owns the composition and the chrome.* Read this before filing anything as a missing
feature — several absences on the library side are contract, not omission.

The licence position behind this split — the two peers, the zero runtime dependencies, the three
MIT libraries that belong to the application and the gates that hold each claim — is written down in
[`docs/explanation/ownership-and-licensing.md`](docs/explanation/ownership-and-licensing.md).

### What the host owns

| The host owns | Reaches the library as | Why it cannot be ours |
| --- | --- | --- |
| **The authorial catalogue** — which panes exist, what they are called, which intervals are served, which series they carry | `catalogue: WorkspaceSetupPolicy`, `panes: PaneSpec[]`, `studies.catalogue` | naming an indicator names your business. A gate fails the build if a business word appears in `src/` |
| **Market convention** — which colour and which position mean "up" | `data.convention: PriceScaleConvention` | red-is-up is a real market convention, not a bug. The library defaults to the Western pair and audits the encoding, it does not decide it |
| **Symbol search** — the picker, the list, the fuzzy match, the dialog | `data.onSymbolRequest`; the library shows the current symbol and emits the request | a dialog needs a portal and a focus trap; opening one belongs to your shell |
| **The drawing binding** — which drawing library, which tools, what a saved drawing is | `drawing.vocabulary`, `drawing.binding: DrawingBinding` | the rail is generic composition; the drawing engine is a dependency decision |
| **Tab storage** — where a tab set is between visits, how an older payload migrates, and how a set leaves the machine | `tabs.store: WorkspaceStore`, `tabs.migrate`, `tabs.onExport` (the file write itself goes through your `WorkspaceExporter`) | the library touches no platform. Without a store, tabs live for the session and die on unmount — including on a fullscreen dialog that unmounts on exit |
| **The renderer** — the chart instance itself | `data.engine: ChartEngine` | `lightweight-charts@5` is ESM-only; importing it at runtime would break the CommonJS build for everyone |
| **The data** — history, live frames, reconnection semantics of your transport | `data.port: MarketDataPort` | it is your backend. The executable conformance suite says what an adapter must satisfy |
| **The look of a control** | `chrome.components`, `chrome.theme` | it is your design system |
| **Indicator arithmetic** — what a study computes | `studies.resolve` / `studies.views`, `data.read` | see the first row: the words are yours |

### What the library owns

| The library owns | Why it is generic |
| --- | --- |
| **Generic constructors** — `computeLayout`, the pane budget, the tab reducer and codec, indicator resolution, the catalogue builders | arithmetic with no DOM and no business word. Importing them pulls in neither React nor a canvas |
| **The composition** — regions, their order, what each may read, and which state crosses regions (alerts, the armed tool, the active pattern set) | a list of toggleable, reorderable rows is generic. *Which* rows exist is catalogue, and arrives injected |
| **The chrome** — the five roles below, the label channel, focus order, roving focus, live regions, the accessible names | accessibility is not a per-host decision, and a host that had to reassemble it would get it wrong |
| **Layout policy** — how price and studies split a height budget, what happens to a collapsed pane, what a reconnect does to a scope | it is the same answer for every adapter |

### What the library will never do

A request on this list is answered with "that one is yours":

- **open a dialog** — no portal, no focus trap. It asks; you open;
- **search for a symbol** — it shows the current one and emits the request;
- **know your backend** — it receives a port you implemented;
- **register a plugin by name** — extension is by instance. A registry needs an import for side
  effects, which kills tree-shaking for everyone;
- **inject global CSS** — every style is inline over theme tokens you can replace.

## The five chrome roles

Every control the composition paints is one of five roles. You may replace any of them wholesale;
you replace none of them by default. Five is the ceiling, not a starting point — the sixth extension
point is `chrome.sections`, which injects *content*, not a control.

| Role | What it is | The obligation you take on |
| --- | --- | --- |
| `Pill` | chip with visible text — the highest-traffic role | render a native `button`; map `state` to the right ARIA (`aria-pressed` for `toggle`, `aria-checked` for `radio`, `aria-expanded` for `menu`, nothing for `action`) |
| `IconButton` | glyph-only control | `label` is required *in the type*, because a glyph is not a name. Put it on the accessible name AND on `title`; accept `ref`, `controls`, `hover` and `testId` |
| `Toggle` | a binary in widget form | `role="switch"` with `aria-checked` — never `aria-pressed`. `label` is mandatory; let the browser keep Enter and Space |
| `Tooltip` | rich tooltip over a single trigger element | the panel *describes*, it does not label: wire `aria-describedby`, keep the panel a sibling of the trigger, close on Escape without leaking the key. Disabled, fall back to the native `title` |
| `Notice` | the only error surface, and the only live region | `severity` decides the insistence: `error` is assertive, the rest polite. Honour `onDismiss` and `dismissLabel` |

Skip one and you get the built-in — `chrome.components` takes each role independently, so replacing
`Pill` leaves the other four alone.

### Overriding a role

Annotate the whole `chrome` object and every role is typed for you by inference. The five prop types
are not exported by name — the entry publishes only what has a consumer, and a type reached through
`ChartWorkspaceProps` already is one — so this is the path, not a workaround. The worked recipe, the
partial override and the traps are one page:
[`docs/how-to/replace-chrome.md`](docs/how-to/replace-chrome.md).

**Hoist it, or memoize it.** `chrome` is context, and context is for what never changes. A new object
literal per render invalidates every consumer, and the symptom is not a warning — it is the panel
closing itself and focus getting lost. The same rule covers `chrome.theme`, `chrome.labels` and
`chrome.sections`.

And the type is the weaker half of the contract: a role that spreads `...rest` onto a `div` and drops
`aria-pressed` compiles fine and silently voids a dozen accessibility criteria — in a host written in
plain JavaScript it is not checked at all. The obligations in the table above are what the type
cannot state.

### Words on the screen

Every sentence the composition can say lives in one channel, `chrome.labels`, English by default and
overridable member by member — `DEFAULT_WORKSPACE_CHROME_LABELS` is the whole of it. Sentences that
depend on a value are functions (`workspace(symbol)`, `state(symbol, timeframe, panes)`), so a host
translating them keeps control of word order. Colours come from `chrome.theme`, whose default is
`DEFAULT_WORKSPACE_THEME`.

## Documentation

`docs/` follows four quadrants, each answering one kind of question — the map is
[`docs/README.md`](docs/README.md).

| I want to… | Go to |
| --- | --- |
| get a chart drawing, having never seen this package | [`docs/tutorial/first-chart.md`](docs/tutorial/first-chart.md) |
| do one specific thing | [`docs/how-to/`](docs/how-to/inject-catalogue.md) — catalogue, drawing, tabs, chrome, overlays |
| look up a symbol or a signature | [`docs/reference/_index.md`](docs/reference/_index.md), derived from the entry |
| understand why it is shaped this way | [`docs/explanation/README.md`](docs/explanation/README.md) |

And the two files that are not documentation about the code but about the project:

- **[`CHANGELOG.md`](CHANGELOG.md)** — what shipped, and what counts as a breaking change.
- **[`CONTRIBUTING.md`](CONTRIBUTING.md)** — the commands that exist, the gates that decide and what
  each one does *not* answer, and what a pull request has to carry.

## License

Apache-2.0. See [`LICENSE`](LICENSE), and [`NOTICE`](NOTICE) for what the name might otherwise imply:
this package is not affiliated with, sponsored by or endorsed by TradingView, Inc.
