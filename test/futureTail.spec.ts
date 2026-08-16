/**
 * The future room, as arithmetic — no React, no chart, no DOM.
 *
 * Keeping the policy pure is what lets the four invalid values each get their own assertion instead
 * of four hook renders that would prove the same thing more slowly and less directly.
 */
import type { Bar } from '../src/domain/types';
import { utcSeconds } from '../src/domain/types';
import { INITIAL_ROOM_COLUMNS, futureBarCount, futureTail } from '../src/domain/futureTail';

/** Prices are irrelevant here — every assertion below is about time. */
const barsAt = (...times: readonly number[]): readonly Bar[] =>
  times.map((time) => ({ time: utcSeconds(time), open: 1, high: 1, low: 1, close: 1 }));

describe('futureBarCount', () => {
  it('defaults to as much future as there is history', () => {
    // Measured on a live deploy: twelve columns read as MUCH too short. Proportional scales with the
    // timeframe and with however much history the host chose to load, without a second knob.
    // A TENTH, floored at the short margin. Twelve read as much too short in live use; the whole
    // history read as half a screen of emptiness, because `fitContent` frames the room WITH the
    // candles — measured, and the reason framing by logical index was removed.
    expect(futureBarCount(undefined, 800)).toBe(80);
    expect(futureBarCount(undefined, 600)).toBe(60);
    expect(futureBarCount(undefined, 60)).toBe(INITIAL_ROOM_COLUMNS);
    expect(futureBarCount(undefined, 0)).toBe(INITIAL_ROOM_COLUMNS);
  });

  it('honours a count the host asked for, whatever the history', () => {
    expect(futureBarCount(5, 800)).toBe(5);
    expect(futureBarCount(40, 3)).toBe(40);
  });

  it('honours zero, which is how a host turns the room off', () => {
    // Not folded into the invalid cases: zero is a DECISION, and falling back to 12 would override
    // a host that deliberately wants the chart to end at the last bar.
    expect(futureBarCount(0, 800)).toBe(0);
  });

  it.each<[string, number]>([
    ['negative', -1],
    ['fractional', 2.5],
    ['not a number', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
  ])('falls back to the proportional default when the count is %s', (_label, requested) => {
    expect(futureBarCount(requested, 800)).toBe(80);
  });
});

describe('futureTail', () => {
  it('adds one time-only point per requested column', () => {
    const tail = futureTail(barsAt(100, 200, 300), 3);

    expect(tail).toEqual([{ time: 400 }, { time: 500 }, { time: 600 }]);
    // Stated as its own assertion because "no price" is the whole point: a point carrying open or
    // close would be a candle the market never printed.
    for (const point of tail) expect(Object.keys(point)).toEqual(['time']);
  });

  it('spaces the tail by the LAST TWO bars, not by an average', () => {
    // 100 -> 200 -> 900: the average step is 400, the last step is 700. A tail built on the average
    // would land on 1300; a tail built on the last two lands on 1600. The two are only separable
    // when the bars are irregular, which is why they are.
    expect(futureTail(barsAt(100, 200, 900), 2)).toEqual([{ time: 1600 }, { time: 2300 }]);
  });

  it('adds nothing when there is no interval to measure', () => {
    expect(futureTail(barsAt(), 12)).toEqual([]);
    expect(futureTail(barsAt(100), 12)).toEqual([]);
  });

  it('adds nothing when the host turned the room off', () => {
    expect(futureTail(barsAt(100, 200, 300), 0)).toEqual([]);
  });

  it('adds nothing when the last two bars share a time', () => {
    // A zero interval would stack every future point on the last bar's column — room that is not
    // room. Degrading to no tail keeps the chart honest instead of drawing a pile.
    expect(futureTail(barsAt(100, 200, 200), 4)).toEqual([]);
  });
});

describe('INITIAL_ROOM_COLUMNS', () => {
  it('is a short margin, not the whole tail', () => {
    // The opening view frames the candles plus this. Measured in the base library's source:
    // `fitContent()` reads `_points.length - 1`, and whitespace points ARE in `_points` — so framing
    // by content would put the proportional tail on screen and squeeze the price into half of it.
    expect(INITIAL_ROOM_COLUMNS).toBe(12);
  });
});
