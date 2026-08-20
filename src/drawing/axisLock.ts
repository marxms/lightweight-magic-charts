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
}

const LOCKED = { handleScroll: false, handleScale: false };
const FREE = { handleScroll: true, handleScale: true };

export function attachAxisLock(host: AxisLockHost): () => void {
  let detached = false;
  let pendingRelease: (() => void) | null = null;

  const grabsAnchor = (event: MouseEvent): boolean => {
    const rect = host.container.getBoundingClientRect();
    try {
      return host.anchorAt({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    } catch {
      // A hit-test against a state the engine did not expect costs one missed lock, never a crash.
      return false;
    }
  };

  // CAPTURE PHASE: the only place this lands before the base library reads the same press in bubble.
  const onDown = (event: MouseEvent): void => {
    if (event.button !== 0 || !grabsAnchor(event)) return;
    host.chart.applyOptions(LOCKED);
    const release = (): void => {
      window.removeEventListener('mouseup', release);
      window.removeEventListener('blur', release);
      pendingRelease = null;
      // A gesture can outlive the component. Unlocking a chart the base library already disposed
      // means nothing, so the orphaned gesture just dissolves.
      if (detached) return;
      host.chart.applyOptions(FREE);
    };
    pendingRelease = release;
    // On `window`, not the container: the drag that ends outside the chart is the common one, and
    // `blur` covers the gesture abandoned by a tab switch. A frozen axis is worse than the defect.
    window.addEventListener('mouseup', release);
    window.addEventListener('blur', release);
  };

  host.container.addEventListener('mousedown', onDown, true);

  return () => {
    detached = true;
    pendingRelease?.();
    host.container.removeEventListener('mousedown', onDown, true);
  };
}
