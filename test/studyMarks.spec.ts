/**
 * MARK-01/MARK-02 — the map from a resolved study to the marks that ride its own series.
 *
 * `example/studyMarks.ts` shipped with NO test file at all, and the Verifier measured what that
 * cost: deleting the whole of `markOf`'s narrowing — the shape allow-list, the position allow-list,
 * the required colour and the non-finite time — left `npm test` at 1449/1449 and `npm run e2e` at
 * 96/96. The e2e can only see that SOME marks drew; every rule about which ones is decided here.
 *
 * EVERY CASE BELOW IS SYNTHETIC ON PURPOSE. Three of the four narrowings guard against a shape the
 * catalogue never produces: measured over all 72 marker-emitting rows at their own defaults, 10,103
 * marks carry a finite time, every time is a bar of the loaded window, and every mark carries a
 * colour. A test built from the vendor's own output would therefore pass with the narrowing deleted
 * — which is exactly what happened. The shape allow-list is the one with a live producer: 1,558 of
 * 2,109 marks name one of the eight shapes the base library cannot draw.
 *
 * Each rule is asserted with a PAIR: the mark that is refused, and its neighbour on the next bar
 * that is kept. A test that only asserted the refusal would pass against a `markOf` that returned
 * `null` for everything.
 */

import type { StudyPass, VendorResult } from '../example/indicators';
import { markChannel } from '../example/studyMarks';
import type { Bar, UtcSeconds } from '../src/domain/types';
import { utcSeconds } from '../src/domain/types';
import type { SeriesMarkerPoint } from '../src/port/chartApi';
import type { ResolvedSourceView, SourceResolution } from '../src/indicator/resolution';

/* ---- the window, and the study drawn into it ----------------------------------------------- */

const TIMES = [10, 20, 30, 40].map((n) => utcSeconds(n));

const GRID: readonly Bar[] = TIMES.map((time, at) => ({
  time,
  open: 100 + at,
  high: 101 + at,
  low: 99 + at,
  close: 100 + at,
}));

/** A drawable mark, so every case below can name only the field it is about. */
const mark = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  time: 20,
  position: 'aboveBar',
  shape: 'circle',
  color: '#00e676',
  ...over,
});

function viewOf(id: string, lane: number, overlay: boolean): ResolvedSourceView {
  return {
    id,
    lane,
    paneId: overlay ? 'price' : `ind${lane + 1}`,
    label: id,
    overlay,
    drawn: 1,
    availability: 'ok',
    warmUpBars: 0,
    windowBars: GRID.length,
  };
}

function resolutionOf(...views: readonly ResolvedSourceView[]): SourceResolution {
  return {
    views,
    readings: new Map(),
    labels: new Map(),
    activePaneIds: new Set(views.filter((view) => !view.overlay).map((view) => view.paneId)),
  };
}

function passOf(
  id: string,
  markers: readonly Record<string, unknown>[],
  grid: readonly Bar[] = GRID,
): StudyPass {
  return { id, grid, result: { markers } as unknown as VendorResult };
}

/** The marks the channel offers for one study, in the order it built them. */
function marksFor(
  markers: readonly Record<string, unknown>[],
  options: { readonly overlay?: boolean; readonly grid?: readonly Bar[] } = {},
): readonly SeriesMarkerPoint[] {
  const channel = markChannel();
  channel.record(passOf('study', markers, options.grid ?? GRID));
  const built = channel.map(resolutionOf(viewOf('study', 0, options.overlay ?? false)));
  return [...built.values()][0] ?? [];
}

/* ---- the shape allow-list ------------------------------------------------------------------ */

describe('MARK-01 — a mark the base library has no shape for is dropped, not redrawn', () => {
  it('keeps the four shapes the base library draws', () => {
    // `SeriesMarkerPoint['shape']` is exactly `lightweight-charts`' own `SeriesMarkerShape`.
    const kept = marksFor(
      ['circle', 'square', 'arrowUp', 'arrowDown'].map((shape, at) =>
        mark({ shape, time: TIMES[at] as unknown as number }),
      ),
    );
    expect(kept.map((point) => point.shape)).toEqual(['circle', 'square', 'arrowUp', 'arrowDown']);
  });

  it('drops a shape it cannot draw and keeps its neighbour', () => {
    // `triangleUp` is one of the eight the vendor emits and the base library has no destination
    // for. Redrawing it as a circle would be a lie; an absence is visible.
    const kept = marksFor([mark({ shape: 'triangleUp', time: 10 }), mark({ time: 20 })]);
    expect(kept.map((point) => point.time)).toEqual([20]);
  });

  it('drops a mark that names no shape at all', () => {
    const kept = marksFor([mark({ shape: undefined, time: 10 }), mark({ time: 20 })]);
    expect(kept.map((point) => point.time)).toEqual([20]);
  });
});

/* ---- the position allow-list --------------------------------------------------------------- */

describe('MARK-01 — a mark is placed only where the base library places one', () => {
  it('keeps the three placements it draws', () => {
    const kept = marksFor(
      ['aboveBar', 'belowBar', 'inBar'].map((position, at) =>
        mark({ position, time: TIMES[at] as unknown as number }),
      ),
    );
    expect(kept.map((point) => point.position)).toEqual(['aboveBar', 'belowBar', 'inBar']);
  });

  it('drops a placement it does not draw and keeps its neighbour', () => {
    const kept = marksFor([mark({ position: 'atPriceTop', time: 10 }), mark({ time: 20 })]);
    expect(kept.map((point) => point.time)).toEqual([20]);
  });

  it('drops a mark that names no placement at all', () => {
    const kept = marksFor([mark({ position: undefined, time: 10 }), mark({ time: 20 })]);
    expect(kept.map((point) => point.time)).toEqual([20]);
  });
});

/* ---- the colour ---------------------------------------------------------------------------- */

describe('MARK-01 — a mark carries its own colour or it is not offered', () => {
  it('passes the colour through unchanged', () => {
    expect(marksFor([mark({ color: '#ffeb3b' })])[0].color).toBe('#ffeb3b');
  });

  it('drops a mark with no colour, and one with an empty string, keeping the neighbour', () => {
    // `SeriesMarkerPoint.color` is required, so an absent one would reach the base library as
    // `undefined` and the mark would be painted in whatever the plugin defaults to — a mark whose
    // colour is not the study's is the wrong signal, not a missing one.
    const kept = marksFor([
      mark({ color: undefined, time: 10 }),
      mark({ color: '', time: 30 }),
      mark({ time: 20 }),
    ]);
    expect(kept.map((point) => point.time)).toEqual([20]);
  });
});

/* ---- the time ------------------------------------------------------------------------------ */

describe('MARK-01 — a mark whose bar the chart does not hold is dropped', () => {
  it('drops a non-finite time and keeps its neighbour', () => {
    const kept = marksFor([mark({ time: Number.NaN }), mark({ time: 20 })]);
    expect(kept.map((point) => point.time)).toEqual([20]);
  });

  it('drops a time that is not a number at all', () => {
    const kept = marksFor([mark({ time: '20' }), mark({ time: 20 })]);
    expect(kept.map((point) => point.time)).toEqual([20]);
  });

  it('EDGE CASE spec.md:195 — a mark outside the loaded window goes, its neighbours stay', () => {
    // The base library places a mark by looking its time up in the series' own data, so a time no
    // bar holds has no coordinate. Both directions are here: 15 sits BETWEEN two loaded bars and 99
    // sits beyond the last one, and the three marks on real bars are untouched.
    const kept = marksFor([
      mark({ time: 10 }),
      mark({ time: 15 }),
      mark({ time: 20 }),
      mark({ time: 99 }),
      mark({ time: 30 }),
    ]);
    expect(kept.map((point) => point.time)).toEqual([10, 20, 30]);
  });

  it('CONTROL — the same marks against a window that DOES hold those bars are all kept', () => {
    // Without this, a `markOf` that dropped everything would satisfy the case above.
    const wider: readonly Bar[] = [10, 15, 20, 30, 99].map((n) => ({
      time: utcSeconds(n),
      open: 100,
      high: 101,
      low: 99,
      close: 100,
    }));
    const kept = marksFor(
      [10, 15, 20, 99, 30].map((time) => mark({ time })),
      { grid: wider },
    );
    expect(kept.map((point) => point.time)).toEqual([10, 15, 20, 99, 30]);
  });
});

/* ---- the optional text --------------------------------------------------------------------- */

describe('MARK-01 — the label a mark carries', () => {
  it('keeps a non-empty text and omits the key otherwise', () => {
    expect(marksFor([mark({ text: 'BUY' })])[0].text).toBe('BUY');
    expect(marksFor([mark({ text: '' })])[0]).not.toHaveProperty('text');
    expect(marksFor([mark({})])[0]).not.toHaveProperty('text');
  });
});

/* ---- which series the marks ride ----------------------------------------------------------- */

describe('MARK-01 — the marks ride the study\'s own series, never the candles', () => {
  it('files an own-pane study under its lane series', () => {
    const channel = markChannel();
    channel.record(passOf('study', [mark({})]));
    expect([...channel.map(resolutionOf(viewOf('study', 1, false))).keys()]).toEqual(['ind2:ind2p1']);
  });

  it('files an over-price study under its price-pane overlay slot', () => {
    // The vendor's own reference pins every mark to the price pane, so an oscillator's signal lands
    // on a scale it was never measured against. Keyed by series, the mark rides the line it names.
    const channel = markChannel();
    channel.record(passOf('study', [mark({})]));
    expect([...channel.map(resolutionOf(viewOf('study', 1, true))).keys()]).toEqual(['price:ovl2p1']);
  });
});

/* ---- MARK-02: a study with nothing drawable offers no entry -------------------------------- */

describe('MARK-02 — a study whose marks all fall away offers no entry at all', () => {
  it('writes no key when every mark is refused', () => {
    // An empty array under a series key is not the same as no key: the surface would send an empty
    // marker list to a series that never had one, which is a write per render for nothing.
    const channel = markChannel();
    channel.record(passOf('study', [mark({ shape: 'triangleUp' }), mark({ time: 99 })]));
    expect([...channel.map(resolutionOf(viewOf('study', 0, false))).keys()]).toEqual([]);
  });

  it('writes no key for a study that emitted no markers, and none for one never recorded', () => {
    const channel = markChannel();
    channel.record(passOf('study', []));
    expect(channel.map(resolutionOf(viewOf('study', 0, false))).size).toBe(0);
    expect(channel.map(resolutionOf(viewOf('never-ran', 0, false))).size).toBe(0);
  });

  it('leaves the other studies alone when one of them has nothing to offer', () => {
    const channel = markChannel();
    channel.record(passOf('empty', []));
    channel.record(passOf('marked', [mark({})]));
    const built = channel.map(
      resolutionOf(viewOf('empty', 0, false), viewOf('marked', 1, false)),
    );
    expect([...built.keys()]).toEqual(['ind2:ind2p1']);
  });
});

/* ---- the cache the docblock claims --------------------------------------------------------- */

describe('MARK-01 — the map is cached on the resolution identity', () => {
  it('answers the same map for the same resolution and rebuilds for a new one', () => {
    // The effect that applies the map depends on the map, so a fresh one per render would resend
    // every mark on every render — about 7,400 of them in the worst frame this catalogue produces.
    const channel = markChannel();
    channel.record(passOf('study', [mark({})]));
    const resolution = resolutionOf(viewOf('study', 0, false));
    expect(channel.map(resolution)).toBe(channel.map(resolution));
    expect(channel.map(resolutionOf(viewOf('study', 0, false)))).not.toBe(channel.map(resolution));
  });

  it('CONTROL — a recompute reaches the next map, so the cache is not a freeze', () => {
    const channel = markChannel();
    channel.record(passOf('study', [mark({ color: '#00e676' })]));
    const first = channel.map(resolutionOf(viewOf('study', 0, false)));
    channel.record(passOf('study', [mark({ color: '#ffeb3b' })]));
    const second = channel.map(resolutionOf(viewOf('study', 0, false)));
    expect([...first.values()][0][0].color).toBe('#00e676');
    expect([...second.values()][0][0].color).toBe('#ffeb3b');
  });
});

/* ---- the type the module hands on ---------------------------------------------------------- */

describe('MARK-01 — a narrowed mark is exactly what the port declares', () => {
  it('carries only the port\'s five members, with the vendor\'s extras dropped', () => {
    const kept = marksFor([mark({ text: 'BUY', size: 3, id: 'vendor-only' })]);
    expect(kept[0]).toEqual({
      time: 20 as unknown as UtcSeconds,
      position: 'aboveBar',
      shape: 'circle',
      color: '#00e676',
      text: 'BUY',
    });
  });
});
