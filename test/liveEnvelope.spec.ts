/**
 * LMC-19 — the live envelope: opaque payload, injected projection, refusal by identity.
 *
 * THE PROJECTION IS A SPY ON PURPOSE. Two of the three clauses are about what does NOT happen —
 * a payload for another scope is never parsed, and a discarded envelope costs no new object — and
 * both are invisible to an assertion on the returned value alone. A projection that counts its calls
 * makes the first observable; comparing by reference rather than by value makes the second
 * observable. Asserting equal contents would pass on the implementation this exists to forbid.
 */

import {
  EMPTY_LIVE_TIP,
  applyLiveEnvelope,
  type LiveEnvelope,
  type LiveTip,
} from '../src/port/frames';
import { seriesId, type Scope, type SeriesId } from '../src/domain/types';

const HERE: Scope = { instrument: 'AAA', resolution: '1m', venue: 'v', market: 'm' };
const ELSEWHERE: Scope = { instrument: 'BBB', resolution: '1m', venue: 'v', market: 'm' };

interface Wire {
  readonly rows: Readonly<Record<string, number>>;
}

function envelope(gen: number, seq: number, scope: Scope, rows: Record<string, number>): LiveEnvelope<Wire> {
  return { gen, seq, scope, payload: { rows } };
}

/** A projection the library never sees the inside of, plus a count of how often it ran. */
function spyProjection() {
  const calls: Wire[] = [];
  const project = (payload: Wire): ReadonlyMap<SeriesId, number> => {
    calls.push(payload);
    return new Map(Object.entries(payload.rows).map(([key, value]) => [seriesId(key), value]));
  };
  return { calls, project };
}

describe('the envelope reuses the scope and the series key the package already has', () => {
  it('applies a payload for the scope being watched, keyed by series identity', () => {
    const { project } = spyProjection();
    const next = applyLiveEnvelope(EMPTY_LIVE_TIP, envelope(1, 7, HERE, { a: 10, b: 20 }), HERE, project);
    expect(next.gen).toBe(1);
    expect(next.seq).toBe(7);
    expect(next.values.get(seriesId('a'))).toBe(10);
    expect(next.values.get(seriesId('b'))).toBe(20);
  });

  it('starts from a tip that has applied nothing, and says so instead of guessing zero', () => {
    expect(EMPTY_LIVE_TIP.gen).toBeNull();
    expect(EMPTY_LIVE_TIP.seq).toBeNull();
    expect(EMPTY_LIVE_TIP.values.size).toBe(0);
  });

  it('matches the scope on all four coordinates, not on the instrument alone', () => {
    const { project, calls } = spyProjection();
    const otherVenue: Scope = { ...HERE, venue: 'w' };
    expect(applyLiveEnvelope(EMPTY_LIVE_TIP, envelope(1, 1, otherVenue, { a: 1 }), HERE, project)).toBe(
      EMPTY_LIVE_TIP,
    );
    expect(calls).toHaveLength(0);
  });
});

describe('the refusal runs BEFORE the projection', () => {
  it('never parses a payload addressed to another scope', () => {
    // The lane carries several scopes at once, so most envelopes are somebody else's. A projection
    // that ran first would have to be total over payloads it was never meant to read.
    const { project, calls } = spyProjection();
    applyLiveEnvelope(EMPTY_LIVE_TIP, envelope(1, 1, ELSEWHERE, { a: 1 }), HERE, project);
    expect(calls).toEqual([]);
  });

  it('never parses a duplicate or out-of-order envelope within one generation', () => {
    const { project, calls } = spyProjection();
    const applied = applyLiveEnvelope(EMPTY_LIVE_TIP, envelope(4, 9, HERE, { a: 1 }), HERE, project);
    expect(calls).toHaveLength(1);

    applyLiveEnvelope(applied, envelope(4, 9, HERE, { a: 2 }), HERE, project);
    applyLiveEnvelope(applied, envelope(4, 8, HERE, { a: 3 }), HERE, project);
    expect(calls).toHaveLength(1);
  });

  it('POSITIVE CONTROL: the projection DOES run when the envelope is accepted', () => {
    // Without this, a projection that never ran at all would satisfy both clauses above.
    const { project, calls } = spyProjection();
    applyLiveEnvelope(EMPTY_LIVE_TIP, envelope(1, 1, HERE, { a: 1 }), HERE, project);
    expect(calls).toEqual([{ rows: { a: 1 } }]);
  });
});

describe('a refused envelope returns the SAME reference', () => {
  const { project } = spyProjection();
  const applied: LiveTip = applyLiveEnvelope(
    EMPTY_LIVE_TIP,
    envelope(4, 9, HERE, { a: 1 }),
    HERE,
    project,
  );

  it('returns the identical state object for another scope', () => {
    // By reference. An equal-looking copy would satisfy a structural comparison and would still cost
    // the consumer a render for every envelope meant for somebody else.
    expect(applyLiveEnvelope(applied, envelope(4, 10, ELSEWHERE, { a: 2 }), HERE, project)).toBe(applied);
  });

  it('returns the identical state object for a duplicate sequence', () => {
    expect(applyLiveEnvelope(applied, envelope(4, 9, HERE, { a: 2 }), HERE, project)).toBe(applied);
  });

  it('returns the identical state object for a sequence that went backwards', () => {
    expect(applyLiveEnvelope(applied, envelope(4, 1, HERE, { a: 2 }), HERE, project)).toBe(applied);
  });

  it('advances on the next sequence of the same generation, replacing the values wholesale', () => {
    // Replaced, not merged: on a snapshot channel the envelope IS the state of its scope, so a key
    // the new envelope omits is a reading that stopped, never one that persists.
    const next = applyLiveEnvelope(applied, envelope(4, 10, HERE, { b: 2 }), HERE, project);
    expect(next).not.toBe(applied);
    expect(next.seq).toBe(10);
    expect(next.values.get(seriesId('b'))).toBe(2);
    expect(next.values.has(seriesId('a'))).toBe(false);
  });

  it('REBASES on a different generation, even when the sequence went backwards', () => {
    // The producer restarted and its numbering began again, so a low sequence there is fresh. Read
    // as stale, the tip would freeze on the previous run and never move again.
    const next = applyLiveEnvelope(applied, envelope(5, 1, HERE, { a: 99 }), HERE, project);
    expect(next).not.toBe(applied);
    expect(next.gen).toBe(5);
    expect(next.seq).toBe(1);
    expect(next.values.get(seriesId('a'))).toBe(99);
  });
});
