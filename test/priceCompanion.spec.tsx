/**
 * @jest-environment jsdom
 *
 * The price pane's COMPANIONS and the user's own price levels.
 *
 * Both are cases where "it rendered" is worthless. A magnitude drawn on the candles' own scale
 * renders perfectly — and flattens the price action into a line, which is a picture of nothing. A
 * level that never fires renders perfectly too, and so does one that fires on every bar. So each
 * case below holds an output to the declaration it came from, and each carries a control positive:
 * the same surface, driven with the flag off, must produce the OTHER answer.
 */
import { render } from '@testing-library/react';

import { directionConvention, paneId, seriesId, utcSeconds } from '../src/domain/types';
import type { Bar, PaneSpec, SeriesSpec } from '../src/domain/types';
import type {
  ChartEngine,
  PriceLineHandle,
  PriceLineOptions,
  SeriesHandle,
  SeriesShape,
  WorkspaceChartHandle,
} from '../src/port/chartApi';
import { ChartSurface, type SeriesReader } from '../src/react/surface/ChartSurface';

/** A drawn level, paired with the handle it was handed out as, so removal is by IDENTITY. */
interface DrawnLine {
  readonly options: PriceLineOptions;
  readonly handle: PriceLineHandle;
}

interface SeriesRecord {
  readonly shape: SeriesShape;
  readonly paneIndex: number;
  readonly options: Record<string, unknown>;
  readonly priceLines: DrawnLine[];
  readonly margins: Array<{ readonly top: number; readonly bottom: number }>;
  readonly data: Array<{ readonly time: number; readonly value?: number; readonly color?: string }>;
}

function fakeEngine(): { series: SeriesRecord[]; engine: ChartEngine } {
  const series: SeriesRecord[] = [];
  const engine: ChartEngine = () => {
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
      addSeries: (shape, options, paneIndex): SeriesHandle => {
        const record: SeriesRecord = {
          shape,
          paneIndex: paneIndex ?? 0,
          options: options as Record<string, unknown>,
          priceLines: [],
          margins: [],
          data: [],
        };
        series.push(record);
        return {
          setData: (data) => {
            record.data.length = 0;
            record.data.push(...(data as SeriesRecord['data']));
          },
          applyOptions: () => undefined,
          priceScale: () => ({
            applyOptions: (o) => {
              if (o.scaleMargins !== undefined) record.margins.push(o.scaleMargins);
            },
          }),
          createPriceLine: (line) => {
            const handle: PriceLineHandle = { applyOptions: () => undefined };
            record.priceLines.push({ options: line, handle });
            return handle;
          },
          removePriceLine: (line) => {
            const at = record.priceLines.findIndex((drawn) => drawn.handle === line);
            if (at >= 0) record.priceLines.splice(at, 1);
          },
          priceToCoordinate: () => null,
          coordinateToPrice: () => null,
          attachPrimitive: () => undefined,
          detachPrimitive: () => undefined,
        };
      },
      applyOptions: () => undefined,
      timeScale: () => ({ fitContent: () => undefined }),
      subscribeCrosshairMove: () => undefined,
      unsubscribeCrosshairMove: () => undefined,
      remove: () => undefined,
    };
    return chart;
  };
  return { series, engine };
}

const CONVENTION = directionConvention({ upColor: '#26a69a', downColor: '#ef5350' });

const magnitude = (over: Partial<SeriesSpec> = {}): SeriesSpec => ({
  id: seriesId('magnitude'),
  label: 'Magnitude',
  shape: 'histogram',
  color: '#888888',
  ...over,
});

function priceWith(series: readonly SeriesSpec[]): PaneSpec {
  return {
    id: paneId('price'),
    title: 'Price',
    format: { kind: 'price', minMove: 0.01 },
    series,
    defaultVisible: true,
  };
}

/** Two rising bars then two falling ones, all carrying the SAME positive magnitude. */
const BARS: readonly Bar[] = [
  { time: utcSeconds(100), open: 10, high: 12, low: 9, close: 11 },
  { time: utcSeconds(200), open: 11, high: 13, low: 10, close: 12 },
  { time: utcSeconds(300), open: 12, high: 12, low: 8, close: 9 },
  { time: utcSeconds(400), open: 9, high: 10, low: 7, close: 8 },
];

const FLAT_READINGS: readonly number[] = [4000, 4000, 4000, 4000];
const readFlat: SeriesReader = () => FLAT_READINGS;

interface RenderOptions {
  readonly spec: SeriesSpec;
  readonly bars?: readonly Bar[];
  readonly alerts?: readonly number[];
  readonly onCrossed?: (crossed: readonly { readonly price: number }[]) => void;
}

function mount(options: RenderOptions): { series: SeriesRecord[] } {
  const { series, engine } = fakeEngine();
  render(
    <ChartSurface
      engine={engine}
      convention={CONVENTION}
      data={{ bars: options.bars ?? BARS, panes: [], read: readFlat, pricePane: priceWith([options.spec]) }}
      layout={{ heightPx: 400 }}
      a11y={{ label: 'surface', describedBy: 'status' }}
      alerts={{ levels: options.alerts, onCrossed: options.onCrossed }}
    />,
  );
  return { series };
}

describe('a series declared on the price pane', () => {
  it('takes a scale of its own when it asks for one, in pane 0', () => {
    const { series } = mount({ spec: magnitude({ ownScale: true }) });

    const candles = series.find((record) => record.shape === 'candlestick');
    const companion = series.find((record) => record.shape === 'histogram');
    expect(candles).toBeDefined();
    expect(companion).toBeDefined();
    expect(companion?.paneIndex).toBe(0);

    // The whole point: a named overlay scale, and the candles on the default one.
    expect(companion?.options.priceScaleId).toBe('magnitude');
    // CONTROL POSITIVE. If the assertion above passed because everything gets a `priceScaleId`,
    // the two would share a scale and the separation would be a fiction.
    expect(candles?.options.priceScaleId).toBeUndefined();
    // Pushed to the floor of the pane, so it sits under the price action rather than across it.
    expect(companion?.margins.at(-1)?.top).toBeGreaterThan(0.5);
    expect(candles?.margins.at(-1)?.top).toBeLessThan(0.5);
  });

  it('SHARES the candles’ scale by default, which is the only way an overlay is over anything', () => {
    const { series } = mount({ spec: magnitude({ shape: 'line' }) });
    const companion = series.filter((record) => record.shape === 'line').at(0);

    expect(companion?.paneIndex).toBe(0);
    // No scale of its own, and no margins pushing it to the floor: it rides the candles' axis.
    expect(companion?.options.priceScaleId).toBeUndefined();
    expect(companion?.margins).toEqual([]);

    // CONTROL POSITIVE: the SAME series with the flag set does take a scale of its own, so the
    // absence above is the default speaking rather than the flag being unread.
    const { series: owned } = mount({ spec: magnitude({ shape: 'line', ownScale: true }) });
    const separate = owned.filter((record) => record.shape === 'line').at(0);
    expect(separate?.options.priceScaleId).toBe('magnitude');
    expect(separate?.margins).not.toEqual([]);
  });

  it('reads in its OWN unit when it declares one, not in the pane’s', () => {
    const { series } = mount({
      spec: magnitude({ format: { kind: 'compact', decimals: 1 } }),
    });
    const companion = series.find((record) => record.shape === 'histogram');
    const format = companion?.options.priceFormat as { formatter(value: number): string };

    expect(format.formatter(4000)).toBe('4.0K');

    // CONTROL POSITIVE: the pane's own format answers differently for the same reading, so the
    // assertion above is about WHICH format was chosen and not about formatting in general.
    const { series: fallback } = mount({ spec: magnitude() });
    const plain = fallback.find((record) => record.shape === 'histogram');
    const paneFormat = plain?.options.priceFormat as { formatter(value: number): string };
    expect(paneFormat.formatter(4000)).toBe('4000.0');
  });
});

describe('barDirectionColoring', () => {
  it('takes its colour from the BAR, so an all-positive magnitude still shows direction', () => {
    const { series } = mount({ spec: magnitude({ barDirectionColoring: true }) });
    const drawn = series.find((record) => record.shape === 'histogram')?.data ?? [];

    expect(drawn.map((point) => point.color)).toEqual([
      '#26a69a', // 10 -> 11, up
      '#26a69a', // 11 -> 12, up
      '#ef5350', // 12 ->  9, down
      '#ef5350', // 9 ->  8, down
    ]);
  });

  it('is not what signColoring does — the control positive for the case above', () => {
    // Same readings, same bars, the OTHER flag. Every value is positive, so colouring by the value's
    // own sign paints one colour for all four bars and says nothing about direction.
    const { series } = mount({ spec: magnitude({ signColoring: true }) });
    const drawn = series.find((record) => record.shape === 'histogram')?.data ?? [];

    expect(new Set(drawn.map((point) => point.color))).toEqual(new Set(['#26a69a']));
  });
});

describe('the user’s price levels', () => {
  it('draws one line per declared level, on the candles', () => {
    const { series } = mount({ spec: magnitude(), alerts: [11.5, 9.5] });
    const candles = series.find((record) => record.shape === 'candlestick');

    expect(candles?.priceLines.map((line) => line.options.price)).toEqual([11.5, 9.5]);

    // CONTROL POSITIVE: with nothing declared there is no line, so the count above is the
    // declaration's doing and not a fixture the surface always draws.
    const { series: none } = mount({ spec: magnitude() });
    expect(none.find((record) => record.shape === 'candlestick')?.priceLines).toEqual([]);
  });

  it('reports a level ONCE, on the bar that crosses it', () => {
    const crossings: number[][] = [];
    const record = (crossed: readonly { readonly price: number }[]): void => {
      crossings.push(crossed.map((alert) => alert.price));
    };

    // The last close walks 11 -> 12 -> 9 -> 8. A level at 10.5 is above the close at the start,
    // below it after bar 2, and back above it at bar 3 — one crossing, then silence, because a
    // level that has fired stays fired until it is moved.
    const { rerender, engine, series } = (() => {
      const fake = fakeEngine();
      const view = render(
        <ChartSurface
          engine={fake.engine}
          convention={CONVENTION}
          data={{ bars: BARS.slice(0, 1), panes: [], read: readFlat, pricePane: priceWith([magnitude()]) }}
          layout={{ heightPx: 400 }}
          a11y={{ label: 'surface', describedBy: 'status' }}
          alerts={{ levels: [10.5], onCrossed: record }}
        />,
      );
      return { rerender: view.rerender, engine: fake.engine, series: fake.series };
    })();

    const step = (count: number): void => {
      rerender(
        <ChartSurface
          engine={engine}
          convention={CONVENTION}
          data={{ bars: BARS.slice(0, count), panes: [], read: readFlat, pricePane: priceWith([magnitude()]) }}
          layout={{ heightPx: 400 }}
          a11y={{ label: 'surface', describedBy: 'status' }}
          alerts={{ levels: [10.5], onCrossed: record }}
        />,
      );
    };

    step(2); // close 12: still above, nothing fires
    expect(crossings).toEqual([]);

    step(3); // close 9: crossed downward
    expect(crossings).toEqual([[10.5]]);

    step(4); // close 8: still below, and already fired
    expect(crossings).toEqual([[10.5]]);

    // The line is still the one the first render created — a re-declaration of the same level must
    // not rebuild it, or a drag would destroy the line under the pointer mid-gesture.
    expect(series.find((entry) => entry.shape === 'candlestick')?.priceLines).toHaveLength(1);
  });
});
