/**
 * @jest-environment jsdom
 *
 * LMC-23 — the reference line, and THE REF WRITE DURING RENDER.
 *
 * THE SHAPE DEFECT THIS FILE CLOSES. The list of reference lines was cached in a ref that the
 * COMPONENT BODY overwrote when the key differed, and read back in the same render. Writing to a
 * ref during render and depending on the result is the pattern React's documentation marks as
 * unsupported: a render may be discarded or repeated, and the ref does not undo. `useMemo` says the
 * same thing through the mechanism React supports.
 *
 * "SAME SEMANTICS" IS NOT ASSERTABLE BY ARRAY IDENTITY FROM OUTSIDE — the list never leaves the
 * hook. What leaves is its CONSEQUENCE, and that is what these cases measure: while the key does
 * not change, no line is removed and none is created. A host that rebuilds the pane objects on
 * every render — the common case, and what this chart does on every cursor movement — cannot cost
 * a remove/create pair per render.
 */
import { render } from '@testing-library/react';

import { directionConvention, paneId, seriesId, utcSeconds } from '../src/domain/types';
import type { Bar, PaneSpec } from '../src/domain/types';
import type {
  ChartEngine,
  PaneHandle,
  PriceLineHandle,
  SeriesHandle,
  WorkspaceChartHandle,
} from '../src/port/chartApi';
import { ChartSurface, type PaneView, type SeriesReader } from '../src/react/surface/ChartSurface';

/** A count of CALLS, not live state: what is measured here is redone work, not the result. */
interface Ledger {
  created: number[];
  removed: number;
}

function countingEngine(ledger: Ledger): ChartEngine {
  return () => {
    let nextPane = 1;
    const makePane = (index: number): PaneHandle => ({
      paneIndex: () => index,
      getStretchFactor: () => 1,
      setStretchFactor: () => undefined,
      setPreserveEmptyPane: () => undefined,
      moveTo: () => undefined,
      getHTMLElement: () => null,
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
        createPriceLine: (line): PriceLineHandle => {
          ledger.created.push(line.price);
          return { applyOptions: () => undefined };
        },
        removePriceLine: () => {
          ledger.removed += 1;
        },
        priceToCoordinate: () => null,
        coordinateToPrice: () => null,
        attachPrimitive: () => undefined,
        detachPrimitive: () => undefined,
      }),
      applyOptions: () => undefined,
      subscribeCrosshairMove: () => undefined,
      unsubscribeCrosshairMove: () => undefined,
      remove: () => undefined,
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
const BARS: readonly Bar[] = [
  { time: utcSeconds(1_700_000_000), open: 100, high: 110, low: 95, close: 105 },
];
const read: SeriesReader = () => [1];

/**
 * A NEW PANE ON EVERY CALL, with the SAME declaration.
 *
 * This is the case that separates memoisation by key from memoisation by identity: the host
 * rebuilds the objects, the declaration has not changed, and the reference line should feel
 * nothing.
 */
function lane(reference?: number, label = 'Lane'): PaneView {
  const spec: PaneSpec = {
    id: paneId('lane'),
    title: 'Indicator',
    format: { kind: 'custom', format: (v) => v.toFixed(0), minMove: 0.01 },
    targetHeightPx: 90,
    defaultVisible: true,
    ...(reference === undefined ? {} : { referenceLine: reference }),
    series: [{ id: seriesId('lane-a'), label, shape: 'line', color: '#4fc3f7' }],
  };
  return { spec, visible: true, heightPx: 90, lastUsedAt: 1 };
}

function mounted(ledger: Ledger, first: PaneView) {
  const engine = countingEngine(ledger);
  const props = {
    engine,
    convention: CONVENTION,
    layout: { heightPx: 400 },
    a11y: { label: 'workspace', describedBy: 'state' },
  };
  const withPanes = (panes: readonly PaneView[]) => (
    <ChartSurface {...props} data={{ bars: BARS, panes, read, pricePane: PRICE }} />
  );
  const view = render(withPanes([first]));
  return {
    rerenderWith: (next: PaneView): void => {
      view.rerender(withPanes([next]));
    },
  };
}

describe('LMC-23 — the derived list does not change while the key does not change', () => {
  it('new pane objects with the SAME declaration do not cost a remove/create pair', () => {
    const ledger: Ledger = { created: [], removed: 0 };
    const { rerenderWith } = mounted(ledger, lane(50));
    expect(ledger.created).toEqual([50]);

    // Three host renders, three new pane objects, the same declaration. On a chart that re-renders
    // on every hovered pixel, the version without a cache would do this thirty times a second.
    rerenderWith(lane(50));
    rerenderWith(lane(50));
    rerenderWith(lane(50));

    expect(ledger.created).toEqual([50]);
    expect(ledger.removed).toBe(0);
  });

  it('and what is NOT in the key costs nothing either: relabelling a series moves no line', () => {
    // The key is `id=referenceLine`, sorted. A swapped series label is a new declaration for the
    // object and the SAME declaration for the reference line.
    const ledger: Ledger = { created: [], removed: 0 };
    const { rerenderWith } = mounted(ledger, lane(50, 'Lane'));

    rerenderWith(lane(50, 'Another label'));

    expect(ledger.created).toEqual([50]);
    expect(ledger.removed).toBe(0);
  });

  it('CONTROL POSITIVE: changing the declaration still swaps the line', () => {
    // Without this half, a hook that simply never recomputed would pass the two cases above — and
    // "does not change when the key does not change" would become "never changes".
    const ledger: Ledger = { created: [], removed: 0 };
    const { rerenderWith } = mounted(ledger, lane(50));

    rerenderWith(lane(0));

    expect(ledger.created).toEqual([50, 0]);
    expect(ledger.removed).toBe(1);
  });

  it('CONTROL POSITIVE: removing the declaration erases the line and creates no other', () => {
    const ledger: Ledger = { created: [], removed: 0 };
    const { rerenderWith } = mounted(ledger, lane(50));

    rerenderWith(lane(undefined));

    expect(ledger.created).toEqual([50]);
    expect(ledger.removed).toBe(1);
  });
});
