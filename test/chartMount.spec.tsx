/**
 * @jest-environment jsdom
 *
 * LMC-23 — the mount as a named hook, and strict mode's DOUBLE CYCLE.
 *
 * WHY THE DOUBLE CYCLE IS THE CASE THAT MATTERS. Strict mode mounts, tears down and mounts again —
 * all in the SAME commit, before any state update is applied. It is React's rehearsal of what will
 * happen on a real remount, and it is where an orphan chart is born: if the teardown does not see
 * the chart the first mount created, it stays alive, invisible and forever, with its canvases
 * hanging off the document.
 *
 * The app mounts the entire tree under `StrictMode` [`apps/web/src/index.tsx`], so this is not a
 * laboratory case: it is the production path in development.
 */
import { StrictMode } from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render } from '@testing-library/react';

import { directionConvention, paneId, seriesId, utcSeconds } from '../src/domain/types';
import type { Bar, PaneSpec } from '../src/domain/types';
import type { ChartEngine, SeriesHandle, WorkspaceChartHandle } from '../src/port/chartApi';
import { ChartSurface, type PaneView, type SeriesReader } from '../src/react/surface/ChartSurface';
import { collectSources } from './gates/sourceScan';

interface Ledger {
  created: number;
  removed: number;
  subscribed: number;
  unsubscribed: number;
}

function ledgerEngine(ledger: Ledger): ChartEngine {
  return () => {
    ledger.created += 1;
    let nextPane = 1;
    const makePane = (index: number) => ({
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
        createPriceLine: () => ({ applyOptions: () => undefined }),
        removePriceLine: () => undefined,
        priceToCoordinate: () => null,
        coordinateToPrice: () => null,
        attachPrimitive: () => undefined,
        detachPrimitive: () => undefined,
      }),
      applyOptions: () => undefined,
      subscribeCrosshairMove: () => {
        ledger.subscribed += 1;
      },
      unsubscribeCrosshairMove: () => {
        ledger.unsubscribed += 1;
      },
      remove: () => {
        ledger.removed += 1;
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

function surface(ledger: Ledger): React.ReactElement {
  return (
    <ChartSurface
      engine={ledgerEngine(ledger)}
      convention={CONVENTION}
      data={{ bars: BARS, panes: [view(RATE)], read, pricePane: PRICE }}
      layout={{ heightPx: 480 }}
      a11y={{ label: 'workspace', describedBy: 'state' }}
    />
  );
}

const empty = (): Ledger => ({ created: 0, removed: 0, subscribed: 0, unsubscribed: 0 });

describe('LMC-23 — mount, tear down and mount again leaves no orphan chart', () => {
  it('under strict mode the rehearsal happens, and exactly ONE live chart is left', () => {
    const ledger = empty();
    const view1 = render(<StrictMode>{surface(ledger)}</StrictMode>);

    // The rehearsal HAPPENED — without this the case would be about strict mode not being on, and
    // it would pass vacuously in an environment that does not run it.
    expect(ledger.created).toBeGreaterThan(1);
    // And one is left. An orphan chart is the difference between created and removed exceeding one.
    expect(ledger.created - ledger.removed).toBe(1);

    view1.unmount();
    // Unmounted, nothing is left. This is the number the defect would violate: a live chart with
    // no tree.
    expect(ledger.created).toBe(ledger.removed);
  });

  it('the crosshair is unsubscribed as many times as it was subscribed', () => {
    // The OTHER half of the unmount. A subscription that survived would keep the component
    // reachable from the chart, and the chart reachable from the base library.
    const ledger = empty();
    const view1 = render(<StrictMode>{surface(ledger)}</StrictMode>);
    view1.unmount();
    expect(ledger.subscribed).toBe(ledger.created);
    expect(ledger.unsubscribed).toBe(ledger.subscribed);
  });

  it('without strict mode, one mount and one removal — the simple path stays simple', () => {
    // POSITIVE CONTROL for the pair above: the double rehearsal is strict mode's, not the
    // surface's.
    const ledger = empty();
    const view1 = render(surface(ledger));
    expect(ledger.created).toBe(1);
    expect(ledger.removed).toBe(0);

    view1.unmount();
    expect(ledger.removed).toBe(1);
  });

  it('remounting by a new key creates another chart and tears the old one down, one for one', () => {
    // The REAL remount, which is what strict mode's rehearsal foretells. Without the synchronous
    // view, the teardown would read a state not yet applied and the first chart would stay alive.
    const ledger = empty();
    const view1 = render(<div key="a">{surface(ledger)}</div>);
    expect(ledger.created - ledger.removed).toBe(1);

    view1.rerender(<div key="b">{surface(ledger)}</div>);
    expect(ledger.created).toBe(2);
    expect(ledger.removed).toBe(1);

    view1.unmount();
    expect(ledger.created).toBe(ledger.removed);
  });
});

describe('LMC-23 — the mount left the component', () => {
  it('the hook is named, consumes the factory, and the surface no longer creates anything', () => {
    const sources = collectSources(join(__dirname, '..', 'src'));
    const hook = sources.find((source) => source.file === 'react/surface/useChartMount.ts');
    expect(hook).toBeDefined();
    expect(hook?.text).toMatch(/createChartSurface/);
    // Publishes the handles at the end: whoever depends on them never sees half a chart.
    expect(hook?.text).toMatch(/publish\(created\)/);

    const surfaceSource = sources.find((source) => source.file === 'react/surface/ChartSurface.tsx');
    expect(surfaceSource).toBeDefined();
    expect(surfaceSource?.text).toMatch(/useChartMount\(/);
    expect(surfaceSource?.text).not.toMatch(/createChartSurface/);
    expect(surfaceSource?.text).not.toMatch(/subscribeCrosshairMove/);
  });

  it('the mount spec is DERIVED from the factory input, not retyped', () => {
    // Two declarations of one contract diverge the first time either side gains a field, and the
    // silent side is the one nobody notices. The type is an `Omit` of the factory input.
    const hook = readFileSync(
      join(__dirname, '..', 'src', 'react', 'surface', 'useChartMount.ts'),
      'utf8',
    );
    expect(hook).toMatch(/Omit<SeriesFactoryInput, 'host' \| 'panes'>/);
    expect(hook).not.toMatch(/readonly engine: ChartEngine/);
  });
});
