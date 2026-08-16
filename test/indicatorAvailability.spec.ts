import {
  alignReadings,
  availabilityOf,
  barPositions,
  firstReadingAt,
  median,
  onPriceScale,
  readingOf,
  type Reading,
} from '../src/indicator/availability';
import {
  CALIBRATED_PRICE_NEIGHBOURHOOD,
  CALIBRATED_WARM_UP_SHARE,
} from '../src/catalogue/sources';
import type { Bar, Point } from '../src/domain/types';

/**
 * LMC-18, LMC-20 — what the window allows to be read from a study.
 *
 * Parity against the previous implementation (LMC-22) is measured at the app's end, in
 * `apps/web/src/hooks/__tests__/activeIndicators.parity.test.ts`, against the captured record of
 * 841d0ef: that is where the arithmetic composes into a whole result, and a parity written only
 * over the pieces would pass while the composition regressed.
 */

const bar = (time: number, close: number): Bar =>
  ({ time, open: close, high: close, low: close, close }) as unknown as Bar;
const point = (time: number, value: number): Point => ({ time, value }) as unknown as Point;
const gap = (time: number): Point => ({ time }) as unknown as Point;

describe('readingOf — a gap is a gap, and never a zero', () => {
  it('asks the package whether the point is a gap, instead of reaching into the field', () => {
    expect(readingOf(point(1, 7))).toBe(7);
    expect(readingOf(point(1, 0))).toBe(0); // zero is a MEASUREMENT, and stays one
    expect(readingOf(point(1, -3))).toBe(-3);
    expect(readingOf(gap(1))).toBeNull();
  });

  it('a non-finite value is an absence of reading, not a number', () => {
    expect(readingOf(point(1, Number.NaN))).toBeNull();
    expect(readingOf(point(1, Number.POSITIVE_INFINITY))).toBeNull();
    expect(readingOf(point(1, Number.NEGATIVE_INFINITY))).toBeNull();
  });
});

describe('alignReadings — alignment by TIME, never by position', () => {
  const BARS = [bar(100, 1), bar(200, 2), bar(300, 3), bar(400, 4)];
  const grid = barPositions(BARS);

  it('puts each reading on the bar of its own time, and the warm-up stays on the left', () => {
    // The defect this avoids: zipping the arrays would put the first reading on the first bar and
    // shift the whole study by its own warm-up — and it would still look like a study.
    expect(alignReadings([point(300, 30), point(400, 40)], grid, BARS.length)).toEqual([
      null,
      null,
      30,
      40,
    ]);
  });

  it('a point off the grid is DISCARDED, not appended', () => {
    expect(alignReadings([point(999, 9), point(200, 20)], grid, BARS.length)).toEqual([
      null,
      20,
      null,
      null,
    ]);
  });

  it('an empty list is a whole window of gaps', () => {
    expect(alignReadings([], grid, BARS.length)).toEqual([null, null, null, null]);
  });

  it("the grid is built from the bars' time, one position per bar", () => {
    expect(barPositions(BARS).get(300)).toBe(2);
    expect(barPositions(BARS).size).toBe(4);
  });
});

describe('median — median, not mean', () => {
  it('an absurd reading from a third party does not move the decision', () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 1_000_000])).toBe(2);
    // POSITIVE CONTROL: the mean would move, and that is why it is not used.
    const mean = [1, 2, 3, 1_000_000].reduce((a, b) => a + b, 0) / 4;
    expect(mean).toBeGreaterThan(1000);
  });

  it('picks the lower element in an even list, and is stable', () => {
    expect(median([4, 1, 3, 2])).toBe(2);
    expect(median([5])).toBe(5);
  });
});

describe('onPriceScale — the MEASURED scale against the DECLARED flag', () => {
  const line = (value: number): Reading[] => [value, value, value];

  it('accepts the neighbourhood and refuses what is orders of magnitude outside it', () => {
    expect(onPriceScale(line(30000), 30000)).toBe(true);
    expect(onPriceScale(line(-900), 30000)).toBe(false);
    // Sign does not matter: the measurement is about MAGNITUDE, or else a negative oscillator would
    // escape.
    expect(onPriceScale(line(-30000), 30000)).toBe(true);
  });

  it('the two exact edges of the neighbourhood, and the first step outside each one', () => {
    const price = 30000;
    expect(onPriceScale(line(price * CALIBRATED_PRICE_NEIGHBOURHOOD), price)).toBe(true);
    expect(onPriceScale(line(price / CALIBRATED_PRICE_NEIGHBOURHOOD), price)).toBe(true);
    expect(onPriceScale(line(price * CALIBRATED_PRICE_NEIGHBOURHOOD + 1), price)).toBe(false);
    expect(onPriceScale(line(price / CALIBRATED_PRICE_NEIGHBOURHOOD - 1), price)).toBe(false);
  });

  it('a dead line does not vote — it is not going to be drawn anywhere', () => {
    expect(onPriceScale([null, null, null], 30000)).toBe(true);
  });

  it('the threshold is a PARAMETER, with the calibrated value as the default', () => {
    const price = 30000;
    const far = line(price * 5);
    expect(onPriceScale(far, price)).toBe(false);
    expect(onPriceScale(far, price, 10)).toBe(true);
    // And the default is literally the calibrated number, not a copy of it.
    expect(onPriceScale(line(price * CALIBRATED_PRICE_NEIGHBOURHOOD), price)).toBe(
      onPriceScale(line(price * CALIBRATED_PRICE_NEIGHBOURHOOD), price, CALIBRATED_PRICE_NEIGHBOURHOOD),
    );
  });
});

describe('firstReadingAt — how much of the window the warm-up ate', () => {
  it('the first bar on which ANY drawn line has a reading', () => {
    expect(firstReadingAt([[null, null, 3, 4], [null, 2, 3, 4]], 4)).toBe(1);
  });

  it('no line with a reading returns the window size', () => {
    expect(firstReadingAt([[null, null]], 2)).toBe(2);
    expect(firstReadingAt([], 20)).toBe(20);
  });
});

describe('availabilityOf — what the window allows, said out loud', () => {
  it('with no drawn line it is empty, whatever the warm-up', () => {
    expect(availabilityOf(0, 0, 20)).toBe('empty');
    expect(availabilityOf(0, 20, 20)).toBe('empty');
  });

  it('the exact edge of half the window is still ok; one step beyond is warm-up', () => {
    const bars = 20;
    expect(availabilityOf(1, bars * CALIBRATED_WARM_UP_SHARE, bars)).toBe('ok');
    expect(availabilityOf(1, bars * CALIBRATED_WARM_UP_SHARE + 1, bars)).toBe('warmup');
  });

  it('the threshold is a PARAMETER, with the calibrated value as the default', () => {
    expect(availabilityOf(1, 12, 20)).toBe('warmup');
    expect(availabilityOf(1, 12, 20, 0.9)).toBe('ok');
    expect(availabilityOf(1, 12, 20, 0.1)).toBe('warmup');
  });
});

describe('LMC-20 — no React and no DOM', () => {
  it('the suite runs under testEnvironment node', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });
});
