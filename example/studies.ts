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
];

const BY_ID = new Map(DEMO_SOURCES.map((source) => [source.id, source]));

/** One id, one answer — the shape the resolver takes. */
export const demoLookup = (id: string): PlottableSource | undefined => BY_ID.get(id);

export const DEMO_STUDY_CATALOGUE: readonly SeriesCatalogueEntry[] = DEMO_SOURCES.map((source) => ({
  provider: source.series()[0].provider,
  label: source.label,
  category: source.placement === 'over-price' ? 'Over the price' : 'Own lane',
  hint:
    source.placement === 'over-price'
      ? 'Drawn on the price scale, because it is priced in the same unit.'
      : 'Drawn in a lane of its own, because it is not.',
}));

export const DEMO_STUDY_IDS: readonly string[] = DEMO_SOURCES.map((source) => source.id);
