# Draw your own panes and indicators

**The question:** I have my own series and my own indicator arithmetic. How do they reach the chart?

Through three props, and none of them is optional-by-accident — the library ships no catalogue of its
own on purpose. The argument for that is in
[`../explanation/catalogue.md`](../explanation/catalogue.md); this page is the wiring.

| Prop | What it settles | When you need it |
| --- | --- | --- |
| `catalogue` | which panes may exist, their titles and heights, which intervals your build serves | always — it is a required prop |
| `panes` | the actual series drawn in each pane, with shape, colour and number format | as soon as you want a line, not an empty titled pane |
| `studies` | the indicator menu, and the arithmetic behind whatever the reader picks | when the reader chooses what to plot |

## Step 1 — declare the panes and their series

`catalogue` authorises a pane; `panes` fills it. A pane that appears in the first and not the second
is drawn as a titled empty pane, which is a legitimate state and a common first surprise.

Identifiers are branded — `paneId` and `seriesId` are the only way to make one, so a bare string
cannot drift into the wrong slot.

```ts
import {
  paneId,
  seriesId,
  type PaneSpec,
  type SeriesSpec,
} from 'lightweight-magic-charts';

const CLOSE: SeriesSpec = {
  id: seriesId('price.close'),
  label: 'Close',
  shape: 'line',
  color: '#4c8dff',
  lineWidth: 2,
};

const TURNOVER: SeriesSpec = {
  id: seriesId('volume.turnover'),
  label: 'Turnover',
  shape: 'histogram',
  color: '#7a8699',
  barDirectionColoring: true,
};

export const PANES: readonly PaneSpec[] = [
  {
    id: paneId('price'),
    title: 'Price action',
    format: { kind: 'price', minMove: 0.01 },
    series: [CLOSE],
    defaultVisible: true,
  },
  {
    id: paneId('volume'),
    title: 'Traded volume',
    format: { kind: 'compact', decimals: 1 },
    series: [TURNOVER],
    targetHeightPx: 110,
    defaultVisible: true,
  },
];
```

## Step 2 — hand over the numbers

A `SeriesSpec` says how a line looks, never what it holds. The values arrive through `data.read`,
which is asked for one pane and one series at a time and answers with one reading per bar. `null` is
a gap, not a zero — a chart that draws a gap as zero invents a crash.

The reader closes over the bars you already hold, which is why it is written as a factory:

```ts
import type { Bar, PaneSpec, SeriesReader, SeriesSpec } from 'lightweight-magic-charts';

export const readerFor = (bars: readonly Bar[]): SeriesReader => {
  return (_pane: PaneSpec, series: SeriesSpec): readonly (number | null)[] => {
    if (series.label === 'Turnover') return bars.map((bar) => bar.volume ?? null);
    return bars.map((bar) => bar.close);
  };
};
```

Pass it as `data={{ port, engine, symbol, read: readerFor(bars) }}`.

## Step 3 — offer indicators, and compute them

`studies.catalogue` is the menu the series picker shows. Each entry carries a `provider`, which is a
pure function from bars to points: same bars, same points, no clock and no fetch.

```ts
import { seriesId, type Bar, type Point, type SeriesCatalogueEntry } from 'lightweight-magic-charts';

const mean = (window: readonly Bar[]): number =>
  window.reduce((total, bar) => total + bar.close, 0) / window.length;

export const SMA_20: SeriesCatalogueEntry = {
  label: 'Moving average (20)',
  category: 'Trend',
  hint: 'Mean close over the last twenty bars',
  provider: {
    id: seriesId('sma.20'),
    compute: (bars: readonly Bar[]): readonly Point[] =>
      bars.map((bar, at): Point =>
        at < 19 ? { time: bar.time } : { time: bar.time, value: mean(bars.slice(at - 19, at + 1)) },
      ),
  },
};
```

A point with no `value` is a warm-up bar. The workspace reads that as "not ready yet" and says so in
the study panel rather than drawing a flat line from zero.

## Step 4 — say where each chosen study is drawn

`studies.resolve` turns the reader's picks into placed views: which lane, which pane, how many points
were drawn, whether the window was long enough. It runs on every window change, so keep it
arithmetic — it is called with the ids and the bars and nothing else.

```ts
import {
  seriesId,
  type Bar,
  type Reading,
  type SeriesId,
  type SourceResolution,
} from 'lightweight-magic-charts';

export const resolve = (ids: readonly string[], bars: readonly Bar[]): SourceResolution => {
  const readings = new Map<SeriesId, readonly Reading[]>();
  const labels = new Map<SeriesId, string>();
  for (const id of ids) {
    readings.set(seriesId(id), bars.map((bar) => bar.close));
    labels.set(seriesId(id), id);
  }
  return {
    views: ids.map((id, lane) => ({
      id,
      lane,
      paneId: 'price',
      label: id,
      overlay: true,
      drawn: bars.length,
      truncated: 0,
      availability: bars.length === 0 ? 'empty' : 'ok',
      warmUpBars: 20,
      windowBars: bars.length,
    })),
    readings,
    labels,
    activePaneIds: new Set(['price']),
  };
};
```

`overlay: true` draws the study over the price pane; `false` gives it a lane of its own, and the
height for that lane comes out of the same budget as everything else. What happens when the budget
runs out is decided by the library, and measured in
[`../explanation/layout.md`](../explanation/layout.md).

## What you did not have to do

Nothing above named a colour scheme, a font, a control or a layout. The pane order, the legend, the
study panel, the focus order and every accessible name come with the component — see
[`replace-chrome.md`](replace-chrome.md) if you want to repaint the controls, and
[`../reference/_index.md`](../reference/_index.md) for the full signature of anything above.
