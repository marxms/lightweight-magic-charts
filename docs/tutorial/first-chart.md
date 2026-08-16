# Your first chart

By the end of this page a chart is drawing in your browser: candles, a legend, a timeframe row, a
tab bar and a drawing rail, from one component and one file. No backend, no API key, no account.

It takes about ten minutes. Follow the steps in order — each one runs on its own, and the file you
end up with is the file shown in step 3, whole.

**This is a lesson, not a menu.** It makes the choices for you so you can see the result before you
have opinions about it. When you know what you want to change instead, go to [`../how-to/`](../how-to/);
when you want to know *why* a choice is the way it is, go to [`../explanation/`](../explanation/).

## Before you start

You need Node 18 or newer, a React project that builds `.tsx` (Vite's `react-ts` template is the
shortest route), and the two peer dependencies below. They are peers, not dependencies, and the
package declares no runtime dependency of its own.

| Peer | Minimum version | Why you supply it |
| --- | --- | --- |
| `react` | 18.0.0 (`>=18.0.0 <20`) | one React instance per application; two would break hooks |
| `lightweight-charts` | 5.2.0 (`>=5.2.0 <6`) | the renderer. This package never imports it at runtime — you hand it in |

If either is missing or out of range, npm refuses the install and names the range.

## Step 1 — install

```sh
npm install lightweight-magic-charts lightweight-charts react react-dom
```

## Step 2 — what the workspace needs from you

Three things, and it will not invent any of them:

- **a renderer** (`ChartEngine`) — an adapter over `lightweight-charts`, because that package is
  ESM-only and this one also ships CommonJS. You import it; the library talks through the seam;
- **a data source** (`MarketDataPort`) — where the bars come from. In this lesson it is a pure
  function of the bar index, so the same 240 candles draw on every load and nothing is fetched;
- **a catalogue** (`WorkspaceSetupPolicy`) — which panes exist, what they are called and which
  intervals your build serves. Naming a market or an indicator is your business, never the library's.

Everything else — the layout, the legends, the tabs, the focus order, the accessible names — comes
with the component.

## Step 3 — the file

Create `src/main.tsx` with exactly this. It is the whole application: the three seams above, the
mount, and nothing else.

```tsx
import {
  AreaSeries,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  type ChartOptions,
  type DeepPartial,
  type ISeriesApi,
  type SeriesType,
} from 'lightweight-charts';
import {
  ChartWorkspace,
  utcSeconds,
  type Bar,
  type ChartEngine,
  type MarketDataPort,
  type SeriesHandle,
  type SeriesShape,
  type WorkspaceChartHandle,
  type WorkspaceSetupPolicy,
} from 'lightweight-magic-charts';
import { createRoot } from 'react-dom/client';

// 1. THE RENDERER. One pass-through per member. Only the series kind needs translating, because the
// base library names one with an imported value and a structural port cannot carry a value.
const definitionOf = (shape: SeriesShape): unknown => {
  if (shape === 'candlestick') return CandlestickSeries;
  if (shape === 'line') return LineSeries;
  if (shape === 'histogram') return HistogramSeries;
  return AreaSeries;
};

const engine: ChartEngine = (container, options) => {
  const chart = createChart(container, {
    localization: { locale: 'en-US' },
    ...(options as DeepPartial<ChartOptions>),
  });
  const handle: WorkspaceChartHandle = {
    panes: () => chart.panes(),
    addPane: (preserveEmptyPane) => chart.addPane(preserveEmptyPane),
    applyOptions: (next) => chart.applyOptions(next as DeepPartial<ChartOptions>),
    timeScale: () => chart.timeScale(),
    subscribeCrosshairMove: (listener) => chart.subscribeCrosshairMove(listener),
    unsubscribeCrosshairMove: (listener) => chart.unsubscribeCrosshairMove(listener),
    subscribeClick: (listener) => chart.subscribeClick(listener),
    unsubscribeClick: (listener) => chart.unsubscribeClick(listener),
    remove: () => chart.remove(),
    addSeries: (shape, seriesOptions, paneIndex): SeriesHandle => {
      const created: ISeriesApi<SeriesType> = chart.addSeries(
        definitionOf(shape) as never,
        seriesOptions as never,
        paneIndex,
      );
      return created;
    },
  };
  return handle;
};

// 2. THE DATA. A pure function of the bar index: no clock, no random source, no network, so every
// load in every browser draws the same series and "it looks wrong here" stays reproducible.
const BARS: readonly Bar[] = Array.from({ length: 240 }, (_ignored, index): Bar => {
  const open = 100 + Math.sin((index - 1) / 12) * 8;
  const close = 100 + Math.sin(index / 12) * 8;
  return {
    time: utcSeconds(1_700_000_000 + index * 3_600),
    open,
    high: Math.max(open, close) + 0.8,
    low: Math.min(open, close) - 0.8,
    close,
    volume: 500 + (index % 40) * 12,
  };
});

const port: MarketDataPort = {
  fetchBars: async () => ({ bars: BARS, exhausted: true }),
  describe: () => [],
  subscribe: () => () => undefined,
};

// 3. THE CATALOGUE. One pane, two intervals. `title` is what the reader sees; `id` never is.
const catalogue: WorkspaceSetupPolicy = {
  catalogue: [{ id: 'price', title: 'Price action', heightPx: 320, defaultVisible: true }],
  servedTimeframes: ['1h', '4h'],
  gridFallback: ['1h'],
  maxGridCells: 4,
  density: { floor: 0.1, gamma: 1 },
  showDensity: false,
  showProfile: false,
  autoFit: true,
  coerceIndicators: () => [],
};

// 4. THE MOUNT. Three prop groups: what may be drawn, where the numbers come from, how much height.
const root = document.getElementById('root');
if (root !== null) {
  createRoot(root).render(
    <ChartWorkspace
      catalogue={catalogue}
      data={{ port, engine, symbol: 'DEMO-USD' }}
      layout={{ heightPx: 520 }}
    />,
  );
}
```

## Step 4 — run it

```sh
npm run dev
```

Open the page. You should see candles filling a pane about 520 pixels tall, a legend above them, a
row of interval chips reading **1h** and **4h**, a tab bar, and a rail of controls down the side.
Click **4h**: the chips move, the same series redraws. Drag the divider under the pane: the height
splits and the legend follows.

## What you are looking at

Two things on that page are the library telling you the truth rather than failing, and both are
worth recognising now rather than filing as bugs later.

**A notice saying the history-to-live seam could not be proven.** The port above answers history and
subscribes to nothing — `subscribe` returns the function that detaches a channel that was never
attached. That is a legitimate adapter, and the workspace says so instead of pretending. Give it a
live channel and the notice goes.

**One pane, not two.** The catalogue authorises panes; it does not fill them. A pane with no
authored series is drawn as a titled empty pane, which is why this lesson declares one. Pass the
`panes` prop and each entry gets its series.

## Where to go next

You now have a mount and three seams you own. The next questions each have one page:

| I want to… | Go to |
| --- | --- |
| draw my own panes and indicators | [`../how-to/inject-catalogue.md`](../how-to/inject-catalogue.md) |
| keep tabs between visits | [`../how-to/persist-tabs.md`](../how-to/persist-tabs.md) |
| connect a real drawing library | [`../how-to/bind-drawing.md`](../how-to/bind-drawing.md) |
| make the controls look like my product | [`../how-to/replace-chrome.md`](../how-to/replace-chrome.md) |
| draw something of my own over the chart | [`../how-to/write-an-overlay.md`](../how-to/write-an-overlay.md) |
| look up a symbol or a signature | [`../reference/_index.md`](../reference/_index.md) |

And when you want the argument rather than the recipe — why the renderer is injected, why there is
no dialog, why the catalogue cannot live here — the measurements are in
[`../explanation/`](../explanation/README.md). Start with
[`../explanation/entry.md`](../explanation/entry.md) for what the entry exports and what it deliberately
does not, and [`../explanation/port.md`](../explanation/port.md) for the data seam you just filled.
