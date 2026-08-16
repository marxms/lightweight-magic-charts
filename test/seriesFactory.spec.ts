import { readFileSync } from 'fs';
import { join } from 'path';

import { DEFAULT_WORKSPACE_THEME } from '../src/react/theme';
import { directionConvention, paneId, seriesId, type PaneSpec, type SeriesSpec } from '../src/domain/types';
import type { ChartEngine, SeriesHandle, WorkspaceChartHandle } from '../src/port/chartApi';
import {
  createChartSurface,
  seriesKey,
  twinKey,
  twinShapeOf,
  type ChartPalette,
  type FactoryPaneView,
} from '../src/render/seriesFactory';
import { collectSources } from './gates/sourceScan';

/**
 * LMC-20, LMC-23 — the chart's creation, repatriated and PROVEN identical.
 *
 * ── HOW THE PARITY RECORDING WAS MADE ──
 *
 * Creation is IMPERATIVE, so the recording is not a return value: it is the SEQUENCE of calls that
 * cross the port, with the options of each one. Before the first line left
 * `react/ChartSurface.tsx`, a temporary harness mounted the PREVIOUS surface (commit ef880cc)
 * against an engine that records everything, over the corpus declared below, and wrote
 * `fixtures/seriesFactoryParity.json`. The harness was deleted in the same commit that moves the
 * code.
 *
 * THE PRICE FORMAT is recorded by APPLYING the formatter to probe values, never by function
 * identity. Two reasons: a function does not serialise, and what has to be equal is what the axis
 * SHOWS — an identity comparison would walk straight past a formatter swapped for an equivalent one
 * and would fail on one that was recreated without changing behaviour.
 */

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'seriesFactoryParity.json'), 'utf8'),
) as {
  readonly probes: readonly number[];
  readonly cases: ReadonlyArray<readonly [string, ReadonlyArray<Record<string, unknown>>]>;
};

const PROBES = FIXTURE.probes;

/** The SAME recording engine as the capture harness, re-declared here — the record's other half. */
function recordingEngine(log: Array<Record<string, unknown>>): ChartEngine {
  let nextPane = 1;
  return (_host, options) => {
    log.push({ call: 'createChart', options: JSON.parse(JSON.stringify(options)) as unknown });
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
      addPane: () => {
        log.push({ call: 'addPane', index: nextPane });
        return makePane(nextPane++);
      },
      addSeries: (shape, options, paneIndex): SeriesHandle => {
        const raw = options as Record<string, unknown>;
        const priceFormat = raw.priceFormat as
          | { formatter?: (value: number) => string; minMove?: number }
          | undefined;
        const scaleId = typeof raw.priceScaleId === 'string' ? raw.priceScaleId : `right@${paneIndex ?? 0}`;
        log.push({
          call: 'addSeries',
          shape,
          paneIndex: paneIndex ?? 0,
          color: raw.color ?? null,
          upColor: raw.upColor ?? null,
          downColor: raw.downColor ?? null,
          lineWidth: raw.lineWidth ?? null,
          priceLineVisible: raw.priceLineVisible ?? null,
          lastValueVisible: raw.lastValueVisible ?? null,
          borderVisible: raw.borderVisible ?? null,
          wickUpColor: raw.wickUpColor ?? null,
          wickDownColor: raw.wickDownColor ?? null,
          visible: raw.visible ?? null,
          priceScaleId: raw.priceScaleId ?? null,
          minMove: priceFormat?.minMove ?? null,
          formatted: priceFormat?.formatter === undefined ? null : PROBES.map(priceFormat.formatter),
        });
        return {
          setData: () => undefined,
          applyOptions: () => undefined,
          setMarkers: () => undefined,
          priceScale: () => ({
            applyOptions: (next) => {
              if (next.scaleMargins === undefined) return;
              log.push({
                call: 'scaleMargins',
                scaleId,
                top: next.scaleMargins.top,
                bottom: next.scaleMargins.bottom,
              });
            },
          }),
          createPriceLine: () => ({ applyOptions: () => undefined }),
          removePriceLine: () => undefined,
          priceToCoordinate: () => null,
          coordinateToPrice: () => null,
          attachPrimitive: () => undefined,
          detachPrimitive: () => undefined,
        };
      },
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
const BUDGET = { priceFloorPx: 180, defaultPaneHeightPx: 90 };
const THEME: ChartPalette = DEFAULT_WORKSPACE_THEME;

const series = (over: Omit<Partial<SeriesSpec>, 'id'> & { id: string; label: string }): SeriesSpec => ({
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
const PRICE_WITH_COMPANIONS: PaneSpec = {
  ...PRICE,
  series: [
    series({ id: 'vol', label: 'Vol', shape: 'histogram', ownScale: true, format: { kind: 'compact', decimals: 1 } }),
    series({ id: 'ovl', label: 'Ovl', color: '#4fc3f7' }),
  ],
};
const RATE: PaneSpec = {
  id: paneId('rate'),
  title: 'Rate',
  format: { kind: 'percent', decimals: 4 },
  targetHeightPx: 90,
  defaultVisible: true,
  series: [series({ id: 'rate', label: 'Rate', shape: 'histogram', lineWidth: 2 })],
};
const BOUNDED: PaneSpec = {
  id: paneId('bounded'),
  title: 'Bounded',
  format: { kind: 'ratio', decimals: 2 },
  targetHeightPx: 126,
  defaultVisible: true,
  series: [series({ id: 'a', label: 'A', color: '#ffb74d' }), series({ id: 'b', label: 'B', shape: 'area' })],
};
const HIDDEN: PaneSpec = {
  id: paneId('hidden'),
  title: 'Hidden',
  format: { kind: 'custom', format: (v) => v.toFixed(0), minMove: 0.01 },
  targetHeightPx: 90,
  defaultVisible: false,
  series: [series({ id: 'ratio', label: 'Ratio', color: '#91a069' })],
};

const view = (spec: PaneSpec): FactoryPaneView => ({ spec });

const CASES: ReadonlyArray<readonly [string, PaneSpec | undefined, readonly FactoryPaneView[]]> = [
  ['price plus three panes, one of them hidden', PRICE, [view(RATE), view(BOUNDED), view(HIDDEN)]],
  ['price with companions, one on its own scale', PRICE_WITH_COMPANIONS, [view(RATE)]],
  ['no price pane: the first listed becomes the anchor', undefined, [view(RATE), view(BOUNDED)]],
  ['the price pane alone', PRICE, []],
  ['a pane with no series at all', PRICE, [view({ ...RATE, series: [] })]],
];

function run(at: number): { log: Array<Record<string, unknown>>; created: ReturnType<typeof createChartSurface> } {
  const [, pricePane, panes] = CASES[at];
  const log: Array<Record<string, unknown>> = [];
  const created = createChartSurface({
    host: {} as HTMLElement,
    engine: recordingEngine(log),
    pricePane,
    panes,
    convention: CONVENTION,
    budget: BUDGET,
    theme: THEME,
  });
  return { log, created };
}

describe('LMC-22 — parity: the same declarations, the same conversation with the port', () => {
  it('the corpus and the record have the same size and the same names — a mute case does not pass', () => {
    expect(CASES.length).toBe(FIXTURE.cases.length);
    expect(CASES.map(([name]) => name)).toEqual(FIXTURE.cases.map(([name]) => name));
    expect(PROBES.length).toBeGreaterThanOrEqual(4);
    // The record is neither empty nor trivial: the largest case talks to the port dozens of times.
    expect(FIXTURE.cases[0][1].length).toBeGreaterThanOrEqual(14);
  });

  it.each(CASES.map(([name], at) => [name, at] as const))(
    'talks to the port exactly as the previous one did: %s',
    (_name, at) => {
      expect(run(at).log).toEqual(FIXTURE.cases[at][1]);
    },
  );

  it('the record DISCRIMINATES — each rule altered breaks the parity of a named case', () => {
    const [, , panes] = CASES[0];

    // 1. HIDDEN PANE NOT CREATED — the most expensive invariant in the file. Without the hidden
    //    pane, the panes below it are renumbered and every stored index points one row higher.
    const withoutHidden: Array<Record<string, unknown>> = [];
    createChartSurface({
      host: {} as HTMLElement,
      engine: recordingEngine(withoutHidden),
      pricePane: PRICE,
      panes: panes.slice(0, 2),
      convention: CONVENTION,
      budget: BUDGET,
      theme: THEME,
    });
    expect(withoutHidden).not.toEqual(FIXTURE.cases[0][1]);

    // 2. SHARED FORMAT — a pane with no format of its own widens everyone's axis, because the base
    //    library takes the maximum width across the panes and applies it to all of them.
    const sharedFormat: Array<Record<string, unknown>> = [];
    createChartSurface({
      host: {} as HTMLElement,
      engine: recordingEngine(sharedFormat),
      pricePane: PRICE,
      panes: panes.map((item) => ({ spec: { ...item.spec, format: PRICE.format } })),
      convention: CONVENTION,
      budget: BUDGET,
      theme: THEME,
    });
    expect(sharedFormat).not.toEqual(FIXTURE.cases[0][1]);

    // 3. MARGINS SWAPPED between the indicator pane and the price pane: the first plotted point
    //    ends up drawn underneath its own label.
    const margens = FIXTURE.cases[0][1].filter((entry) => entry.call === 'scaleMargins');
    expect(margens.map((entry) => entry.top)).toEqual([0.12, 0.24, 0.24, 0.24]);

    // 4. INVERTED PALETTE: the convention is an ARGUMENT, and the candles swap sides with it.
    const invertido: Array<Record<string, unknown>> = [];
    createChartSurface({
      host: {} as HTMLElement,
      engine: recordingEngine(invertido),
      pricePane: PRICE,
      panes,
      convention: directionConvention({ upColor: '#ef5350', downColor: '#26a69a' }),
      budget: BUDGET,
      theme: THEME,
    });
    expect(invertido).not.toEqual(FIXTURE.cases[0][1]);
  });
});

describe('LMC-23 — every pane is created, the hidden one included', () => {
  it('the switched-off pane gets `addPane` and gets its series', () => {
    // THE INVARIANT, asserted on the effect and not on the intent: destroying a pane renumbers every
    // pane below it, so an invisible pane is COLLAPSED and never absent.
    const { log, created } = run(0);
    const panes = log.filter((entry) => entry.call === 'addPane');
    expect(panes.map((entry) => entry.index)).toEqual([1, 2, 3]);
    expect(created.series.has(seriesKey('hidden', 'ratio'))).toBe(true);

    // POSITIVE CONTROL: the hidden pane's index is the LAST one, so the panes above it keep the
    // indices they would have had if it did not exist — the defect would be the ones below rising.
    const ocultas = log.filter((entry) => entry.call === 'addSeries' && entry.paneIndex === 3);
    expect(ocultas).toHaveLength(2); // the declared series and the hidden twin
  });

  it('a pane with no series at all still occupies its row', () => {
    const { log } = run(4);
    expect(log.filter((entry) => entry.call === 'addPane').map((entry) => entry.index)).toEqual([1]);
    // And it configures no scale: with no series there is no scale to hang a margin on.
    expect(log.filter((entry) => entry.call === 'scaleMargins')).toHaveLength(1);
  });
});

describe('LMC-23 — each pane’s format and margins reach the scale', () => {
  it('each pane takes its OWN formatter to the axis, and two panes never coincide', () => {
    const { log } = run(0);
    const created = log.filter((entry) => entry.call === 'addSeries');
    const formatted = (paneIndex: number): readonly string[] =>
      (created.find((entry) => entry.paneIndex === paneIndex)?.formatted ?? []) as readonly string[];

    // The named defect: a single format makes the base library take the maximum axis width across
    // panes and apply it to all of them, and the right-hand column starts reading as a meaningless
    // band.
    expect(formatted(1)).not.toEqual(formatted(2));
    expect(formatted(2)).not.toEqual(formatted(3));
    expect(formatted(0)).not.toEqual(formatted(1));
  });

  it('the companion with its own scale gets a scale id and the margins of the bottom sixth', () => {
    const { log } = run(1);
    const own = log.find((entry) => entry.call === 'addSeries' && entry.priceScaleId === 'vol');
    expect(own).toBeDefined();
    expect(log).toContainEqual({ call: 'scaleMargins', scaleId: 'vol', top: 0.84, bottom: 0 });

    // POSITIVE CONTROL: the companion WITHOUT a scale of its own gets no id at all — omitting it is
    // what puts it on the candles' scale, which is where an overlay belongs.
    const overlay = log.find(
      (entry) => entry.call === 'addSeries' && entry.color === '#4fc3f7',
    );
    expect(overlay?.priceScaleId).toBeNull();
  });

  it('every configured scale enters the list, so that refitting reaches all of them', () => {
    const { log, created } = run(1);
    expect(created.priceScales).toHaveLength(
      log.filter((entry) => entry.call === 'scaleMargins').length,
    );
    expect(created.priceScales.length).toBeGreaterThan(1);
  });
});

describe('LMC-23 — the hidden twin and the anchor', () => {
  it('line and histogram get a twin; candle and area have no pair', () => {
    expect(twinShapeOf(series({ id: 'x', label: 'X', shape: 'line' }))).toBe('histogram');
    expect(twinShapeOf(series({ id: 'x', label: 'X', shape: 'histogram' }))).toBe('line');
    expect(twinShapeOf(series({ id: 'x', label: 'X', shape: 'area' }))).toBeNull();

    const { log, created } = run(0);
    expect(created.series.has(twinKey(seriesKey('bounded', 'a')))).toBe(true);
    // POSITIVE CONTROL: the area on the same pane got no twin, so the rule belongs to the pair and
    // not to the pane.
    expect(created.series.has(twinKey(seriesKey('bounded', 'b')))).toBe(false);
    // The twin is born invisible — switching style is a visibility switch and never an `addSeries`.
    const twins = log.filter((entry) => entry.call === 'addSeries' && entry.visible === false);
    expect(twins.length).toBeGreaterThan(0);
  });

  it('with a price pane the anchor is the candle; without one it is the first pane’s first series', () => {
    // ONE creation, read twice: `run` creates a new chart on every call, so comparing identity
    // across two calls would compare two different objects.
    const withPrice = run(0).created;
    expect(withPrice.candle).not.toBeNull();
    expect(withPrice.anchor).toBe(withPrice.candle);

    const noPrice = run(2).created;
    expect(noPrice.candle).toBeNull();
    expect(noPrice.anchor).not.toBeNull();
    // With no candles there is no alert: a price level is priced on their scale.
    expect(noPrice.alerts).toBeNull();
    expect(withPrice.alerts).not.toBeNull();
  });
});

describe('LMC-23 — creation left the component', () => {
  it('the module does not import React, and the surface does not redeclare the creation', () => {
    const sources = collectSources(join(__dirname, '..', 'src'));
    const factory = sources.find((source) => source.file === 'render/seriesFactory.ts');
    expect(factory).toBeDefined();
    expect(factory?.text).not.toMatch(/from 'react'/);

    const surface = sources.find((source) => source.file === 'react/surface/ChartSurface.tsx');
    expect(surface).toBeDefined();
    // Same reason as `paneBoxes`: the surface went down one level, and the import went down with it.
    expect(surface?.text).toMatch(/from '(?:\.\.\/)+render\/seriesFactory'/);
    // `chart.addSeries(` and not `addSeries`: the surface's header explains in PROSE why switching
    // style is never an `addSeries`, and a gate that flags the text of the rule instead of the
    // violation of it is a gate somebody switches off.
    expect(surface?.text).not.toMatch(/chart\.addSeries/);
    expect(surface?.text).not.toMatch(/attributionLogo/);
    expect(surface?.text).not.toMatch(/SCALE_MARGINS/);
    expect(surface?.text).not.toMatch(/new PriceAlertLines/);
  });

  it('the licence attribution mark stays, and stays inside the package that depends on the base', () => {
    // The base library is Apache-2.0 and the licence requires the mark on screen. It changed file in
    // this commit, and a consumer assembling its own options must not be able to omit it.
    const { log } = run(0);
    const options = log[0].options as { layout: { attributionLogo: boolean } };
    expect(options.layout.attributionLogo).toBe(true);
  });
});
