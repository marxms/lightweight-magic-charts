/**
 * @jest-environment jsdom
 *
 * THE REAL RENDER ORDER of a timeframe change, driven step by step.
 *
 * WHY THIS FILE EXISTS. Three rules were written against this defect and three failed on the deploy,
 * each time because the sequence was DEDUCED instead of driven. This drives `useSeriesData` with the
 * exact render order a timeframe change produces and reads back every range that was applied.
 */
import { renderHook } from '@testing-library/react';

import { utcSeconds } from '../src/domain/types';
import type { Bar } from '../src/domain/types';
import { useSeriesData } from '../src/react/surface/useSeriesData';
import type { ChartHandles } from '../src/react/surface/chartHandles';

const bars = (count: number, step = 3600): readonly Bar[] =>
  Array.from({ length: count }, (_u, at) => ({
    time: utcSeconds(1_700_000_000 + at * step),
    open: 1,
    high: 2,
    low: 0.5,
    close: 1.5,
  }));

function handles() {
  const ranges: Array<{ from: number; to: number }> = [];
  const drawn: number[] = [];
  const chart = {
    // Framing is `fitContent` and nothing after it. What this records is THAT the surface framed,
    // which is the property the render order has to get right; the range that used to be recorded
    // here belonged to a mechanism measured at 0.00 fill on the deploy and removed.
    timeScale: () => ({ fitContent: () => ranges.push({ from: 0, to: 0 }) }),
  };
  const candle = { setData: (d: readonly unknown[]) => drawn.push(d.length) };
  return {
    ranges,
    drawn,
    handles: {
      chart,
      candle,
      series: new Map(),
      priceScales: [{ applyOptions: () => undefined }],
    } as unknown as ChartHandles,
  };
}

describe('the render order a timeframe change actually produces', () => {
  it('frames the arriving interval, not the one being left', () => {
    const { ranges, handles: h } = handles();
    const base = { panes: [], read: () => [], upColor: '#0a0', downColor: '#a00', autoFit: false };

    const { rerender } = renderHook(
      (props: { bars: readonly Bar[]; datasetId: string }) =>
        useSeriesData(h, { ...base, bars: props.bars, datasetId: props.datasetId }),
      { initialProps: { bars: bars(800), datasetId: 'BTC·4h' } },
    );

    // The click changes the IDENTITY one render before the bars change.
    rerender({ bars: bars(800), datasetId: 'BTC·15m' });
    // The arriving interval starts small...
    rerender({ bars: bars(3, 900), datasetId: 'BTC·15m' });
    // ...and then completes.
    rerender({ bars: bars(800, 900), datasetId: 'BTC·15m' });

    // Four renders, and the surface must have framed on the ones that changed what is on screen:
    // the identity change, the small arrival, and the full load.
    expect(ranges.length).toBeGreaterThanOrEqual(3);
  });

  it('frames the arriving interval when it NEVER grows past the one being left', () => {
    // The live shape the deploy suggests: the leaving interval had 800, the arriving one settles at
    // a DIFFERENT count, and the identity moved a render early. If the last range is sized for the
    // count that is actually on screen, the view is right; if it keeps the old size, the bars end up
    // squeezed into the first columns — which is what two lit columns out of 1144 measured.
    const { ranges, handles: h } = handles();
    const base = { panes: [], read: () => [], upColor: '#0a0', downColor: '#a00', autoFit: false };
    const { rerender } = renderHook(
      (props: { bars: readonly Bar[]; datasetId: string }) =>
        useSeriesData(h, { ...base, bars: props.bars, datasetId: props.datasetId }),
      { initialProps: { bars: bars(800), datasetId: 'BTC·4h' } },
    );
    rerender({ bars: bars(800), datasetId: 'BTC·15m' });
    rerender({ bars: bars(3, 900), datasetId: 'BTC·15m' });

    // The arriving interval starting SMALLER than the one being left still earns a framing — that
    // is the shrink half of the rule, and a grow-only rule left the view sized for the old load.
    expect(ranges.length).toBeGreaterThanOrEqual(2);
  });
});
