/**
 * @jest-environment jsdom
 *
 * FILL-06 (spec AC 4a) — an idle re-render does not rewrite the drawn data.
 *
 * WHY THIS IS NOT A PIXEL TEST, AND CANNOT BE. Rewriting the same payload produces the same picture:
 * a canvas read after an idle re-render is identical whether the data was written once or thirty-
 * seven times. The cost is real and invisible — every `setData` re-enters the base library, re-scans
 * the series and re-lays the axis — so the only instrument that can see it counts the WRITES.
 *
 * WHAT WAS MEASURED, and the first measurement was of the harness rather than the code. Sampling the
 * counter at the first write reads 37 and sampling it once the mount SETTLES reads 111 — the mount
 * is asynchronous, so an early sample debits the rest of the mount to whatever happened next.
 * `settled()` below is that correction, and without it this suite would report a rewrite that never
 * occurred.
 *
 * THE RE-RENDER THAT MATTERS IS NOT THE ONE FROM OUTSIDE. A host that memoises its prop groups is
 * saved by `React.memo` on the composition: the body never re-renders and nothing is rewritten,
 * with or without the fix. What the fix closes is the re-render the composition does to ITSELF —
 * an alert level, a notice, a tab — because those rebuild the reading closures, and the memo that
 * writes the data hangs off them. Measured by deletion: with the readers built inline, adding one
 * horizontal price line takes the write count from 111 to 148, and a second line adds the same
 * again. A horizontal line has nothing to do with a series payload.
 *
 * AND THIS FEATURE MULTIPLIES IT. The lane widening takes the series count from 43 to 505 and this
 * batch adds a second closure of the same shape (`readColors`), so what used to be a wasted pass
 * over 43 series is a wasted pass over 505.
 *
 * THE HOST BELOW MEMOISES THE WAY A HOST MUST. `docs/explanation/react-workspace.md` says so and
 * `example/App.tsx` does it. A host that hands over inline groups is beyond what the composition
 * can fix — `resolved` is a function of the `studies` object it was given — and that is written
 * down rather than asserted here.
 */
import { useMemo, useState, type ReactElement } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

import { ChartWorkspace } from '../src/react/workspace/ChartWorkspace';
import type { WorkspaceStudies } from '../src/react/workspace/ChartWorkspace';
import { resolutionPolicy } from '../src/catalogue/sources';
import type { PlottableSource, SourceLookup } from '../src/catalogue/sources';
import { resolveSources } from '../src/indicator/resolution';
import { seriesId, utcSeconds } from '../src/domain/types';
import type { Bar, PaneSpec, Point, Scope } from '../src/domain/types';
import type { ChartEngine, SeriesHandle, WorkspaceChartHandle } from '../src/port/chartApi';
import type { FrameSink, HistoryResult, MarketDataPort, Unsubscribe } from '../src/port/ports';
import type { WorkspaceSetupPolicy } from '../src/tabs/setup';

const CATALOGUE: WorkspaceSetupPolicy = {
  catalogue: [
    { id: 'price', defaultVisible: true, heightPx: 200, title: 'Price' },
    { id: 'volume', defaultVisible: true, heightPx: 90, title: 'Volume' },
  ],
  servedTimeframes: ['1h'],
  gridFallback: ['1h'],
  maxGridCells: 4,
  density: { floor: 0.1, gamma: 1 },
  showDensity: false,
  showProfile: false,
  autoFit: true,
  coerceIndicators: () => ['study'],
};

const BARS: readonly Bar[] = Array.from({ length: 8 }, (_unused, at) => ({
  time: utcSeconds(1000 + at * 60),
  open: 10 + at,
  high: 12 + at,
  low: 9 + at,
  close: 11 + at,
  volume: 100 + at,
}));

const PORT: MarketDataPort = {
  describe: () => [],
  subscribe: (_scope: Scope, _sink: FrameSink): Unsubscribe => () => undefined,
  fetchBars: async (): Promise<HistoryResult> => ({ bars: BARS, exhausted: true }),
};

/** A study of three lines, one of which carries a colour per point — this batch's own channel. */
const SOURCE: PlottableSource = {
  id: 'study',
  label: 'Study',
  placement: 'own-pane',
  series: () =>
    ['a', 'b', 'c'].map((key, plot) => ({
      spec: { id: seriesId(key), label: key, shape: 'line' as const, color: '#4c9aff', lineWidth: 1 as const },
      provider: {
        id: seriesId(key),
        compute: (bars: readonly Bar[]): readonly Point[] =>
          bars.map((bar, at) =>
            ({
              time: bar.time,
              value: at + plot,
              ...(plot === 0 ? { color: at % 2 === 0 ? '#ff0000' : '#0000ff' } : {}),
            }) as unknown as Point,
          ),
      },
    })),
} as unknown as PlottableSource;

const LOOKUP: SourceLookup = (id: string) => (id === 'study' ? SOURCE : undefined);
const POLICY = resolutionPolicy({ lanes: 6 });

interface Counter {
  writes: number;
}

/** Every payload written to any series, counted. The candles are one of them. */
function countingEngine(counter: Counter): ChartEngine {
  const pane = (index: number) => ({
    setStretchFactor: () => undefined,
    getStretchFactor: () => 1,
    getHTMLElement: () => null,
    setPreserveEmptyPane: () => undefined,
    moveTo: () => undefined,
    paneIndex: () => index,
  });
  return () => {
    let panes = 1;
    return {
      panes: () => Array.from({ length: panes }, (_unused, index) => pane(index)),
      addPane: () => {
        panes += 1;
        return pane(panes - 1);
      },
      addSeries: (): SeriesHandle =>
        ({
          setData: () => {
            counter.writes += 1;
          },
          applyOptions: () => undefined,
          priceScale: () => ({ applyOptions: () => undefined }),
          createPriceLine: () => ({ applyOptions: () => undefined }),
          removePriceLine: () => undefined,
          priceToCoordinate: () => null,
          coordinateToPrice: () => null,
          attachPrimitive: () => undefined,
          detachPrimitive: () => undefined,
        }) as unknown as SeriesHandle,
      applyOptions: () => undefined,
      timeScale: () => ({ fitContent: () => undefined }),
      subscribeCrosshairMove: () => undefined,
      unsubscribeCrosshairMove: () => undefined,
      remove: () => undefined,
    } as unknown as WorkspaceChartHandle;
  };
}

const PANES: readonly PaneSpec[] = [
  {
    id: 'price',
    title: 'Price',
    format: { kind: 'price', minMove: 0.01 },
    defaultVisible: true,
    series: [],
  } as unknown as PaneSpec,
];

/** A HOST, memoising the way `example/App.tsx` does, with a button that re-renders and nothing else. */
function Host({ engine }: { readonly engine: ChartEngine }): ReactElement {
  const [tick, setTick] = useState(0);
  const [symbol, setSymbol] = useState('AAA-BBB');
  const studies = useMemo<WorkspaceStudies>(
    () => ({
      catalogue: [
        {
          id: 'study',
          label: 'Study',
          category: 'Test',
          provider: { id: seriesId('study'), compute: () => [] },
        },
      ],
      resolve: (ids: readonly string[], bars: readonly Bar[]) => resolveSources(ids, LOOKUP, bars, POLICY),
      capacity: 6,
      lanes: { plots: 3, colors: ['#f5a623', '#4c9aff', '#c792ea'], heightPx: 120 },
    }),
    [],
  );
  const data = useMemo(() => ({ port: PORT, engine, symbol }), [engine, symbol]);
  const layout = useMemo(() => ({ heightPx: 480 }), []);
  return (
    <>
      <button type="button" data-testid="rerender" onClick={() => setTick(tick + 1)}>
        {`render ${tick}`}
      </button>
      <button type="button" data-testid="resymbol" onClick={() => setSymbol('CCC-DDD')}>
        move
      </button>
      <ChartWorkspace catalogue={CATALOGUE} panes={PANES} data={data} layout={layout} studies={studies} />
    </>
  );
}

/**
 * The count once it STOPS MOVING, not the count at the first tick.
 *
 * The mount is asynchronous — the port seeds a window, the layout applies, the handles are
 * published — so sampling at the first write reads a number the sequence has not finished producing
 * and then debits the difference to the re-render that followed. Measured: 37 at the first tick and
 * 111 once the mount settles, so a harness that sampled early would have reported a rewrite that
 * never happened.
 */
async function settled(counter: Counter): Promise<number> {
  let previous = -1;
  for (let round = 0; round < 30 && counter.writes !== previous; round += 1) {
    previous = counter.writes;
    // eslint-disable-next-line no-await-in-loop
    await act(async () => {
      await new Promise((resume) => setTimeout(resume, 0));
    });
  }
  return counter.writes;
}

describe('FILL-06 — nothing changed, so nothing is rewritten', () => {
  it('writes the drawn data at mount and NOT AGAIN on a re-render that changed nothing', async () => {
    const counter: Counter = { writes: 0 };
    render(<Host engine={countingEngine(counter)} />);
    const afterMount = await settled(counter);
    expect(afterMount).toBeGreaterThan(0);

    act(() => {
      screen.getByTestId('rerender').click();
    });
    await waitFor(() => expect(screen.getByTestId('rerender')).toHaveTextContent('render 1'));
    const afterIdle = await settled(counter);

    act(() => {
      screen.getByTestId('rerender').click();
    });
    await waitFor(() => expect(screen.getByTestId('rerender')).toHaveTextContent('render 2'));
    await settled(counter);

    // The re-render HAPPENED — the button's own text is the witness — and not one payload followed
    // it. Measured before this task, the same mount wrote every series again on each idle render.
    expect(afterIdle).toBe(afterMount);
    expect(counter.writes).toBe(afterMount);
  });

  it('does not rewrite every series because a PRICE LINE was added', async () => {
    // The re-render that actually happens in use. A host may memoise everything it hands over and
    // the composition still re-renders itself: an alert level, a notice, a tab. Every one of those
    // rebuilds the reading closures, and the memo that writes the data hangs off them — so adding a
    // horizontal line rewrote all 505 series, which has nothing to do with a horizontal line.
    const counter: Counter = { writes: 0 };
    render(<Host engine={countingEngine(counter)} />);
    const afterMount = await settled(counter);

    act(() => {
      screen.getByRole('button', { name: 'Add line' }).click();
    });
    const afterLevel = await settled(counter);

    // Verified by deletion: with the readers built inline instead of memoised, this reads more than
    // it did at mount, and the second click below adds the same amount again.
    expect(afterLevel).toBe(afterMount);

    act(() => {
      screen.getByRole('button', { name: 'Add line' }).click();
    });
    expect(await settled(counter)).toBe(afterMount);
  });

  it('still writes when the data actually changes, so the memo is not a mute button', async () => {
    // CONTROL POSITIVE, and the necessary half: an effect that never fires again would satisfy the
    // clause above perfectly and leave the chart frozen on the first window it was given. The same
    // button-and-count harness, with the one thing that IS a change — another market.
    const counter: Counter = { writes: 0 };
    render(<Host engine={countingEngine(counter)} />);
    const afterMount = await settled(counter);
    expect(afterMount).toBeGreaterThan(0);

    act(() => {
      screen.getByTestId('resymbol').click();
    });
    const afterMove = await settled(counter);

    expect(afterMove).toBeGreaterThan(afterMount);
  });
});
