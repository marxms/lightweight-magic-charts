/**
 * An in-memory reference adapter, and the harness the conformance suite drives it through.
 *
 * WHY THIS EXISTS. A conformance suite nobody has ever run against a real implementation is a
 * document, not a check. This is the smallest implementation that can satisfy `MarketDataPort`, and
 * running the suite against it proves the suite is executable and that the invariants are
 * satisfiable — before any production adapter is asked to satisfy them.
 *
 * It is deliberately NOT clever: a map of subscribers, a queued history response, and no transport
 * at all. Anything smarter would start hiding the failures the suite exists to surface.
 */

import type { Bar, Scope } from '../src/domain/types';
import { scopeKey } from '../src/domain/types';
import type { Frame } from '../src/port/frames';
import type {
  FrameSink,
  HistoryRequest,
  HistoryResult,
  MarketDataPort,
  Unsubscribe,
} from '../src/port/ports';
import type { ConformanceHarness } from '../src/conformance/suite';

export function createReferenceHarness(): ConformanceHarness {
  const sinks = new Map<string, Set<FrameSink>>();
  /** Every sink ever handed over, detached or not — the only way to simulate a late callback. */
  const everSeen = new Map<string, Set<FrameSink>>();
  let nextHistory: { bars: readonly Bar[]; exhausted: boolean } = { bars: [], exhausted: false };
  let held: (() => void) | null = null;
  let holdNext = false;

  const port: MarketDataPort = {
    describe: (scope: Scope) => [{ shape: 'delta' as const, scope, seriesIds: [] }],

    subscribe: (scope: Scope, sink: FrameSink): Unsubscribe => {
      const key = scopeKey(scope);
      const set = sinks.get(key) ?? new Set<FrameSink>();
      set.add(sink);
      sinks.set(key, set);
      const seen = everSeen.get(key) ?? new Set<FrameSink>();
      seen.add(sink);
      everSeen.set(key, seen);
      sink.onStatus('open');

      let detached = false;
      return () => {
        if (detached) return; // idempotent — M5 says the closure is the token, not a one-shot
        detached = true;
        const current = sinks.get(key);
        current?.delete(sink);
        if (current && current.size === 0) sinks.delete(key);
      };
    },

    fetchBars: async (req: HistoryRequest): Promise<HistoryResult> => {
      const response = nextHistory;
      nextHistory = { bars: [], exhausted: false };

      if (holdNext) {
        holdNext = false;
        await new Promise<void>((resolve) => {
          held = resolve;
        });
      }
      // The signal is honoured, which is what I2 and I7 actually measure.
      if (req.signal.aborted) throw new Error('aborted');

      // `barCount` takes priority over the window (M6 / task 2.3).
      const windowed = response.bars.filter((b) => b.time >= req.from && b.time < req.to);
      const bars =
        req.barCount === undefined ? windowed : response.bars.slice(-req.barCount);
      return { bars, exhausted: response.exhausted };
    },
  };

  return {
    port,
    emit: (frame: Frame) => {
      const set = sinks.get(scopeKey(frame.scope));
      if (!set) return;
      for (const sink of Array.from(set)) sink.onFrame(frame);
    },
    // Deliberately ignores the attached set: a misbehaving transport does too.
    emitToDetached: (frame: Frame) => {
      const seen = everSeen.get(scopeKey(frame.scope));
      if (!seen) return;
      const attached = sinks.get(scopeKey(frame.scope));
      for (const sink of Array.from(seen)) {
        if (attached?.has(sink)) continue;
        sink.onFrame(frame);
      }
    },
    setHistory: (bars, opts) => {
      // The suite states windows as "whatever I hand you"; keep them reachable by any range.
      nextHistory = { bars, exhausted: opts?.exhausted ?? false };
    },
    holdHistory: () => {
      holdNext = true;
    },
    releaseHistory: () => {
      held?.();
      held = null;
    },
    openSubscriptions: () => {
      let total = 0;
      sinks.forEach((set) => {
        total += set.size;
      });
      return total;
    },
  };
}
