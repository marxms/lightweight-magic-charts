/**
 * The data seam, faked — the same shape `test/chartWorkspace.spec.tsx` mounts the workspace with,
 * and the reason this example needs neither a backend nor a credential.
 *
 * THE CANDLES ARE DETERMINISTIC, and that is the whole point of writing the generator instead of
 * reaching for `Math.random`. A reference page that draws a different chart on every load is worth
 * nothing as a reference: two people reading it see two things, a screenshot goes stale the moment
 * it is taken, and "it looks wrong here" stops being reproducible. The seed and the first timestamp
 * are constants, nothing reads the clock, so every load in every browser draws the same series.
 */
import type { Bar, MarketDataPort, PaneSpec, SeriesSpec } from 'lightweight-magic-charts';
import { utcSeconds } from 'lightweight-magic-charts';

import { densityOf } from './density';

/** 2023-11-14T22:13:20Z, written as a constant so no clock enters the output. */
const FIRST_BAR_AT = 1_700_000_000;
const ONE_HOUR = 3_600;
const BAR_COUNT = 240;
const OPENING_PRICE = 100;

/**
 * A 32-bit integer hash used as the whole random source: same input, same output, forever, with no
 * state carried between calls. A seeded generator would do as well until somebody reordered the
 * calls; a pure function of the bar index cannot be reordered into a different chart.
 */
function noise(index: number): number {
  let value = (index + 0x9e3779b9) | 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  value = value ^ (value >>> 15);
  return (value >>> 0) / 0x1_0000_0000;
}

/** A slow trend plus bounded noise: recognisable as price action, and never negative. */
function seriesOf(count: number): readonly Bar[] {
  const bars: Bar[] = [];
  let close = OPENING_PRICE;
  for (let index = 0; index < count; index += 1) {
    const open = close;
    const drift = Math.sin(index / 24) * 0.9;
    const shock = (noise(index) - 0.5) * 2.4;
    close = Math.max(1, open + drift + shock);
    const spread = 0.4 + noise(index + 10_000) * 1.6;
    bars.push({
      time: utcSeconds(FIRST_BAR_AT + index * ONE_HOUR),
      open,
      high: Math.max(open, close) + spread,
      low: Math.max(0.5, Math.min(open, close) - spread),
      close,
      volume: Math.round(400 + noise(index + 20_000) * 1_600),
    });
  }
  return bars;
}

/** Built once at module scope: the series is a constant, so it is computed like one. */
const BARS = seriesOf(BAR_COUNT);

/** The simulated liquidation map, built once from the same constant series. */
export const DEMO_DENSITY = densityOf(BARS);

/**
 * WHAT AN AUTHORED PANE ACTUALLY DRAWS COMES THROUGH `data.read`, not through the port.
 *
 * This surprised me and it is worth writing down. `HistoryResult` carries an optional `series` map
 * and it looks like the channel — it is declared in `port/ports.ts` and exported. Nothing in `src/`
 * reads it. The reading a pane draws is asked for per frame, by `SeriesReader`, off the data source.
 *
 * A `PaneSpec` declares that a lane holds a series and what it looks like; it carries no numbers.
 * Leaving this out is what shipped a lane titled `Traded volume` with nothing in it, over bars that
 * had carried volume the whole time — the declaration existed and the reading never arrived.
 */
const READINGS: ReadonlyMap<string, readonly (number | null)[]> = new Map([
  ['volume', BARS.map((bar) => bar.volume ?? null)],
]);

/** Positional: one reading per bar, in bar order, or `null` where the series has nothing to say. */
export const demoRead = (_pane: PaneSpec, series: SeriesSpec): readonly (number | null)[] =>
  READINGS.get(series.id) ?? [];

/**
 * History answers with the whole series and declares itself exhausted; live subscribes to nothing
 * and hands back the closure that detaches it. A silent live channel is a legitimate adapter — the
 * workspace renders history and simply never receives a tick.
 */
export const demoPort: MarketDataPort = {
  describe: () => [],
  subscribe: () => () => undefined,
  fetchBars: async () => ({ bars: BARS, exhausted: true }),
};
