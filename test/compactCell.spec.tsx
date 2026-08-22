/**
 * @jest-environment jsdom
 *
 * The compact grid cell, held to the property the grid exists for: INDEPENDENT SCOPES.
 *
 * Each cell opens its own `openScope` — subscribe first, then seed — and closes it as a unit on
 * unmount (I7/I8). A cell that leaked its subscription would keep a socket alive for a chart
 * nobody sees; a cell that seeded before subscribing would reintroduce the seam defect the
 * transaction exists to close. Both are pinned here against a recording port, not assumed.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentType, ReactNode } from 'react';

import { directionConvention, utcSeconds } from '../src/domain/types';
import type { Bar, Scope } from '../src/domain/types';
import type { FrameSink, HistoryRequest, HistoryResult, Unsubscribe } from '../src/port/ports';
import type { ChartEngine, SeriesHandle, WorkspaceChartHandle } from '../src/port/chartApi';
import { CompactCell } from '../src/react/CompactCell';
import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import { DEFAULT_WORKSPACE_THEME } from '../src/react/theme';
import type { WorkspaceTheme } from '../src/react/theme';

const CONVENTION = directionConvention({ upColor: '#0a0', downColor: '#a00' });

const bar = (time: number, close: number, volume?: number): Bar => ({
  time: utcSeconds(time),
  open: close - 1,
  high: close + 1,
  low: close - 2,
  close,
  volume,
});

interface SeriesRecord {
  readonly shape: string;
  readonly data: Array<{ time: number; value?: number; close?: number; color?: string }>;
}

function fakeEngine() {
  const series: SeriesRecord[] = [];
  let fitContentCalls = 0;
  let removed = 0;
  const engine: ChartEngine = () => {
    const chart: WorkspaceChartHandle = {
      panes: () => [],
      addPane: () => {
        throw new Error('a compact cell never adds a pane');
      },
      addSeries: (shape): SeriesHandle => {
        const record: SeriesRecord = { shape, data: [] };
        series.push(record);
        return {
          setData: (data) => {
            record.data.length = 0;
            record.data.push(...(data as SeriesRecord['data']));
          },
          applyOptions: () => undefined,
          priceScale: () => ({ applyOptions: () => undefined }),
          createPriceLine: () => ({ applyOptions: () => undefined }),
          removePriceLine: () => undefined,
          priceToCoordinate: () => null,
          coordinateToPrice: () => null,
          attachPrimitive: () => undefined,
          detachPrimitive: () => undefined,
        };
      },
      applyOptions: () => undefined,
      timeScale: () => ({
        fitContent: () => {
          fitContentCalls += 1;
        },
      }),
      subscribeCrosshairMove: () => undefined,
      unsubscribeCrosshairMove: () => undefined,
      remove: () => {
        removed += 1;
      },
    };
    return chart;
  };
  return {
    engine,
    series,
    fitContent: () => fitContentCalls,
    removed: () => removed,
  };
}

/** A port that RECORDS: which scopes were subscribed, and which were released. */
function recordingPort(barsByResolution: Record<string, readonly Bar[]>) {
  const subscribed: string[] = [];
  const released: string[] = [];
  const order: string[] = [];
  return {
    log: { subscribed, released, order },
    describe: () => [],
    subscribe: (scope: Scope, _sink: FrameSink): Unsubscribe => {
      subscribed.push(scope.resolution);
      order.push(`subscribe:${scope.resolution}`);
      return () => {
        released.push(scope.resolution);
      };
    },
    fetchBars: async (req: HistoryRequest): Promise<HistoryResult> => {
      order.push(`fetch:${req.scope.resolution}`);
      return { bars: barsByResolution[req.scope.resolution] ?? [], exhausted: true };
    },
  };
}

const SCOPE: Scope = { instrument: 'AAA/BBB', resolution: '15m', venue: 'v', market: 'm' };

/** One macrotask, so the whole seed-transaction microtask chain settles inside `act`. */
const flush = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

async function mount(
  overrides: Partial<Parameters<typeof CompactCell>[0]> = {},
  wrapper?: ComponentType<{ children: ReactNode }>,
) {
  const fakes = fakeEngine();
  const port = recordingPort({
    '15m': [bar(100, 10, 5), bar(160, 12, 7)],
    '1d': [bar(100, 20)],
  });
  const onTimeframe: string[] = [];
  const onRemove = { calls: 0 };
  const view = render(
    <CompactCell
      engine={fakes.engine}
      port={port}
      scope={SCOPE}
      title="AAA"
      timeframes={['15m', '1h', '1d']}
      onTimeframe={(tf) => onTimeframe.push(tf)}
      onRemove={() => {
        onRemove.calls += 1;
      }}
      convention={CONVENTION}
      {...overrides}
    />,
    wrapper === undefined ? undefined : { wrapper },
  );
  await flush();
  return { view, fakes, port, onTimeframe, onRemove };
}

/**
 * THE THIRD OCCURRENCE of the same role declared without a keyboard.
 *
 * The cell declares `role="radiogroup"` over the timeframes and answered no arrow at all — three
 * buttons, three tab stops, and no way to jump. And the cell's reading (how many bars, how much it
 * moved) sat drawn beside the chart with no tie to it at all: whoever reads the screen heard the
 * name of the image role and nothing of the number that matters.
 */
describe('LMC-61 and LMC-62 — the timeframes’ radio group', () => {
  const radios = () => screen.getAllByRole('radio');

  it('the horizontal arrow crosses the group, wraps and CHECKS what receives focus', async () => {
    const { onTimeframe } = await mount();
    const rail = screen.getByRole('radiogroup');
    radios()[0].focus();

    fireEvent.keyDown(rail, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByTestId('compact-cell-tf-1h'));
    fireEvent.keyDown(rail, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByTestId('compact-cell-tf-1d'));
    // Sticking at the end is indistinguishable from a handler that was never wired.
    fireEvent.keyDown(rail, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByTestId('compact-cell-tf-15m'));

    // AUTOMATIC ACTIVATION: `role="radio"` promises that focus and checking travel together.
    // Separating them would make the reader announce "not checked" for the item the person has
    // just reached.
    expect(onTimeframe).toEqual(['1h', '1d', '15m']);
  });

  it('Home goes to the first and End to the last', async () => {
    await mount();
    const rail = screen.getByRole('radiogroup');
    radios()[0].focus();

    fireEvent.keyDown(rail, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByTestId('compact-cell-tf-1d'));
    fireEvent.keyDown(rail, { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByTestId('compact-cell-tf-15m'));
  });

  it('the VERTICAL arrow is not this group’s, and it does not swallow it', async () => {
    await mount();
    const rail = screen.getByRole('radiogroup');
    radios()[0].focus();

    fireEvent.keyDown(rail, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('compact-cell-tf-15m'));
    expect(fireEvent.keyDown(rail, { key: 'ArrowDown' })).toBe(true);
    expect(fireEvent.keyDown(rail, { key: 'ArrowRight' })).toBe(false);
  });

  it('ONE tab stop, on the checked item', async () => {
    await mount();
    // Three timeframes cost three Tabs; the arrow exists to remove that cost, and the `tabindex`
    // is what makes it necessary instead of decorative.
    expect(radios().map((radio) => radio.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('with the cell’s timeframe OUTSIDE the list, the stop falls back to the first', async () => {
    // CONTROL POSITIVE: nothing checked. Without the fallback the whole group would leave the
    // tab order.
    await mount({ timeframes: ['1h', '4h'] });
    expect(radios().every((radio) => radio.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(radios().map((radio) => radio.getAttribute('tabindex'))).toEqual(['0', '-1']);
  });
});

describe('CompactCell — the cell’s reading describes the drawn screen', () => {
  it('the chart points at the status text by description', async () => {
    await mount();
    const chart = screen.getByTestId('compact-cell-chart');
    const status = screen.getByTestId('compact-cell-status');

    // Without the tie, whoever reads the screen hears "AAA · 15m" and nothing of the number that
    // matters — it sits a paragraph away in reading order, with nothing joining the two.
    expect(chart.getAttribute('aria-describedby')).toBe(status.id);
    expect(status.id).not.toBe('');
    expect(status).toHaveTextContent('2 bars');
  });
});

describe('CompactCell — its own scope, opened and closed as a unit', () => {
  it('subscribes BEFORE fetching, in the timeframe of the CELL', async () => {
    const { port } = await mount();
    expect(port.log.order[0]).toBe('subscribe:15m');
    expect(port.log.order[1]).toBe('fetch:15m');
  });

  it('closes its session on unmount (I7/I8) and removes its chart', async () => {
    const { view, port, fakes } = await mount();
    expect(port.log.released).toEqual([]);
    view.unmount();
    expect(port.log.released).toEqual(['15m']);
    expect(fakes.removed()).toBe(1);
  });

  it('reopens on a scope change and releases the OLD session, never the new one', async () => {
    const { view, port, fakes } = await mount();
    view.rerender(
      <CompactCell
        engine={fakes.engine}
        port={port}
        scope={{ ...SCOPE, resolution: '1d' }}
        title="AAA"
        timeframes={['15m', '1h', '1d']}
        onTimeframe={() => undefined}
        convention={CONVENTION}
      />,
    );
    await flush();
    expect(port.log.subscribed).toEqual(['15m', '1d']);
    expect(port.log.released).toEqual(['15m']);
  });

  it('draws candles and volume from the seeded window, and fits it on screen', async () => {
    const { fakes } = await mount();
    const [candles, volume] = fakes.series;
    expect(candles.shape).toBe('candlestick');
    expect(candles.data).toHaveLength(2);
    expect(volume.shape).toBe('histogram');
    // Volume rows exist only for bars that REPORT volume — a bar without one contributes nothing.
    expect(volume.data).toHaveLength(2);
    expect(volume.data[0].color).toBe(CONVENTION.upColor);
    expect(fakes.fitContent()).toBe(1);
  });

  it('states its reading in the status line', async () => {
    await mount();
    // 10 -> 12 over the window: +20.00%, and the count is the window's, not a hard-coded string.
    expect(screen.getByTestId('compact-cell-status')).toHaveTextContent('2 bars · +20.00%');
  });

  it('owns TF chips as an exclusive group NAMED for its market, and reports the switch', async () => {
    const { onTimeframe } = await mount();
    const group = screen.getByRole('radiogroup', { name: 'Timeframe of AAA' });
    expect(group).toBeInTheDocument();
    expect(screen.getByTestId('compact-cell-tf-15m')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('compact-cell-tf-1d')).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByTestId('compact-cell-tf-1d'));
    expect(onTimeframe).toEqual(['1d']);
  });

  it('offers removal only when the host wires it, named for the market', async () => {
    const { onRemove, view } = await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Remove the AAA cell' }));
    expect(onRemove.calls).toBe(1);
    view.unmount();
    // CONTROL POSITIVE of the absence: without a handler there is no dead button.
    await mount({ onRemove: undefined });
    expect(screen.queryByTestId('compact-cell-remove')).toBeNull();
  });
});

/**
 * The theme is READ, not received — and the pair of mounts is what makes that measurable.
 *
 * A cell that ignored the mounted chrome and always painted the package default would pass the
 * second assertion alone; a cell that demanded a provider would pass the first alone. The tokens
 * are deliberately absurd, so a default leaking through cannot be mistaken for the canary.
 */
describe('CompactCell — the theme comes from the mounted chrome, never from a prop', () => {
  const CANARY: WorkspaceTheme = {
    ...DEFAULT_WORKSPACE_THEME,
    text: 'rgb(1, 2, 3)',
    border: 'rgb(4, 5, 6)',
    fontFamily: 'Canary Mono',
  };

  const inChrome = ({ children }: { children: ReactNode }) => (
    <WorkspaceChromeProvider theme={CANARY}>{children}</WorkspaceChromeProvider>
  );

  it('paints with the provider tokens, and no theme prop exists to pass', async () => {
    await mount({}, inChrome);
    const root = screen.getByTestId('compact-cell');
    expect(root).toHaveStyle({ color: CANARY.text, fontFamily: CANARY.fontFamily });
    expect(root.style.borderLeftColor).toBe(CANARY.border);
  });

  it('mounted outside every provider, it still paints with the package default', async () => {
    await mount();
    const root = screen.getByTestId('compact-cell');
    expect(root).toHaveStyle({
      color: DEFAULT_WORKSPACE_THEME.text,
      fontFamily: DEFAULT_WORKSPACE_THEME.fontFamily,
    });
    expect(DEFAULT_WORKSPACE_THEME.text).not.toBe(CANARY.text);
  });
});

/**
 * The cell's two centred rows, serialised as they were before the shared value.
 *
 * Captured from the tree BEFORE the collapse. The radio group is the one whose declaration is
 * nothing but the shared pair and a gap, so a spread that dropped a property would leave it
 * unlaid-out with every other assertion in this file still green.
 */
describe('the centred row inside the cell', () => {
  it('serialises the cell header exactly as it did before', async () => {
    const { view } = await mount();
    const head = view.container.querySelector('[data-compact-cell] > div');
    expect(head?.getAttribute('style')).toBe(
      'display: flex; align-items: center; gap: 6px; padding: 3px 8px;' +
        ' border-bottom: 1px solid rgba(255,255,255,0.14); font-size: 10.5px;',
    );
  });

  it('serialises the timeframe group exactly as it did before', async () => {
    const { view } = await mount();
    expect(view.container.querySelector('[role="radiogroup"]')?.getAttribute('style')).toBe(
      'display: flex; align-items: center; gap: 6px;',
    );
  });
});

/**
 * The cell's own column stack, serialised as it was before the shared value.
 *
 * Captured from the tree BEFORE the collapse. `flex: 1` and the two minimums are what let a cell
 * shrink inside the grid row, and they have to keep declaring themselves AFTER the direction.
 */
describe('the column stack inside the cell', () => {
  it('serialises the cell root exactly as it did before', async () => {
    const { view } = await mount();
    expect(view.container.querySelector('[data-compact-cell]')?.getAttribute('style')).toBe(
      'display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0;' +
        ' border-left: 1px solid rgba(255,255,255,0.14);' +
        ' font-family: Inter, system-ui, sans-serif; color: rgb(184, 188, 196);',
    );
  });
});
