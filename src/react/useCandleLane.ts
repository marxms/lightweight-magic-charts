/**
 * The candle lane: history and live as ONE seed transaction, never two effects.
 * See docs/explanation/react.md#one-seed-transaction-and-never-two-effects
 */
import { useEffect, useMemo, useState } from 'react';

import { scopeKey } from '../domain/types';
import type { Bar, Scope } from '../domain/types';
import type { LinkStatus } from '../port/frames';
import type { MarketDataPort } from '../port/ports';
import { needsRefetch } from '../port/scopeMachine';
import { openScope } from '../port/seedTransaction';
import type { SeedOutcome, Session } from '../port/seedTransaction';

export interface CandleLane {
  /** `null` parks the lane: no market chosen yet, so no session and no socket. */
  readonly scope: Scope | null;
  readonly port: MarketDataPort;
  readonly barCount: number;
}

export interface CandleLaneState {
  readonly bars: readonly Bar[];
  readonly status: LinkStatus | null;
  readonly outcome: SeedOutcome['kind'] | null;
  /** Whether the history-to-live seam could be PROVEN. `unverified` is not `verified`. */
  readonly seam: string;
}

const NO_BARS: readonly Bar[] = [];

export function useCandleLane({ scope, port, barCount }: CandleLane): CandleLaneState {
  const [bars, setBars] = useState<readonly Bar[]>(NO_BARS);
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [outcome, setOutcome] = useState<SeedOutcome['kind'] | null>(null);
  const [seam, setSeam] = useState<string>('none');

  // A scope is identified BY VALUE. See docs/explanation/react.md#a-scope-is-identified-by-value
  const key = scope === null ? null : scopeKey(scope);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` IS `scope` by value — depending on the object would defeat the normalisation this memo exists for
  const session = useMemo(() => scope, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (session === null) return;
    setBars(NO_BARS);
    setOutcome(null);
    setSeam('none');

    let live = true;
    // Assigned right below: the ask reaches the session that is still being built.
    let current: Session | null = null;

    const opened = openScope({
      scope: session,
      // `delta` polices contiguity; `barCount` outranks the window, which is the advisory full range.
      shape: 'delta',
      port,
      history: { from: 0, to: Number.MAX_SAFE_INTEGER, barCount },
      onState: (state) => {
        setBars(state.bars);
        setSeam(state.seam);
        // A stranded scope draws nothing and refuses every later frame, so the lane asks again.
        // See docs/explanation/port.md#a-stranded-scope-asks-again
        if (live && needsRefetch(state)) void current?.reseed();
      },
      onStatus: setStatus,
    });
    current = opened;
    opened.outcome.then(
      (result) => {
        if (live) setOutcome(result.kind);
      },
      () => {
        if (live) setOutcome('aborted');
      },
    );

    return () => {
      live = false;
      opened.unsubscribe();
    };
  }, [session, port, barCount]);

  return useMemo(() => ({ bars, status, outcome, seam }), [bars, status, outcome, seam]);
}
