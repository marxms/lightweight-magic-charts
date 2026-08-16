// THE CHART TEARDOWN — declared LAST on purpose: React destroys cleanups in declaration order.
// See docs/explanation/react-surface.md#declared-last-on-purpose

import { useEffect } from 'react';

import type { LiveHandles, PublishHandles } from './chartHandles';

export function useChartTeardown(live: LiveHandles, publish: PublishHandles): void {
  useEffect(
    () => () => {
      // Synchronous view, never the state; and zeroed BEFORE removing.
      // See docs/explanation/react-surface.md#zeroed-before-removing
      const current = live.current;
      publish(null);
      current?.chart.remove();
    },
    [live, publish],
  );
}
