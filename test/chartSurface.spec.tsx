/**
 * @jest-environment jsdom
 *
 * The composed surface, held to the things that are invisible to "did it render".
 *
 * A stack of nine anonymous strips renders perfectly. A pane whose axis says `0.00` where the
 * reading is 0.0084% renders perfectly. A mirrored series whose legend prints the negated figure
 * renders perfectly. Every case below therefore holds an OUTPUT to the declaration it came from, and
 * every one carries a control positive — the assertion that fails if the implementation replaced the
 * declaration with a constant.
 *
 * THE ENGINE IS A FAKE, NOT A MOCKED PACKAGE. `src/` talks to the base library through
 * `ChartEngine`, so the whole surface can be driven without a canvas and without
 * `jest.mock('lightweight-charts')`. That is the port paying for itself: what is under test here is
 * this package's composition, and a test that mocked the real module would be testing the mock's
 * fidelity too.
 */
import { render, screen, within } from '@testing-library/react';

import {
  directionConvention,
  invertConvention,
  paneId,
  seriesId,
  utcSeconds,
} from '../src/domain/types';
import type { Bar, PaneSpec, PriceScaleConvention, SeriesSpec } from '../src/domain/types';
import type {
  ChartEngine,
  PriceLineHandle,
  PriceLineOptions,
  SeriesHandle,
  SeriesMarkerPoint,
  SeriesShape,
  WorkspaceChartHandle,
} from '../src/port/chartApi';
import type { Overlay } from '../src/extension/plugins';
import type { DrawingBinding, DrawingLayerEvents, DrawingSurfaceHost } from '../src/drawing/drawingLayer';
import {
  ChartSurface,
  seriesStyleKey,
  type PaneView,
  type SeriesReader,
  type SurfaceData,
} from '../src/react/surface/ChartSurface';

interface SeriesRecord {
  readonly shape: SeriesShape;
  readonly paneIndex: number;
  readonly options: {
    readonly color?: string;
    readonly upColor?: string;
    readonly downColor?: string;
    readonly visible?: boolean;
    readonly priceFormat?: { readonly formatter?: (value: number) => string; readonly minMove?: number };
  };
  readonly priceLines: PriceLineOptions[];
  readonly data: Array<{ readonly time: number; readonly value?: number; readonly color?: string }>;
  /** Every `applyOptions` call after creation, in order — how a visibility flip becomes observable. */
  readonly applied: Array<Record<string, unknown>>;
  /** Every `setMarkers` call, in order. */
  readonly markerCalls: Array<readonly SeriesMarkerPoint[]>;
}

/**
 * A PRICE scale of the fake, modelled with the one rule of the base library this file has to prove.
 *
 * `autoScale` starts ON, as in the base library. Dragging the price axis — a gesture the base offers
 * by default (`handleScale.axisPressedMouseMove.price`) — turns it OFF, and from then on
 * `Pane._internal_recalculate` returns on the first line without touching the range: that is why
 * `fitContent()`, which only reframes the TIME axis, leaves the price axis on the previous market.
 * `range` is recomputed inside `fitContent` and only for the ARMED scales, which is the real
 * behaviour.
 */
interface ScaleRecord {
  autoScale: boolean;
  range: { readonly min: number; readonly max: number } | null;
  readonly members: SeriesRecord[];
}

/** Every plotted number of a point: a candle brings four, a line brings one. */
function plottedNumbers(point: Record<string, unknown>): number[] {
  const out: number[] = [];
  for (const [key, value] of Object.entries(point)) {
    if (key === 'time' || key === 'color') continue;
    if (typeof value === 'number' && Number.isFinite(value)) out.push(value);
  }
  return out;
}

interface Recording {
  readonly series: SeriesRecord[];
  readonly engine: ChartEngine;
  /**
   * The ORDER in which the teardown crossed the port.
   *
   * A counter would not do: the defect is neither "called too much" nor "called too little", it is
   * the SEQUENCE — detaching a primitive from an already removed chart reschedules a repaint that
   * only runs later, against canvases that have already been discarded.
   */
  readonly teardown: string[];
  /** How many times the scale was REDONE. The counter separates "switched asset" from "bar arrived". */
  readonly fits: { count: number };
  /** The price scales, by id (`right@<pane>` for the pane's, the `priceScaleId` for their own). */
  readonly scales: Map<string, ScaleRecord>;
  /**
   * The user's DRAG on the price axis, reproduced. Without it the defect is invisible: with
   * autoscale on the base library reframes the price by itself, and it is precisely the disarmed
   * state — permanent, because nothing in this application rearmed it — that the screenshot shows.
   */
  readonly dragPriceAxis: (scaleId?: string) => void;
}

/**
 * THE DOOR IS BUILT BY THE ADAPTER, NEVER BY THE DOUBLE — measured, and it is why nobody saw the
 * defect. `ISeriesApi` in the installed `lightweight-charts@5` has no `setMarkers` at all; the
 * member lives on `ISeriesMarkersPluginApi`, which `createSeriesMarkers` returns. A double that
 * implements what the real object lacks turns a silent no-op green, and the pattern marks the
 * published 0.2.1 offers shipped without drawing.
 *
 * So the default here is an engine WITHOUT the door, which is what a host that returns the raw
 * series has, and `markerDoor` is what an adapter adds.
 */
function fakeEngine({ markerDoor = true }: { readonly markerDoor?: boolean } = {}): Recording {
  const series: SeriesRecord[] = [];
  const teardown: string[] = [];
  const fits = { count: 0 };
  const scales = new Map<string, ScaleRecord>();
  const scaleOf = (id: string): ScaleRecord => {
    const found = scales.get(id);
    if (found !== undefined) return found;
    const created: ScaleRecord = { autoScale: true, range: null, members: [] };
    scales.set(id, created);
    return created;
  };
  const dragPriceAxis = (scaleId = 'right@0'): void => {
    scaleOf(scaleId).autoScale = false;
  };
  const engine: ChartEngine = () => {
    let nextPane = 1;
    const makePane = (index: number) => ({
      paneIndex: () => index,
      getStretchFactor: () => 1,
      setStretchFactor: () => undefined,
      setPreserveEmptyPane: () => undefined,
      moveTo: () => undefined,
      // jsdom lays nothing out, so the surface must fall back to the geometry the layout pass itself
      // produced. Answering `null` here is what forces that path to be the one under test.
      getHTMLElement: () => null,
    });
    const pane0 = makePane(0);
    const chart: WorkspaceChartHandle = {
      panes: () => [pane0],
      addPane: () => makePane(nextPane++),
      addSeries: (shape, options, paneIndex): SeriesHandle => {
        const handles: PriceLineHandle[] = [];
        const record: SeriesRecord = {
          shape,
          paneIndex: paneIndex ?? 0,
          options: options as SeriesRecord['options'],
          priceLines: [],
          data: [],
          applied: [],
          markerCalls: [],
        };
        series.push(record);
        // `priceScaleId` NAMES a scale; without it the series lands on the pane's scale, which is
        // the one drawn on the axis. Same rule as the base library, and it is what separates the
        // volume (its own scale) from the candles.
        const rawScaleId = (options as { priceScaleId?: unknown }).priceScaleId;
        const scale = scaleOf(
          typeof rawScaleId === 'string' ? rawScaleId : `right@${paneIndex ?? 0}`,
        );
        scale.members.push(record);
        return {
          setData: (data) => {
            record.data.length = 0;
            record.data.push(...(data as SeriesRecord['data']));
          },
          applyOptions: (next) => {
            record.applied.push(next);
          },
          ...(markerDoor
            ? {
                setMarkers: (markers: readonly SeriesMarkerPoint[]) => {
                  record.markerCalls.push(markers);
                },
              }
            : {}),
          priceScale: () => ({
            applyOptions: (next) => {
              if (next.autoScale !== undefined) scale.autoScale = next.autoScale;
            },
          }),
          // `priceLines` is the series' LIVE state, not the call history: a lane that swaps
          // occupant removes the old guide and creates the new one, and a recorder that only
          // accumulated could not tell "swapped" from "stacked two".
          createPriceLine: (line) => {
            const handle = { applyOptions: () => undefined };
            record.priceLines.push(line);
            handles.push(handle);
            return handle;
          },
          removePriceLine: (handle) => {
            const at = handles.indexOf(handle);
            if (at < 0) return;
            handles.splice(at, 1);
            record.priceLines.splice(at, 1);
          },
          // A LINEAR SCALE, one pixel per price unit: the magnet is a screen tolerance, so a
          // converter that always answered null would make every snap case pass for the wrong
          // reason. The axis points down, like every price scale.
          priceToCoordinate: (price) => 200 - price,
          coordinateToPrice: () => null,
          attachPrimitive: () => undefined,
          detachPrimitive: () => {
            teardown.push('detachPrimitive');
          },
        };
      },
      applyOptions: () => undefined,
      subscribeCrosshairMove: () => undefined,
      unsubscribeCrosshairMove: () => undefined,
      remove: () => {
        teardown.push('chart.remove');
      },
      timeScale: () => ({
        fitContent: () => {
          fits.count += 1;
          // The base library reframes the time axis and, ALONG FOR THE RIDE, recomputes the range
          // of the price scales — but `Pane._internal_recalculate` skips every scale with
          // `autoScale` off. A disarmed scale stays exactly where it was, which is the reported
          // defect.
          for (const scale of scales.values()) {
            if (!scale.autoScale) continue;
            const values = scale.members.flatMap((member) =>
              member.data.flatMap((point) => plottedNumbers(point as Record<string, unknown>)),
            );
            if (values.length === 0) continue;
            scale.range = { min: Math.min(...values), max: Math.max(...values) };
          }
        },
      }),
    };
    return chart;
  };
  return { series, engine, teardown, fits, scales, dragPriceAxis };
}

const CONVENTION = directionConvention({ upColor: '#26a69a', downColor: '#ef5350' });

// `Omit` on the id: `Partial<SeriesSpec>` already declares it BRANDED, and intersecting that with
// `{ id: string }` yields `SeriesId & string`, which no plain literal satisfies.
const series = (
  over: Omit<Partial<SeriesSpec>, 'id'> & { id: string; label: string },
): SeriesSpec => ({
  shape: 'line',
  color: '#ffffff',
  ...over,
  id: seriesId(over.id),
});

const PRICE: PaneSpec = {
  id: paneId('price'),
  title: 'Price',
  format: { kind: 'price', minMove: 0.000001 },
  series: [],
  defaultVisible: true,
};

/** A rate that stays in force between prints — the only shape `stepCarry` is valid for. */
const RATE: PaneSpec = {
  id: paneId('rate'),
  title: 'Settled rate',
  format: { kind: 'percent', decimals: 4 },
  referenceLine: 0,
  targetHeightPx: 90,
  defaultVisible: true,
  series: [series({ id: 'rate', label: 'Rate', shape: 'histogram', signColoring: true, stepCarry: true })],
};

/** Bounded 0..100, so its formatter must disagree with every other pane's on the same reading. */
const BOUNDED: PaneSpec = {
  id: paneId('bounded'),
  title: 'Bounded 0-100',
  format: { kind: 'custom', format: (v) => v.toFixed(0), minMove: 0.01 },
  targetHeightPx: 126,
  defaultVisible: true,
  series: [series({ id: 'a', label: 'A', color: '#ffb74d' })],
};

/** Two sides of one unit, the second negated so it lands on the far side of the eye-line. */
const SIDES: PaneSpec = {
  id: paneId('sides'),
  title: 'Sides',
  format: { kind: 'compact', decimals: 1 },
  referenceLine: 0,
  targetHeightPx: 108,
  defaultVisible: true,
  series: [
    series({ id: 'up', label: 'Up', shape: 'histogram', color: '#26a69a' }),
    series({ id: 'down', label: 'Down', shape: 'histogram', color: '#ef5350', mirrored: true }),
  ],
};

const HIDDEN: PaneSpec = {
  id: paneId('hidden'),
  title: 'Hidden pane',
  format: { kind: 'ratio', decimals: 2 },
  referenceLine: 1,
  targetHeightPx: 90,
  defaultVisible: false,
  series: [series({ id: 'ratio', label: 'Ratio', color: '#91a069' })],
};

const BARS: readonly Bar[] = [
  { time: utcSeconds(1_700_000_000), open: 100, high: 110, low: 95, close: 105 },
  { time: utcSeconds(1_700_000_060), open: 105, high: 120, low: 100, close: 115 },
];

/** Raw readings, per series id. `null` is "nobody measured this bar" and never zero. */
const READINGS: Readonly<Record<string, ReadonlyArray<number | null>>> = {
  rate: [0.00008402, null],
  a: [55.4, 71.2],
  up: [88_431.5, 12_000],
  down: [40_000, 9_000],
  ratio: [1.4, 1.2],
};

const read: SeriesReader = (_pane, spec) => READINGS[String(spec.id)] ?? [];

const view = (spec: PaneSpec, visible = true, lastUsedAt = 1): PaneView => ({
  spec,
  visible,
  heightPx: spec.targetHeightPx ?? 90,
  lastUsedAt,
});

/**
 * WHAT A CASE OVERRIDES, DERIVED FROM THE CONTRACT ITSELF.
 *
 * Almost every case in this file swaps one thing out of what is DRAWN — the bars, the panes, the
 * reader, the price pane — and that is exactly what `SurfaceData` declares. Writing the list by hand
 * here would be a second declaration of it; `Partial<SurfaceData>` cannot diverge. The convention is
 * left out because it is a top-level prop, and it is the only top-level one any case swaps.
 */
type SurfaceOver = Partial<SurfaceData> & {
  readonly convention?: PriceScaleConvention;
  /** `false` mounts an engine that never implements the optional marker door — MARK-02. */
  readonly markerDoor?: boolean;
};

function mount(over: SurfaceOver = {}): Recording {
  const recording = fakeEngine({ markerDoor: over.markerDoor ?? true });
  const { convention, markerDoor: _door, ...data } = over;
  render(
    <ChartSurface
      engine={recording.engine}
      convention={convention ?? CONVENTION}
      data={{
        bars: BARS,
        panes: [view(RATE), view(BOUNDED, true, 2), view(SIDES, true, 3), view(HIDDEN, false, 0)],
        read,
        pricePane: PRICE,
        priceCaption: 'ABC · 1h',
        ...data,
      }}
      layout={{ heightPx: 720 }}
      a11y={{ label: 'workspace', describedBy: 'state' }}
    />,
  );
  return recording;
}

const legend = (id: string): HTMLElement => screen.getByTestId(`chart-workspace-legend-${id}`);

describe('the titled legend', () => {
  it('names every VISIBLE pane on the canvas, and names no pane it does not draw', () => {
    mount();

    expect(legend('rate')).toHaveTextContent('Settled rate');
    expect(legend('bounded')).toHaveTextContent('Bounded 0-100');
    expect(legend('sides')).toHaveTextContent('Sides');
    expect(legend('price')).toHaveTextContent('ABC · 1h');

    // CONTROL POSITIVE: a pane switched OFF is collapsed to the layout floor, and a label drawn on a
    // 2px strip would sit over its neighbour's. A component that printed every catalogue title would
    // pass every assertion above and fail this one.
    expect(screen.queryByTestId('chart-workspace-legend-hidden')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden pane')).not.toBeInTheDocument();
  });

  it('stacks the labels down the panes instead of piling them at the origin', () => {
    mount();

    const tops = ['price', 'rate', 'bounded', 'sides'].map((id) =>
      Number.parseFloat(legend(id).style.top),
    );

    expect(tops.every((top) => Number.isFinite(top))).toBe(true);
    for (let index = 1; index < tops.length; index += 1) {
      expect(tops[index]).toBeGreaterThan(tops[index - 1]);
    }
    // CONTROL POSITIVE: the price pane holds the residual of a 720px budget, so its label cannot sit
    // a few pixels above the next one — an implementation stacking by a constant would pass the
    // ordering check above and fail this.
    expect(tops[1] - tops[0]).toBeGreaterThan(200);
  });
});

describe('each pane reads in its OWN unit', () => {
  it('hands each pane its own axis formatter, so the AXIS reads like the legend', () => {
    const { series: recorded } = mount();
    const formatterOf = (paneIndex: number): ((value: number) => string) => {
      const found = recorded.find((record) => record.paneIndex === paneIndex);
      const formatter = found?.options.priceFormat?.formatter;
      if (formatter === undefined) throw new Error(`pane ${paneIndex} got no formatter`);
      return formatter;
    };

    // Pane 0 is price; rate, bounded and sides are 1, 2 and 3 in creation order.
    expect(formatterOf(1)(0.00008402)).toBe('0.0084%');
    expect(formatterOf(2)(55.4)).toBe('55');
    expect(formatterOf(3)(88_431.5)).toBe('88.4K');
    expect(legend('rate')).toHaveTextContent('0.0084%');
    expect(legend('bounded')).toHaveTextContent('71');

    // CONTROL POSITIVE: the same reading through a neighbouring pane's formatter is a DIFFERENT
    // string. Had one formatter been shared, all three of these would agree.
    expect(formatterOf(2)(0.00008402)).not.toBe(formatterOf(1)(0.00008402));
    expect(formatterOf(3)(55.4)).not.toBe(formatterOf(2)(55.4));
  });

  it('says "no reading" rather than zero when a bar carries none', () => {
    mount({ read: () => [null, null] });

    expect(legend('rate')).toHaveTextContent('—');
    // CONTROL POSITIVE: a zero rate is a real, tradeable reading — printing one for a bucket nobody
    // measured is the chart asserting something the data never said.
    expect(legend('rate')).not.toHaveTextContent('0.0000%');
  });
});

describe('the drawing flags are interpreted HERE, not by the host', () => {
  it('carries a step function across its gaps and breaks every other series at one', () => {
    const { series: recorded } = mount();
    const dataOf = (paneIndex: number): SeriesRecord['data'] =>
      recorded.find((record) => record.paneIndex === paneIndex)?.data ?? [];

    // The rate declares `stepCarry` and reads [0.00008402, null]: the second bar is not unmeasured,
    // it is the rate that settled last and is STILL IN FORCE.
    expect(dataOf(1).map((point) => point.value)).toEqual([0.00008402, 0.00008402]);
    expect(legend('rate')).toHaveTextContent('0.0084%');

    // CONTROL POSITIVE: the same shape of gap on a series that does NOT declare it stays a gap.
    const gapped = mount({
      panes: [view({ ...RATE, series: [series({ id: 'rate', label: 'Rate', shape: 'histogram' })] })],
      pricePane: undefined,
    });
    expect(gapped.series[0].data.map((point) => point.value)).toEqual([0.00008402]);
  });

  it('plots a mirrored series below the line while the legend prints what was MEASURED', () => {
    const { series: recorded } = mount();
    const down = recorded.find((record) => record.options.color === '#ef5350' && record.paneIndex === 3);

    expect(down?.data.map((point) => point.value)).toEqual([-40_000, -9_000]);
    // The legend is the measured figure, positive, because negation is a drawing decision and a
    // legend that repeated it would report a quantity nobody measured.
    expect(within(legend('sides')).getByText(/Down 9\.0K/)).toBeInTheDocument();

    // CONTROL POSITIVE: its unmirrored neighbour in the same pane, same unit, is NOT negated.
    const up = recorded.find((record) => record.options.color === '#26a69a' && record.paneIndex === 3);
    expect(up?.data.map((point) => point.value)).toEqual([88_431.5, 12_000]);
  });

  it('takes both directional colours from the DECLARED convention, never from a constant', () => {
    const western = mount();
    const eastAsian = mount({ convention: invertConvention(CONVENTION) });

    const candlesOf = (rec: Recording): SeriesRecord | undefined =>
      rec.series.find((record) => record.shape === 'candlestick');

    expect(candlesOf(western)?.options.upColor).toBe('#26a69a');
    // CONTROL POSITIVE: the inverted convention is the same two colours with opposite meanings, so a
    // hard-coded palette would produce the identical object here.
    expect(candlesOf(eastAsian)?.options.upColor).toBe('#ef5350');
    expect(candlesOf(eastAsian)?.options.downColor).toBe('#26a69a');
  });
});

describe('the reference line', () => {
  it('is drawn on the panes that declare one, at the value they declare, on their own scale', () => {
    const { series: recorded } = mount();
    const lines = recorded.flatMap((record) =>
      record.priceLines.map((line) => ({ paneIndex: record.paneIndex, price: line.price })),
    );

    expect(lines).toContainEqual({ paneIndex: 1, price: 0 });
    // CONTROL POSITIVE: the bounded pane declares none — it lives in 0..100 and has no meaningful
    // eye-line — so an implementation that drew a zero line on every pane would fail here.
    expect(lines.filter((line) => line.paneIndex === 2)).toEqual([]);
  });

  it('marks PARITY, not zero, where the pane says so', () => {
    const { series: recorded } = mount({ panes: [view(HIDDEN, true)], pricePane: undefined });
    const prices = recorded.flatMap((record) => record.priceLines.map((line) => line.price));

    expect(prices).toContain(1);
    expect(prices).not.toContain(0);
  });

  /**
   * THE GUIDE OF A GENERIC LANE, which swaps occupant at runtime.
   *
   * The panes are created ONCE, at mount (destroying one renumbers every pane below it), and the
   * reference line used to be born inside that same pass. For the authored panes that is enough:
   * their level is fixed. An indicator LANE has no level of its own — it is 50 while the RSI is in
   * it and 0 when the MACD takes its place — and a guide tied to the mount would be lying from the
   * first swap onwards, which is the worst way to be wrong: a dashed line at 50 on a MACD looks
   * deliberate.
   */
  describe('on a lane that swaps occupant', () => {
    const lane = (reference?: number): PaneSpec => ({
      id: paneId('lane'),
      title: 'Indicator',
      format: { kind: 'custom', format: (v) => v.toFixed(0), minMove: 0.01 },
      targetHeightPx: 90,
      defaultVisible: true,
      ...(reference === undefined ? {} : { referenceLine: reference }),
      series: [series({ id: 'lane-a', label: 'Lane', color: '#4fc3f7' })],
    });

    const mounted = (reference?: number) => {
      const recording = fakeEngine();
      const element = (occupant?: number) => (
        <ChartSurface
          engine={recording.engine}
          convention={CONVENTION}
          data={{ bars: BARS, panes: [view(lane(occupant))], read: () => [1, 2], pricePane: PRICE }}
          layout={{ heightPx: 400 }}
          a11y={{ label: 'workspace', describedBy: 'state' }}
        />
      );
      const rendered = render(element(reference));
      return {
        drawn: (): number[] =>
          recording.series.flatMap((record) => record.priceLines.map((line) => line.price)),
        occupy: (next?: number): void => {
          rendered.rerender(element(next));
        },
      };
    };

    it('replaces the guide when the study on the lane changes', () => {
      const { drawn, occupy } = mounted(50);
      expect(drawn()).toEqual([50]);

      occupy(0);

      // ONE line, and it is the new one. An implementation that only created would leave [50, 0]
      // on the pane.
      expect(drawn()).toEqual([0]);
    });

    it('erases the guide when a study that declares none moves in', () => {
      const { drawn, occupy } = mounted(50);

      occupy(undefined);

      expect(drawn()).toEqual([]);
    });

    it('CONTROL POSITIVE: the lane whose guide did not change gains no second line', () => {
      const { drawn, occupy } = mounted(50);

      occupy(50);

      expect(drawn()).toEqual([50]);
    });
  });
});

describe('withholding the price pane', () => {
  it('draws no candles and no price legend, and gives pane 0 to the first pane instead', () => {
    const { series: recorded } = mount({
      pricePane: undefined,
      panes: [view(RATE), view(BOUNDED, true, 2)],
    });

    expect(recorded.some((record) => record.shape === 'candlestick')).toBe(false);
    expect(screen.queryByTestId('chart-workspace-legend-price')).not.toBeInTheDocument();
    // The first pane took pane 0: it absorbs the residual and is the pane the floor protects.
    expect(recorded[0].paneIndex).toBe(0);
    // CONTROL POSITIVE: the anchor is still labelled, so the absence above is the price legend being
    // withheld and not the legend layer failing to render at all.
    expect(legend('rate')).toHaveTextContent('Settled rate');
  });
});

describe('the outer box may shrink in BOTH axes', () => {
  it('declares `minWidth: 0`, so a sibling column can be given room the canvas would keep', () => {
    mount();

    const box = screen.getByTestId('chart-workspace-surface');
    // WHAT THIS HOLDS, AND WHY IT IS NOT A "THE PROP ARRIVED" ASSERTION. jsdom computes no layout,
    // so the browser fact — the compact grid measuring 0 px beside a surface that took the whole
    // row — cannot be reproduced here. What CAUSED it can: without `minWidth`, this box's automatic
    // minimum is the canvas already drawn inside it, and a flex item that cannot go below its
    // content width has no width to hand back to anybody. The two axes are the same rule, and the
    // `minHeight` beside it is the half that was already there.
    expect(box).toHaveStyle({ width: '100%', minWidth: '0', minHeight: '0' });
    // AND THE TWO DECLARATIONS THAT MUST NOT BE THERE, which is the half a `toHaveStyle` cannot
    // reach: it reads what was declared, and the defect here is a declaration ARRIVING. Both are
    // asserted as the empty string because both are absences.
    //
    //   `flex`      — `flex: 1` and `flexBasis: 0` each reset this box's basis to zero, and a
    //                 basis of zero shrinks by zero: the surface goes to 0 px and the canvas with
    //                 it. Measured in Chromium: `surface=0, grid=1058 of row=1100`. jsdom
    //                 serialises the shorthand from ANY longhand — with only `flexBasis: 0`
    //                 declared, `style.flex` reads `"0px"` — so this one line covers the whole
    //                 `flex-*` family, which is why the grid beside it carries the same clause
    //                 (`compactGrid.spec.tsx`).
    //   `maxWidth`  — a cap of zero beats `width: 100%` outright: same 0 px, same blank canvas,
    //                 and nothing else in either suite reads the property.
    //
    // These are strictly weaker than `npm run layout-probe`, which measures the pixels instead of
    // the declarations. They exist because the probe is opt-in (`LAYOUT_PROBE=1`) and this runs
    // every time.
    expect(box.style.flex).toBe('');
    expect(box.style.maxWidth).toBe('');
    // CONTROL POSITIVE: the box really is the measured one, so the clause above is not passing over
    // a default-styled div that happens to carry the same test id.
    expect(box).toHaveStyle({ height: '720px', position: 'relative' });
  });
});

describe('the price legend', () => {
  it('reports the last bar it was drawn from, with its change', () => {
    mount();
    const price = legend('price');

    // open 105, close 115 -> +9.52%.
    expect(within(price).getByText('+9.52%')).toBeInTheDocument();
    expect(price).toHaveTextContent('115.00');
    // CONTROL POSITIVE: the first bar's close. Reading from index 0 — or from a fixed bar — would
    // put 105.00 here and the assertion above would still pass on the open.
    expect(price).not.toHaveTextContent('95.00');
  });

  it('C2 — tints the Δ% by the DECLARED convention, in both directions', () => {
    mount();
    // Rising bar under the western convention: the change wears the up colour.
    expect(within(legend('price')).getByText('+9.52%')).toHaveStyle({ color: '#26a69a' });

    // A falling bar wears the down colour — so the tint tracks the SIGN, not a fixed slot.
    const falling: readonly Bar[] = [
      { time: utcSeconds(1_700_000_000), open: 100, high: 110, low: 85, close: 90 },
    ];
    mount({ bars: falling });
    expect(screen.getAllByTestId('chart-workspace-legend-price')[1]).toHaveTextContent('-10.00%');
    expect(within(screen.getAllByTestId('chart-workspace-legend-price')[1]).getByText('-10.00%')).toHaveStyle(
      { color: '#ef5350' },
    );

    // CONTROL POSITIVE: the INVERTED convention is the same two colours with opposite meanings —
    // a hard-coded green-means-up would paint this rise green too.
    mount({ convention: invertConvention(CONVENTION) });
    expect(within(screen.getAllByTestId('chart-workspace-legend-price')[2]).getByText('+9.52%')).toHaveStyle(
      { color: '#ef5350' },
    );
  });
});

describe('B3 — the series style pair', () => {
  const styled = (styles: Record<string, SeriesShape> | undefined): Recording =>
    mount(styles === undefined ? {} : { seriesStyles: styles });

  it('creates a hidden twin in the other shape, carrying the SAME readings', () => {
    const { series: recorded } = styled(undefined);
    const pair = recorded.filter((record) => record.paneIndex === 1);

    // The rate pane declares one histogram; the surface adds its line twin, hidden.
    expect(pair.map((record) => record.shape)).toEqual(['histogram', 'line']);
    expect(pair[1].options.visible).toBe(false);
    expect(pair[1].data).toEqual(pair[0].data);
    // CONTROL POSITIVE: the candlestick series has no line/histogram twin — a surface twinning
    // every series would put a second candlestick record here.
    expect(recorded.filter((record) => record.shape === 'candlestick')).toHaveLength(1);
  });

  it('flips visibility to the CHOSEN member and leaves unstyled series on their declaration', () => {
    const { series: recorded } = styled({ 'rate:rate': 'line' });
    const [primary, twin] = recorded.filter((record) => record.paneIndex === 1);

    const lastVisible = (record: SeriesRecord): unknown =>
      [...record.applied].reverse().find((options) => 'visible' in options)?.visible;
    expect(lastVisible(primary)).toBe(false);
    expect(lastVisible(twin)).toBe(true);

    // CONTROL POSITIVE: the bounded pane got no style, so its line stays the visible member.
    const [boundedPrimary, boundedTwin] = recorded.filter((record) => record.paneIndex === 2);
    expect(lastVisible(boundedPrimary)).toBe(true);
    expect(lastVisible(boundedTwin)).toBe(false);
  });

  it('ignores a stored style that names neither member of the pair', () => {
    const { series: recorded } = styled({ 'rate:rate': 'area' as SeriesShape });
    const [primary, twin] = recorded.filter((record) => record.paneIndex === 1);
    const lastVisible = (record: SeriesRecord): unknown =>
      [...record.applied].reverse().find((options) => 'visible' in options)?.visible;

    // A stale value must not blank the series: the declaration stays in force.
    expect(lastVisible(primary)).toBe(true);
    expect(lastVisible(twin)).toBe(false);
  });
});

describe('B8 — pattern marks on the price series', () => {
  const MARKS: readonly SeriesMarkerPoint[] = [
    { time: 1_700_000_000, position: 'aboveBar', shape: 'arrowDown', color: '#ef5350', text: 'DOJI' },
  ];

  it('hands the marks to the candle series, and only when the host declares any', () => {
    const withMarks = mount({ priceMarkers: MARKS });
    const candles = withMarks.series.find((record) => record.shape === 'candlestick');
    expect(candles?.markerCalls.at(-1)).toEqual(MARKS);

    // CONTROL POSITIVE: with the prop absent the feature is unused — no call reaches the series,
    // so an engine that never wired markers is never even asked.
    const without = mount();
    const untouched = without.series.find((record) => record.shape === 'candlestick');
    expect(untouched?.markerCalls).toEqual([]);
  });

  it('MARK-02 — an engine WITHOUT the door still draws every line, and offers no marks', () => {
    // The measured hazard is the reverse of this one: `ISeriesApi` in the installed base library has
    // no `setMarkers`, so a host returning the raw series has a door that swallows every call. This
    // engine models that host, and what has to survive it is the DRAWING.
    const closed = mount({ priceMarkers: MARKS, markerDoor: false });
    const candles = closed.series.find((record) => record.shape === 'candlestick');

    expect(candles?.markerCalls).toEqual([]);
    expect(candles?.data.length).toBeGreaterThan(0);
    expect(legend('rate')).toHaveTextContent('Settled rate');
  });

  it('puts a study\u2019s marks on the study\u2019s OWN series, not on the candles', () => {
    const key = seriesStyleKey('bounded', 'a');
    const recording = mount({ seriesMarkers: new Map([[key, MARKS]]) });

    // `#ffb74d` is the `bounded` pane's only line. The candles are a different record entirely, and
    // pinning every mark to them is exactly what the vendor's own reference implementation does.
    const study = recording.series.find((record) => record.options.color === '#ffb74d');
    const candles = recording.series.find((record) => record.shape === 'candlestick');
    expect(study?.markerCalls.at(-1)).toEqual(MARKS);
    expect(candles?.markerCalls).toEqual([]);
  });
});

describe('B1/B2 — the drawing seam', () => {
  interface BindingLog {
    hosts: DrawingSurfaceHost[];
    events: DrawingLayerEvents[];
    armed: Array<string | null>;
    detached: number;
  }

  const fakeBinding = (): { binding: DrawingBinding; log: BindingLog } => {
    const log: BindingLog = { hosts: [], events: [], armed: [], detached: 0 };
    const binding: DrawingBinding = (host, events) => {
      log.hosts.push(host);
      log.events.push(events);
      return {
        setActiveTool: (id) => log.armed.push(id),
        deleteSelection: () => undefined,
        clearAll: () => undefined,
        detach: () => {
          log.detached += 1;
        },
      };
    };
    return { binding, log };
  };

  it('attaches ONCE with the chart, the anchor series and the canvas host, and pushes the armed tool', () => {
    const { binding, log } = fakeBinding();
    const recording = fakeEngine();
    const view2 = render(
      <ChartSurface
        engine={recording.engine}
        convention={CONVENTION}
        data={{ bars: BARS, panes: [view(RATE)], read, pricePane: PRICE }}
        layout={{ heightPx: 480 }}
        a11y={{ label: 'workspace', describedBy: 'state' }}
        drawing={{ binding, activeTool: 'trend-line' }}
      />,
    );

    expect(log.hosts).toHaveLength(1);
    expect(log.hosts[0].container).toBeInstanceOf(HTMLElement);
    expect(log.hosts[0].chart).toBeDefined();
    expect(log.hosts[0].series).toBeDefined();
    // The tool armed before attach still arrives — pushed state, not a lost render.
    expect(log.armed).toEqual(['trend-line']);

    // The layer speaks and the host hears: count events surface through the callback prop.
    view2.unmount();
    expect(log.detached).toBe(1);
  });

  it('routes the layer events to the host callbacks', () => {
    const { binding, log } = fakeBinding();
    const counts: number[] = [];
    let finished = 0;
    render(
      <ChartSurface
        engine={fakeEngine().engine}
        convention={CONVENTION}
        data={{ bars: BARS, panes: [view(RATE)], read, pricePane: PRICE }}
        layout={{ heightPx: 480 }}
        a11y={{ label: 'workspace', describedBy: 'state' }}
        drawing={{
          binding,
          onCountChange: (count) => counts.push(count),
          onToolFinished: () => {
            finished += 1;
          },
        }}
      />,
    );

    log.events[0].onCountChange(3);
    log.events[0].onToolFinished();
    expect(counts).toEqual([3]);
    expect(finished).toBe(1);
  });

  it('mounts with no binding at all, with the tool armed — the seam is inert by design', () => {
    // THE SEAM BRINGS NO IMPLEMENTATION, and that property has to survive the change of layer. A
    // host that injects no binding mounts the chart just the same, and arming a tool with no layer
    // is a request with nobody to serve it — never an error. All three cases above pass a binding,
    // so the path with no drawing engine was exercised by none of them.
    const recording = fakeEngine();
    const inert = render(
      <ChartSurface
        engine={recording.engine}
        convention={CONVENTION}
        data={{ bars: BARS, panes: [view(RATE)], read, pricePane: PRICE }}
        layout={{ heightPx: 480 }}
        a11y={{ label: 'workspace', describedBy: 'state' }}
        drawing={{ activeTool: 'trend-line' }}
      />,
    );

    // The chart exists and the series were created: the missing binding did not stop the mount.
    expect(recording.series.length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: 'workspace' })).toBeInTheDocument();
    // And the teardown crosses the port in the same order, with no drawing layer to detach.
    inert.unmount();
    expect(recording.teardown[recording.teardown.length - 1]).toBe('chart.remove');
  });

  it('MAGNET-01, MAGNET-05 — a host that says nothing about the magnet gets free placement', () => {
    // The reported pain is being stuck ON with no way out, so the absent prop cannot mean "on".
    // The bar under the pointer has its high at 110 and its close at 105; the answer is neither.
    const { binding, log } = fakeBinding();
    render(
      <ChartSurface
        engine={fakeEngine().engine}
        convention={CONVENTION}
        data={{ bars: BARS, panes: [view(RATE)], read, pricePane: PRICE }}
        layout={{ heightPx: 480 }}
        a11y={{ label: 'workspace', describedBy: 'state' }}
        drawing={{ binding }}
      />,
    );

    expect(log.hosts[0].snapPrice({ time: BARS[0].time, price: 109 })).toBe(109);
  });

  it('MAGNET-01 — with the magnet on, the anchor resolves to the bar value under the pointer', () => {
    const { binding, log } = fakeBinding();
    render(
      <ChartSurface
        engine={fakeEngine().engine}
        convention={CONVENTION}
        data={{ bars: BARS, panes: [view(RATE)], read, pricePane: PRICE }}
        layout={{ heightPx: 480 }}
        a11y={{ label: 'workspace', describedBy: 'state' }}
        drawing={{ binding, magnet: 'on' }}
      />,
    );

    expect(log.hosts[0].snapPrice({ time: BARS[0].time, price: 109 })).toBe(110);
  });

  it('MAGNET-05 — the threshold defaults to eight pixels, measured against its own sentence', () => {
    // THE NUMBER, NOT A NUMBER. The low is 95; eight price units below it is eight pixels on this
    // scale and must snap, nine must not, and a host asking for nine gets the nine. Without all
    // three the default could be any value at all and nothing here would say so.
    const wide = fakeBinding();
    render(
      <ChartSurface
        engine={fakeEngine().engine}
        convention={CONVENTION}
        data={{ bars: BARS, panes: [view(RATE)], read, pricePane: PRICE }}
        layout={{ heightPx: 480 }}
        a11y={{ label: 'workspace', describedBy: 'state' }}
        drawing={{ binding: wide.binding, magnet: 'on', snapThresholdPx: 9 }}
      />,
    );
    const byDefault = fakeBinding();
    render(
      <ChartSurface
        engine={fakeEngine().engine}
        convention={CONVENTION}
        data={{ bars: BARS, panes: [view(RATE)], read, pricePane: PRICE }}
        layout={{ heightPx: 480 }}
        a11y={{ label: 'workspace', describedBy: 'state' }}
        drawing={{ binding: byDefault.binding, magnet: 'on' }}
      />,
    );

    expect(byDefault.log.hosts[0].snapPrice({ time: BARS[0].time, price: 87 })).toBe(95);
    expect(byDefault.log.hosts[0].snapPrice({ time: BARS[0].time, price: 86 })).toBe(86);
    expect(wide.log.hosts[0].snapPrice({ time: BARS[0].time, price: 86 })).toBe(95);
  });

  it('refuses to attach without the price pane — drawings are priced off the candle scale', () => {
    const { binding, log } = fakeBinding();
    render(
      <ChartSurface
        engine={fakeEngine().engine}
        convention={CONVENTION}
        data={{ bars: BARS, panes: [view(RATE)], read }}
        layout={{ heightPx: 480 }}
        a11y={{ label: 'workspace', describedBy: 'state' }}
        drawing={{ binding }}
      />,
    );
    // CONTROL POSITIVE for the attach test above: same binding, same panes, no anchor — no call.
    expect(log.hosts).toHaveLength(0);
  });
});

/**
 * THE SCALE WHEN THE BAR SET IS REPLACED — the reported defect, and the distinction that is the
 * heart of it.
 *
 * `setData` is called in BOTH cases: when the asset changes (an entirely different window, from
 * another market, in another price range) and when a live bar arrives (the SAME window, one item
 * longer). The surface touched the scale in neither of them, so switching asset left the chart on
 * the previous asset's window. The naive fix — redoing the scale on every `setData` — destroys the
 * user's zoom and scroll on every tick, which is a worse defect than the reported one and invisible
 * to a test that only exercises the switch. That is why both cases are here, and one is the other's
 * control positive.
 */
describe('the scale and the bar set', () => {
  const bar = (time: number, close: number): Bar => ({
    time: utcSeconds(time),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
  });
  const WINDOW_A: readonly Bar[] = [bar(1_700_000_000, 100), bar(1_700_000_060, 105)];
  const WINDOW_B: readonly Bar[] = [bar(1_800_000_000, 3), bar(1_800_000_060, 4)];

  const scaled = (over: Partial<SurfaceData> = {}) => {
    const recording = fakeEngine();
    const element = (extra: Partial<SurfaceData> = {}) => (
      <ChartSurface
        engine={recording.engine}
        convention={CONVENTION}
        data={{
          bars: WINDOW_A,
          panes: [],
          read: () => [],
          pricePane: PRICE,
          datasetId: 'BTCUSDT·1h',
          ...over,
          ...extra,
        }}
        layout={{ heightPx: 400 }}
        a11y={{ label: 'workspace', describedBy: 'state' }}
      />
    );
    const view = render(element());
    const rerender = (next: Partial<SurfaceData>): void => {
      view.rerender(element(next));
    };
    return {
      fits: recording.fits,
      scales: recording.scales,
      dragPriceAxis: recording.dragPriceAxis,
      rerender,
    };
  };

  /** The range the price pane's axis is showing. `null` = never framed. */
  const priceRange = (scales: Map<string, ScaleRecord>) => scales.get('right@0')?.range ?? null;

  it('once the first set is seeded, the whole window shows up — once', () => {
    const { fits } = scaled();
    expect(fits.count).toBe(1);
  });

  it('SWITCHING ASSET redoes the scale: the previous window does not describe the new', () => {
    const { fits, rerender } = scaled();

    rerender({ datasetId: 'ETHUSDT·1h', bars: WINDOW_B });

    expect(fits.count).toBe(2);
  });

  it('changing RESOLUTION too: these are other bars, not the same ones extended', () => {
    const { fits, rerender } = scaled();

    rerender({ datasetId: 'BTCUSDT·1d', bars: WINDOW_B });

    expect(fits.count).toBe(2);
  });

  it('a NEW BAR does not redo the scale — the zoom the user chose is theirs', () => {
    const { fits, rerender } = scaled();

    rerender({ bars: [...WINDOW_A, bar(1_700_000_120, 108)] });
    rerender({ bars: [...WINDOW_A, bar(1_700_000_120, 112)] });

    // The decisive case. An implementation that called `fitContent` on every `setData` would pass
    // every case above and rip the user's window away on every market tick.
    expect(fits.count).toBe(1);
  });

  it('with AUTO FIT on, the new bar does redo it — that is what the switch promises', () => {
    const { fits, rerender } = scaled({ autoFit: true });

    rerender({ autoFit: true, bars: [...WINDOW_A, bar(1_700_000_120, 108)] });

    expect(fits.count).toBe(2);
  });

  it('with no bars there is nothing to fit; the scale is made when the first window arrives', () => {
    const { fits, rerender } = scaled({ bars: [] });
    expect(fits.count).toBe(0);

    rerender({ bars: WINDOW_A });
    expect(fits.count).toBe(1);
  });

  /**
   * THE PRICE AXIS, and why counting `fitContent` was not enough.
   *
   * The cases above pass by counting CALLS, and that is exactly why the defect came back:
   * `fitContent()` belongs to the TIME axis. The price axis has an autoscale of its own, and the
   * base library turns it off FOREVER on the user's first drag over the axis —
   * `PriceScale._internal_scaleTo` does `setMode({ autoScale: false })`, and from then on
   * `Pane._internal_recalculate` returns on the first line without recomputing any range. Switching
   * asset reframes the time and leaves the price on the previous market's range: ETH at 1,880 on an
   * axis that reads 150,000, with the candles squeezed onto the floor.
   *
   * The cases below assert the RANGE, never the call.
   */
  it('SWITCHING ASSET rescales the PRICE AXIS, not just the time one', () => {
    const { scales, dragPriceAxis, rerender } = scaled();
    expect(priceRange(scales)).toEqual({ min: 99, max: 106 });

    // The gesture that creates the state of the defect, and that the base library enables by
    // default.
    dragPriceAxis();

    rerender({ datasetId: 'ETHUSDT·1h', bars: WINDOW_B });

    // THE DECISIVE CASE. An implementation that only called `fitContent` passes every case above
    // and fails here, leaving the previous market's range on the screen.
    expect(priceRange(scales)).toEqual({ min: 2, max: 5 });
  });

  it('a NEW BAR does not rearm the price axis — the vertical fit belongs to the user', () => {
    const { scales, dragPriceAxis, rerender } = scaled();
    dragPriceAxis();

    rerender({ bars: [...WINDOW_A, bar(1_700_000_120, 108)] });

    // Control positive for the case above: rearming on every `setData` would give the autoscale
    // back and rip away the chosen vertical framing on every market tick.
    expect(scales.get('right@0')?.autoScale).toBe(false);
    expect(priceRange(scales)).toEqual({ min: 99, max: 106 });
  });

  it('rearms ALL the panes: the volume own scale and the indicator pane one come along', () => {
    const priceWithVolume: PaneSpec = {
      ...PRICE,
      series: [series({ id: 'volume', label: 'Vol', shape: 'histogram', ownScale: true })],
    };
    const { scales, dragPriceAxis, rerender } = scaled({
      pricePane: priceWithVolume,
      panes: [view(RATE)],
      read: () => [500, 600],
    });
    expect(scales.get('volume')?.range).toEqual({ min: 500, max: 600 });
    expect(scales.get('right@1')?.range).toEqual({ min: 500, max: 600 });

    dragPriceAxis('volume');
    dragPriceAxis('right@1');

    rerender({
      pricePane: priceWithVolume,
      panes: [view(RATE)],
      datasetId: 'ETHUSDT·1h',
      bars: WINDOW_B,
      read: () => [7, 8],
    });

    expect(scales.get('volume')?.range).toEqual({ min: 7, max: 8 });
    expect(scales.get('right@1')?.range).toEqual({ min: 7, max: 8 });
  });
});

/**
 * THE TEARDOWN, IN ORDER — the second source of the "Object is disposed" reported on Firefox.
 *
 * WHAT USED TO HAPPEN. React destroys effect cleanups in THE ORDER THE EFFECTS WERE DECLARED, and
 * the effect that creates the chart is necessarily the first (everything else hangs off it). With
 * `chart.remove()` inside that first cleanup, all the rest of the teardown — the overlay
 * primitives, the drawing layer — was detaching from an ALREADY REMOVED chart. The base library
 * answers a `detachPrimitive` with a FULL invalidation, which it schedules in a
 * `requestAnimationFrame`; the frame runs later, when the chart's canvases have already been
 * discarded, and `fancy-canvas` throws `Object is disposed` from inside the callback — outside any
 * `try/catch` of the teardown, therefore as a page error.
 *
 * WHY THE ORDER IS THE ASSERTION, AND NOT "it did not throw". Nothing throws in jsdom: there is no
 * canvas, no `fancy-canvas`, no frame. What can be asserted without simulating half the base
 * library is the invariant the defect violates — nothing touches the chart after it has been
 * removed — and it is observable in the SEQUENCE of the calls that cross the port.
 */
describe('teardown — the chart is the LAST to fall', () => {
  const inertOverlay = (): Overlay => ({
    zOrder: 'behind',
    attached: () => undefined,
    detached: () => undefined,
    draw: () => undefined,
  });

  /** Logs the layer `detach` on the SAME tape as the engine calls, which is what compares them. */
  const loggingBinding = (log: string[]): DrawingBinding => () => ({
    setActiveTool: () => undefined,
    deleteSelection: () => undefined,
    clearAll: () => undefined,
    detach: () => {
      log.push('layer.detach');
    },
  });

  const mountForTeardown = (): Recording => {
    const recording = fakeEngine();
    const view1 = render(
      <ChartSurface
        engine={recording.engine}
        convention={CONVENTION}
        data={{ bars: BARS, panes: [view(RATE)], read, pricePane: PRICE }}
        layout={{ heightPx: 480 }}
        a11y={{ label: 'workspace', describedBy: 'state' }}
        overlays={[inertOverlay()]}
        drawing={{ binding: loggingBinding(recording.teardown) }}
      />,
    );
    view1.unmount();
    return recording;
  };

  it('detaches the overlay primitives BEFORE removing the chart', () => {
    const { teardown } = mountForTeardown();
    expect(teardown).toContain('detachPrimitive');
    expect(teardown).toContain('chart.remove');
    expect(teardown.indexOf('detachPrimitive')).toBeLessThan(teardown.indexOf('chart.remove'));
  });

  it('switches the drawing layer off BEFORE removing the chart', () => {
    const { teardown } = mountForTeardown();
    expect(teardown).toContain('layer.detach');
    expect(teardown.indexOf('layer.detach')).toBeLessThan(teardown.indexOf('chart.remove'));
  });

  it('removes the chart ONCE, and it is the last thing to happen', () => {
    // CONTROL POSITIVE for the two assertions above: an implementation that simply stopped removing
    // the chart would satisfy them vacuously (`indexOf` would return -1 on both sides). Here the
    // removal is required, counted, and required at the END — the leak and the wrong order fall
    // together.
    const { teardown } = mountForTeardown();
    expect(teardown.filter((step) => step === 'chart.remove')).toHaveLength(1);
    expect(teardown.at(-1)).toBe('chart.remove');
  });
});
