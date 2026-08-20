/**
 * @jest-environment jsdom
 *
 * DRAG-01 through DRAG-06 — pulling an anchor moves the anchor and nothing else.
 *
 * WHAT THE DEFECT LOOKED LIKE. The base library's pan handler and the drawing engine's drag handler
 * hear the same press and both act, so the chart scrolled under the anchor being pulled and a shape
 * could never be resized. The lock is the fix, and each clause below is one of the ways it can be
 * got wrong: locking on every press, never releasing, releasing only inside the chart, or reaching
 * a chart that has already been disposed.
 *
 * THE PRESS IS DISPATCHED ON A CHILD OF THE CONTAINER, which is what really happens — the pointer
 * lands on the canvas the chart puts inside its host, never on the host itself.
 */
import { attachAxisLock, type AxisLockHost } from '../src/drawing/axisLock';

interface Harness {
  readonly host: AxisLockHost;
  readonly container: HTMLDivElement;
  readonly canvas: HTMLDivElement;
  readonly outside: HTMLDivElement;
  readonly calls: Array<Record<string, unknown>>;
  readonly hits: Array<{ x: number; y: number }>;
}

function harness(anchorAt: (point: { readonly x: number; readonly y: number }) => boolean): Harness {
  const container = document.createElement('div');
  const canvas = document.createElement('div');
  container.appendChild(canvas);
  const outside = document.createElement('div');
  document.body.replaceChildren(container, outside);

  const calls: Array<Record<string, unknown>> = [];
  const hits: Array<{ x: number; y: number }> = [];
  return {
    container,
    canvas,
    outside,
    calls,
    hits,
    host: {
      container,
      chart: { applyOptions: (options) => calls.push(options) },
      anchorAt: (point) => {
        hits.push({ x: point.x, y: point.y });
        return anchorAt(point);
      },
    },
  };
}

const press = (target: Element, button = 0): void => {
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button }));
};

const ON_ANCHOR = (): boolean => true;
const NO_ANCHOR = (): boolean => false;

afterEach(() => {
  document.body.replaceChildren();
});

describe('DRAG-01 — a press that grabs an anchor holds both axes', () => {
  it('reaches the press even when the element under it stops propagation', () => {
    // The reason the registration is in CAPTURE phase, stated as a behaviour: the handler that
    // would compete for this press sits below, in bubble, and a bubble-phase lock would never run.
    const it = harness(ON_ANCHOR);
    it.canvas.addEventListener('mousedown', (event) => event.stopPropagation());
    const dispose = attachAxisLock(it.host);

    press(it.canvas);

    expect(it.calls).toEqual([{ handleScroll: false, handleScale: false }]);
    dispose();
  });

  it('holds handleScroll and handleScale at false, and nothing else', () => {
    const it = harness(ON_ANCHOR);
    const dispose = attachAxisLock(it.host);

    press(it.canvas);

    expect(it.calls).toEqual([{ handleScroll: false, handleScale: false }]);
    dispose();
  });
});

describe('DRAG-02 — releasing the press restores both options', () => {
  it('a mouseup puts handleScroll and handleScale back to true', () => {
    const it = harness(ON_ANCHOR);
    const dispose = attachAxisLock(it.host);
    press(it.canvas);

    window.dispatchEvent(new MouseEvent('mouseup'));

    expect(it.calls).toEqual([
      { handleScroll: false, handleScale: false },
      { handleScroll: true, handleScale: true },
    ]);
    dispose();
  });
});

describe('DRAG-03 — a release outside the container still restores', () => {
  it('a mouseup on an element that is not inside the chart unlocks it', () => {
    // The listener is on `window` for exactly this: the pointer leaves the pane and the button
    // comes up over the page, which is the common end of a drag rather than the exotic one. Bound
    // to the container, this release would never be heard and the axes would stay frozen.
    const it = harness(ON_ANCHOR);
    const dispose = attachAxisLock(it.host);
    press(it.canvas);

    it.outside.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(it.calls[1]).toEqual({ handleScroll: true, handleScale: true });
    dispose();
  });
});

describe('DRAG-04 — a window that loses focus mid-drag restores', () => {
  it('a blur unlocks the chart, so a tab switch cannot freeze it', () => {
    const it = harness(ON_ANCHOR);
    const dispose = attachAxisLock(it.host);
    press(it.canvas);

    window.dispatchEvent(new Event('blur'));

    expect(it.calls[1]).toEqual({ handleScroll: true, handleScale: true });
    dispose();
  });
});

describe('DRAG-05 — a gesture that outlives the surface touches no disposed chart', () => {
  it('after the disposer, a late mouseup calls nothing and no listener is left behind', () => {
    // Going full screen unmounts the surface while the button is still down. The mouseup lands
    // afterwards against a chart the base library has already removed, which answers by throwing.
    //
    // THE DISPOSER ITSELF IS NOT THAT LATE EVENT. It runs one step ahead of `chart.remove()`, so it
    // frees the axes on a live chart — the pair below. What DRAG-05 forbids is a THIRD call, and the
    // exact-length match is what forbids it: the post-dispose mouseup and press add nothing.
    const it = harness(ON_ANCHOR);
    const dispose = attachAxisLock(it.host);
    press(it.canvas);
    expect(it.calls).toHaveLength(1);

    dispose();
    window.dispatchEvent(new MouseEvent('mouseup'));
    press(it.canvas);

    expect(it.calls).toEqual([
      { handleScroll: false, handleScale: false },
      { handleScroll: true, handleScale: true },
    ]);
    expect(it.hits).toHaveLength(1);
  });
});

describe('DRAG-06 — a press that is not on an anchor leaves panning alone', () => {
  it('a press the hit-test refuses makes no call at all', () => {
    const it = harness(NO_ANCHOR);
    const dispose = attachAxisLock(it.host);

    press(it.canvas);

    expect(it.calls).toEqual([]);
    dispose();
  });

  it('a press with a button other than the left one makes no call at all', () => {
    const it = harness(ON_ANCHOR);
    const dispose = attachAxisLock(it.host);

    press(it.canvas, 2);

    expect(it.calls).toEqual([]);
    dispose();
  });

  it('a hit-test that throws costs one missed lock, not an exception out of the handler', () => {
    // The engine can be asked about a state it did not expect. A crash here would escape into the
    // page, because a press is dispatched by the browser and nobody above is catching for us.
    const it = harness(() => {
      throw new Error('the engine did not expect this state');
    });
    // The MESSAGE and not the event object: an ErrorEvent carries the whole window on it, and a
    // failed comparison against one is a diff nobody can read.
    const escaped: string[] = [];
    const onError = (event: Event): void => {
      escaped.push((event as ErrorEvent).message);
    };
    window.addEventListener('error', onError);
    const dispose = attachAxisLock(it.host);

    press(it.canvas);

    expect(it.calls).toEqual([]);
    expect(escaped).toEqual([]);
    window.removeEventListener('error', onError);
    dispose();
  });
});

describe('DRAG-02 — the disposer frees a chart that is still alive', () => {
  // WHY THE DISPOSER IS A LIVE-CHART PATH, not a disposed-chart one. `ChartSurface` calls
  // `useDrawingSeam` at line 238 and `useChartTeardown` at line 277, and React destroys effect
  // cleanups in declaration order — the reason `useChartTeardown.ts:1` says it is declared last.
  // `chart.remove()` for this chart exists nowhere else, and that teardown effect depends only on
  // a ref and a `useCallback([])`, so it never re-runs. The seam's cleanup therefore always fires
  // while the chart is alive, and a disposer that skips the release freezes the axes for good.
  it('a press still held when the seam re-binds ends free, not frozen', () => {
    const it = harness(ON_ANCHOR);
    const dispose = attachAxisLock(it.host);
    press(it.canvas);

    dispose();

    expect(it.calls).toEqual([
      { handleScroll: false, handleScale: false },
      { handleScroll: true, handleScale: true },
    ]);
  });

  it('has already stopped listening by the time it has freed the chart', () => {
    const it = harness(ON_ANCHOR);
    const dispose = attachAxisLock(it.host);
    press(it.canvas);

    dispose();
    window.dispatchEvent(new MouseEvent('mouseup'));
    window.dispatchEvent(new Event('blur'));

    expect(it.calls).toEqual([
      { handleScroll: false, handleScale: false },
      { handleScroll: true, handleScale: true },
    ]);
  });
});
