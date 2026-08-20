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

interface PanedHarness extends Harness {
  readonly pricePane: HTMLDivElement;
  readonly otherPane: HTMLDivElement;
}

/**
 * The same harness with the panes drawn in: a container holding the price pane and a study below it,
 * which is what a chart with an indicator looks like. `unnamed` is the pane the chart cannot answer
 * for yet.
 */
function panedHarness(unnamed = false): PanedHarness {
  const built = harness(ON_ANCHOR);
  const pricePane = document.createElement('div');
  const otherPane = document.createElement('div');
  pricePane.appendChild(built.canvas);
  built.container.append(pricePane, otherPane);
  return {
    ...built,
    pricePane,
    otherPane,
    host: { ...built.host, pricePane: () => (unnamed ? null : pricePane) },
  };
}

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

describe('DRAG-06 — a press outside the price pane leaves the axes alone', () => {
  it('a press on another pane makes no call at all, even where the hit-test says yes', () => {
    // A STUDY PANE IS NOT THE PRICE PANE, and the anchors of a drawing live in the price pane only.
    // The hit-test answers on container coordinates, so below the price pane it answers about a
    // point that is not where the pointer is — which is why the pane, not the hit-test, is the guard.
    const it = panedHarness();
    const dispose = attachAxisLock(it.host);

    press(it.otherPane);

    expect(it.calls).toEqual([]);
    dispose();
  });

  it('a press inside the price pane still holds both axes', () => {
    // DRAG-01, unregressed. The guard narrows where the lock applies and never what it does there.
    const it = panedHarness();
    const dispose = attachAxisLock(it.host);

    press(it.canvas);

    expect(it.calls).toEqual([{ handleScroll: false, handleScale: false }]);
    dispose();
  });

  it('a pane reader that throws costs one missed lock, not an exception out of the handler', () => {
    // THE SIBLING'S CONTRACT, applied to the reader that did not have it. `chart.panes()` is what
    // the in-repo caller asks (`src/react/surface/useDrawingSeam.ts:82`), and the base library
    // throws "Object is disposed" out of it once the chart is gone — reachable without the disposer
    // ever running, because `attachAxisLock` is published for hosts composing their own surface.
    //
    // REFUSED, and not the container fallback `null` gets: the reasoning is at axisLock.ts:38-54.
    const built = harness(ON_ANCHOR);
    const it = {
      ...built,
      host: {
        ...built.host,
        pricePane: (): HTMLElement | null => {
          throw new Error('Object is disposed');
        },
      },
    };
    const escaped: string[] = [];
    const onError = (event: Event): void => {
      escaped.push((event as ErrorEvent).message);
    };
    window.addEventListener('error', onError);
    const dispose = attachAxisLock(it.host);

    press(it.canvas);

    expect(escaped).toEqual([]);
    expect(it.calls).toEqual([]);
    window.removeEventListener('error', onError);
    dispose();
  });

  it('a pane the chart cannot name yet costs no lock at all', () => {
    // `getHTMLElement()` answers `null` until that pane index has a widget — the port says so at
    // docs/explanation/port.md#gethtmlelement-is-the-gui-catch-up-read. Refusing to lock on an
    // unanswered read would put the chart back to panning under the anchor, which is the defect.
    const it = panedHarness(true);
    const dispose = attachAxisLock(it.host);

    press(it.canvas);

    expect(it.calls).toEqual([{ handleScroll: false, handleScale: false }]);
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

/**
 * The `window` listeners added and not yet taken back, matched by type AND identity: two presses
 * register two distinct `release` closures under the same two names, so counting names alone would
 * report a leak as balanced.
 */
function stranded(add: jest.SpyInstance, remove: jest.SpyInstance): string[] {
  const takenBack = remove.mock.calls as ReadonlyArray<readonly unknown[]>;
  const matched = new Set<number>();
  const live: string[] = [];
  for (const call of add.mock.calls as ReadonlyArray<readonly unknown[]>) {
    const at = takenBack.findIndex(
      (back, index) => !matched.has(index) && back[0] === call[0] && back[1] === call[1],
    );
    if (at === -1) live.push(String(call[0]));
    else matched.add(at);
  }
  return live;
}

describe('DRAG-05 — overlapping presses cannot strand a release listener', () => {
  it('the disposer takes back the listeners of every press still held, not just the last', () => {
    // A SLOT LOSES THE FIRST PRESS. `blur` fires without a `mouseup`, the button comes back down,
    // and now two releases are live; a single-slot handle can only ever reach the newer one, so the
    // older pair outlives the disposer and keeps a closure over a chart the host has finished with.
    const it = harness(ON_ANCHOR);
    const add = jest.spyOn(window, 'addEventListener');
    const remove = jest.spyOn(window, 'removeEventListener');
    const dispose = attachAxisLock(it.host);

    press(it.canvas);
    press(it.canvas);
    dispose();

    expect(stranded(add, remove)).toEqual([]);
    add.mockRestore();
    remove.mockRestore();
  });

  it('frees the chart once per press held, and never again after teardown', () => {
    const it = harness(ON_ANCHOR);
    const dispose = attachAxisLock(it.host);

    press(it.canvas);
    press(it.canvas);
    dispose();
    window.dispatchEvent(new MouseEvent('mouseup'));
    window.dispatchEvent(new Event('blur'));

    expect(it.calls).toEqual([
      { handleScroll: false, handleScale: false },
      { handleScroll: false, handleScale: false },
      { handleScroll: true, handleScale: true },
      { handleScroll: true, handleScale: true },
    ]);
  });
});

const pressAt = (target: Element, clientX: number, clientY: number): void => {
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX, clientY }));
};

describe('DRAG-01, DRAG-06 — the hit-test is asked about a point inside the container', () => {
  it('subtracts the container origin, so the point is container-relative and not page-relative', () => {
    // WHY THE RECT IS STUBBED AT ALL. jsdom does no layout, so every rect reads zeros — and at an
    // origin of 0,0 the page point and the container point are the same number. That is how a wrong
    // coordinate contract survives a green suite: the subtraction can be dropped, or the two axes
    // transposed, and nothing here would ever have noticed. The offsets differ from each other and
    // from the deltas on purpose, so each of those mistakes lands on a different wrong answer.
    const it = harness(ON_ANCHOR);
    it.container.getBoundingClientRect = () =>
      ({ top: 30, left: 12, width: 800, height: 400 }) as DOMRect;
    const dispose = attachAxisLock(it.host);

    pressAt(it.canvas, 212, 130);

    expect(it.hits).toEqual([{ x: 200, y: 100 }]);
    dispose();
  });
});
