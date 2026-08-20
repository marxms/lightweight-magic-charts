/**
 * MAGNET-02, MAGNET-03, MAGNET-04 and the two edge cases the spec decides for the magnet.
 *
 * WHAT THIS FILE HOLDS. The magnet is the choice that was missing: every anchor used to land on a
 * bar value with no way to refuse. So `off` has to be genuinely free — the pointer's own price,
 * reached without ever consulting a bar — and `on` has to be a SCREEN tolerance, because a price
 * tolerance means one thing at 60 000 and another at 0.4.
 *
 * THE CONVERTER IS A ONE-PIXEL-PER-UNIT SCALE, on purpose. It makes every distance in these cases
 * readable as a price difference, so a reader can check the arithmetic without running it, and it
 * is the only place the fixture decides what "eight pixels away" means.
 */
import { utcSeconds, type Bar } from '../src/domain/types';
import { snapAnchorPrice, type SnapInput } from '../src/drawing/magnet';

const TIME = utcSeconds(1_700_000_000);

/** Open 100, high 110, low 95, close 105: the four candidates, all distinguishable. */
const BAR: Bar = { time: TIME, open: 100, high: 110, low: 95, close: 105 };

/** One pixel per price unit, and the axis points down like every price scale. */
const scale = (price: number): number => 200 - price;

function input(over: Partial<SnapInput>): SnapInput {
  return {
    mode: 'on',
    bars: [BAR],
    time: TIME,
    price: 103.7,
    thresholdPx: 8,
    priceToCoordinate: scale,
    ...over,
  };
}

/** The bars, wrapped so that every read of them is counted rather than assumed absent. */
function countingBars(bars: readonly Bar[]): { bars: readonly Bar[]; reads: () => number } {
  let reads = 0;
  const watched = new Proxy(bars, {
    get(target, key, receiver) {
      reads += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  return { bars: watched, reads: () => reads };
}

describe('MAGNET-02 — off resolves to the pointer’s own price', () => {
  it('returns the pointer price, and reaches no bar at all to do it', () => {
    // "not to the price of any bar" is the criterion, and the strongest reading of it is that the
    // bars are never consulted: a magnet that looked and then discarded would pass a value check
    // while still paying for the lookup on every crosshair move.
    const watched = countingBars([BAR]);
    let converted = 0;
    const price = snapAnchorPrice(
      input({
        mode: 'off',
        bars: watched.bars,
        price: 103.7,
        priceToCoordinate: (value) => {
          converted += 1;
          return scale(value);
        },
      }),
    );

    expect(price).toBe(103.7);
    expect(watched.reads()).toBe(0);
    expect(converted).toBe(0);
  });
});

describe('MAGNET-03 — on resolves to the nearest bar value within the threshold', () => {
  it('a pointer one pixel under the high resolves to the high, not to the close', () => {
    // The high is 1 px away and the close is 4 px away, both inside the threshold. A rule that
    // stopped at the first candidate inside the tolerance would answer 100 here.
    expect(snapAnchorPrice(input({ price: 109 }))).toBe(110);
  });

  it('a pointer near the close resolves to the close, not to the high', () => {
    // Distances from the pointer: close `1.3`, open `3.7`, high `6.3`, low `8.7`. Only the close
    // may win, and it is a different member of the quartet than above, so "nearest" does real work.
    expect(snapAnchorPrice(input({ price: 103.7 }))).toBe(105);
  });
});

describe('MAGNET-04 — nothing within the threshold leaves the price alone', () => {
  it('a threshold of one pixel with the nearest value 2.5 px away returns the pointer price', () => {
    expect(snapAnchorPrice(input({ price: 102.5, thresholdPx: 1 }))).toBe(102.5);
  });
});

describe('the edge cases the spec decides', () => {
  it('a chart with no bars resolves to the pointer price, because there is nothing to snap to', () => {
    expect(snapAnchorPrice(input({ bars: [], price: 103.7 }))).toBe(103.7);
  });

  it('two equidistant candidates resolve to the HIGHER price', () => {
    // Low and open sit at 100, high and close at 110, and the pointer is exactly between them. The
    // outcome is decided rather than incidental: without the rule it is whichever the loop met last.
    const tied: Bar = { time: TIME, open: 100, high: 110, low: 100, close: 110 };
    expect(snapAnchorPrice(input({ bars: [tied], price: 105 }))).toBe(110);
  });

  it('a candidate the scale cannot place is dropped, and the snap still happens', () => {
    // The close is nearest at `1.3` px and converts to null. The open, at `3.7` px, is still inside
    // the threshold — so the answer is the open, never the raw pointer price.
    const price = snapAnchorPrice(
      input({
        price: 103.7,
        priceToCoordinate: (value) => (value === 105 ? null : scale(value)),
      }),
    );

    expect(price).toBe(100);
  });
});

describe('MAGNET-04 — an unmeasurable gesture places at the pointer, never at a bar', () => {
  // WHY THESE FAIL LOUDLY RATHER THAN QUIETLY. Every comparison against `NaN` is false, so
  // `distancePx > thresholdPx` stopped rejecting anything the moment either side stopped being a
  // number: the tolerance switched off instead of the magnet, every candidate qualified, and the
  // anchor landed on a bar value the user never aimed at. A threshold nobody can measure has to
  // mean "do not snap", which is the same reading `observePrice` takes of a non-finite price.
  it('a threshold that is not a number returns the pointer price, far from every bar value', () => {
    expect(snapAnchorPrice(input({ price: 400, thresholdPx: Number.NaN }))).toBe(400);
  });

  it('a pointer price that is not a number resolves to itself, not to a bar value', () => {
    expect(snapAnchorPrice(input({ price: Number.NaN }))).toBeNaN();
  });

  it('a candidate whose coordinate is NaN is dropped, and the snap survives it', () => {
    // The same shape as the `null` case above, and the close is again the nearest at `1.3` px. The
    // open at `3.7` px is the only other candidate inside the threshold, so the answer is the open.
    const price = snapAnchorPrice(
      input({
        price: 103.7,
        priceToCoordinate: (value) => (value === 105 ? Number.NaN : scale(value)),
      }),
    );

    expect(price).toBe(100);
  });

  it('a candidate whose coordinate is Infinity is dropped, and the snap survives it', () => {
    const price = snapAnchorPrice(
      input({
        price: 103.7,
        priceToCoordinate: (value) => (value === 105 ? Number.POSITIVE_INFINITY : scale(value)),
      }),
    );

    expect(price).toBe(100);
  });
});
