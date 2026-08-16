/**
 * A compact chart cell for a grid layout — price and volume, NOTHING ELSE, deliberately.
 *
 * Replicating the full workspace per cell would multiply every pane and overlay by N, and the
 * overlays alone do not fit a 60fps budget four times over. It would also recreate the very thing
 * the composed surface exists to remove: several full chart instances kept in step by hand. So a
 * cell is one candlestick series and one volume histogram, and the main surface stays the one
 * place where the full analysis lives.
 *
 * THE CELL OWNS ITS OWN SCOPE. Each cell calls `openScope` for its own resolution — subscribe
 * first, buffer, fetch, seam check (I12/I13/I14) — and closes it as a unit on unmount or scope
 * change (I7/I8). Cells are therefore independent by construction: closing one never disturbs a
 * neighbour's session, which is the property the grid is for.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';

import { formatterFor, minMoveOf } from '../domain/format';
import { encodeDirection, scopeKey } from '../domain/types';
import type { Bar, PriceScaleConvention, Scope, ValueFormat } from '../domain/types';
import type { HistoryPort, LivePort } from '../port/ports';
import { openScope } from '../port/seedTransaction';
import type { ChartEngine, SeriesHandle, WorkspaceChartHandle } from '../port/chartApi';
import { useChromeTheme } from './chrome/ChromeContext';
import { DEFAULT_WORKSPACE_CHROME_LABELS } from './chrome/labels';
import { nextRovingIndex } from './chrome/rovingFocus';

export interface CompactCellLabels {
  /** Names the cell's timeframe group. Repeated per cell, so the title has to be in the name. */
  readonly timeframeGroup: (title: string) => string;
  readonly remove: (title: string) => string;
  readonly status: (bars: number, changePct: number) => string;
  /** The canvas' accessible name — it is a bitmap, and this is all a reader gets. */
  readonly chart: (title: string, timeframe: string) => string;
  readonly empty: string;
  readonly error: string;
  readonly loading: string;
}

/** The same object the whole contract carries — a second copy would drift on the first edit. */
export const DEFAULT_COMPACT_CELL_LABELS: CompactCellLabels =
  DEFAULT_WORKSPACE_CHROME_LABELS.compactCell;

export interface CompactCellProps {
  readonly engine: ChartEngine;
  /** The SAME port the main surface drinks from; the cell only asks for a shorter window. */
  readonly port: HistoryPort & LivePort;
  readonly scope: Scope;
  /** What the cell calls its market in its own chrome. The host names it; this never guesses. */
  readonly title: string;
  /** Timeframes the cell can switch to on its own. */
  readonly timeframes: readonly string[];
  readonly onTimeframe: (timeframe: string) => void;
  readonly onRemove?: () => void;
  readonly barCount?: number;
  readonly convention: PriceScaleConvention;
  /** The price axis' format. Omitted, the axis keeps the base library's default formatting. */
  readonly format?: ValueFormat;
  readonly labels?: CompactCellLabels;
  readonly testIdPrefix?: string;
}

/** Short on purpose: a cell is a glance, and its cost is proportional to its window. */
const DEFAULT_CELL_BAR_COUNT = 200;
/** Volume rides the bottom of the pane on a scale of its own, out of the candles' way. */
const VOLUME_SCALE_MARGINS = { top: 0.78, bottom: 0 };

interface CellReading {
  readonly bars: number;
  readonly changePct: number;
}

export function CompactCell({
  engine,
  port,
  scope,
  title,
  timeframes,
  onTimeframe,
  onRemove,
  barCount = DEFAULT_CELL_BAR_COUNT,
  convention,
  format,
  labels = DEFAULT_COMPACT_CELL_LABELS,
  testIdPrefix = 'compact-cell',
}: CompactCellProps): ReactElement {
  const theme = useChromeTheme();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<WorkspaceChartHandle | null>(null);
  const candleRef = useRef<SeriesHandle | null>(null);
  const volumeRef = useRef<SeriesHandle | null>(null);
  const [reading, setReading] = useState<CellReading | null>(null);
  const [failed, setFailed] = useState(false);

  const upColor = encodeDirection(convention, 1).color ?? theme.text;
  const downColor = encodeDirection(convention, -1).color ?? theme.text;

  // Same lifecycle rule as the main surface: the chart is built once and fed with setData.
  const mountRef = useRef({ engine, format, theme, upColor, downColor });
  mountRef.current = { engine, format, theme, upColor, downColor };
  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const mount = mountRef.current;

    const chart = mount.engine(host, {
      autoSize: true,
      layout: {
        background: { color: mount.theme.background },
        textColor: mount.theme.text,
        // Required by the base library's licence, on every cell — a cell is a chart like any other.
        attributionLogo: true,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: mount.theme.gridLine } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
    });
    chartRef.current = chart;

    candleRef.current = chart.addSeries('candlestick', {
      upColor: mount.upColor,
      downColor: mount.downColor,
      borderVisible: false,
      wickUpColor: mount.upColor,
      wickDownColor: mount.downColor,
      ...(mount.format === undefined
        ? {}
        : {
            priceFormat: {
              type: 'custom',
              formatter: formatterFor(mount.format),
              minMove: minMoveOf(mount.format),
            },
          }),
    });
    const volume = chart.addSeries('histogram', {
      priceFormat: { type: 'volume' },
      priceScaleId: 'cell-volume',
      priceLineVisible: false,
      lastValueVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: VOLUME_SCALE_MARGINS });
    volumeRef.current = volume;

    return () => {
      candleRef.current = null;
      volumeRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
    // Mount-only: the chart instance outlives every prop; the session effect feeds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Identified BY VALUE, so a host that passes a fresh scope literal each render does not tear the
  // session down every time anything on its page changes.
  const key = scopeKey(scope);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` IS `scope` by value — the memo exists to normalise the identity
  const session = useMemo(() => scope, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setReading(null);
    setFailed(false);

    const paint = (bars: readonly Bar[]): void => {
      candleRef.current?.setData(
        bars.map((bar) => ({
          time: bar.time,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        })),
      );
      volumeRef.current?.setData(
        bars.flatMap((bar) =>
          bar.volume === undefined
            ? []
            : [
                {
                  time: bar.time,
                  value: bar.volume,
                  color: bar.close >= bar.open ? upColor : downColor,
                },
              ],
        ),
      );
      const first = bars[0];
      const last = bars[bars.length - 1];
      setReading({
        bars: bars.length,
        changePct:
          first === undefined || last === undefined || first.close === 0
            ? 0
            : ((last.close - first.close) / first.close) * 100,
      });
    };

    const opened = openScope({
      scope: session,
      shape: 'delta',
      port,
      history: { from: 0, to: Number.MAX_SAFE_INTEGER, barCount },
      onState: (state) => paint(state.bars),
    });

    let live = true;
    opened.outcome.then(
      (outcome) => {
        if (!live) return;
        if (outcome.kind === 'stale-history') setFailed(true);
        // The whole seeded window, on screen. The default view shows only what fits the default
        // bar spacing, which for a glance-sized cell is a fraction of what was fetched.
        if (outcome.kind === 'seeded' || outcome.kind === 'seeded-unverified') {
          chartRef.current?.timeScale().fitContent();
        }
      },
      () => {
        if (live) setFailed(true);
      },
    );

    // I7/I8 — the session closes as a unit: subscription and in-flight fetch together.
    return () => {
      live = false;
      opened.unsubscribe();
    };
  }, [session, port, barCount, upColor, downColor]);

  const statusText = failed
    ? labels.error
    : reading === null
      ? labels.loading
      : reading.bars === 0
        ? labels.empty
        : labels.status(reading.bars, reading.changePct);

  /**
   * The cell's radio group — the THIRD occurrence of the same role declared without a keyboard.
   *
   * AUTOMATIC ACTIVATION, unlike the tab bar: `role="radio"` promises that focus and checking travel
   * together, and separating them would make the reader announce "1h, radio, not checked" for the
   * item the person has just reached. The price is opening one data session per arrow traversed; it
   * closes as a unit on every switch, and the price of the broken promise is higher.
   */
  const railRef = useRef<HTMLDivElement | null>(null);
  const checkedIndex = timeframes.indexOf(scope.resolution);
  // With a `resolution` outside the list NOTHING is checked; without the fallback to the first, the
  // whole group would leave the tab order and become unreachable by keyboard.
  const tabStopIndex = checkedIndex === -1 ? 0 : checkedIndex;

  const onRailKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const nodes = Array.from(railRef.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []);
    const next = nextRovingIndex(
      event.key,
      nodes.indexOf(document.activeElement as HTMLElement),
      nodes.length,
      'horizontal',
    );
    if (next === null) return;
    // Only after knowing the key is ours: the cell lives in a grid the host scrolls.
    event.preventDefault();
    nodes[next]?.focus();
    const timeframe = timeframes[next];
    if (timeframe !== undefined) onTimeframe(timeframe);
  };

  /** The cell's reading, pointed at BY DESCRIPTION from the canvas: see the `role="img"` below. */
  const statusId = `${testIdPrefix}-status`;

  return (
    <div
      data-testid={testIdPrefix}
      data-compact-cell=""
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        borderLeft: `1px solid ${theme.border}`,
        fontFamily: theme.fontFamily,
        color: theme.text,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 8px',
          borderBottom: `1px solid ${theme.border}`,
          fontSize: 10.5,
        }}
      >
        <strong>{title}</strong>
        {/* Arrow traversal is the obligation that comes with `role="radiogroup"`, and it is in
            `onRailKeyDown` — the handler lives on the group, not on each button, because the target
            of the movement is a SIBLING of whoever received the key. */}
        <div
          ref={railRef}
          role="radiogroup"
          aria-label={labels.timeframeGroup(title)}
          aria-orientation="horizontal"
          onKeyDown={onRailKeyDown}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {timeframes.map((timeframe, index) => (
            // biome-ignore lint/a11y/useSemanticElements: focus ring survives only on a real button
            <button
              type="button"
              key={timeframe}
              role="radio"
              aria-checked={timeframe === scope.resolution}
              // The group has ONE tab stop: traversal inside it is by arrow.
              tabIndex={index === tabStopIndex ? 0 : -1}
              data-testid={`${testIdPrefix}-tf-${timeframe}`}
              onClick={() => onTimeframe(timeframe)}
              style={{
                padding: '1px 6px',
                cursor: 'pointer',
                borderRadius: 3,
                fontSize: 10,
                border: `1px solid ${timeframe === scope.resolution ? theme.accent : 'transparent'}`,
                background: timeframe === scope.resolution ? theme.accentFill : 'transparent',
                color: timeframe === scope.resolution ? theme.accentText : theme.text,
              }}
            >
              {timeframe}
            </button>
          ))}
        </div>
        <span id={statusId} data-testid={statusId} style={{ marginLeft: 'auto', opacity: 0.6 }}>
          {statusText}
        </span>
        {onRemove !== undefined && (
          <button
            type="button"
            data-testid={`${testIdPrefix}-remove`}
            onClick={onRemove}
            aria-label={labels.remove(title)}
            title={labels.remove(title)}
            style={{ border: 'none', background: 'transparent', color: theme.text, cursor: 'pointer' }}
          >
            ✕
          </button>
        )}
      </div>
      <div
        ref={hostRef}
        data-testid={`${testIdPrefix}-chart`}
        // The canvas is invisible to assistive technology — no nodes, no text, no focus. The role
        // and the name are the only reading it has.
        role="img"
        aria-label={labels.chart(title, scope.resolution)}
        // And the cell's READING enters as the description of the canvas itself. The status text —
        // how many bars, how much it moved — was drawn alongside it with no tie to the chart at all:
        // whoever reads the screen heard "AAA · 15m" and nothing more, while the number that matters
        // sat a paragraph away in reading order.
        aria-describedby={statusId}
        style={{ flex: 1, minHeight: 0 }}
      />
    </div>
  );
}

export default CompactCell;
