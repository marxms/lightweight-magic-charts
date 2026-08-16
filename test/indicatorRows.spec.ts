/**
 * `buildWorkspaceRows` — series responses folded into one row per bar.
 *
 * The derivatives fixtures are the SAME INPUTS the host's component suite feeds today — contracts
 * falling while the notional they imply rises — so the equality of output across the move is
 * asserted rather than presumed.
 */
import {
  buildWorkspaceRows,
  type DerivativeSeries,
  type DerivativeSnapshot,
  type ReadingSeries,
  type RowBar,
} from '../src/indicator/rows';

const TF_MS = 7_200_000;
const T0 = 1_710_000_000_000;

const CONTRACTS = [90_000, 84_000, 78_000];
const PRICE = [50_000, 58_000, 68_000];
const NOTIONAL = CONTRACTS.map((contracts, index) => contracts * PRICE[index]);

const BARS: RowBar[] = CONTRACTS.map((_, index) => ({
  timestamp: T0 + index * TF_MS,
  volume: 1000 + index,
}));

const derivatives = (
  snapshotOf: (index: number) => DerivativeSnapshot | null,
): DerivativeSeries => ({
  data: CONTRACTS.map((_, index) => ({
    timestamp: T0 + index * TF_MS,
    snapshot: snapshotOf(index),
  })),
});

const readings = (
  entries: readonly { name: string; values: (number | null)[]; timestamps?: number[] }[],
): ReadingSeries => ({ data: [{ indicators: entries }] });

const STAMPS = BARS.map((bar) => bar.timestamp);

describe('the derivatives projection', () => {
  it('lands contracts on the plotted field and keeps the notional out of it', () => {
    const rows = buildWorkspaceRows(
      BARS,
      null,
      derivatives((index) => ({
        openInterestBase: CONTRACTS[index],
        openInterest: NOTIONAL[index],
      })),
    );

    expect(rows.map((row) => row.openInterestBase)).toEqual(CONTRACTS);
    expect(rows.map((row) => row.openInterest)).toEqual(NOTIONAL);
    // Control positive, stated as an inequality: the plotted series FALLS while the notional RISES,
    // so a projection reaching for the notional flips the pane's direction instead of shifting it.
    expect(rows[rows.length - 1].openInterestBase as number).toBeLessThan(
      rows[0].openInterestBase as number,
    );
    expect(NOTIONAL[NOTIONAL.length - 1]).toBeGreaterThan(NOTIONAL[0]);
  });

  it('leaves the plotted field null when the wire carries only the notional', () => {
    const rows = buildWorkspaceRows(
      BARS,
      null,
      derivatives((index) => ({ openInterest: NOTIONAL[index] })),
    );

    expect(rows.map((row) => row.openInterestBase)).toEqual([null, null, null]);
    expect(rows.map((row) => row.openInterest)).toEqual(NOTIONAL);
  });

  it('leaves the plotted field null when the point carries no snapshot at all', () => {
    const rows = buildWorkspaceRows(BARS, null, derivatives(() => null));

    expect(rows.map((row) => row.openInterestBase)).toEqual([null, null, null]);
    expect(rows.map((row) => row.fundingRate)).toEqual([null, null, null]);
  });

  it('ignores a derivatives point that lands on no bar of the window', () => {
    const rows = buildWorkspaceRows(BARS, null, {
      data: [{ timestamp: T0 - TF_MS, snapshot: { openInterestBase: 1 } }],
    });

    expect(rows.map((row) => row.openInterestBase)).toEqual([undefined, undefined, undefined]);
  });
});

describe('the readings', () => {
  it('places a value on the bar its own timestamp names', () => {
    const rows = buildWorkspaceRows(
      BARS,
      readings([{ name: 'rsi', values: [10, 20, 30], timestamps: [...STAMPS] }]),
      null,
    );

    expect(rows.map((row) => row.rsi)).toEqual([10, 20, 30]);
  });

  it('drops a series that arrived without timestamps rather than aligning it by index', () => {
    // Index alignment maps every value one candle late whenever the in-progress bar is in the
    // window: the chart then asserts a reading for a bar that never had one.
    const rows = buildWorkspaceRows(BARS, readings([{ name: 'rsi', values: [10, 20, 30] }]), null);

    expect(rows.map((row) => row.rsi)).toEqual([undefined, undefined, undefined]);
  });

  it('drops a series whose timestamps do not pair one-to-one with its values', () => {
    const rows = buildWorkspaceRows(
      BARS,
      readings([{ name: 'rsi', values: [10, 20, 30], timestamps: [STAMPS[0], STAMPS[1]] }]),
      null,
    );

    expect(rows.map((row) => row.rsi)).toEqual([undefined, undefined, undefined]);
  });

  it('skips a null or non-finite reading instead of writing it onto the grid', () => {
    const rows = buildWorkspaceRows(
      BARS,
      readings([{ name: 'rsi', values: [10, null, Number.NaN], timestamps: [...STAMPS] }]),
      null,
    );

    expect(rows.map((row) => row.rsi)).toEqual([10, undefined, undefined]);
  });

  it('keeps the FIRST value written for a name, so a later duplicate cannot overwrite it', () => {
    const rows = buildWorkspaceRows(
      BARS,
      readings([
        { name: 'rsi', values: [10, 20, 30], timestamps: [...STAMPS] },
        { name: 'rsi', values: [99, 99, 99], timestamps: [...STAMPS] },
      ]),
      null,
    );

    expect(rows.map((row) => row.rsi)).toEqual([10, 20, 30]);
  });
});

describe('volume', () => {
  it('is seeded from the BAR, because nothing computes it and it cannot be missing', () => {
    const rows = buildWorkspaceRows(BARS, null, null);

    expect(rows.map((row) => row.volume)).toEqual([1000, 1001, 1002]);
  });

  it('reads as null, never as zero, when the feed carries no volume', () => {
    const rows = buildWorkspaceRows(
      [{ timestamp: T0 }, { timestamp: T0 + TF_MS, volume: null }],
      null,
      null,
    );

    expect(rows.map((row) => row.volume)).toEqual([null, null]);
  });
});

describe('the grid', () => {
  it('emits one row per bar, in bar order, keyed by the bar timestamp', () => {
    const rows = buildWorkspaceRows(BARS, null, null);

    expect(rows).toHaveLength(BARS.length);
    expect(rows.map((row) => row.timestamp)).toEqual(STAMPS);
  });
});
