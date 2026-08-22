/**
 * @jest-environment jsdom
 *
 * The compact grid: which cells exist, what each one is looking at, and what editing one does.
 *
 * EACH CELL IS ASKED WHAT IT IS DRAWING, not merely counted. A column of the right length whose
 * cells all subscribe to the same resolution renders perfectly and is the defect — so the recording
 * port below is read per cell, and the market travels with the resolution.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';

import { directionConvention } from '../src/domain/types';
import type { Scope } from '../src/domain/types';
import type { ChartEngine, SeriesHandle, WorkspaceChartHandle } from '../src/port/chartApi';
import type { FrameSink, HistoryRequest, HistoryResult, Unsubscribe } from '../src/port/ports';
import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import { CompactGrid } from '../src/react/workspace/CompactGrid';
import { WorkspaceSetupProvider } from '../src/react/workspace/setupContext';
import type { WorkspaceLayoutMode, WorkspaceSetup } from '../src/tabs/setup';

const CONVENTION = directionConvention({ upColor: '#0a0', downColor: '#a00' });
const MARKET: Omit<Scope, 'resolution'> = {
  instrument: 'BTC/USDT',
  venue: 'binance',
  market: 'perp',
};

function fakeEngine(): ChartEngine {
  return () =>
    ({
      panes: () => [],
      addPane: () => {
        throw new Error('a compact cell never adds a pane');
      },
      addSeries: (): SeriesHandle =>
        ({
          setData: () => undefined,
          applyOptions: () => undefined,
          priceScale: () => ({ applyOptions: () => undefined }),
          createPriceLine: () => ({ applyOptions: () => undefined }),
          removePriceLine: () => undefined,
          priceToCoordinate: () => null,
          coordinateToPrice: () => null,
          attachPrimitive: () => undefined,
          detachPrimitive: () => undefined,
          setMarkers: () => undefined,
        }) as unknown as SeriesHandle,
      applyOptions: () => undefined,
      timeScale: () => ({ fitContent: () => undefined }),
      subscribeCrosshairMove: () => undefined,
      unsubscribeCrosshairMove: () => undefined,
      remove: () => undefined,
    }) as unknown as WorkspaceChartHandle;
}

/** What each cell actually asked for, in the order it asked. */
function recordingPort(subscribed: string[]) {
  return {
    describe: () => [],
    subscribe: (scope: Scope, _sink: FrameSink): Unsubscribe => {
      subscribed.push(`${scope.instrument}·${scope.resolution}`);
      return () => undefined;
    },
    fetchBars: async (_req: HistoryRequest): Promise<HistoryResult> => ({
      bars: [],
      exhausted: true,
    }),
  };
}

const SETUP: WorkspaceSetup = {
  timeframe: '1h',
  layoutMode: 'grade',
  gridCells: ['15m', '4h'],
  panes: [],
  density: { floor: 0.05, gamma: 1.5 },
  showDensity: false,
  showProfile: false,
  autoFit: false,
  indicators: [],
  seriesStyles: {},
};

interface HarnessProps {
  readonly setup?: Partial<WorkspaceSetup>;
  readonly onChange?: (patch: Partial<WorkspaceSetup>) => void;
  readonly instrument?: string;
  readonly port: ReturnType<typeof recordingPort>;
}

function Harness({ setup, onChange, instrument, port }: HarnessProps): ReactElement {
  return (
    <WorkspaceChromeProvider>
      <WorkspaceSetupProvider setup={{ ...SETUP, ...setup }} onChange={onChange}>
        <CompactGrid
          source={{
            engine: fakeEngine(),
            port,
            scope: { ...MARKET, instrument: instrument ?? MARKET.instrument },
            convention: CONVENTION,
          }}
          timeframes={['15m', '1h', '4h']}
          heightPx={480}
        />
      </WorkspaceSetupProvider>
    </WorkspaceChromeProvider>
  );
}

const mode = (value: WorkspaceLayoutMode): Partial<WorkspaceSetup> => ({ layoutMode: value });

/** One macrotask, so each cell's seed transaction settles inside `act` instead of after the test. */
const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe('the compact grid', () => {
  it('draws one cell per declared cell when the grid mode is on', async () => {
    const subscribed: string[] = [];
    render(<Harness port={recordingPort(subscribed)} />);
    await settle();
    expect(screen.getByTestId('workspace-grid').children).toHaveLength(2);
  });

  it('draws nothing at all in focus mode', async () => {
    const subscribed: string[] = [];
    render(<Harness port={recordingPort(subscribed)} setup={mode('foco')} />);
    await settle();
    expect(screen.queryByTestId('workspace-grid')).toBeNull();
    // POSITIVE CONTROL for the clause above: no cell opened a session either.
    expect(subscribed).toEqual([]);
  });

  it('draws nothing before a market has been chosen', async () => {
    const subscribed: string[] = [];
    render(<Harness port={recordingPort(subscribed)} instrument="" />);
    await settle();
    expect(screen.queryByTestId('workspace-grid')).toBeNull();
    expect(subscribed).toEqual([]);
  });

  it('gives every cell the same market and its OWN resolution', async () => {
    const subscribed: string[] = [];
    render(<Harness port={recordingPort(subscribed)} />);
    await settle();
    expect(subscribed).toEqual(['BTC/USDT·15m', 'BTC/USDT·4h']);
  });

  it('swaps the resolution of the cell that was edited, and leaves the others alone', async () => {
    const patches: Partial<WorkspaceSetup>[] = [];
    const subscribed: string[] = [];
    render(<Harness port={recordingPort(subscribed)} onChange={(patch) => patches.push(patch)} />);
    await settle();
    const groups = screen.getAllByRole('radiogroup', { name: /BTC\/USDT/ });
    fireEvent.click(within(groups[1]).getByRole('radio', { name: '1h' }));
    expect(patches).toEqual([{ gridCells: ['15m', '1h'] }]);
  });

  it('removes the cell that was dropped, by position and not by resolution', async () => {
    const patches: Partial<WorkspaceSetup>[] = [];
    const subscribed: string[] = [];
    render(
      <Harness
        port={recordingPort(subscribed)}
        setup={{ gridCells: ['15m', '4h', '15m'] }}
        onChange={(patch) => patches.push(patch)}
      />,
    );
    await settle();
    // The LAST of the two identical resolutions: dropping by value would take the first.
    fireEvent.click(screen.getAllByRole('button', { name: /Remove/ })[2]);
    expect(patches).toEqual([{ gridCells: ['15m', '4h'] }]);
  });

  it('withholds the remove control from the last cell, so the mode cannot be emptied', async () => {
    const subscribed: string[] = [];
    render(<Harness port={recordingPort(subscribed)} setup={{ gridCells: ['1h'] }} />);
    await settle();
    expect(screen.queryAllByRole('button', { name: /Remove/ })).toHaveLength(0);
  });

  it('asks the row for width the way the surface beside it asks — `width`, never `flex`', async () => {
    // THE DECLARATION IS ASSERTABLE EVEN THOUGH THE LAYOUT IS NOT. jsdom computes no flex
    // distribution, so the 0 px column it produced on screen cannot be reproduced here — but what
    // DECIDED that geometry is this declaration, and jsdom serves it: `flex: 1` is `1 1 0%`, a basis
    // of zero shrinks by zero, and every negative pixel of the row fell on this column. The pair of
    // clauses below is the whole of the fix measured in the browser, held where the suite runs.
    const subscribed: string[] = [];
    render(<Harness port={recordingPort(subscribed)} />);
    await settle();
    const column = screen.getByTestId('workspace-grid');
    expect(column).toHaveStyle({ width: '100%', minWidth: '0' });
    // And the way it must NOT ask. Without this line the clause above survives `flex: 1` ARRIVING
    // ALONGSIDE the width — a shorthand that resets the basis to zero again, which is the same
    // defect wearing the same numbers.
    expect(column.style.flex).toBe('');
    // And the third way to reach the same 0 px, which neither clause above reads: a cap of zero
    // beats `width: 100%` outright. Measured in Chromium: `surface=1058, grid=0 of row=1100` — the
    // original defect's own numbers, from a different property.
    expect(column.style.maxWidth).toBe('');
  });
});

/**
 * The grid column's declaration, serialised as it was before the shared value.
 *
 * Captured from the tree BEFORE the collapse. `width: 100%` rather than `flex` is a defect this
 * column already paid for once — a basis of zero shrank it to 0 px — so the property has to survive
 * the collapse, and it is only visible after the direction.
 */
describe('the column stack inside the grid', () => {
  it('serialises the grid column exactly as it did before', async () => {
    const subscribed: string[] = [];
    render(<Harness port={recordingPort(subscribed)} />);
    await settle();
    expect(screen.getByTestId('workspace-grid').getAttribute('style')).toBe(
      'display: flex; flex-direction: column; width: 100%; min-width: 0; height: 480px;',
    );
  });
});
