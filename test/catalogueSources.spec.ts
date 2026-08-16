/**
 * LMC-18 — the contract one level above a series provider, exercised by a double.
 *
 * THE DOUBLE IS THE POINT, not a convenience. The claim is that a resolver can be written against
 * this contract alone, so the contract has to be exercised by something typed entirely from this
 * package: two entries built here out of `SeriesSpec`, `SeriesProvider` and `Bar`, with no catalogue
 * of anyone's indicators anywhere near it. If a test needed the consumer's package to express an
 * entry, the contract would not be the level it claims to be.
 */

import * as contract from '../src/catalogue/sources';
import {
  CALIBRATED_PRICE_NEIGHBOURHOOD,
  CALIBRATED_WARM_UP_SHARE,
  resolutionPolicy,
  type PlottableSource,
  type PlottedSeries,
  type SourceLookup,
} from '../src/catalogue/sources';
import { seriesId, utcSeconds, type Bar, type Point } from '../src/domain/types';

const bars: readonly Bar[] = [
  { time: utcSeconds(100), open: 1, high: 2, low: 0, close: 1 },
  { time: utcSeconds(200), open: 1, high: 3, low: 1, close: 2 },
];

/** A pair built from library types only: the drawn shape, and the numbers behind it. */
function pair(id: string, values: readonly (number | null)[]): PlottedSeries {
  return {
    spec: { id: seriesId(id), label: id.toUpperCase(), shape: 'line', color: '#4fc3f7' },
    provider: {
      id: seriesId(id),
      compute: (input: readonly Bar[]): readonly Point[] =>
        input.map((bar, at): Point => {
          const value = values[at];
          return value === null || value === undefined
            ? { time: bar.time }
            : { time: bar.time, value };
        }),
    },
  };
}

const OWN_PANE: PlottableSource = {
  id: 'first',
  label: 'First',
  placement: 'own-pane',
  guide: 50,
  series: () => [pair('a', [10, 20]), pair('b', [30, 40])],
};

const OVER_PRICE: PlottableSource = {
  id: 'second',
  label: 'Second',
  placement: 'over-price',
  series: () => [pair('c', [1, null])],
};

const lookup: SourceLookup = (id) => [OWN_PANE, OVER_PRICE].find((entry) => entry.id === id);

describe('the entry — a set of pairs and a placement request', () => {
  it('answers for an id it was wired with, and gives back the declared placement', () => {
    expect(lookup('first')?.placement).toBe('own-pane');
    expect(lookup('second')?.placement).toBe('over-price');
  });

  it('answers UNDEFINED for an id nobody wired, instead of an empty entry', () => {
    // The consumer keeps a list of active ids; the catalogue may not have arrived, or may not know
    // one of them. An empty entry would read as a source that computes nothing, which is a
    // different diagnosis from a source that is not there.
    expect(lookup('third')).toBeUndefined();
  });

  it('offers no way to ask for everything — the contract is a lookup, not a container', () => {
    // The absence IS the clause. There is no list on the entry, no list on the lookup, and no
    // helper in the module that turns a list into one: enumeration is how a catalogue of hundreds
    // gets retained whole, and how names that must stay outside cross the boundary.
    const exported = contract as Record<string, unknown>;
    const callable = Object.entries(exported)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name);
    expect(callable).toEqual(['resolutionPolicy']);
    expect(Object.values(exported).some(Array.isArray)).toBe(false);
    expect(Object.values(OWN_PANE).some(Array.isArray)).toBe(false);
  });

  it('carries a set of pairs, each one a drawn spec beside the numbers behind it', () => {
    const plots = lookup('first')?.series() ?? [];
    expect(plots).toHaveLength(2);
    expect(plots.map((plot) => plot.spec.label)).toEqual(['A', 'B']);
    expect(plots[0].provider.compute(bars)).toEqual([
      { time: utcSeconds(100), value: 10 },
      { time: utcSeconds(200), value: 20 },
    ]);
  });

  it('lets a provider declare a gap, which is not a zero', () => {
    const plots = lookup('second')?.series() ?? [];
    expect(plots[0].provider.compute(bars)).toEqual([
      { time: utcSeconds(100), value: 1 },
      { time: utcSeconds(200) },
    ]);
  });

  it('computes ON CALL, so a source that throws costs only itself', () => {
    // As a field this throw would happen while the catalogue was being built and take everything
    // with it. As a call it is the caller's to contain, one entry at a time.
    const broken: PlottableSource = {
      id: 'broken',
      label: 'Broken',
      placement: 'own-pane',
      series: () => {
        throw new Error('third-party computation blew up');
      },
    };
    expect(broken.id).toBe('broken');
    expect(() => broken.series()).toThrow(/blew up/);
  });

  it('leaves the guide ABSENT when there is none, rather than defaulting it to a level', () => {
    expect(lookup('first')?.guide).toBe(50);
    expect(lookup('second')).not.toHaveProperty('guide');
  });
});

describe('the policy — counts and thresholds as parameters, not as fixed calibration', () => {
  it('requires the counts and fills the two calibrated ratios', () => {
    expect(resolutionPolicy({ lanes: 4, plotsPerLane: 4 })).toEqual({
      lanes: 4,
      plotsPerLane: 4,
      priceNeighbourhood: CALIBRATED_PRICE_NEIGHBOURHOOD,
      warmUpShare: CALIBRATED_WARM_UP_SHARE,
    });
  });

  it('keeps the measured values of today as those defaults', () => {
    expect(CALIBRATED_PRICE_NEIGHBOURHOOD).toBe(3);
    expect(CALIBRATED_WARM_UP_SHARE).toBe(0.5);
  });

  it('lets a consumer override either ratio, and the counts carry no default at all', () => {
    // A ratio measured against one installed catalogue is a default, not a law. The counts are a
    // resource the consumer owns, so there is no number this library could pick for them.
    expect(resolutionPolicy({ lanes: 2, plotsPerLane: 1, priceNeighbourhood: 8 })).toEqual({
      lanes: 2,
      plotsPerLane: 1,
      priceNeighbourhood: 8,
      warmUpShare: CALIBRATED_WARM_UP_SHARE,
    });
    expect(resolutionPolicy({ lanes: 6, plotsPerLane: 3, warmUpShare: 0.25 }).warmUpShare).toBe(0.25);
  });
});
