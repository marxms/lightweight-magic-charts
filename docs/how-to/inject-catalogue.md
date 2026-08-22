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

## Step 5 — how many of your picks were actually drawn

`resolveSources` builds `views` by mapping over the list `laneOrder` has already deduplicated and
truncated to the lane count, so **`views.length` IS the resolved count**, and what was cut is the
difference against the list you passed in. The library publishes no `cut` member because nothing
inside it would read one; the subtraction is yours, and it is exact.

```ts
import type { SourceResolution } from 'lightweight-magic-charts';

/** Chosen minus resolved. Two ids that resolve to one identity fold into one view, not two. */
export const laneCut = (chosen: readonly string[], resolution: SourceResolution): number =>
  chosen.length - resolution.views.length;
```

If that number is ever above zero your `studies.capacity` is larger than the lane count your
`resolutionPolicy` truncates to, and a reader can choose studies that silently never resolve. Report
it, or do what the example does and write the two as one number so the difference cannot arise.

## Step 6 — bind a third-party indicator catalogue

The library ships no indicator arithmetic and takes no dependency on any: a single indicator from a
general-purpose catalogue is around a megabyte of minified JavaScript, roughly ten times this whole
package, and the boundary suite fails the build if a name from one appears under `src/`. **The bytes
and the words are yours.** What the library adds is the two things a host cannot do alone.

**A stable identity.** `SeriesCatalogueEntry.id` is what gets persisted; absent, the label stands in.
Put the same string in `provider.id`, because the menu builds its DOM and test ids from that one
while the pressed state and the stored list use the identity — if they disagree nothing throws, the
chip renders under one name and compares another, and the study looks unselectable while the payload
fills up correctly.

**Values it stores and never reads.** `WorkspaceSetup.studySettings` is a map from that identity to
`StudySettings`, which is `unknown`. That is not laziness: the compiler refuses the package a
property read, which is exactly what keeps a vendor's vocabulary out of it. The narrowing is yours,
it happens in `coerceStudySettings`, and a value outside the bounds your catalogue declares is best
REFUSED rather than clamped — a silently rewritten value is one the reader did not choose, arriving
back on every load.

```ts
import type { StudySettings, WorkspaceSetupPolicy } from 'lightweight-magic-charts';

/** Your vocabulary. The library never sees inside this shape. */
interface Period {
  readonly length: number;
}

const readPeriod = (held: StudySettings): Period | null => {
  if (typeof held !== 'object' || held === null || Array.isArray(held)) return null;
  const length = (held as { readonly length?: unknown }).length;
  return typeof length === 'number' && Number.isInteger(length) && length > 0 ? { length } : null;
};

export const coerceStudySettings: NonNullable<WorkspaceSetupPolicy['coerceStudySettings']> = (
  raw,
  indicators,
) => {
  const held = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const kept: Record<string, StudySettings> = {};
  for (const id of indicators) {
    // OWN properties only: `in` answers for `toString` and fabricates a value nobody stored.
    if (!Object.prototype.hasOwnProperty.call(held, id)) continue;
    const values = readPeriod(held[id]);
    if (values !== null) kept[id] = values;
  }
  return kept;
};
```

Values for a study no longer in the list are dropped, a payload written before this feature existed
loads with no values and no version bump, and the whole map survives duplicate, export and re-import
because it is part of the tab.

**The form is yours too.** A catalogue of hundreds of studies with thousands of inputs is not an
enumerable vocabulary, and `chrome.labels` is a closed record of groups that could not hold it. So
the library renders your component and sees nothing inside it: declare one `chrome.sections` entry,
define its `Body` at **module scope**, and read and write through the two published doors. A `Body`
built inline in your render is a new element type on every render — a remount, and the caret dies on
the first character typed into it.

```tsx
import { useWorkspaceSetup, useWorkspaceSetupWriter } from 'lightweight-magic-charts';
import type { ReactElement } from 'react';

/** MODULE SCOPE, and the section that carries it is declared once and never reordered. */
export function StudyInputs(): ReactElement {
  const write = useWorkspaceSetupWriter();
  const held = useWorkspaceSetup((setup) => setup.studySettings);
  const length = (held?.['sma'] as { readonly length?: number } | undefined)?.length ?? 20;
  return (
    <label>
      Length
      <input
        type="number"
        min={1}
        value={length}
        onChange={(event) => {
          const next = Number(event.target.value);
          // Refused, never clamped: out of range writes nothing at all.
          if (Number.isInteger(next) && next > 0) {
            write({ studySettings: { ...held, sma: { length: next } } });
          }
        }}
      />
    </label>
  );
}
```

Load the arithmetic behind the reader's first pick rather than at boot, and check that your bundler
actually defers it: with `outfile` and no code splitting, esbuild inlines a dynamically imported
module into the entry, and the megabyte an `await import()` was written to defer is on the wire
anyway with nothing red.

## What you did not have to do

Nothing above named a colour scheme, a font, a control or a layout. The pane order, the legend, the
study panel, the focus order and every accessible name come with the component — see
[`replace-chrome.md`](replace-chrome.md) if you want to repaint the controls, and
[`../reference/_index.md`](../reference/_index.md) for the full signature of anything above.
