/**
 * The density field, given something to draw — a simulated map of where leveraged positions would
 * be forced out.
 *
 * `showDensity` only turns the CONTROL on. The field itself reads `data.density`, and this page
 * supplied none, so the toggle existed and the overlay had nothing to paint. That is the same shape
 * as the volume lane that was titled and empty: a declared capability with no input behind it.
 *
 * WHAT IS SIMULATED, and it is a simulation rather than a claim: a position opened at some past bar
 * with leverage L is liquidated when price moves against it by roughly 1/L. So for every bar, the
 * levels that matter are its close scaled by those fractions — below for longs, above for shorts —
 * and the weight is how much of that bar's volume is still plausibly sitting there.
 *
 * NOTHING HERE IS A MARKET CLAIM. The point is a field with recognisable structure: bands that
 * follow the price, thicken where the market spent time, and thin out as they age. A random cloud
 * would demonstrate the overlay just as well and would teach the reader something false.
 */
import type { Bar, DensitySample, DensitySlice } from 'lightweight-magic-charts';

/** The leverage tiers a retail book actually clusters at. Higher tiers sit nearer the price. */
const LEVERAGE = [5, 10, 25, 50, 100] as const;

/** How many bars back still contribute. Older positions have been closed or already blown up. */
const MEMORY_BARS = 48;

/** One slice every N bars: the field is a map, not a per-bar reading, and it stays cheap to draw. */
const EVERY = 2;

/**
 * Weight decays with age — an exponential, so the field fades rather than ending in a wall.
 * Half of the contribution is gone by a quarter of the memory.
 */
const ageWeight = (barsAgo: number): number => Math.exp((-3 * barsAgo) / MEMORY_BARS);

export function densityOf(bars: readonly Bar[]): readonly DensitySlice[] {
  const slices: DensitySlice[] = [];

  for (let at = 0; at < bars.length; at += EVERY) {
    const samples: DensitySample[] = [];
    const from = Math.max(0, at - MEMORY_BARS);

    for (let origin = from; origin <= at; origin += 1) {
      const bar = bars[origin];
      const age = ageWeight(at - origin);
      // Volume is what makes a level heavy: a level nobody traded into holds nobody.
      const size = (bar.volume ?? 0) * age;
      if (size <= 0) continue;

      for (const leverage of LEVERAGE) {
        const move = bar.close / leverage;
        // Higher leverage is a smaller share of the book, so it weighs less even sitting closer.
        const share = size / leverage;
        samples.push({ price: bar.close - move, weight: share });
        samples.push({ price: bar.close + move, weight: share * 0.8 });
      }
    }

    if (samples.length > 0) slices.push({ time: bars[at].time, samples });
  }

  return slices;
}
