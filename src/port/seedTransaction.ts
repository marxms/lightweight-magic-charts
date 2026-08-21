/**
 * The seed transaction — design.md §2.5, migration M14. ONE transaction, not two effects:
 * (1) subscribe, (2) snapshot gives baseline B and anchor T while buffering (I12), (3) fetch
 * history, (4) does the window contain a bar at T (I13), (5) release the buffer from B+1 (I14).
 * Cancellable as a UNIT. See docs/explanation/port.md#the-seed-transaction-is-one-transaction-not-two-effects
 */

import type { Bar, Scope } from '../domain/types';
import type { HistoryPort, LivePort, Unsubscribe } from './ports';
import type { ChannelShape, Frame, LinkStatus } from './frames';
import {
  applyFrame,
  createScopeState,
  discardScope,
  needsRefetch,
  resumeScope,
  seedHistory,
  strandScope,
  type ScopeState,
} from './scopeMachine';

/**
 * How many consecutive failed repairs a session spends before it stops asking.
 *
 * A COUNT and not a delay, because nothing in this layer may name a timer. A history endpoint that
 * sits permanently behind the live edge would otherwise turn the repair into one fetch per frame,
 * which is a worse failure than the blank chart it replaces — and a louder one to pay for.
 * See docs/explanation/port.md#a-stranded-scope-asks-again
 */
const MAX_CONSECUTIVE_REPAIRS = 6;

export type SeedOutcome =
  | { readonly kind: 'seeded'; readonly bars: readonly Bar[]; readonly baseline: number }
  /** Seeded and live, but the seam could NOT be proven. See docs/explanation/port.md#seeded-unverified-is-reported-not-folded-into-seeded */
  | {
      readonly kind: 'seeded-unverified';
      readonly bars: readonly Bar[];
      readonly baseline: number;
      readonly reason: 'no-anchor';
    }
  | {
      readonly kind: 'stale-history';
      readonly baselineTime: number;
      readonly newestBarTime?: number;
    }
  | { readonly kind: 'aborted' };

export interface SessionOptions {
  readonly scope: Scope;
  readonly shape: ChannelShape;
  readonly port: HistoryPort & LivePort;
  /** Window requested from history. `barCount` takes priority over `[from, to)`. */
  readonly history: { readonly from: number; readonly to: number; readonly barCount?: number };
  readonly onState?: (state: ScopeState) => void;
  readonly onStatus?: (status: LinkStatus) => void;
  /** How many times a stale window may be refetched before giving up. */
  readonly maxRefetch?: number;
}

export interface Session {
  readonly state: () => ScopeState;
  /** The FIRST seed. Every repair after it reports through `reseed`. */
  readonly outcome: Promise<SeedOutcome>;
  /**
   * Fetch the window again for a scope that `needsRefetch` reports, and release the buffer onto it.
   *
   * One verdict per repair, because `outcome` already settled and a settled promise cannot carry
   * the result of anything that happens later. Refuses without touching the network when there is
   * nothing to repair, when the cursor is not back yet, or when the repair ceiling is spent.
   */
  readonly reseed: () => Promise<SeedOutcome>;
  /** M5 — the closure IS the token. Idempotent: calling it twice is not an error. */
  readonly unsubscribe: Unsubscribe;
}

/** Opens a scope: subscribe, buffer, fetch, verify, release. See docs/explanation/port.md#openscope-owns-the-abortcontroller */
export function openScope(options: SessionOptions): Session {
  const { scope, shape, port, history } = options;
  const maxRefetch = options.maxRefetch ?? 1;

  let state = createScopeState(scope, shape);
  let released = false;
  let detach: Unsubscribe | null = null;
  /** The repair in flight, so a second caller joins it instead of starting a rival one. */
  let repair: Promise<SeedOutcome> | null = null;
  /** Consecutive failed repairs. A seed that lands clears it; the ceiling stops the asking. */
  let spent = 0;
  const controller = new AbortController();

  const publish = (next: ScopeState): void => {
    state = next;
    if (!released) options.onState?.(next);
  };

  // Step 1 — subscribe BEFORE any fetch. Everything that closes from here on is captured.
  detach = port.subscribe(scope, {
    onFrame: (frame: Frame) => {
      // I7 — after unsubscribe nothing reaches the consumer, even if the transport is late.
      if (released) return;
      publish(applyFrame(state, frame));
    },
    onStatus: (status: LinkStatus) => {
      if (!released) options.onStatus?.(status);
    },
  });

  const unsubscribe: Unsubscribe = () => {
    if (released) return;
    released = true;
    state = discardScope(state);
    controller.abort();
    detach?.();
    detach = null;
  };

  const runSeed = async (): Promise<SeedOutcome> => {
    for (let attempt = 0; attempt <= maxRefetch; attempt += 1) {
      let bars: readonly Bar[];
      try {
        // Step 3 — the fetch shares the transaction's signal, so aborting the scope aborts it.
        const result = await port.fetchBars({
          scope,
          from: history.from,
          to: history.to,
          barCount: history.barCount,
          signal: controller.signal,
        });
        bars = result.bars;
      } catch {
        return { kind: 'aborted' };
      }
      if (released || controller.signal.aborted) return { kind: 'aborted' };

      // Steps 4 and 5 — seam check, then release the buffer with the cursor intact.
      const applied = seedHistory(state, bars);

      if (applied.verdict === 'verified' || applied.verdict === 'unverifiable') {
        publish(applied.state);
        return applied.verdict === 'verified'
          ? { kind: 'seeded', bars: applied.state.bars, baseline: applied.state.baseline }
          : {
              // Live, and the consumer is TOLD the seam could not be proven. Saying nothing would
              // be indistinguishable from having checked. See docs/explanation/port.md#seeded-unverified-is-reported-not-folded-into-seeded
              kind: 'seeded-unverified',
              bars: applied.state.bars,
              baseline: applied.state.baseline,
              reason: 'no-anchor',
            };
      }

      // I13 — the window does not reach the live edge. Refetch, and do NOT publish: the machine
      // stays in `seeding` with its buffer intact. See docs/explanation/port.md#a-stale-window-is-refetched-without-publishing
      if (attempt === maxRefetch) {
        const baselineTime = state.baselineTime ?? 0;
        const newestBarTime = bars.length > 0 ? bars[bars.length - 1].time : undefined;
        // Spent, so the scope is STRANDED and says so. `restartScope` stood here and left it in
        // `seeding`, which `needsRefetch` does not report — the second way a scope went quiet.
        publish(strandScope(state));
        return { kind: 'stale-history', baselineTime, newestBarTime };
      }
    }
    return { kind: 'aborted' };
  };

  const outcome = runSeed();

  const reseed = (): Promise<SeedOutcome> => {
    // One repair at a time. Two in flight would publish two windows, and the older one landing
    // last would walk the bars backwards — a corruption the blank chart never had.
    if (repair !== null) return repair;
    if (
      released ||
      !needsRefetch(state) ||
      // The cursor is not back yet, and `seedHistory` only proves the seam under `anchored`. Seeding
      // here would pass the proof vacuously and report `verified`, which is the outcome this port
      // exists to make impossible — so the repair waits instead of guessing.
      state.seam === 'none' ||
      spent >= MAX_CONSECUTIVE_REPAIRS
    ) {
      return Promise.resolve({ kind: 'aborted' });
    }

    publish(resumeScope(state));
    const running = runSeed().then((result) => {
      spent = result.kind === 'seeded' || result.kind === 'seeded-unverified' ? 0 : spent + 1;
      repair = null;
      return result;
    });
    repair = running;
    return running;
  };

  return { state: () => state, outcome, reseed, unsubscribe };
}
