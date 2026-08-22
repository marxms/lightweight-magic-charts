/**
 * FILL-01/02/04/05 — the host's band primitive, held to what it PAINTS.
 *
 * Every case below reads the rectangles that came out of a draw, with their fill strings: an
 * interruption is a rectangle that is absent, a bicoloured fill is two different strings, and a
 * constant-level bound is a rectangle whose top sits on the level. A test that asserted "`fillRect`
 * was called" would pass against a primitive that painted the whole window one colour.
 *
 * The numbers in the controls are the vendor's own, measured over the 320 offered rows at their own
 * defaults: 186 fills, 86 of them carrying a colour per bar, 76 of those really changing colour, 16
 * carrying `transp`, 171 with at least one bar where a bound is not finite, and 14 bound references
 * naming an `hlines` entry rather than a plot.
 */

import { BandFillOverlay, bandsOf, composeFillColor, resolveBound } from '../example/bandOverlay';
import type { Band } from '../example/bandOverlay';
import type { VendorResult } from '../example/indicators';
import { utcSeconds } from '../src/domain/types';
import type { Projection } from '../src/extension/plugins';
import { RecordingContext, fakeTarget } from './renderFakes';

/* ---- a projection with a readable arithmetic ---------------------------------------------- */

/** Price to y is `200 - price`, so the axis points DOWN like a real one; time to x is the index. */
const projection = (times: readonly number[]): Projection => ({
  priceToY: (price) => 200 - price,
  timeToX: (time) => times.indexOf(time as unknown as number) * 10,
  barSpacing: 10,
});

function painted(overlay: BandFillOverlay, times: readonly number[]): ReadonlyArray<{ y: number; h: number; fill: string }> {
  const ctx = new RecordingContext();
  overlay.draw(fakeTarget(ctx, { widthPx: 400, heightPx: 200, hRatio: 1, vRatio: 1 }), projection(times));
  return ctx.rects.map((rect) => ({ y: rect.y, h: rect.h, fill: rect.fill }));
}

const TIMES = [1, 2, 3, 4].map((n) => utcSeconds(n));
const RAW = [1, 2, 3, 4];

const band = (over: Partial<Band>): Band => ({
  upper: [120, 120, 120, 120],
  lower: [100, 100, 100, 100],
  colors: ['rgba(0, 0, 255, 0.5)'],
  ...over,
});

/* ---- the alpha ---------------------------------------------------------------------------- */

describe('FILL-01 — the alpha a fill declares is computed, never concatenated', () => {
  it("turns PineScript's transparency into the complementary alpha", () => {
    // `transp: 90` is ninety per cent transparent, so a tenth opaque. The Ichimoku Kumo's own value.
    expect(composeFillColor('#43A047', 90)).toBe('rgba(67, 160, 71, 0.09999999999999998)');
    expect(composeFillColor('#F44336', 0)).toBe('rgba(244, 67, 54, 1)');
    expect(composeFillColor('rgba(38,166,154,0.15)', 50)).toBe('rgba(38, 166, 154, 0.5)');
  });

  it('CONTROL — the concatenation the reference does lands on a different colour entirely', () => {
    // `'#43A047' + (90).toString(16)` is `#43A0475a`: valid hex8, alpha 0x5A = 35%, three and a half
    // times as opaque as the tenth the vendor asked for. The clause is not "produces a string".
    const naive = `#43A047${(90).toString(16)}`;
    expect(naive).toBe('#43A0475a');
    expect(Number.parseInt(naive.slice(7), 16) / 255).toBeCloseTo(0.353, 3);
    expect(composeFillColor('#43A047', 90)).not.toBe(naive);
  });

  it('leaves a colour alone when the vendor declared no transparency for it', () => {
    expect(composeFillColor('rgba(38,166,154,0.15)', undefined)).toBe('rgba(38,166,154,0.15)');
    expect(composeFillColor(undefined, 40)).toBe('transparent');
  });
});

/* ---- the bound that is a level ------------------------------------------------------------ */

describe('FILL-02 — a bound that names a level draws against that level', () => {
  const RESULT: VendorResult = {
    plots: { plot0: RAW.map((n) => ({ time: n, value: 150 })) },
    hlines: [
      { value: 40, options: { title: 'Over Bought' } },
      { value: -40, options: { title: 'Over Sold' } },
      { value: 0, options: { title: 'Zero Line' } },
    ],
  };

  it('resolves all four spellings the vendor uses, and the plot key beside them', () => {
    // Measured on the offered rows: `hline_<index>` (top-bottom-candle), `hline_<exact title>`
    // (rsi-cyclic-smoothed), `hline_<lower-cased title>` (cct-bbo, banker-fund-flow) and the bare
    // title with no prefix at all (stoch-vx3).
    expect(resolveBound('plot0', RESULT, 4)).toEqual([150, 150, 150, 150]);
    expect(resolveBound('hline_2', RESULT, 4)).toEqual([0, 0, 0, 0]);
    expect(resolveBound('hline_Over Bought', RESULT, 4)).toEqual([40, 40, 40, 40]);
    expect(resolveBound('hline_over sold', RESULT, 4)).toEqual([-40, -40, -40, -40]);
    expect(resolveBound('zero line', RESULT, 4)).toEqual([0, 0, 0, 0]);
  });

  it('paints the fill down to the level, not to whatever the other bound was', () => {
    const bands = bandsOf(
      { ...RESULT, fills: [{ plot1: 'plot0', plot2: 'hline_Over Bought', options: { color: '#0000ff' } }] },
      4,
    );
    const overlay = new BandFillOverlay('anchor');
    overlay.setBands(TIMES, bands);

    // 150 down to 40: `200 - 150 = 50` at the top, `200 - 40 = 160` at the bottom, so 110 tall.
    expect(painted(overlay, RAW)).toEqual(
      RAW.map(() => ({ y: 50, h: 110, fill: '#0000ff' })),
    );
  });

  it('FILL-05 — refuses a fill whose bound resolves to nothing rather than drawing it half-way', () => {
    expect(resolveBound('hline_nowhere', RESULT, 4)).toBeNull();
    expect(bandsOf({ ...RESULT, fills: [{ plot1: 'plot0', plot2: 'hline_nowhere' }] }, 4)).toEqual([]);
  });
});

/* ---- the interruption ---------------------------------------------------------------------- */

describe('FILL-01 — a bar without both bounds is not painted, and its neighbour still is', () => {
  it('leaves a hole where either bound is missing rather than spanning it', () => {
    const overlay = new BandFillOverlay('anchor');
    overlay.setBands(TIMES, [band({ upper: [120, null, 120, 120], lower: [100, 100, null, 100] })]);

    // Bars 1 and 3 survive; bars 2 and 3 each lose one bound, so two of the four are absent.
    expect(painted(overlay, RAW)).toEqual([
      { y: 80, h: 20, fill: 'rgba(0, 0, 255, 0.5)' },
      { y: 80, h: 20, fill: 'rgba(0, 0, 255, 0.5)' },
    ]);
  });

  it('CONTROL — the same band with every bound finite paints all four', () => {
    const overlay = new BandFillOverlay('anchor');
    overlay.setBands(TIMES, [band({})]);

    expect(painted(overlay, RAW)).toHaveLength(4);
  });

  it('drops a bar the chart does not know, which is what a null x means', () => {
    const overlay = new BandFillOverlay('anchor');
    overlay.setBands(TIMES, [band({})]);

    // `timeToX` answers `null` only for a time that is not a point on the scale — never for one
    // merely off screen — so it is an interruption of the same kind as a missing bound.
    const ctx = new RecordingContext();
    overlay.draw(fakeTarget(ctx, { widthPx: 400, heightPx: 200, hRatio: 1, vRatio: 1 }), {
      ...projection(RAW),
      timeToX: (time) => ((time as unknown as number) === 3 ? null : 10),
    });
    expect(ctx.rects).toHaveLength(3);
  });
});

/* ---- the two colours ------------------------------------------------------------------------ */

describe('FILL-04 — a fill the vendor coloured per bar keeps every one of those colours', () => {
  it('paints each bar in its own colour and skips the bars declared clear', () => {
    const overlay = new BandFillOverlay('anchor');
    overlay.setBands(TIMES, [
      band({ colors: ['#43a047', '#43a047', 'transparent', '#f44336'] }),
    ]);

    expect(painted(overlay, RAW).map((rect) => rect.fill)).toEqual(['#43a047', '#43a047', '#f44336']);
  });

  it('CONTROL — one colour still serves every bar, so the per-bar read is not a requirement', () => {
    const overlay = new BandFillOverlay('anchor');
    overlay.setBands(TIMES, [band({ colors: ['#123456'] })]);

    expect(painted(overlay, RAW).map((rect) => rect.fill)).toEqual(['#123456', '#123456', '#123456', '#123456']);
  });

  it("carries the vendor's per-bar array through untouched, and its options colour when there is none", () => {
    const result: VendorResult = {
      plots: { a: RAW.map((n) => ({ time: n, value: 120 })), b: RAW.map((n) => ({ time: n, value: 100 })) },
      fills: [
        { plot1: 'a', plot2: 'b', colors: ['#43a047', '#f44336', 'transparent', '#43a047'] },
        { plot1: 'a', plot2: 'b', options: { color: '#43A047', transp: 90 } },
      ],
    };
    const bands = bandsOf(result, 4);

    expect(bands[0].colors).toEqual(['#43a047', '#f44336', 'transparent', '#43a047']);
    expect(bands[1].colors).toEqual(['rgba(67, 160, 71, 0.09999999999999998)']);
  });
});

/* ---- the two Kumo bands, side by side -------------------------------------------------------- */

describe('FILL-04 — the Kumo keeps its two bands, which is the whole reading', () => {
  it('paints the bullish band above and the bearish band below, in their own colours', () => {
    // The shape the Ichimoku emits: two fills sharing the Leading Span B bound, one against the
    // bullish hidden plot and one against the bearish, each alive on the bars the other is not.
    const result: VendorResult = {
      plots: {
        plot4: RAW.map((n) => ({ time: n, value: 100 })),
        plot5: [120, 120, null, null].map((value, at) => ({ time: RAW[at], value })),
        plot6: [null, null, 80, 80].map((value, at) => ({ time: RAW[at], value })),
      },
      fills: [
        { plot1: 'plot5', plot2: 'plot4', options: { color: '#43A047', transp: 90 } },
        { plot1: 'plot6', plot2: 'plot4', options: { color: '#F44336', transp: 90 } },
      ],
    };
    const overlay = new BandFillOverlay('anchor');
    overlay.setBands(TIMES, bandsOf(result, 4));

    const green = 'rgba(67, 160, 71, 0.09999999999999998)';
    const red = 'rgba(244, 67, 54, 0.09999999999999998)';
    expect(painted(overlay, RAW)).toEqual([
      { y: 80, h: 20, fill: green },
      { y: 80, h: 20, fill: green },
      { y: 100, h: 20, fill: red },
      { y: 100, h: 20, fill: red },
    ]);
  });
});
