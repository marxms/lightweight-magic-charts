/**
 * A distribution profile in a trough, never over the live edge.
 *
 * "Does not cover the live edge" is the requirement, and it is asserted the only way that means
 * anything: over the rectangles the overlay actually emitted, checking that none of them intersects
 * the live column. A test on the computed geometry alone would agree with a renderer that drew
 * somewhere else entirely.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import { directionConvention, invertConvention, utcSeconds, type Bar } from '../src/domain/types';
import {
  DEFAULT_TROUGH_STYLE,
  TroughProfileOverlay,
  buildProfile,
  troughStyleFor,
  type Profile,
  type TroughStyle,
} from '../src/overlays/troughProfile';
import {
  PRICE_ORIGIN,
  RecordingContext,
  alphaOf,
  fakeProjection,
  fakeTarget,
  type RecordedRect,
} from './renderFakes';

const bar = (time: number, o: number, h: number, l: number, c: number, volume: number): Bar => ({
  time: utcSeconds(time),
  open: o,
  high: h,
  low: l,
  close: c,
  volume,
});

/** A profile with one heavy bucket, so `available` maps straight onto the widest bar. */
function flatProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    buckets: [{ priceLow: 10, priceHigh: 20, weight: 10, upShare: 0.5 }],
    peak: 10,
    control: 15,
    bandLow: 10,
    bandHigh: 20,
    total: 10,
    ...overrides,
  };
}

const style = (overrides: Partial<TroughStyle> = {}): TroughStyle => ({
  ...DEFAULT_TROUGH_STYLE,
  ...overrides,
});

/** The control line is a hairline across the plot; the trough bars are everything taller. */
function troughRects(rects: readonly RecordedRect[]): readonly RecordedRect[] {
  return rects.filter((rect) => rect.h > 1);
}

describe('task 4.6 — building the distribution', () => {
  it('spreads weight across the buckets a bar SPANS, in proportion to the overlap', () => {
    // Dumping the whole bar on its close is the common shortcut, and it invents a spike at every
    // closing price — a feature of the shortcut, read by the eye as a feature of the market.
    const profile = buildProfile([bar(1, 0, 100, 0, 100, 100)], 2);

    expect(profile).not.toBeNull();
    expect(profile?.buckets.map((b) => b.weight)).toEqual([50, 50]);
  });

  it('returns null rather than an empty distribution when there is no volume to distribute', () => {
    expect(buildProfile([bar(1, 0, 100, 0, 100, 0)], 4)).toBeNull();
    expect(buildProfile([{ time: utcSeconds(1), open: 1, high: 2, low: 0, close: 1 }], 4)).toBeNull();
    expect(buildProfile([], 4)).toBeNull();
    expect(buildProfile([bar(1, 5, 5, 5, 5, 10)], 4)).toBeNull();
  });

  it('grows the band outward from the control level, always taking the heavier neighbour', () => {
    // Four buckets over [0,100). Weights land as [1,10,100,40]: the control is [50,75) and the
    // heavier neighbour is the one above it, so the band opens upward and stops there.
    const profile = buildProfile(
      [
        bar(1, 50, 75, 50, 75, 100),
        bar(2, 75, 100, 75, 100, 40),
        bar(3, 25, 50, 25, 50, 10),
        bar(4, 0, 25, 0, 25, 1),
      ],
      4,
    );

    expect(profile?.control).toBeCloseTo(62.5, 6);
    expect(profile?.bandLow).toBeCloseTo(50, 6);
    expect(profile?.bandHigh).toBeCloseTo(100, 6);
  });

  it('splits each bucket by direction, leaving the colour of each side to the consumer', () => {
    const profile = buildProfile([bar(1, 0, 10, 0, 10, 100), bar(2, 10, 10, 0, 0, 100)], 1);
    expect(profile?.buckets[0].upShare).toBeCloseTo(0.5, 6);
  });
});

describe('task 4.6 — the trough never covers the live edge', () => {
  it('shrinks into the margin instead of sliding over the newest bar', () => {
    // Wanted width 200px from the right edge of a 400px plot, live bar at x=300 with 10px spacing:
    // the trough may only have the 95px between the live bar's right side and the edge.
    const overlay = new TroughProfileOverlay();
    overlay.setStyle(style({ side: 'right', widthShare: 0.5 }));
    overlay.setProfile(flatProfile());
    overlay.setLiveEdge(utcSeconds(300));
    const ctx = new RecordingContext();

    overlay.draw(
      fakeTarget(ctx, { widthPx: 400, heightPx: 200 }),
      fakeProjection({ barSpacing: 10 }),
    );

    expect(overlay.frameStats().availablePx).toBe(95);
    for (const rect of troughRects(ctx.rects)) expect(rect.x).toBeGreaterThanOrEqual(305);
  });

  it('takes its full width when there is no live edge to protect', () => {
    // The control that makes the previous case meaningful: without the clamp the trough starts at
    // 200, which is 105px inside the live bar.
    const overlay = new TroughProfileOverlay();
    overlay.setStyle(style({ side: 'right', widthShare: 0.5 }));
    overlay.setProfile(flatProfile());
    const ctx = new RecordingContext();

    overlay.draw(
      fakeTarget(ctx, { widthPx: 400, heightPx: 200 }),
      fakeProjection({ barSpacing: 10 }),
    );

    expect(overlay.frameStats().availablePx).toBe(200);
    expect(Math.min(...troughRects(ctx.rects).map((r) => r.x))).toBe(200);
  });

  it('draws NOTHING when the live edge leaves no trough, instead of drawing past the edge', () => {
    // The live bar sits at the container edge. A trough measured with an absolute value would find
    // "room" beyond the edge and paint outside the plot.
    const overlay = new TroughProfileOverlay();
    overlay.setStyle(style({ side: 'right', widthShare: 0.5 }));
    overlay.setProfile(flatProfile());
    overlay.setLiveEdge(utcSeconds(399));
    const ctx = new RecordingContext();

    overlay.draw(
      fakeTarget(ctx, { widthPx: 400, heightPx: 200 }),
      fakeProjection({ barSpacing: 10 }),
    );

    expect(overlay.frameStats()).toEqual({ drawn: 0, availablePx: 0 });
    expect(troughRects(ctx.rects)).toEqual([]);
  });

  it('mirrors to the left edge, growing rightward from x=0', () => {
    const overlay = new TroughProfileOverlay();
    overlay.setStyle(style({ side: 'left', widthShare: 0.25 }));
    overlay.setProfile(flatProfile());
    const ctx = new RecordingContext();

    overlay.draw(
      fakeTarget(ctx, { widthPx: 400, heightPx: 200 }),
      fakeProjection({ barSpacing: 10 }),
    );

    expect(overlay.frameStats().availablePx).toBe(100);
    expect(Math.min(...troughRects(ctx.rects).map((r) => r.x))).toBe(0);
    expect(Math.max(...troughRects(ctx.rects).map((r) => r.x + r.w))).toBe(100);
  });

  it('steps the control level OVER the live column rather than stopping short of it', () => {
    // A level that ends halfway across reads as a level that expired, and this one has not.
    const overlay = new TroughProfileOverlay();
    overlay.setProfile(flatProfile());
    overlay.setLiveEdge(utcSeconds(300));
    const ctx = new RecordingContext();

    overlay.draw(
      fakeTarget(ctx, { widthPx: 400, heightPx: 200 }),
      fakeProjection({ barSpacing: 10 }),
    );

    const line = ctx.rects.filter((rect) => rect.h === 1);
    expect(line.map((rect) => [rect.x, rect.x + rect.w])).toEqual([
      [0, 295],
      [305, 400],
    ]);
    expect(line.every((rect) => rect.y === PRICE_ORIGIN - 15)).toBe(true);
  });

  it('draws the control level in one span when there is no live edge', () => {
    const overlay = new TroughProfileOverlay();
    overlay.setProfile(flatProfile());
    const ctx = new RecordingContext();

    overlay.draw(
      fakeTarget(ctx, { widthPx: 400, heightPx: 200 }),
      fakeProjection({ barSpacing: 10 }),
    );

    const line = ctx.rects.filter((rect) => rect.h === 1);
    expect(line.map((rect) => [rect.x, rect.x + rect.w])).toEqual([[0, 400]]);
  });
});

describe('task 4.6 — side, width and opacity are the consumer’s', () => {
  it('is drawn BEHIND the price action', () => {
    expect(new TroughProfileOverlay().zOrder).toBe('behind');
  });

  it('scales the widest bucket to the configured share of the plot', () => {
    for (const [widthShare, expected] of [
      [0.1, 40],
      [0.25, 100],
      [0.5, 200],
    ] as const) {
      const overlay = new TroughProfileOverlay();
      overlay.setStyle(style({ widthShare }));
      overlay.setProfile(flatProfile());
      const ctx = new RecordingContext();
      overlay.draw(fakeTarget(ctx, { widthPx: 400, heightPx: 200 }), fakeProjection());
      expect(overlay.frameStats().availablePx).toBe(expected);
    }
  });

  it('multiplies every fill by the configured opacity, and dims what falls outside the band', () => {
    const overlay = new TroughProfileOverlay();
    overlay.setStyle(style({ opacity: 0.8, outsideBandOpacity: 0.25 }));
    overlay.setProfile(
      flatProfile({
        buckets: [
          { priceLow: 10, priceHigh: 20, weight: 10, upShare: 1 },
          { priceLow: 30, priceHigh: 40, weight: 10, upShare: 1 },
        ],
        bandLow: 10,
        bandHigh: 20,
      }),
    );
    const ctx = new RecordingContext();

    overlay.draw(fakeTarget(ctx, { widthPx: 400, heightPx: 200 }), fakeProjection());

    const alphas = troughRects(ctx.rects).map((rect) => alphaOf(rect.fill));
    expect(alphas).toEqual([0.8, 0.2]);
  });

  it('does not round a zero-width side up to a hairline of the wrong direction', () => {
    // At these opacities a one-pixel line of the opposite colour is exactly what the eye picks up,
    // and it would be a reading the data does not support.
    const overlay = new TroughProfileOverlay();
    overlay.setProfile(flatProfile({ buckets: [{ priceLow: 10, priceHigh: 20, weight: 10, upShare: 1 }] }));
    const ctx = new RecordingContext();

    overlay.draw(fakeTarget(ctx, { widthPx: 400, heightPx: 200 }), fakeProjection());

    expect(troughRects(ctx.rects)).toHaveLength(1);
    expect(alphaOf(troughRects(ctx.rects)[0].fill)).toBe(DEFAULT_TROUGH_STYLE.opacity);
  });

  it('takes the up and down colours from the consumer — the western convention is not fixed', () => {
    const overlay = new TroughProfileOverlay();
    overlay.setStyle(style({ upColor: '1,2,3', downColor: '4,5,6' }));
    overlay.setProfile(flatProfile());
    const ctx = new RecordingContext();

    overlay.draw(fakeTarget(ctx, { widthPx: 400, heightPx: 200 }), fakeProjection());

    const fills = troughRects(ctx.rects).map((rect) => rect.fill);
    expect(fills[0]).toMatch(/^rgba\(1,2,3,/);
    expect(fills[1]).toMatch(/^rgba\(4,5,6,/);
  });

  it('asks the host to redraw on every change, and reports nothing once detached', () => {
    const overlay = new TroughProfileOverlay();
    let redraws = 0;
    overlay.attached({ requestRedraw: () => (redraws += 1), projection: fakeProjection() });

    overlay.setProfile(flatProfile());
    overlay.setLiveEdge(utcSeconds(1));
    overlay.setStyle(style());
    expect(redraws).toBe(3);

    overlay.detached();
    overlay.setProfile(null);
    expect(redraws).toBe(3);
    expect(overlay.frameStats()).toEqual({ drawn: 0, availablePx: 0 });
  });
});

describe('task 7.3 — the declared convention reaches the render', () => {
  it('resolves the consumer hex pair into the fills the trough actually emits', () => {
    const overlay = new TroughProfileOverlay();
    overlay.setStyle(troughStyleFor(directionConvention({ upColor: '#010203', downColor: '#040506' })));
    overlay.setProfile(flatProfile());
    const ctx = new RecordingContext();

    overlay.draw(fakeTarget(ctx, { widthPx: 400, heightPx: 200 }), fakeProjection());

    const fills = troughRects(ctx.rects).map((rect) => rect.fill);
    expect(fills[0]).toMatch(/^rgba\(1,2,3,/);
    expect(fills[1]).toMatch(/^rgba\(4,5,6,/);
  });

  it('inverts the two fills when the inverted convention is declared', () => {
    const western = directionConvention({ upColor: '#010203', downColor: '#040506' });
    const overlay = new TroughProfileOverlay();
    overlay.setStyle(troughStyleFor(invertConvention(western)));
    overlay.setProfile(flatProfile());
    const ctx = new RecordingContext();

    overlay.draw(fakeTarget(ctx, { widthPx: 400, heightPx: 200 }), fakeProjection());

    const fills = troughRects(ctx.rects).map((rect) => rect.fill);
    expect(fills[0]).toMatch(/^rgba\(4,5,6,/);
    expect(fills[1]).toMatch(/^rgba\(1,2,3,/);
  });

  it('keeps the two directions apart with ONE colour — the split is positional, not chromatic', () => {
    // The reading a colour-blind user gets, simulated by removing the colour channel entirely: the
    // up share grows from the outer edge and the down share continues beyond it, so the two
    // rectangles still occupy disjoint x ranges. If direction rode on hue alone this would collapse
    // into one indistinguishable band.
    const mono = directionConvention({
      upColor: '#B8BCC4',
      downColor: '#B8BCC4',
      encodeDirectionBy: ['position'],
    });
    const overlay = new TroughProfileOverlay();
    overlay.setStyle(troughStyleFor(mono, { ...DEFAULT_TROUGH_STYLE, widthShare: 0.5 }));
    overlay.setProfile(flatProfile());
    const ctx = new RecordingContext();

    overlay.draw(fakeTarget(ctx, { widthPx: 400, heightPx: 200 }), fakeProjection());

    const [up, down] = troughRects(ctx.rects);
    expect(up.fill).toBe(down.fill);
    expect(up.w).toBeGreaterThan(0);
    expect(down.w).toBeGreaterThan(0);
    // Disjoint: the down segment ends exactly where the up segment starts.
    expect(down.x + down.w).toBe(up.x);
  });

  it('refuses a colour it cannot resolve instead of composing rgba(undefined)', () => {
    expect(() =>
      troughStyleFor({ upColor: 'teal', downColor: '#ef5350', encodeDirectionBy: ['position'] }),
    ).toThrow(/not a hex colour/);
  });
});

describe('LMC-23 — the trough default style is a literal, not a call at module scope', () => {
  it('is worth EXACTLY what the call it replaced produced', () => {
    // The lock against drift. The literal is only safe while it equals what the resolver returns
    // for the same convention — and it is this assertion, not the comment, that guarantees it.
    expect(DEFAULT_TROUGH_STYLE).toEqual(
      troughStyleFor(
        directionConvention({
          upColor: '#26a69a',
          downColor: '#ef5350',
          encodeDirectionBy: ['color', 'position'],
        }),
      ),
    );
    expect(DEFAULT_TROUGH_STYLE.upColor).toBe('38,166,154');
    expect(DEFAULT_TROUGH_STYLE.downColor).toBe('239,83,80');
  });

  it('the module-scope initializer is no longer a call', () => {
    // THE CRITERION IS ABOUT THE INITIALIZER, not about the value: the value above would pass just
    // the same with the call back in. A call at module scope is a call nothing can shake — it holds
    // the convention validator, the resolver and the hex parser in the graph of whoever only wanted
    // the style. So the one who answers is the compiler, about the FORM of the declaration.
    const file = join(__dirname, '..', 'src', 'overlays', 'troughProfile.ts');
    const parsed = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2021, true);
    const initializerOf = (name: string): ts.Expression | undefined =>
      parsed.statements
        .filter(ts.isVariableStatement)
        .flatMap((statement) => [...statement.declarationList.declarations])
        .find((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === name)
        ?.initializer;

    const initializer = initializerOf('DEFAULT_TROUGH_STYLE');
    expect(initializer).toBeDefined();
    expect(ts.isObjectLiteralExpression(initializer as ts.Expression)).toBe(true);
    expect(ts.isCallExpression(initializer as ts.Expression)).toBe(false);

    // POSITIVE CONTROL: the same predicate, over the form the rule forbids, answers the opposite.
    const chamada = ts
      .createSourceFile('synthetic.ts', 'const X = troughStyleFor(c);', ts.ScriptTarget.ES2021, true)
      .statements.filter(ts.isVariableStatement)[0].declarationList.declarations[0].initializer;
    expect(ts.isObjectLiteralExpression(chamada as ts.Expression)).toBe(false);
    expect(ts.isCallExpression(chamada as ts.Expression)).toBe(true);
  });
});
