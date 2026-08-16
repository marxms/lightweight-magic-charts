import { applyTipToLastPoint } from '../src/indicator/liveTip';
import { EMPTY_LIVE_TIP, applyLiveEnvelope, type LiveTip } from '../src/port/frames';
import { seriesId } from '../src/domain/types';
import type { Scope, SeriesId } from '../src/domain/types';

/**
 * LMC-19, LMC-20 — the live tip, folded into the last bar.
 *
 * Parity against the previous implementation (LMC-22) is measured at the app's edge, in
 * `apps/web/src/hooks/__tests__/liveTip.parity.test.ts`, because that is where the real projection
 * exists: the field list is the emitter's vocabulary and does not cross this boundary.
 */

const tip = (values: Record<string, number>): LiveTip => ({
  gen: 1,
  seq: 1,
  values: new Map(Object.entries(values).map(([key, value]) => [seriesId(key), value])),
});

const SERIES = [
  { timestamp: 1000, rsi: 10, bw1: 1 },
  { timestamp: 2000, rsi: 20, bw1: 2 },
];

describe('applyTipToLastPoint — only the last bar, and only when something changes', () => {
  it('updates the LAST bar and leaves the history untouched BY IDENTITY', () => {
    const next = applyTipToLastPoint(SERIES, tip({ rsi: 77 }));
    expect(next[0]).toBe(SERIES[0]);
    expect(next[1]).toEqual({ timestamp: 2000, rsi: 77, bw1: 1 * 2 });
  });

  it('writes on the bar that has NO key — the only bar the tip exists to speak for', () => {
    // The persisted series ends on the last CLOSED candle, so the row for the in-flight candle does
    // not even carry the field's KEY. A `key in row` guard only let it write where a value already
    // existed: it switched the tip off in exactly the hole it exists to fill.
    const open = [...SERIES, { timestamp: 3000 }];
    const next = applyTipToLastPoint(open, tip({ rsi: 88, novo: 95 }));
    expect(next[2]).toEqual({ timestamp: 3000, rsi: 88, novo: 95 });
    expect(next[0]).toBe(open[0]);
    expect(next[1]).toBe(open[1]);
  });

  it('returns the SAME array when nothing changed — identity is contract, not optimisation', () => {
    expect(applyTipToLastPoint(SERIES, tip({ rsi: 20 }))).toBe(SERIES);
    expect(applyTipToLastPoint(SERIES, EMPTY_LIVE_TIP)).toBe(SERIES);
    // CONTROL POSITIVE: a real change produces a new array.
    expect(applyTipToLastPoint(SERIES, tip({ rsi: 21 }))).not.toBe(SERIES);
    // And a PARTIALLY equal tip still changes, because one of the fields changed.
    expect(applyTipToLastPoint(SERIES, tip({ rsi: 20, bw1: 9 }))).not.toBe(SERIES);
  });

  it('an empty series comes out empty, through the same reference', () => {
    const empty: { timestamp: number }[] = [];
    expect(applyTipToLastPoint(empty, tip({ rsi: 5 }))).toBe(empty);
  });

  it('requires NO shape from the row — the decorative constraint no longer exists', () => {
    // The old signature asked for `T extends { timestamp: number }` and never read the field. A
    // constraint nobody reads documents nothing: it refuses callers and protects nothing.
    const withoutTime = [{ at: 'first' }, { at: 'last' }];
    expect(applyTipToLastPoint(withoutTime, tip({ rsi: 5 }))[1]).toEqual({ at: 'last', rsi: 5 });
  });
});

describe('LMC-19 — the scope refusal returns the SAME reference, and does not project', () => {
  const SCOPE: Scope = { venue: 'v', market: 'm', instrument: 'i', resolution: '1h' };
  const OTHER: Scope = { ...SCOPE, instrument: 'z' };

  it('refuses a foreign scope without ALLOCATING — measured by identity and by call count', () => {
    // Two assertions, and the second is the one that discriminates. Comparing the CONTENT would
    // also pass over a copy with equal content, and it is precisely the copy that costs one render
    // per foreign envelope — and a foreign envelope is the common case on a scope-multiplexed lane.
    const state = tip({ rsi: 1 });
    const project = jest.fn((payload: Record<string, number>) => {
      const values = new Map<SeriesId, number>();
      for (const [key, value] of Object.entries(payload)) values.set(seriesId(key), value);
      return values;
    });

    const refused = applyLiveEnvelope(
      state,
      { gen: 9, seq: 99, scope: OTHER, payload: { rsi: 2 } },
      SCOPE,
      project,
    );
    expect(refused).toBe(state);
    // The projection never even runs: the refusal happens BEFORE it, and that is why it is injected.
    expect(project).not.toHaveBeenCalled();

    // CONTROL POSITIVE: the same envelope on the right scope is applied, and projection runs once.
    const applied = applyLiveEnvelope(
      state,
      { gen: 9, seq: 99, scope: SCOPE, payload: { rsi: 2 } },
      SCOPE,
      project,
    );
    expect(applied).not.toBe(state);
    expect(applied.values.get(seriesId('rsi'))).toBe(2);
    expect(project).toHaveBeenCalledTimes(1);
  });

  it('a duplicate and a late seq in the same generation also return the SAME reference', () => {
    const project = jest.fn(() => new Map<SeriesId, number>([[seriesId('rsi'), 2]]));
    const state: LiveTip = { gen: 1, seq: 5, values: new Map([[seriesId('rsi'), 1]]) };
    expect(applyLiveEnvelope(state, { gen: 1, seq: 5, scope: SCOPE, payload: {} }, SCOPE, project)).toBe(state);
    expect(applyLiveEnvelope(state, { gen: 1, seq: 4, scope: SCOPE, payload: {} }, SCOPE, project)).toBe(state);
    expect(project).not.toHaveBeenCalled();
    // CONTROL POSITIVE: a seq ahead is applied, and a new generation re-baselines with a low seq.
    expect(applyLiveEnvelope(state, { gen: 1, seq: 6, scope: SCOPE, payload: {} }, SCOPE, project)).not.toBe(state);
    expect(applyLiveEnvelope(state, { gen: 2, seq: 1, scope: SCOPE, payload: {} }, SCOPE, project).gen).toBe(2);
  });
});

describe('LMC-20 — no React and no DOM', () => {
  it('the suite runs under testEnvironment node', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });
});
