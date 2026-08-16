/**
 * @jest-environment jsdom
 *
 * LMC-23 — the drawing seam, and THE DISCARD BY TOOL IDENTITY.
 *
 * WHAT THIS FILE PROVES AND NOBODY WAS PROVING. The layer hears each armed tool ONCE. It is not
 * thrift: it is what lets an implementation reset the gesture state on every `setActiveTool` without
 * losing the user's gesture. This chart re-renders on every cursor movement, so a seam with no
 * discard would resend the SAME tool dozens of times per second — and the consumer's
 * implementation, which has no way of knowing that nothing changed, would reset the stroke half way
 * through.
 *
 * The existing suite covered attaching once, routing the events, mounting with no binding at all
 * and refusing without the price pane [`test/workspaceSurface.spec.tsx` § "B1/B2 — the drawing
 * seam"]. None of the four re-renders with the same tool, which is the only condition in which the
 * discard shows up.
 */
import { render } from '@testing-library/react';

import { directionConvention, paneId, seriesId, utcSeconds } from '../src/domain/types';
import type { Bar, PaneSpec } from '../src/domain/types';
import type { DrawingBinding } from '../src/drawing/drawingLayer';
import type {
  ChartEngine,
  PaneHandle,
  SeriesHandle,
  WorkspaceChartHandle,
} from '../src/port/chartApi';
import { ChartSurface, type PaneView, type SeriesReader } from '../src/react/surface/ChartSurface';

function fakeEngine(): ChartEngine {
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
        createPriceLine: () => ({ applyOptions: () => undefined }),
        removePriceLine: () => undefined,
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

interface Log {
  /** EVERY `setActiveTool` call, in order — the discard is about the count, not about the value. */
  readonly armed: Array<string | null>;
  attaches: number;
}

function fakeBinding(log: Log): DrawingBinding {
  return () => {
    log.attaches += 1;
    return {
      setActiveTool: (id) => log.armed.push(id),
      deleteSelection: () => undefined,
      clearAll: () => undefined,
      detach: () => undefined,
    };
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

function mounted(log: Log, tool: string | null) {
  // The SAME binding on every render: a new identity would re-attach the layer, and re-attaching is
  // losing the user's drawings — another contract, covered by the surface suite.
  const binding = fakeBinding(log);
  const engine = fakeEngine();
  const props = {
    engine,
    convention: CONVENTION,
    data: { bars: BARS, panes: [view(RATE)], read, pricePane: PRICE },
    a11y: { label: 'workspace', describedBy: 'state' },
  };
  const draw = (b: DrawingBinding, tool: string | null, heightPx = 480) => (
    <ChartSurface {...props} layout={{ heightPx }} drawing={{ binding: b, activeTool: tool }} />
  );
  const rendered = render(draw(binding, tool));
  return {
    rerender: (next: string | null, heightPx = 480): void => {
      rendered.rerender(draw(binding, next, heightPx));
    },
    /** NEW binding and new tool in the same render — the commit where attach and push coincide. */
    reattachWith: (nextBinding: DrawingBinding, next: string | null): void => {
      rendered.rerender(draw(nextBinding, next));
    },
  };
}

describe('LMC-23 — the layer hears each armed tool ONCE', () => {
  it('re-arming the SAME tool does not speak to the layer again', () => {
    const log: Log = { armed: [], attaches: 0 };
    const { rerender } = mounted(log, 'trend-line');
    expect(log.armed).toEqual(['trend-line']);

    rerender('trend-line');
    rerender('trend-line');

    // THE DECISIVE CASE. Without the discard, every render would resend — and the consumer's
    // implementation, which does not know that nothing changed, would reset the gesture in progress.
    expect(log.armed).toEqual(['trend-line']);
    expect(log.attaches).toBe(1);
  });

  it('a render that does not touch the tool does not speak to the layer either', () => {
    // The real condition: the chart re-renders for anything at all — here, the height budget.
    const log: Log = { armed: [], attaches: 0 };
    const { rerender } = mounted(log, 'trend-line');

    rerender('trend-line', 500);

    expect(log.armed).toEqual(['trend-line']);
  });

  it('POSITIVE CONTROL: switching tools still arrives, and disarming too', () => {
    // Without this half, a seam that never spoke after the attach would pass the two cases above —
    // and "hears once" would become "never hears again".
    const log: Log = { armed: [], attaches: 0 };
    const { rerender } = mounted(log, 'trend-line');

    rerender('ruler');
    rerender('ruler');
    rerender(null);
    rerender(null);

    expect(log.armed).toEqual(['trend-line', 'ruler', null]);
  });

  it('the tool armed BEFORE the attach arrives once, and not twice', () => {
    // The attach pushes whatever was armed; the push effect runs right after, in the same commit,
    // and has to recognise that the layer has already heard it.
    const log: Log = { armed: [], attaches: 0 };
    mounted(log, 'trend-line');

    expect(log.armed).toEqual(['trend-line']);
  });

  it('a NEW binding and a new tool in the same render deliver the tool only once', () => {
    // THE CASE WHERE THE RECORD OF "WHAT WAS SENT" IS THE ONLY THING HOLDING. In this commit BOTH
    // effects run: the attach, because the binding's identity changed, and the push, because the
    // tool changed. The attach already delivered the new tool; without the record, the push
    // delivers it again, and the consumer's implementation resets the gesture that has just begun.
    const log: Log = { armed: [], attaches: 0 };
    const { reattachWith } = mounted(log, 'trend-line');
    expect(log.attaches).toBe(1);

    reattachWith(fakeBinding(log), 'ruler');

    expect(log.attaches).toBe(2);
    expect(log.armed).toEqual(['trend-line', 'ruler']);
  });
});
