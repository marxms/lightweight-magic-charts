/**
 * The executable conformance suite — task 2.5, one case per invariant of design.md §2.4.
 *
 * WHY IT IS PUBLISHED AND NOT INTERNAL (LSP). "Any adapter satisfies MarketDataPort" is a claim
 * about every adapter that will ever exist, including ones written after this library ships. The
 * only way to keep such a claim true is to hand the checker to whoever writes the adapter.
 *
 * WHY IT TAKES NO TEST FRAMEWORK. Cases are plain async functions that throw. The consumer wires
 * them into whatever runner they already have:
 *
 *     for (const c of CONFORMANCE_CASES) it(`${c.id} — ${c.title}`, () => c.run(makeHarness()));
 *
 * A dependency on jest here would be a dependency in the published package, and `sideEffects: false`
 * plus a test-framework import do not coexist.
 *
 * WHAT THE ADAPTER AUTHOR PROVIDES is a `ConformanceHarness`: their real port, plus two levers the
 * suite needs to create conditions a live transport will not produce on demand — emitting a chosen
 * frame, and deciding what the next history fetch returns.
 */

import type { Bar, Scope } from '../domain/types';
import { scopeKey, utcSeconds } from '../domain/types';
import type { ChannelShape, Frame } from '../port/frames';
import { resolveChannelShape } from '../port/frames';
import type { MarketDataPort } from '../port/ports';
import {
  applyFrame,
  createScopeState,
  needsRefetch,
  seedHistory,
  type ScopeState,
} from '../port/scopeMachine';
import { openScope } from '../port/seedTransaction';

export interface ConformanceHarness {
  readonly port: MarketDataPort;
  /** Deliver a frame to every current subscriber of that frame's scope, as the transport would. */
  emit(frame: Frame): void;
  /** What the NEXT `fetchBars` resolves with. */
  setHistory(bars: readonly Bar[], opts?: { readonly exhausted?: boolean }): void;
  /** Hold the next `fetchBars` open until `releaseHistory` is called (for in-flight cases). */
  holdHistory?(): void;
  releaseHistory?(): void;
  /**
   * Deliver a frame to a sink that has ALREADY been detached — i.e. simulate a transport that
   * calls back after unsubscribe. Required, because `emit` routes through the harness's own
   * bookkeeping and therefore cannot reach a detached sink: without this lever the I7 case proves
   * the harness cleans up after itself, not that the session refuses the late frame.
   */
  emitToDetached(frame: Frame): void;
  /** Subscriptions still attached. Used to prove no leak. */
  openSubscriptions(): number;
}

export interface ConformanceCase {
  readonly id: string;
  readonly title: string;
  run(harness: ConformanceHarness): Promise<void> | void;
}

export class ConformanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConformanceError';
  }
}

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ConformanceError(message);
}

function equal(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(a === e, `${what}: expected ${e}, got ${a}`);
}

// ── fixtures ────────────────────────────────────────────────────────────────
const SCOPE_A: Scope = { instrument: 'AAA', resolution: '1', venue: 'v', market: 'm' };
const SCOPE_B: Scope = { instrument: 'BBB', resolution: '1', venue: 'v', market: 'm' };

const bar = (time: number, close = 10): Bar => ({
  time: utcSeconds(time),
  open: close,
  high: close + 1,
  low: close - 1,
  close,
});

const snapshot = (scope: Scope, baseline: number, baselineTime?: number, gen = 1): Frame => ({
  kind: 'snapshot',
  gen,
  seq: baseline,
  scope,
  state: new Map(),
  baseline,
  baselineTime,
});

const append = (scope: Scope, seq: number, time: number, gen = 1): Frame => ({
  kind: 'append',
  gen,
  seq,
  scope,
  bar: bar(time),
});

const live = (scope: Scope, shape: ChannelShape, baseline = 0): ScopeState => {
  const seeded = applyFrame(createScopeState(scope, shape), snapshot(scope, baseline));
  return seedHistory(seeded, []).state;
};

// ── the cases ───────────────────────────────────────────────────────────────
export const CONFORMANCE_CASES: readonly ConformanceCase[] = [
  {
    id: 'I1',
    title: 'a frame from another scope is discarded, never applied',
    run: () => {
      const state = live(SCOPE_A, 'delta');
      const next = applyFrame(state, append(SCOPE_B, 1, 100));
      equal(next.bars.length, 0, 'foreign frame reached the series');
      check(next.discarded === 1, 'the discard was not even counted');
    },
  },
  {
    id: 'I2',
    title: 'a history response arriving after a scope change is discarded by generation',
    run: async (h) => {
      h.setHistory([bar(1), bar(2)]);
      const session = openScope({
        scope: SCOPE_A,
        shape: 'delta',
        port: h.port,
        history: { from: 0, to: 10 },
      });
      session.unsubscribe(); // the scope moved on while the fetch was in flight
      const outcome = await session.outcome;
      equal(outcome.kind, 'aborted', 'a late history response was accepted after the scope changed');
      equal(session.state().bars.length, 0, 'late history reached a discarded scope');
    },
  },
  {
    id: 'I3',
    title: 'append with seq != baseline+1 resets, never applies partially',
    run: () => {
      // Seeded with real bars ON PURPOSE. Starting from an empty series made the case unable to
      // tell "the reset refused the new bar" from "the reset wiped everything the client had" —
      // and discarding held history IS the partial application I3 forbids.
      const seeded = seedHistory(
        applyFrame(createScopeState(SCOPE_A, 'delta'), snapshot(SCOPE_A, 5, 50)),
        [bar(40), bar(50)],
      ).state;
      equal(seeded.bars.length, 2, 'precondition: the scope holds history before the gap');

      const gapped = applyFrame(seeded, append(SCOPE_A, 8, 100));
      equal(gapped.phase, 'reset', 'a sequence gap did not reset');
      equal(gapped.resetCause, 'gap', 'the reset cause is not a gap');
      equal(gapped.bars.length, 2, 'the reset discarded history the client already had');
      equal(
        gapped.bars.map((b) => b.time).includes(utcSeconds(100)),
        false,
        'the gapped bar was applied anyway',
      );

      // RESET is terminal until a refetch: a later frame, contiguous or not, draws nothing.
      const after = applyFrame(gapped, append(SCOPE_A, 6, 110));
      equal(after.bars.length, 2, 'a frame was applied to a scope awaiting a refetch');
      check(after.discarded > gapped.discarded, 'the refusal was not even counted');
    },
  },
  {
    id: 'I4',
    title: 'amend of an already closed bar resets, it is not patched in place',
    run: () => {
      const state = live(SCOPE_A, 'delta', 5);
      const amended = applyFrame(state, {
        kind: 'amend',
        gen: 1,
        seq: 6,
        scope: SCOPE_A,
        bar: bar(50),
      });
      equal(amended.phase, 'reset', 'an amend did not reset');
      equal(amended.resetCause, 'amend', 'the reset cause is not an amend');
    },
  },
  {
    id: 'I5',
    title: 'an open bar never advances the baseline',
    run: () => {
      const state = live(SCOPE_A, 'delta', 5);
      const opened = applyFrame(state, { kind: 'open', gen: 1, scope: SCOPE_A, bar: bar(100) });
      equal(opened.baseline, 5, 'an open bar moved the cursor');
      equal(opened.bars.length, 1, 'the open bar was not drawn');
      // and the next real close must still be contiguous
      const closed = applyFrame(opened, append(SCOPE_A, 6, 101));
      equal(closed.phase, 'live', 'the close after an open was misread as a gap');
    },
  },
  {
    id: 'I6',
    title: 'a bar older than the tail is rejected, never silently reordered',
    run: () => {
      let state = live(SCOPE_A, 'delta', 5);
      state = applyFrame(state, append(SCOPE_A, 6, 200));
      const stale = applyFrame(state, append(SCOPE_A, 7, 100));
      equal(
        stale.bars.map((b) => b.time),
        [200],
        'an out-of-order bar was inserted',
      );
      equal(stale.baseline, 7, 'a contiguous-but-stale bar was treated as a gap');
    },
  },
  {
    id: 'I7',
    title: 'unsubscribe during seeding leaks neither the request nor a later frame',
    run: async (h) => {
      h.setHistory([bar(1)]);
      const before = h.openSubscriptions();
      const session = openScope({
        scope: SCOPE_A,
        shape: 'delta',
        port: h.port,
        history: { from: 0, to: 10 },
      });
      check(h.openSubscriptions() === before + 1, 'subscribe did not attach');
      session.unsubscribe();
      check(h.openSubscriptions() === before, 'unsubscribe left the subscription attached');

      h.emit(append(SCOPE_A, 1, 500));
      // AND the case that matters: a transport that calls back anyway. `emit` cannot reach a
      // detached sink, so on its own it proves only the harness's bookkeeping — deleting the
      // session's own `released` guard would not have failed this case. `emitToDetached` bypasses
      // the bookkeeping and asks the session directly.
      h.emitToDetached(append(SCOPE_A, 1, 501));
      await session.outcome;
      equal(session.state().bars.length, 0, 'a frame arrived after unsubscribe');
      equal(session.state().phase, 'discarded', 'the scope did not enter the discarded phase');
    },
  },
  {
    id: 'I8',
    title: 'subscriptions of distinct scopes are independent and order does not matter',
    run: async (h) => {
      h.setHistory([bar(1)]);
      const a = openScope({
        scope: SCOPE_A,
        shape: 'delta',
        port: h.port,
        history: { from: 0, to: 10 },
      });
      h.setHistory([bar(1)]);
      const b = openScope({
        scope: SCOPE_B,
        shape: 'delta',
        port: h.port,
        history: { from: 0, to: 10 },
      });
      await Promise.all([a.outcome, b.outcome]);

      // B first, then A: arrival order across scopes must not matter.
      h.emit(append(SCOPE_B, 1, 900));
      h.emit(append(SCOPE_A, 1, 800));

      const timesA = a.state().bars.map((x) => x.time);
      const timesB = b.state().bars.map((x) => x.time);
      check(timesA.includes(utcSeconds(800)), 'scope A did not receive its own bar');
      check(!timesA.includes(utcSeconds(900)), 'scope A received scope B data');
      check(timesB.includes(utcSeconds(900)), 'scope B did not receive its own bar');
      check(!timesB.includes(utcSeconds(800)), 'scope B received scope A data');

      // Cancelling one scope must not disturb the other.
      const beforeCancel = b.state().bars.length;
      a.unsubscribe();
      h.emit(append(SCOPE_B, 2, 901));
      equal(
        b.state().bars.length,
        beforeCancel + 1,
        'cancelling one scope stopped delivery to another',
      );
      b.unsubscribe();
    },
  },
  {
    id: 'I9',
    title: 'in a snapshot channel, seq <= baseline within a generation is a no-op',
    run: () => {
      let state = createScopeState(SCOPE_A, 'snapshot');
      state = applyFrame(state, snapshot(SCOPE_A, 5));
      const stale = applyFrame(state, snapshot(SCOPE_A, 4));
      check(stale === state, 'a stale snapshot produced a new state instead of a no-op');
      const same = applyFrame(state, snapshot(SCOPE_A, 5));
      check(same === state, 'a repeated snapshot produced a new state instead of a no-op');

      // `baseline === 0` is a legitimate value ("nothing has closed"), not a sentinel for absence,
      // so the identity guarantee has to hold there too — a consumer memoising on reference is
      // memoising on every frame, not only the ones above zero.
      const fresh = applyFrame(createScopeState(SCOPE_A, 'snapshot'), snapshot(SCOPE_A, 0));
      check(
        applyFrame(fresh, snapshot(SCOPE_A, 0)) === fresh,
        'a repeated zero-baseline snapshot produced a new state instead of a no-op',
      );
    },
  },
  {
    id: 'I10',
    title: 'a different generation rebases, in every channel shape',
    run: () => {
      for (const shape of ['delta', 'snapshot', 'seeded-delta'] as const) {
        let state = live(SCOPE_A, shape, 5);
        state = applyFrame(state, { kind: 'open', gen: 1, scope: SCOPE_A, bar: bar(10) });
        const rebased = applyFrame(state, snapshot(SCOPE_A, 2, 20, 99));
        equal(rebased.gen, 99, `${shape}: the generation was not adopted`);
        equal(rebased.baseline, 2, `${shape}: the old cursor survived a generation change`);
        equal(rebased.bars.length, 0, `${shape}: stale bars survived a generation change`);
        // And the rebase has to be ANNOUNCED — except where the rebasing frame is itself the data.
        // Landing in `seeding` looked right but left the scope stranded: `needsRefetch` reports
        // only `reset`, so nothing ever asked for the new window and frames piled up until the
        // buffer cap fired a false gap. Every socket reconnect mints a fresh generation, so this
        // was not a corner case.
        //
        // A `snapshot` channel is the one exception, and it is a real distinction rather than an
        // excuse: every frame there carries the complete scope, so the frame that rebases also
        // restores. A `seeded-delta` channel does NOT get that — its snapshot carries series values
        // but never the membership set, so it still owes a load.
        if (shape === 'snapshot') {
          check(!needsRefetch(rebased), 'a snapshot channel asked for a refetch it does not need');
          equal(rebased.phase, 'live', 'a snapshot frame did not restore the scope by itself');
        } else {
          check(needsRefetch(rebased), `${shape}: a rebase did not ask for a refetch`);
        }
      }
    },
  },
  {
    id: 'I11',
    title: 'snapshots accumulated per bar are policed as a delta channel',
    run: () => {
      equal(resolveChannelShape('snapshot', true), 'delta', 'accumulation did not become a delta');
      equal(resolveChannelShape('snapshot', false), 'snapshot', 'a plain snapshot was upgraded');
      equal(resolveChannelShape('delta', true), 'delta', 'a delta changed shape');
      // and the resulting channel really does demand contiguity
      const state = live(SCOPE_A, resolveChannelShape('snapshot', true), 5);
      equal(applyFrame(state, append(SCOPE_A, 9, 1)).phase, 'reset', 'the accumulated channel tolerated a gap');
    },
  },
  {
    id: 'I12',
    title: 'no delta is applied before the seam is verified; until then they are buffered',
    run: () => {
      let state = createScopeState(SCOPE_A, 'delta');
      state = applyFrame(state, snapshot(SCOPE_A, 5, 500));
      state = applyFrame(state, append(SCOPE_A, 6, 600));
      equal(state.bars.length, 0, 'a delta was applied before the seam was verified');
      equal(state.buffered.length, 1, 'the delta was dropped instead of buffered');

      const applied = seedHistory(state, [bar(400), bar(500)]);
      equal(applied.verdict, 'verified', 'a window containing the anchor was rejected');
      equal(
        applied.state.bars.map((b) => b.time),
        [400, 500, 600],
        'the buffer was not released in order after the seam check',
      );
    },
  },
  {
    id: 'I13',
    title: 'a window without a bar at baselineTime refetches; the next delta is never assumed contiguous',
    run: async (h) => {
      // THE DEFECT, in one case. The window stops at 400 while bucket 500 has already closed.
      let state = createScopeState(SCOPE_A, 'delta');
      state = applyFrame(state, snapshot(SCOPE_A, 5, 500));
      state = applyFrame(state, append(SCOPE_A, 6, 600));

      const stale = seedHistory(state, [bar(300), bar(400)]);
      equal(stale.verdict, 'stale', 'a window missing the anchor bar was accepted');
      equal(stale.state.bars.length, 0, 'bars were applied over an unverified seam');
      // The buffer SURVIVES a stale window. A stale window means the history was behind; it says
      // nothing about the frames, whose cursor never moved. Clearing them here meant a refetch that
      // then succeeded went live having silently dropped every bar that closed in between — the
      // exact loss this transaction exists to prevent, reintroduced by its own retry path.
      equal(stale.state.buffered.length, 1, 'the retry discarded frames buffered during the attempt');
      equal(stale.state.phase, 'seeding', 'a stale window left the scope somewhere other than seeding');

      // POSITIVE CONTROL. Without this the case cannot discriminate: the previous version used a
      // history window of [0,10) against bars at 300/400, so the window filter emptied it whatever
      // it contained, and `stale-history` came back even for a window that HELD the anchor. It
      // passed while proving nothing about the seam.
      const good = seedHistory(state, [bar(400), bar(500)]);
      equal(good.verdict, 'verified', 'a window CONTAINING the anchor was still called stale');
      equal(
        good.state.bars.map((b) => b.time),
        [400, 500, 600],
        'the verified path did not release the buffer',
      );

      // A cursor with no anchor is UNVERIFIABLE, never silently verified. This is how the defect
      // came back: an older producer sends `baseline` without `baselineTime`, and a check gated on
      // `baselineTime !== null` simply did not run.
      const unanchored = applyFrame(createScopeState(SCOPE_A, 'delta'), snapshot(SCOPE_A, 5));
      equal(unanchored.seam, 'unanchored', 'a cursor without an anchor was not marked unanchored');
      equal(
        seedHistory(unanchored, [bar(100), bar(200)]).verdict,
        'unverifiable',
        'a window was silently accepted for a cursor whose anchor is unknown',
      );

      // End to end, with a window range that does NOT mask the seam.
      h.setHistory([bar(300), bar(400)]);
      const session = openScope({
        scope: SCOPE_A,
        shape: 'delta',
        port: h.port,
        history: { from: 0, to: 10_000 },
        maxRefetch: 0,
      });
      h.emit(snapshot(SCOPE_A, 5, 500));
      equal(
        (await session.outcome).kind,
        'stale-history',
        'the transaction went live over a stale window',
      );
      session.unsubscribe();

      // End-to-end positive control, same range: a window that reaches the edge must seed.
      h.setHistory([bar(400), bar(500)]);
      const ok = openScope({
        scope: SCOPE_A,
        shape: 'delta',
        port: h.port,
        history: { from: 0, to: 10_000 },
        maxRefetch: 0,
      });
      h.emit(snapshot(SCOPE_A, 5, 500));
      equal(
        (await ok.outcome).kind,
        'seeded',
        'a window reaching the live edge was reported as stale',
      );
      ok.unsubscribe();

      // And the retry itself, end to end: frames that close DURING a failed attempt must survive
      // into the successful one. This is the path the previous version silently dropped — it
      // returned `seeded` having lost every bar buffered before the refetch.
      h.setHistory([bar(300), bar(400)]); // first attempt: no anchor
      const retried = openScope({
        scope: SCOPE_A,
        shape: 'delta',
        port: h.port,
        history: { from: 0, to: 10_000 },
        maxRefetch: 1,
      });
      h.emit(snapshot(SCOPE_A, 5, 500));
      h.emit(append(SCOPE_A, 6, 600));
      h.setHistory([bar(400), bar(500)]); // retry: anchor present
      const retryOutcome = await retried.outcome;
      equal(retryOutcome.kind, 'seeded', 'the retry did not seed on a good window');
      check(
        retried.state().bars.map((b) => b.time).includes(utcSeconds(600)),
        'a bar that closed during the failed attempt was lost by the retry',
      );
      equal(retried.state().baseline, 6, 'the cursor did not advance over the recovered frame');
      retried.unsubscribe();
    },
  },
  {
    id: 'I14',
    title: 'seeding does not reset the baseline; seeding and subscribing are one transaction',
    run: () => {
      let state = createScopeState(SCOPE_A, 'delta');
      state = applyFrame(state, snapshot(SCOPE_A, 42, 500));
      equal(state.baseline, 42, 'the snapshot did not establish the cursor');

      const applied = seedHistory(state, [bar(400), bar(500)]);
      equal(applied.state.baseline, 42, 'seeding threw away the cursor the snapshot established');

      // and the next close is contiguous, so no avoidable resync is triggered
      const next = applyFrame(applied.state, append(SCOPE_A, 43, 600));
      equal(next.phase, 'live', 'the close after seeding was misread as a gap');
      equal(next.baseline, 43, 'the cursor did not advance after seeding');
    },
  },
];

/** Convenience for a consumer that just wants a pass/fail list rather than a runner integration. */
export async function runConformanceSuite(
  makeHarness: () => ConformanceHarness,
): Promise<Array<{ id: string; title: string; passed: boolean; error?: string }>> {
  const results: Array<{ id: string; title: string; passed: boolean; error?: string }> = [];
  for (const c of CONFORMANCE_CASES) {
    try {
      await c.run(makeHarness());
      results.push({ id: c.id, title: c.title, passed: true });
    } catch (error) {
      results.push({
        id: c.id,
        title: c.title,
        passed: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

export { scopeKey };
