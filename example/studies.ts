/**
 * The studies, computed HERE — and that placement is the point of the page, not an accident of it.
 *
 * The library owns composition and chrome; it does not own arithmetic and it does not own the words.
 * `docs/explanation/ownership-and-licensing.md` says so, and a gate fails the build if a business
 * word appears under `src/`. So a demo that showed indicators without authoring them would be
 * demonstrating something the package does not do.
 *
 * Everything below is therefore the HOST's half of the seam, written the way a consumer writes it:
 * a `SeriesProvider` that turns bars into points, wrapped in a `PlottableSource` that says where it
 * wants to be drawn and what it is called.
 */
import type {
  Bar,
  PlottableSource,
  Point,
  SeriesCatalogueEntry,
  SeriesProvider,
} from 'lightweight-magic-charts';
import { seriesId, utcSeconds } from 'lightweight-magic-charts';

/** A window that walks the series once. Nothing here is clever; it is a demo, and it is readable. */
function movingAverage(bars: readonly Bar[], window: number): readonly Point[] {
  const points: Point[] = [];
  let sum = 0;
  for (let index = 0; index < bars.length; index += 1) {
    sum += bars[index].close;
    if (index >= window) sum -= bars[index - window].close;
    // BEFORE THE WINDOW IS FULL THE POINT IS A GAP, not a partial average. A partial one is a
    // different statistic wearing the same name, and the workspace draws a gap as absence.
    points.push(
      index < window - 1
        ? { time: utcSeconds(bars[index].time) }
        : { time: utcSeconds(bars[index].time), value: sum / window },
    );
  }
  return points;
}

/** Wilder's smoothing, the convention the ratio is normally quoted under. */
function relativeStrength(bars: readonly Bar[], window: number): readonly Point[] {
  const points: Point[] = [];
  let gain = 0;
  let loss = 0;
  for (let index = 0; index < bars.length; index += 1) {
    if (index === 0) {
      points.push({ time: utcSeconds(bars[index].time) });
      continue;
    }
    const change = bars[index].close - bars[index - 1].close;
    const up = Math.max(change, 0);
    const down = Math.max(-change, 0);
    if (index <= window) {
      gain += up / window;
      loss += down / window;
      points.push({ time: utcSeconds(bars[index].time) });
      continue;
    }
    gain = (gain * (window - 1) + up) / window;
    loss = (loss * (window - 1) + down) / window;
    const value = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    points.push({ time: utcSeconds(bars[index].time), value });
  }
  return points;
}


/**
 * The exponential average, written out because the recurrence IS the lesson: each point is the last
 * one nudged toward the new close, so it answers faster than the simple mean without a window.
 *
 * SEEDED ON THE SIMPLE MEAN of the first `window` closes, which is the convention every charting
 * package uses. Seeding on the first close alone would make the whole early series a decaying
 * artefact of one bar.
 */
function exponentialAverage(bars: readonly Bar[], window: number): readonly Point[] {
  const points: Point[] = [];
  const k = 2 / (window + 1);
  let average = 0;
  let seed = 0;
  for (let index = 0; index < bars.length; index += 1) {
    const close = bars[index].close;
    if (index < window) {
      seed += close;
      if (index < window - 1) {
        points.push({ time: utcSeconds(bars[index].time) });
        continue;
      }
      average = seed / window;
    } else {
      average = close * k + average * (1 - k);
    }
    points.push({ time: utcSeconds(bars[index].time), value: average });
  }
  return points;
}

/** The reading of a point, or `null` where the series declared a gap. */
const valueAt = (points: readonly Point[], index: number): number | null => {
  const point = points[index];
  return point !== undefined && 'value' in point ? point.value : null;
};

/**
 * Convergence and divergence of two exponential averages, as THREE plots in one lane.
 *
 * It earns its place here by being what the single-line studies cannot show: one lane holding three
 * series that share a scale and are read against each other. `lanes.plots` is 3 in `App.tsx`, and
 * this is what that number is for.
 *
 * A GAP IN EITHER INPUT IS A GAP IN THE OUTPUT. Substituting zero would draw a spike at the exact
 * moment the study has nothing to say — the loudest possible mark for the emptiest possible reason.
 */
function convergence(bars: readonly Bar[]): {
  readonly line: readonly Point[];
  readonly signal: readonly Point[];
  readonly histogram: readonly Point[];
} {
  const fast = exponentialAverage(bars, 12);
  const slow = exponentialAverage(bars, 26);

  const line: Point[] = bars.map((bar, index) => {
    const a = valueAt(fast, index);
    const b = valueAt(slow, index);
    return a === null || b === null
      ? { time: utcSeconds(bar.time) }
      : { time: utcSeconds(bar.time), value: a - b };
  });

  // The signal smooths the LINE, not the price, so it is seeded once the line itself exists.
  const started = line.findIndex((point) => 'value' in point);
  const signal: Point[] = bars.map((bar) => ({ time: utcSeconds(bar.time) }));
  if (started >= 0) {
    const k = 2 / (9 + 1);
    let average = 0;
    let seed = 0;
    for (let index = started; index < line.length; index += 1) {
      const value = valueAt(line, index);
      if (value === null) continue;
      const age = index - started;
      if (age < 9) {
        seed += value;
        if (age < 8) continue;
        average = seed / 9;
      } else {
        average = value * k + average * (1 - k);
      }
      signal[index] = { time: utcSeconds(bars[index].time), value: average };
    }
  }

  const histogram: Point[] = bars.map((bar, index) => {
    const a = valueAt(line, index);
    const b = valueAt(signal, index);
    return a === null || b === null
      ? { time: utcSeconds(bar.time) }
      : { time: utcSeconds(bar.time), value: a - b };
  });

  return { line, signal, histogram };
}

function providerOf(id: string, compute: (bars: readonly Bar[]) => readonly Point[]): SeriesProvider {
  return { id: seriesId(id), compute };
}

/**
 * Two over the price and one in a lane of its own — enough to show BOTH placements, which is the
 * distinction a reader cannot see from a screenshot of either one alone.
 */
export const DEMO_SOURCES: readonly PlottableSource[] = [
  {
    id: 'ma-fast',
    label: 'Average, 20 bars',
    placement: 'over-price',
    series: () => [
      {
        spec: {
          id: seriesId('ma-fast'),
          label: 'Average, 20 bars',
          shape: 'line',
          color: '#4c9aff',
          lineWidth: 2,
        },
        provider: providerOf('ma-fast', (bars) => movingAverage(bars, 20)),
      },
    ],
  },
  {
    id: 'ma-slow',
    label: 'Average, 50 bars',
    placement: 'over-price',
    series: () => [
      {
        spec: {
          id: seriesId('ma-slow'),
          label: 'Average, 50 bars',
          shape: 'line',
          color: '#c792ea',
          lineWidth: 2,
        },
        provider: providerOf('ma-slow', (bars) => movingAverage(bars, 50)),
      },
    ],
  },
  {
    id: 'strength',
    label: 'Relative strength, 14 bars',
    placement: 'own-pane',
    // The midpoint, drawn as the lane's guide: a bounded ratio reads against its middle or not at all.
    guide: 50,
    series: () => [
      {
        spec: {
          id: seriesId('strength'),
          label: 'Relative strength, 14 bars',
          shape: 'line',
          color: '#f5a623',
          lineWidth: 2,
        },
        provider: providerOf('strength', (bars) => relativeStrength(bars, 14)),
      },
    ],
  },
  {
    id: 'ema-fast',
    label: 'Exponential average, 21 bars',
    placement: 'over-price',
    series: () => [
      {
        spec: {
          id: seriesId('ema-fast'),
          label: 'Exponential average, 21 bars',
          shape: 'line',
          color: '#26c6da',
          lineWidth: 2,
        },
        provider: providerOf('ema-fast', (bars) => exponentialAverage(bars, 21)),
      },
    ],
  },
  {
    id: 'convergence',
    label: 'Convergence and divergence, 12/26/9',
    placement: 'own-pane',
    // Zero is the crossing this study is read against, so the lane draws it.
    guide: 0,
    series: () => {
      const parts = convergence;
      return [
        {
          spec: {
            // A LINE, NOT A HISTOGRAM, and that is the library speaking rather than a preference:
            // `src/catalogue/lanes.ts:38` builds every lane series as `shape: 'line'`, so a source
            // that asked for bars would be asking for something the lane never delivers. Declaring
            // it anyway would make this file describe a chart nobody sees. The histogram lives on an
            // AUTHORED pane instead — see the volume lane in `panes.ts`.
            id: seriesId('convergence-histogram'),
            label: 'Difference',
            shape: 'line',
            color: '#4c9aff',
          },
          provider: providerOf('convergence-histogram', (bars) => parts(bars).histogram),
        },
        {
          spec: {
            id: seriesId('convergence-line'),
            label: 'Convergence, 12/26',
            shape: 'line',
            color: '#f5a623',
            lineWidth: 2,
          },
          provider: providerOf('convergence-line', (bars) => parts(bars).line),
        },
        {
          spec: {
            id: seriesId('convergence-signal'),
            label: 'Signal, 9',
            shape: 'line',
            color: '#c792ea',
            lineWidth: 1,
          },
          provider: providerOf('convergence-signal', (bars) => parts(bars).signal),
        },
      ];
    },
  },
];

/**
 * KEYED BY BOTH THE ID AND THE LABEL, and the second key is not belt-and-braces.
 *
 * `ChartWorkspace` stores `entry.label` — the DISPLAYED TEXT — as the chosen study's identity, and
 * that string is what comes back to this lookup. Keyed by id alone it answers `undefined`, and the
 * resolver then treats the source as unknown: no overlay, an unnamed lane, nothing drawn. That is
 * exactly what the published page did, and it looked like the study was broken rather than unfound.
 *
 * Both keys are here so the demo works against the library as it behaves today. The id stays because
 * a display string is the wrong identity for stored state — see the note in the README's boundary
 * section — and this map is what will keep working when that is corrected.
 */
const BY_KEY = new Map(
  DEMO_SOURCES.flatMap((source) => [
    [source.id, source] as const,
    [source.label, source] as const,
  ]),
);

/** One key, one answer — the shape the resolver takes. */
export const demoLookup = (key: string): PlottableSource | undefined => BY_KEY.get(key);

export const DEMO_STUDY_CATALOGUE: readonly SeriesCatalogueEntry[] = DEMO_SOURCES.map((source) => ({
  provider: source.series()[0].provider,
  label: source.label,
  category: source.placement === 'over-price' ? 'Over the price' : 'Own lane',
  hint:
    source.placement === 'over-price'
      ? 'Drawn on the price scale, because it is priced in the same unit.'
      : 'Drawn in a lane of its own, because it is not.',
}));

/** Both spellings, because a stored payload may carry either. */
export const DEMO_STUDY_IDS: readonly string[] = DEMO_SOURCES.flatMap((source) => [
  source.id,
  source.label,
]);
