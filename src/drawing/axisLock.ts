/**
 * THE AXIS LOCK — the whole gesture except the hit-test, which is the binding's one line.
 * See docs/explanation/drawing.md#the-axis-lock-is-the-librarys-half-of-the-drag
 */

import type { ChartLifecycle } from '../port/chartApi';

export interface AxisLockHost {
  readonly chart: Pick<ChartLifecycle, 'applyOptions'>;
  readonly container: HTMLElement;
  /** The ONE fact only the binding knows. The point is relative to the container. */
  readonly anchorAt: (point: { readonly x: number; readonly y: number }) => boolean;
  /** The price pane's element, read at press time. Absent or `null` means the whole container. */
  readonly pricePane?: () => HTMLElement | null;
}

/** The pair, written once. Both axes always move together, so one flag decides both. */
export const axes = (free: boolean) => ({ handleScroll: free, handleScale: free });

/**
 * BOTH RELEASE EVENTS, registered and revoked through one call so the pair can never drift apart.
 *
 * On `window`, not the container: the drag that ends outside the chart is the common one, and `blur`
 * covers the gesture abandoned by a tab switch. A frozen axis is worse than the defect being fixed.
 */
const listen = (op: 'addEventListener' | 'removeEventListener', release: () => void): void => {
  window[op]('mouseup', release);
  window[op]('blur', release);
};

export function attachAxisLock(host: AxisLockHost): () => void {
  const { container } = host;
  let detached = false;
  // A SET AND NOT A SLOT: `blur` without a `mouseup` and the button down again puts two releases in
  // flight, and one slot can only ever reach the newer — the older pair outlived the disposer.
  const pendingReleases = new Set<() => void>();

  const grabsAnchor = (event: MouseEvent): boolean => {
    const rect = container.getBoundingClientRect();
    try {
      return host.anchorAt({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    } catch {
      // A hit-test against a state the engine did not expect costs one missed lock, never a crash.
      return false;
    }
  };

  // CAPTURE PHASE: the only place this lands before the base library reads the same press in bubble.
  const onDown = (event: MouseEvent): void => {
    // WHERE THE PRESS LANDED, asked of the chart and never deduced. A study pane sits below the
    // price pane inside the same container, and the hit-test reads CONTAINER coordinates — pressed
    // down there it answers about a point the pointer is not on, and the axes freeze for a gesture
    // that was never a drag. The pane's own element is the whole guard, so the library still knows
    // nothing about drawings. Unanswered keeps the container: refusing the lock on a read the chart
    // has not caught up with is the very defect this file exists to fix.
    const pane = host.pricePane?.() ?? null;
    if (event.button !== 0 || (pane !== null && !pane.contains(event.target as Node))) return;
    if (!grabsAnchor(event)) return;
    host.chart.applyOptions(axes(false));
    const release = (): void => {
      listen('removeEventListener', release);
      pendingReleases.delete(release);
      // A gesture can outlive the component. Unlocking a chart the base library already disposed
      // means nothing, so the orphaned gesture just dissolves.
      if (detached) return;
      host.chart.applyOptions(axes(true));
    };
    pendingReleases.add(release);
    listen('addEventListener', release);
  };

  container.addEventListener('mousedown', onDown, true);

  return () => {
    // FREED FIRST, THEN DEAF. The seam's cleanup runs while the chart is STILL ALIVE: `ChartSurface`
    // declares `useDrawingSeam` before `useChartTeardown`, React destroys cleanups in that order,
    // and `chart.remove()` exists nowhere else. Setting `detached` first made the release a no-op,
    // so a re-bind mid-press handed the host a chart whose axes never came back.
    // Over a SNAPSHOT: each release deletes itself from the set as it runs.
    for (const release of [...pendingReleases]) release();
    detached = true;
    container.removeEventListener('mousedown', onDown, true);
  };
}
