/**
 * The two phases in which a frame is NOT applied, asserted for all THREE appliers.
 *
 * `applyAppend`, `applyOpen` and `applyMember` each opened with the same preamble: buffer while
 * `seeding`, refuse and count while `reset`. Routing the three copies through one helper is
 * only safe if every door still answers the same way, and the suite as it stood asserted the
 * preamble through `append` alone — `open` and `member` reached it by nothing at all, and the
 * buffer cap was reached by no frame kind at all. A helper wired into two of the three would have
 * passed 1344 tests.
 *
 * WHY THE CAP IS ASSERTED THREE TIMES AND NOT ONCE. It is the branch that turns a buffering scope
 * into a reset one, so a door wired to the wrong helper would go on growing an unbounded buffer,
 * silently, in the exact situation the cap exists for: a history fetch that is not coming back.
 * See docs/explanation/port.md#the-buffer-cap-is-a-refusal-to-grow-without-bound
 */

import { utcSeconds } from '../src/domain/types';
import type { Bar, Scope } from '../src/domain/types';
import type { Frame } from '../src/port/frames';
import { MAX_BUFFERED_FRAMES, applyFrame, createScopeState } from '../src/port/scopeMachine';
import type { ScopeState } from '../src/port/scopeMachine';

const scope: Scope = {
  instrument: 'BTC/USDT',
  resolution: '4h',
  venue: 'binance',
  market: 'swap',
};

const bar = (time: number): Bar => ({
  time: utcSeconds(time),
  open: 1,
  high: 2,
  low: 0,
  close: 1.5,
  volume: 10,
});

const append = (seq: number): Frame => ({ kind: 'append', gen: 1, seq, scope, bar: bar(seq * 100) });
const open = (time: number): Frame => ({ kind: 'open', gen: 1, scope, bar: bar(time) });
const member = (seq: number): Frame => ({
  kind: 'member',
  gen: 1,
  seq,
  scope,
  op: 'upsert',
  key: `k${seq}`,
});

/** The three frame kinds the preamble guards, named so a failure says WHICH door leaked. */
const DOORS: ReadonlyArray<readonly [string, Frame]> = [
  ['append', append(1)],
  ['open', open(100)],
  ['member', member(1)],
];

const seeding = (): ScopeState => ({ ...createScopeState(scope, 'delta'), gen: 1 });

/** A scope in `reset`, reached the way a real one reaches it: an amend on a live channel. */
const reset = (): ScopeState => {
  const live: ScopeState = { ...seeding(), phase: 'live', baseline: 0 };
  const next = applyFrame(live, { kind: 'amend', gen: 1, seq: 1, scope, bar: bar(100) });
  expect(next.phase).toBe('reset');
  return next;
};

/** A scope whose buffer is already at the cap, with the frames it has held so far. */
const full = (): ScopeState => ({
  ...seeding(),
  buffered: Array.from({ length: MAX_BUFFERED_FRAMES }, (_unused, index) => append(index + 1)),
});

describe('I12 — a frame arriving while the seam is unverified is HELD, at every door', () => {
  it.each(DOORS)('buffers a %s frame instead of applying it', (_name, frame) => {
    const next = applyFrame(seeding(), frame);
    expect(next.phase).toBe('seeding');
    expect(next.buffered).toEqual([frame]);
    // HELD, not applied: the bars and the members stay exactly as they were.
    expect(next.bars).toEqual([]);
    expect(next.members.size).toBe(0);
    expect(next.baseline).toBe(0);
  });

  it('holds them in ARRIVAL order, across the three kinds', () => {
    // Order is the whole point of buffering rather than dropping: replayed out of order, an append
    // after an open would write the closed bar over the live one.
    const frames = DOORS.map(([, frame]) => frame);
    const next = frames.reduce(applyFrame, seeding() as ScopeState);
    expect(next.buffered).toEqual(frames);
  });
});

describe('the buffer cap — a buffer this deep means the history is not coming back', () => {
  it.each(DOORS)('turns a %s frame at the cap into a reset naming the gap', (_name, frame) => {
    const next = applyFrame(full(), frame);
    expect(next.phase).toBe('reset');
    expect(next.resetCause).toBe('gap');
    // The reset EMPTIES the buffer: holding 4096 frames a refetch will never release is the state
    // the cap exists to leave behind.
    expect(next.buffered).toEqual([]);
  });

  it('holds the frame one below the cap, so the ceiling is the cap and not the traffic', () => {
    // POSITIVE CONTROL for the clause above. Without it, a helper that reset on EVERY buffered
    // frame would satisfy all three cases above and buffer nothing at all.
    const almost: ScopeState = { ...full(), buffered: full().buffered.slice(0, -1) };
    const next = applyFrame(almost, append(1));
    expect(next.phase).toBe('seeding');
    expect(next.buffered).toHaveLength(MAX_BUFFERED_FRAMES);
  });
});

describe('reset is terminal until a refetch — every door refuses and COUNTS', () => {
  it.each(DOORS)('refuses a %s frame and counts the refusal', (_name, frame) => {
    const before = reset();
    const next = applyFrame(before, frame);
    expect(next.phase).toBe('reset');
    expect(next.discarded).toBe(before.discarded + 1);
    // Refused, not half-applied: nothing the frame carried reached the state.
    expect(next.bars).toEqual(before.bars);
    expect(next.members).toEqual(before.members);
    expect(next.baseline).toBe(before.baseline);
    expect(next.buffered).toEqual([]);
  });
});
