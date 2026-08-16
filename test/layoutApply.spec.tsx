/**
 * @jest-environment jsdom
 *
 * LMC-23 — the budget application, and the ORPHAN FRAME.
 *
 * THE DEFECT THIS FILE CLOSES. The re-measure schedules work for the next frame, and the
 * cancellation of that frame lived in the MOUNT's cleanup — two distant blocks joined by a ref,
 * correct only while they lived in the same file. The mount's cleanup runs FIRST, because it is the
 * first effect declared, so the pending frame would survive it and run against an already removed
 * chart.
 *
 * The fix is one of form: the re-measure returns a DISPOSER, and whoever schedules is who cancels.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { render } from '@testing-library/react';

import { directionConvention, paneId, seriesId, utcSeconds } from '../src/domain/types';
import type { Bar, PaneSpec } from '../src/domain/types';
import type { StackApplication } from '../src/render/paneStack';
import type { ChartEngine, PaneHandle, SeriesHandle, WorkspaceChartHandle } from '../src/port/chartApi';
import { ChartSurface, type PaneView, type SeriesReader } from '../src/react/surface/ChartSurface';

interface Ledger {
  applies: number;
  removed: boolean;
  /** Calls to `applyRowVisibility` AFTER the chart has been removed. It has to stay at zero. */
  afterRemoval: number;
}

/**
 * A pane whose widget never arrives. `getHTMLElement()` at `null` is what makes `applyRowVisibility`
 * return false, which is the condition under which the re-measure schedules a repair frame — without
 * that there is no pending frame and the orphan case would not exist.
 */
function unresolvedEngine(ledger: Ledger): ChartEngine {
  return () => {
    let nextPane = 1;
    const makePane = (index: number): PaneHandle => ({
      paneIndex: () => index,
      getStretchFactor: () => 1,
      setStretchFactor: () => undefined,
      setPreserveEmptyPane: () => undefined,
      moveTo: () => undefined,
      getHTMLElement: () => {
        if (ledger.removed) ledger.afterRemoval += 1;
        return null;
      },
    });
    const pane0 = makePane(0);
    const chart: WorkspaceChartHandle = {
      panes: () => [pane0],
      addPane: () => makePane(nextPane++),
      addSeries: (): SeriesHandle => ({
        setData: () => undefined,
        applyOptions: () => undefined,
        setMarkers: () => undefined,
        priceScale: () => ({ applyOptions: () => undefined }),
        createPriceLine: () => ({ applyOptions: () => undefined }),
        removePriceLine: () => undefined,
        priceToCoordinate: () => null,
        coordinateToPrice: () => null,
        attachPrimitive: () => undefined,
        detachPrimitive: () => undefined,
      }),
      applyOptions: () => {
        ledger.applies += 1;
      },
      subscribeCrosshairMove: () => undefined,
      unsubscribeCrosshairMove: () => undefined,
      remove: () => {
        ledger.removed = true;
      },
      timeScale: () => ({ fitContent: () => undefined }),
    };
    return chart;
  };
}

const CONVENTION = directionConvention({ upColor: '#26a69a', downColor: '#ef5350' });
const PRICE: PaneSpec = {
  id: paneId('price'),
  title: 'Price',
  format: { kind: 'price', minMove: 0.01 },
  series: [],
  defaultVisible: true,
};
const RATE: PaneSpec = {
  id: paneId('rate'),
  title: 'Rate',
  format: { kind: 'percent', decimals: 4 },
  targetHeightPx: 90,
  defaultVisible: true,
  series: [{ id: seriesId('r'), label: 'R', shape: 'line', color: '#abc' }],
};
const BARS: readonly Bar[] = [
  { time: utcSeconds(1_700_000_000), open: 100, high: 110, low: 95, close: 105 },
];
const read: SeriesReader = () => [1];
const view = (spec: PaneSpec): PaneView => ({ spec, visible: true, heightPx: 90, lastUsedAt: 1 });

/** Holds the frames instead of running them, so that "pending" is an observable state. */
function heldFrames(): { run: () => void; pending: () => number; restore: () => void } {
  const original = window.requestAnimationFrame;
  const originalCancel = window.cancelAnimationFrame;
  const queue = new Map<number, FrameRequestCallback>();
  let next = 1;
  window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    const id = next++;
    queue.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = (id: number): void => {
    queue.delete(id);
  };
  return {
    run: () => {
      const callbacks = [...queue.values()];
      queue.clear();
      for (const callback of callbacks) callback(0);
    },
    pending: () => queue.size,
    restore: () => {
      window.requestAnimationFrame = original;
      window.cancelAnimationFrame = originalCancel;
    },
  };
}

describe('LMC-23 — unmounting during a pending frame', () => {
  it('it does not throw, and nothing touches the chart after it has been removed', () => {
    const frames = heldFrames();
    const ledger: Ledger = { applies: 0, removed: false, afterRemoval: 0 };
    try {
      const view1 = render(
        <ChartSurface
          engine={unresolvedEngine(ledger)}
          convention={CONVENTION}
          data={{ bars: BARS, panes: [view(RATE)], read, pricePane: PRICE }}
          layout={{ heightPx: 480 }}
          a11y={{ label: 'workspace', describedBy: 'state' }}
        />,
      );

      // The layout application's frame is PENDING — without it the case would be about nothing.
      expect(frames.pending()).toBeGreaterThan(0);

      view1.unmount();
      expect(ledger.removed).toBe(true);

      // THE CLAUSE THAT PINS THE DISPOSER. The two assertions below pass even with the cancellation
      // deleted: the orphan frame runs, finds the handles already zeroed by the teardown, and does
      // not reach the chart by any other path. What measures the defect is the QUEUE — without the
      // cancellation a frame scheduled after the unmount is left over, and that is what this line
      // fails.
      expect(frames.pending()).toBe(0);

      // Running what is left in the queue must not throw, and must not reach the removed chart.
      expect(() => frames.run()).not.toThrow();
      expect(ledger.afterRemoval).toBe(0);
    } finally {
      frames.restore();
    }
  });

  it("the re-measure's repair frame is also cancelled by the disposer", () => {
    const frames = heldFrames();
    const ledger: Ledger = { applies: 0, removed: false, afterRemoval: 0 };
    try {
      const view1 = render(
        <ChartSurface
          engine={unresolvedEngine(ledger)}
          convention={CONVENTION}
          data={{ bars: BARS, panes: [view(RATE)], read, pricePane: PRICE }}
          layout={{ heightPx: 480 }}
          a11y={{ label: 'workspace', describedBy: 'state' }}
        />,
      );

      // Running the layout frame fires the re-measure, which in turn schedules the repair — because
      // the pane widgets did not resolve. That is the second generation of frame that was orphaned.
      frames.run();
      expect(frames.pending()).toBeGreaterThan(0);

      view1.unmount();
      expect(() => frames.run()).not.toThrow();
      expect(ledger.afterRemoval).toBe(0);
    } finally {
      frames.restore();
    }
  });
});

describe('LMC-23 — the layout report comes in by ref, not as a dependency', () => {
  it('a consumer with an inline function does not re-run the application on every render', () => {
    const ledger: Ledger = { applies: 0, removed: false, afterRemoval: 0 };
    const engine = unresolvedEngine(ledger);
    const seen: StackApplication[] = [];
    const props = {
      engine,
      convention: CONVENTION,
      data: { bars: BARS, panes: [view(RATE)], read, pricePane: PRICE },
      a11y: { label: 'workspace', describedBy: 'state' },
    };
    // The function is NEW on every render, which is what a host writing inline hands over.
    const reported = (heightPx = 480) => (
      <ChartSurface {...props} layout={{ heightPx, onLayout: (a) => seen.push(a) }} />
    );
    const view1 = render(reported());
    const afterMount = ledger.applies;
    expect(afterMount).toBeGreaterThan(0);
    expect(seen.length).toBe(1);

    view1.rerender(reported());
    view1.rerender(reported());

    // THE DECISIVE CASE. As a dependency, every host render would cost an entire layout pass plus a
    // re-measure. By ref, the report keeps arriving and stops being a trigger.
    expect(ledger.applies).toBe(afterMount);
    expect(seen.length).toBe(1);

    // POSITIVE CONTROL: a REAL change of budget still reapplies, so the assertion above is reading
    // the function's identity and not an application that stopped happening.
    view1.rerender(reported(600));
    expect(ledger.applies).toBeGreaterThan(afterMount);
    expect(seen.length).toBe(2);
  });
});

describe('LMC-23 — the application left the component, and the re-measure returns a disposer', () => {
  const surfaceSource = readFileSync(
    join(__dirname, '..', 'src', 'react', 'surface', 'ChartSurface.tsx'),
    'utf8',
  );

  it('the hook is named and the surface no longer holds the application', () => {
    const hook = readFileSync(
      join(__dirname, '..', 'src', 'react', 'surface', 'useLayoutApply.ts'),
      'utf8',
    );
    expect(hook).toMatch(/stack\.apply\(/);
    expect(surfaceSource).toMatch(/useLayoutApply\(/);
    expect(surfaceSource).not.toMatch(/stack\.apply\(/);
  });

  it('the shared ref of the repair frame no longer exists anywhere', () => {
    // THE RATCHET. The defect was a ref written in one effect and cleaned in another; it must not
    // come back out of convenience, and its name is the most direct evidence of that.
    const mount = readFileSync(
      join(__dirname, '..', 'src', 'react', 'surface', 'useChartMount.ts'),
      'utf8',
    );
    // THE RE-MEASURE MOVED HOUSE, and the clause followed. It lives in the geometry hook since T58;
    // the ratchet on the ref's name is about the TREE, so it came to sweep the surface, the mount
    // and the geometry — pinned to a single file, it would become an empty search, and an empty
    // search passes.
    const geometry = readFileSync(
      join(__dirname, '..', 'src', 'react', 'surface', 'useSurfaceGeometry.ts'),
      'utf8',
    );
    for (const text of [surfaceSource, mount, geometry]) {
      expect(text).not.toMatch(/rowVisibilityRetryRef/);
    }
    // And the mount cancels no frame at all: whoever schedules cancels.
    expect(mount).not.toMatch(/cancelAnimationFrame/);
    // The re-measure's signature: it returns a function. Written as a string `RegExp` because the
    // shape has too many parentheses to fit legibly in a literal.
    expect(geometry).toMatch(new RegExp('const measure = useCallback\\(\\(\\): \\(\\(\\) => void\\)'));
    // And the surface does not redeclare the re-measure: a single owner.
    expect(surfaceSource).not.toMatch(/const measure = useCallback/);
    // And the layout effect disposes of what it returned.
    const hook = readFileSync(
      join(__dirname, '..', 'src', 'react', 'surface', 'useLayoutApply.ts'),
      'utf8',
    );
    expect(hook).toMatch(/dispose = measure\(\)/);
    expect(hook).toMatch(/dispose\?\.\(\)/);
  });
});
