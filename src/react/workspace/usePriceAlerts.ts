/**
 * The user's own price levels, and what happens when the price walks through one.
 * See docs/explanation/react-workspace.md#one-owner-for-the-levels-and-the-firings
 */
import { useCallback, useRef, useState } from 'react';

import type { PriceAlert } from '../../alerts/priceAlerts';

/** A status line is read at a glance, so it keeps the last few firings rather than all of them. */
const FIRINGS_KEPT = 4;

export interface WorkspaceAlerts {
  readonly levels: readonly number[];
  readonly onLevels: (levels: readonly number[]) => void;
  readonly onCrossed: (crossed: readonly PriceAlert[]) => void;
  readonly addLevel: (price: number) => void;
  readonly fired: readonly string[];
}

export function usePriceAlerts(told?: (crossed: readonly PriceAlert[]) => void): WorkspaceAlerts {
  const [levels, setLevels] = useState<readonly number[]>([]);
  const [fired, setFired] = useState<readonly string[]>([]);
  const teller = useRef(told);
  teller.current = told;

  const addLevel = useCallback((price: number) => {
    setLevels((held) => [...held, price]);
  }, []);

  const onCrossed = useCallback((crossed: readonly PriceAlert[]) => {
    const names = crossed.map((alert) => String(alert.price));
    setFired((held) => [...held, ...names].slice(-FIRINGS_KEPT));
    teller.current?.(crossed);
  }, []);

  return { levels, fired, onLevels: setLevels, addLevel, onCrossed };
}
