/**
 * REST-01 — the last four channels, held to WHERE they paint and not only to whether they do.
 *
 * The e2e reads the four off a real bitmap in a real browser (`channels.*-draw`), which is the
 * clause the spec asks for and the only instrument that can tell "attached" from "written". This
 * suite answers the question pixels cannot localise: a shading column that spans the pane rather
 * than the bar, a box drawn from the wrong corner, a line extended the wrong way, a label hung on
 * the wrong side of the price it names. All four would still light up a pixel count.
 *
 * The numbers in the cases are the vendor's own, measured over the 320 offered rows at their
 * defaults on the proof's fixture: bgColors on 20 rows and 13,572 items, all of them `rgba` with
 * the alpha already in the string; labels on 7 rows and 1,023 items; lines on 4 rows and 151; boxes
 * on 3 rows and 99.
 */

import { ChannelOverlay, channelChannel, extended, sceneOf } from '../example/channelOverlays';
import type { ChannelScene } from '../example/channelOverlays';
import type { VendorResult } from '../example/indicators';
import { utcSeconds } from '../src/domain/types';
import { PRICE_ORIGIN, RecordingContext, fakeProjection, fakeTarget } from './renderFakes';

const TIMES = [10, 20, 30, 40].map(utcSeconds);

const SIZE = { widthPx: 200, heightPx: 120 };

const scene = (over: Partial<ChannelScene> = {}): ChannelScene => ({
  times: TIMES,
  bgColors: [],
  labels: [],
  lines: [],
  boxes: [],
  ...over,
});

/** One draw of one layer, with the calls it made recorded. `barSpacing` is 10 by default. */
function drawn(layer: 'behind' | 'ahead', content: ChannelScene): RecordingContext {
  const ctx = new RecordingContext();
  const overlay = new ChannelOverlay('anchor', layer);
  overlay.setScene(content);
  overlay.draw(fakeTarget(ctx, SIZE), fakeProjection());
  return ctx;
}

describe('REST-01 — background shading is a column at its own bar', () => {
  it('paints one full-height column per bar, centred on it and one bar wide', () => {
    const ctx = drawn('behind', scene({ bgColors: [{ time: 20, color: 'rgba(0,128,0,0.3)' }] }));

    // `bgcolor()` colours the WHOLE column at that bar: full height, one bar wide, centred on the
    // bar's own x. A shading that spanned the pane would light a pixel count exactly as well.
    expect(ctx.rects).toEqual([{ x: 15, y: 0, w: 10, h: 120, fill: 'rgba(0,128,0,0.3)' }]);
  });

  it('keeps the colour the vendor wrote, verbatim and uncomposed', () => {
    // Measured: 13,572 of 13,572 background colours arrive as `rgba(...)` with the alpha already
    // in the string. Unlike the fill, nothing here has a `transp` to compose — and the fill's own
    // defect was composing one wrongly, so a channel that re-composed would repeat it.
    const ctx = drawn('behind', scene({ bgColors: [{ time: 10, color: 'rgba(255,0,0,0.3)' }] }));

    expect(ctx.rects[0].fill).toBe('rgba(255,0,0,0.3)');
  });

  it('skips a bar the projection cannot place, and still paints its neighbour', () => {
    const off = fakeProjection({ timeToX: (time) => (time === 20 ? null : time) });
    const ctx = new RecordingContext();
    const overlay = new ChannelOverlay('anchor', 'behind');
    overlay.setScene(
      scene({
        bgColors: [
          { time: 20, color: 'rgba(0,128,0,0.3)' },
          { time: 30, color: 'rgba(0,128,0,0.3)' },
        ],
      }),
    );
    overlay.draw(fakeTarget(ctx, SIZE), off);

    expect(ctx.rects.map((rect) => rect.x)).toEqual([25]);
  });

  it('paints nothing where the vendor writes a colour that paints nothing', () => {
    // `transparent` is how the vendor switches a column off, and an empty string is how it says
    // nothing at all. Painting either would put a rectangle over the candles for no reason.
    const ctx = drawn('behind', scene({ bgColors: [{ time: 10, color: 'transparent' }, { time: 20, color: '' }] }));

    expect(ctx.rects).toEqual([]);
  });
});

describe('REST-01 — a box is drawn between the two corners it names', () => {
  const BOX = { time1: 20, price1: 60, time2: 40, price2: 40 } as const;

  it('fills the rectangle the two corners bound, whichever order they arrive in', () => {
    const straight = drawn('behind', scene({ boxes: [{ ...BOX, bgColor: '#00ffbb4D' }] }));
    const flipped = drawn(
      'behind',
      scene({ boxes: [{ time1: 40, price1: 40, time2: 20, price2: 60, bgColor: '#00ffbb4D' }] }),
    );

    // y grows downward, so the HIGHER price is the smaller y: the box runs from 940 to 960.
    expect(straight.rects).toEqual([
      { x: 20, y: PRICE_ORIGIN - 60, w: 20, h: 20, fill: '#00ffbb4D' },
    ]);
    // The vendor names two OPPOSITE corners, not a top-left and a size. Reading them positionally
    // would give a negative width and height on every box that arrives the other way round.
    expect(flipped.rects).toEqual(straight.rects);
  });

  it('outlines it in the border colour, and draws no outline where the border is transparent', () => {
    // Measured: 34 of the 99 boxes carry no border to draw — `hema-trend-levels` writes
    // `borderColor: 'transparent'` on every one of its own — so a stroke there is ink the vendor
    // never asked for, drawn around a third of the boxes on the catalogue.
    const bordered = drawn('behind', scene({ boxes: [{ ...BOX, borderColor: '#4043f1', borderStyle: 'dashed' }] }));
    const bare = drawn('behind', scene({ boxes: [{ ...BOX, bgColor: '#00ffbb4D', borderColor: 'transparent' }] }));

    expect(bordered.strokes).toEqual([
      { from: [20, PRICE_ORIGIN - 60], to: [40, PRICE_ORIGIN - 40], stroke: '#4043f1', width: 1, dash: [6, 4] },
    ]);
    expect(bare.strokes).toEqual([]);
    expect(bare.rects).toHaveLength(1);
  });
});

describe('REST-01 — a drawn line runs between its two endpoints', () => {
  it('strokes the segment in the colour, width and dash the vendor declared', () => {
    const ctx = drawn(
      'ahead',
      scene({
        lines: [{ time1: 20, price1: 60, time2: 40, price2: 40, color: '#ff441f', width: 2, style: 'dashed' }],
      }),
    );

    expect(ctx.strokes).toEqual([
      { from: [20, PRICE_ORIGIN - 60], to: [40, PRICE_ORIGIN - 40], stroke: '#ff441f', width: 2, dash: [6, 4] },
    ]);
  });

  it('draws no line the vendor gave no colour, rather than a black one', () => {
    const ctx = drawn('ahead', scene({ lines: [{ time1: 20, price1: 60, time2: 40, price2: 40 }] }));

    expect(ctx.strokes).toEqual([]);
  });

  it('carries an extended line along its OWN slope, not along the horizontal', () => {
    // `extend: 'right'` means the line continues past its second endpoint at the angle it already
    // has. An implementation that ran it flat to the edge would extend every line and be wrong on
    // every one that is not already horizontal — which is the case the endpoints here describe.
    const rising = extended({ x: 100, y: 200 }, { x: 200, y: 100 }, 'right', 400);
    const both = extended({ x: 100, y: 200 }, { x: 200, y: 100 }, 'both', 400);

    expect(rising).toEqual([{ x: 100, y: 200 }, { x: 400, y: -100 }]);
    expect(both).toEqual([{ x: 0, y: 300 }, { x: 400, y: -100 }]);
  });

  it('leaves a line alone where the vendor extends nothing — measured, that is all four rows', () => {
    // CONTROL POSITIVE for the clause above: over the offered catalogue not one of the 151 drawn
    // lines carries an `extend` — 151 of 151 leave it out — so extending unconditionally would move
    // every line on screen and no pixel count would notice.
    expect(extended({ x: 10, y: 20 }, { x: 30, y: 40 }, undefined, 400)).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    expect(extended({ x: 10, y: 20 }, { x: 30, y: 40 }, 'none', 400)).toEqual([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
  });
});

describe('REST-01 — a label names a price, on the side its style says', () => {
  const LABEL = { time: 20, price: 60, text: '[101.64]', textColor: 'rgba(0,128,128,0.5)' } as const;

  it('writes the text in the colour the vendor named, at the bar it names', () => {
    const ctx = drawn('ahead', scene({ labels: [{ ...LABEL, size: 'tiny' }] }));

    expect(ctx.texts).toHaveLength(1);
    expect(ctx.texts[0]).toMatchObject({ text: '[101.64]', x: 20, fill: 'rgba(0,128,128,0.5)' });
    // `size` is one of PineScript's five words, not a number: measured, 199 of the 1,023 labels
    // ask for `tiny`, 811 for `small`, and 13 name no size at all.
    expect(ctx.texts[0].font).toBe('9px sans-serif');
  });

  it('hangs the body BELOW the price for label_up and above it for label_down', () => {
    const up = drawn('ahead', scene({ labels: [{ ...LABEL, style: 'label_up' }] }));
    const down = drawn('ahead', scene({ labels: [{ ...LABEL, style: 'label_down' }] }));

    // The tip points AT the price either way, so the two bodies sit on opposite sides of it. An
    // implementation that ignored `style` would put both in the same place, and the two families
    // of pivot label — highs above, lows below — would collide on the price they mark.
    expect(up.texts[0].y).toBeGreaterThan(PRICE_ORIGIN - 60);
    expect(down.texts[0].y).toBeLessThan(PRICE_ORIGIN - 60);
  });

  it('draws a bubble only where the vendor gave one a colour', () => {
    // Measured: 4 of the 7 emitters carry no `color` on any label, so the text IS the label there
    // and a bubble drawn anyway would be an opaque box over the candles on most of the rows.
    const bubbled = drawn('ahead', scene({ labels: [{ ...LABEL, color: '#26A69A' }] }));
    const bare = drawn('ahead', scene({ labels: [LABEL] }));

    expect(bubbled.rects).toHaveLength(1);
    expect(bubbled.rects[0].fill).toBe('#26A69A');
    expect(bare.rects).toEqual([]);
    expect(bare.texts).toHaveLength(1);
  });

  it('writes each line of a multi-line text on its own line', () => {
    // Measured: `market-shift-levels` writes `"⬘\n16.2K"`. Drawn as one run it reads as one
    // glyph soup, and the canvas does not break lines on its own.
    const ctx = drawn('ahead', scene({ labels: [{ ...LABEL, text: 'A\nB' }] }));

    expect(ctx.texts.map((run) => run.text)).toEqual(['A', 'B']);
    expect(ctx.texts[1].y).toBeGreaterThan(ctx.texts[0].y);
  });
});

describe('the two layers are the reading, not a detail', () => {
  const FULL = scene({
    bgColors: [{ time: 20, color: 'rgba(0,128,0,0.3)' }],
    boxes: [{ time1: 20, price1: 60, time2: 40, price2: 40, bgColor: '#00ffbb4D' }],
    lines: [{ time1: 20, price1: 60, time2: 40, price2: 40, color: '#ff441f' }],
    labels: [{ time: 20, price: 60, text: 'x', textColor: '#ffffff' }],
  });

  it('puts shading and boxes BEHIND, and lines and labels AHEAD', () => {
    const behind = drawn('behind', FULL);
    const ahead = drawn('ahead', FULL);

    // Ground under annotation: a box drawn over the plot it frames buries it, and text under a
    // line is text nobody can read. The same scene is handed to both layers, and each paints half.
    expect(behind.rects).toHaveLength(2);
    expect(behind.strokes).toEqual([]);
    expect(behind.texts).toEqual([]);
    expect(ahead.strokes).toHaveLength(1);
    expect(ahead.texts).toHaveLength(1);
    expect(ahead.rects).toEqual([]);
  });

  it('draws nothing at all when the study emits none of the four', () => {
    const ctx = drawn('behind', scene());

    expect(ctx.rects).toEqual([]);
  });
});

describe('the channel narrows the result and clears a slot nobody occupies', () => {
  it('takes the four members off the vendor result and leaves an absent one empty', () => {
    const result = { bgColors: [{ time: 10, color: '#fff' }], boxes: [] } as unknown as VendorResult;
    const narrowed = sceneOf(result, TIMES);

    expect(narrowed.bgColors).toHaveLength(1);
    expect(narrowed.labels).toEqual([]);
    expect(narrowed.lines).toEqual([]);
    // A study that has not computed yet has no result, and that is an empty scene, not a throw.
    expect(sceneOf(null, TIMES).bgColors).toEqual([]);
  });

  it('mints two layers per slot per placement, so a study reaches whichever it lands on', () => {
    const channel = channelChannel(3);

    // Six slots — three over the price and three in lanes — two layers each. The placement is a
    // MEASUREMENT the resolve makes, not the study's request, so both have to exist before it.
    expect(channel.overlays).toHaveLength(12);
    expect(new Set(channel.overlays.map((overlay) => overlay.anchor)).size).toBe(6);
    expect(channel.overlays.filter((overlay) => overlay.zOrder === 'ahead')).toHaveLength(6);
  });

  it('clears a slot whose study was removed, rather than leaving the last one’s shading up', () => {
    const channel = channelChannel(1);
    const grid = TIMES.map((time) => ({ time }));
    const held = { bgColors: [{ time: 20, color: 'rgba(0,128,0,0.3)' }] } as unknown as VendorResult;
    channel.record({ id: 'study', grid, result: held } as never);

    channel.apply({ views: [{ id: 'study', lane: 0, overlay: false }] } as never);
    const drawing = new RecordingContext();
    const lane = channel.overlays.find((overlay) => overlay.zOrder === 'behind' && overlay.anchor.includes('ind1'));
    lane?.draw(fakeTarget(drawing, SIZE), fakeProjection());
    expect(drawing.rects).toHaveLength(1);

    // Removing a study detaches no series, so the primitive stays attached: a slot that is not fed
    // would go on painting the departed study's shading over whatever occupies the lane next.
    channel.apply({ views: [] } as never);
    const after = new RecordingContext();
    lane?.draw(fakeTarget(after, SIZE), fakeProjection());
    expect(after.rects).toEqual([]);
  });
});
