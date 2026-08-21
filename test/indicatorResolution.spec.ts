import { laneOrder, resolveSources } from '../src/indicator/resolution';
import { resolutionPolicy } from '../src/catalogue/sources';
import type { PlottableSource, PlottedSeries, SourceLookup } from '../src/catalogue/sources';
import { lanePaneId, laneSeriesId, priceOverlaySeriesId } from '../src/catalogue/lanes';
import { seriesId } from '../src/domain/types';
import type { Bar, Point } from '../src/domain/types';

/**
 * LMC-18, LMC-20 — the resolution, taking the generic LOOKUP instead of a catalogue.
 *
 * Parity against the previous implementation (LMC-22) is measured at the app's edge, in
 * `apps/web/src/hooks/__tests__/activeIndicators.parity.test.ts`. What lives here are the clauses
 * that only exist after the generalisation: the lookup as a parameter, the series identity as the
 * key, and the duplicate-id semantics — which the lib refuses to decide and therefore has to leave
 * observable.
 */

const POLICY = resolutionPolicy({ lanes: 4, plotsPerLane: 4 });

const bar = (time: number, close: number): Bar =>
  ({ time, open: close, high: close, low: close, close }) as unknown as Bar;
const BARS: Bar[] = Array.from({ length: 20 }, (_unused, i) => bar(1000 + i * 60, 30000 + i));

const points = (fn: (i: number) => number | null): Point[] =>
  BARS.map((b, i) => {
    const value = fn(i);
    return (value === null ? { time: b.time } : { time: b.time, value }) as unknown as Point;
  });

const plot = (label: string, fn: (i: number) => number | null): PlottedSeries =>
  ({
    spec: { id: seriesId(label), label, shape: 'line', color: '#fff', lineWidth: 1 },
    provider: { compute: () => points(fn) },
  }) as unknown as PlottedSeries;

const source = (over: Partial<PlottableSource> & { readonly id: string }): PlottableSource => ({
  label: over.id.toUpperCase(),
  placement: 'own-pane',
  series: () => [plot(`${over.id}1`, (i) => i)],
  ...over,
});

/** The scan: it keeps the FIRST occurrence. */
const scanLookup =
  (list: readonly PlottableSource[]): SourceLookup =>
  (id) =>
    list.find((candidate) => candidate.id === id);

/** The map by key: it keeps the LAST. */
const mapLookup = (list: readonly PlottableSource[]): SourceLookup => {
  const byId = new Map(list.map((entry) => [entry.id, entry] as const));
  return (id) => byId.get(id);
};

describe('laneOrder — the list sanitised against the RESOURCE', () => {
  it('a duplicate goes, the order stays, and the surplus is cut from the END', () => {
    expect(laneOrder(['a', 'b', 'a', 'c', 'd', 'e'], 4)).toEqual(['a', 'b', 'c', 'd']);
    // Cutting from the end is what makes the ceiling a LIMIT and not a replacement: the pool this
    // replaced overwrote the first slot when full, and that was how a study vanished unremoved.
    expect(laneOrder(['a', 'b', 'c', 'd', 'e'], 4)[0]).toBe('a');
    expect(laneOrder([], 4)).toEqual([]);
  });

  it('the ceiling is a PARAMETER, because how many lanes exist is up to the consumer', () => {
    expect(laneOrder(['a', 'b', 'c'], 1)).toEqual(['a']);
    expect(laneOrder(['a', 'b', 'c'], 9)).toEqual(['a', 'b', 'c']);
  });
});

/**
 * LANE-02, LANE-03 — the cut a host reads out of values this package already publishes.
 *
 * The criterion names this test and it had never been written: seven ids against three lanes,
 * `views.length` is three, so the cut is `ids.length - views.length`. The gap was behavioural
 * rather than editorial. A `resolveSources` that deduplicates but never cuts at the lane count —
 * `laneOrder` itself untouched — passed 1321 tests and the whole e2e, which is the incident
 * `example/App.tsx` records in its own words, restated: studies the reader chose are never drawn
 * and the difference reads zero while it happens. Asserting `laneOrder` alone does not reach it,
 * because the number a host divides by comes out of `views`.
 */
describe('LANE-02 — views.length IS the resolved count, so the cut is derivable', () => {
  const THREE_LANES = resolutionPolicy({ lanes: 3, plotsPerLane: 4 });
  const lookupOf = (ids: readonly string[]): SourceLookup => scanLookup(ids.map((id) => source({ id })));

  it('seven ids against three lanes resolve THREE, and the host reads a cut of four', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const lookup = lookupOf(ids);
    const resolution = resolveSources(ids, lookup, BARS, THREE_LANES);

    expect(resolution.views).toHaveLength(3);
    expect(ids.length - resolution.views.length).toBe(4);
    // Cut from the END, and the three that fit are UNCHANGED by the four that did not: resolving
    // them on their own produces the same views, member for member.
    expect(resolution.views.map((view) => view.id)).toEqual(['a', 'b', 'c']);
    expect(resolution.views).toEqual(resolveSources(['a', 'b', 'c'], lookup, BARS, THREE_LANES).views);
    // And the ones that did not fit are absent from everything a lane spends, not merely unlisted.
    expect(resolution.activePaneIds.size).toBe(3);
    expect(resolution.activePaneIds.has(lanePaneId(3))).toBe(false);
    expect(resolution.readings.has(seriesId(laneSeriesId(3, 0)))).toBe(false);
  });

  it('a repeated id collapses BEFORE the cut, so the difference is not the cut alone', () => {
    // `ids.length - views.length` counts every entry of the list that draws nothing of its own, and
    // a duplicate is one of those. Reporting that number as "studies the lanes could not fit" would
    // be a second wrong count standing beside the one this story exists for.
    const ids = ['a', 'a', 'b', 'c', 'd'];
    const resolution = resolveSources(ids, lookupOf(['a', 'b', 'c', 'd']), BARS, THREE_LANES);

    expect(resolution.views.map((view) => view.id)).toEqual(['a', 'b', 'c']);
    expect(ids.length - resolution.views.length).toBe(2);
  });
});

describe('LMC-18 — the resolver takes the LOOKUP, never the catalogue', () => {
  it('the lane comes from the list position, and removing the first PROMOTES the second', () => {
    const lookup = scanLookup([source({ id: 'a' }), source({ id: 'b' })]);
    const before = resolveSources(['a', 'b'], lookup, BARS, POLICY);
    expect(before.views.map((view) => [view.id, view.lane])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);

    const after = resolveSources(['b'], lookup, BARS, POLICY);
    expect(after.views.map((view) => [view.id, view.lane])).toEqual([['b', 0]]);
    // The lane that was left over has NO key at all in the result — that is the only way for it to
    // vanish from the pane, from the legend and from the readings at the same time.
    expect(after.readings.has(seriesId(laneSeriesId(1, 0)))).toBe(false);
    expect(after.labels.has(seriesId(laneSeriesId(1, 0)))).toBe(false);
    expect(after.activePaneIds.has(lanePaneId(1))).toBe(false);
  });

  it('an id the lookup does not know comes out as chosen, nameless and empty', () => {
    const resolution = resolveSources(['ghost'], scanLookup([]), BARS, POLICY);
    expect(resolution.views[0]).toMatchObject({
      id: 'ghost',
      label: null,
      overlay: false,
      availability: 'empty',
      drawn: 0,
    });
  });

  /**
   * ADAPT-03 — a third-party computation that throws costs THAT source and nothing else.
   *
   * The guarantee is two nested catches and it had no test. `series()` is wrapped because a source
   * can fail while building its plots; each `compute` is wrapped separately because one plot of a
   * study can fail while its neighbours are fine. With the host now handing this resolver a vendor
   * catalogue of three hundred entries, "one bad study empties the chart" stops being hypothetical
   * and becomes the most likely way a release breaks.
   *
   * BOTH CLAUSES ARE NEEDED. Deleting the per-plot catch leaves the per-source one green, because a
   * source whose `series()` succeeds still throws from inside `compute`.
   */
  it('a source that throws costs itself and leaves every other one drawn', () => {
    const exploding = source({
      id: 'throws-building',
      series: () => {
        throw new Error('the vendor computation failed');
      },
    });
    const halfDead = source({
      id: 'throws-computing',
      series: () => [
        {
          spec: { id: seriesId('dead'), label: 'Dead', shape: 'line', color: '#fff', lineWidth: 1 },
          provider: {
            compute: () => {
              throw new Error('the vendor computation failed');
            },
          },
        } as unknown as PlottedSeries,
        plot('alive', (i) => i * 2),
      ],
    });
    const lookup = scanLookup([exploding, halfDead, source({ id: 'whole' })]);

    const resolution = resolveSources(
      ['throws-building', 'throws-computing', 'whole'],
      lookup,
      BARS,
      POLICY,
    );

    // The one whose `series()` threw is reported, by name, as unavailable — never dropped from the
    // list, because a study the user chose has to stay visible enough to be turned off again.
    expect(resolution.views[0]).toMatchObject({
      id: 'throws-building',
      label: 'THROWS-BUILDING',
      availability: 'empty',
      drawn: 0,
    });
    // The one whose plot threw keeps the plots that did not: a dead line occupies neither lane nor
    // legend, and its neighbour is untouched.
    expect(resolution.views[1]).toMatchObject({ id: 'throws-computing', drawn: 1 });
    expect(resolution.labels.get(seriesId(laneSeriesId(1, 0)))).toBe('alive');
    expect(resolution.readings.get(seriesId(laneSeriesId(1, 0)))?.[3]).toBe(6);
    // And the study beside them is drawn exactly as it would have been alone.
    expect(resolution.views[2]).toMatchObject({ id: 'whole', drawn: 1, availability: 'ok' });
    expect(resolution.readings.get(seriesId(laneSeriesId(2, 0)))?.[3]).toBe(3);
  });

  it('with no bars, the LIST is still the list — and nothing is ASSERTED about it', () => {
    const lookup = scanLookup([source({ id: 'a' })]);
    const resolution = resolveSources(['a'], lookup, [], POLICY);
    expect(resolution.views).toHaveLength(1);
    expect(resolution.views[0].windowBars).toBe(0);
    // `'ok'` is the absence of a diagnosis: flagging "no data" would blame the source for what is
    // really the window not having arrived yet.
    expect(resolution.views[0].availability).toBe('ok');
    expect(resolution.readings.size).toBe(0);
  });
});

describe('LMC-18 — the duplicate-id semantics, LEFT OBSERVABLE', () => {
  const first = source({ id: 'dup', label: 'FIRST', series: () => [plot('p1', () => 1)] });
  const last = source({ id: 'dup', label: 'LAST', series: () => [plot('p1', () => 2)] });

  it('the lookup DECIDES, and the two obvious decisions disagree', () => {
    // This is why the lib does not build a lookup out of a list. A scan keeps the FIRST; a map by
    // key keeps the LAST. Swapping one for the other in an "equivalent" refactor makes one study
    // draw another one's numbers, with nothing turning red.
    const byScan = resolveSources(['dup'], scanLookup([first, last]), BARS, POLICY);
    const byMap = resolveSources(['dup'], mapLookup([first, last]), BARS, POLICY);

    expect(byScan.views[0].label).toBe('FIRST');
    expect(byMap.views[0].label).toBe('LAST');
    expect(byScan.views[0].label).not.toBe(byMap.views[0].label);
  });

  it('the lib offers no lookup builder — the choice stays with whoever holds the list', () => {
    // An assertion about the SURFACE, and not about prose: if a list helper shows up, it will have
    // decided the question above on the consumer's behalf.
    const surface = require('../src/catalogue/sources') as Record<string, unknown>;
    const builders = Object.keys(surface).filter((name) => /lookup|Lookup/.test(name));
    expect(builders).toEqual([]);
  });

  it('an id repeated in the ACTIVE LIST consumes a single lane', () => {
    const resolution = resolveSources(['dup', 'dup'], scanLookup([first]), BARS, POLICY);
    expect(resolution.views).toHaveLength(1);
  });
});

describe('LMC-18 — the key is the SERIES identity minted by the lib', () => {
  it('readings and labels are keyed by the identifiers the lib mints', () => {
    const lookup = scanLookup([
      source({ id: 'a', series: () => [plot('first', (i) => i), plot('second', (i) => -i)] }),
    ]);
    const resolution = resolveSources(['a'], lookup, BARS, POLICY);

    expect(resolution.labels.get(seriesId(laneSeriesId(0, 0)))).toBe('first');
    expect(resolution.labels.get(seriesId(laneSeriesId(0, 1)))).toBe('second');
    expect(resolution.readings.get(seriesId(laneSeriesId(0, 0)))?.[3]).toBe(3);
    expect(resolution.activePaneIds.has(lanePaneId(0))).toBe(true);
  });

  it('a source OVER the price uses the other minter, and lights up no lane at all', () => {
    const lookup = scanLookup([
      source({ id: 'a', placement: 'over-price', series: () => [plot('band', () => 30000)] }),
    ]);
    const resolution = resolveSources(['a'], lookup, BARS, POLICY);

    expect(resolution.views[0].overlay).toBe(true);
    expect(resolution.readings.has(seriesId(priceOverlaySeriesId(0, 0)))).toBe(true);
    expect(resolution.readings.has(seriesId(laneSeriesId(0, 0)))).toBe(false);
    expect(resolution.activePaneIds.size).toBe(0);
  });

  it('the policy is DATA: another plot ceiling changes the truncation, not the module', () => {
    const lookup = scanLookup([
      source({
        id: 'a',
        series: () => [plot('p1', () => 1), plot('p2', () => 2), plot('p3', () => 3)],
      }),
    ]);
    expect(resolveSources(['a'], lookup, BARS, POLICY).views[0]).toMatchObject({
      drawn: 3,
      truncated: 0,
    });
    const tight = resolutionPolicy({ lanes: 4, plotsPerLane: 2 });
    expect(resolveSources(['a'], lookup, BARS, tight).views[0]).toMatchObject({
      drawn: 2,
      truncated: 1,
    });
  });

  it('the guide only comes out when the source has a lane of its own to mark it on', () => {
    const own = scanLookup([source({ id: 'a', guide: 70 })]);
    expect(resolveSources(['a'], own, BARS, POLICY).views[0].guide).toBe(70);

    const over = scanLookup([
      source({ id: 'a', guide: 70, placement: 'over-price', series: () => [plot('b', () => 30000)] }),
    ]);
    expect(resolveSources(['a'], over, BARS, POLICY).views[0]).not.toHaveProperty('guide');
  });

  it('does not import React and runs without a DOM', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });
});
