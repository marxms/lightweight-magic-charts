/**
 * WHICH NUMBERS THE LEGEND SAYS — a model decision, not a render one.
 * See docs/explanation/layout.md#the-legend-prints-what-was-measured
 */

import { formatterFor } from '../domain/format';
import type { Bar, PaneSpec } from '../domain/types';
import type { PaneBox } from './paneBoxes';

/** A pane shorter than this gets no label. See docs/explanation/layout.md#too-short-to-label */
export const MIN_LABELLED_PANE_PX = 18;

export interface LegendEntry {
  readonly id: string;
  readonly label: string;
  /** `null` uses the theme's text colour — a reading that carries no direction of its own. */
  readonly color: string | null;
  /** Already formatted by the PANE's format: a legend formatting unlike its own axis lies. */
  readonly value: string;
}

export interface LegendLine {
  readonly id: string;
  readonly title: string;
  /** Distance from the top of the surface to the top of the pane this line names. */
  readonly topPx: number;
  readonly entries: readonly LegendEntry[];
}

/** The minimum the model needs to know about a drawn pane. See docs/explanation/layout.md#why-legendpaneview-is-local */
export interface LegendPaneView {
  readonly spec: PaneSpec;
  readonly visible: boolean;
}

export interface LegendModelInput {
  /** Where each pane sits. Measured off the DOM when it exists, derived from the layout when not. */
  readonly boxes: ReadonlyMap<string, PaneBox>;
  /** Omitted = no price drawn, and no price line. */
  readonly pricePane?: PaneSpec;
  /** What the host calls the market. Absent, the pane's own title serves. */
  readonly priceCaption?: string;
  readonly panes: readonly LegendPaneView[];
  readonly bars: readonly Bar[];
  /** The bar the legend speaks of: the one under the cursor, or the last one at rest. */
  readonly readAt: number;
  /** Readings already loaded, per pane, in the declaration order of the series. */
  readonly readingsByPane: ReadonlyMap<string, ReadonlyArray<ReadonlyArray<number | null>>>;
  readonly upColor: string;
  readonly downColor: string;
}

/** The legend's lines, in stacking order: price first, then panes. See docs/explanation/layout.md#no-empty-lines */
export function legendModel(input: LegendModelInput): LegendLine[] {
  const { boxes, pricePane, priceCaption, panes, bars, readAt, readingsByPane } = input;
  const lines: LegendLine[] = [];
  const roomFor = (id: string): number | null => {
    const box = boxes.get(id);
    if (box === undefined) return null;
    return box.height >= MIN_LABELLED_PANE_PX ? box.top : null;
  };

  if (pricePane !== undefined) {
    const top = roomFor(String(pricePane.id));
    // Clamped at both ends. See docs/explanation/layout.md#clamping-the-read-index
    const bar = bars.length === 0 ? null : bars[Math.min(Math.max(readAt, 0), bars.length - 1)];
    if (top !== null) {
      const price = formatterFor(pricePane.format);
      // A zero open has no defined percentage change. See docs/explanation/layout.md#a-zero-open-has-no-change
      const change = bar === null || bar.open === 0 ? null : ((bar.close - bar.open) / bar.open) * 100;
      lines.push({
        id: String(pricePane.id),
        title: priceCaption ?? pricePane.title,
        topPx: top,
        entries:
          bar === null
            ? []
            : [
                // The initials stay untranslated. See docs/explanation/layout.md#why-the-ohlc-initials-stay-untranslated
                { id: 'o', label: 'O', color: null, value: price(bar.open) },
                { id: 'h', label: 'H', color: null, value: price(bar.high) },
                { id: 'l', label: 'L', color: null, value: price(bar.low) },
                { id: 'c', label: 'C', color: null, value: price(bar.close) },
                {
                  id: 'chg',
                  label: '',
                  color: change !== null && change >= 0 ? input.upColor : input.downColor,
                  value: change === null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`,
                },
                ...pricePane.series.map((spec, position) => {
                  const value = readingsByPane.get(String(pricePane.id))?.[position]?.[readAt] ?? null;
                  const format = formatterFor(spec.format ?? pricePane.format);
                  return {
                    id: String(spec.id),
                    label: spec.label,
                    color: spec.color,
                    value: value === null ? '—' : format(value),
                  };
                }),
              ],
      });
    }
  }

  for (const view of panes) {
    if (!view.visible) continue;
    const paneKey = String(view.spec.id);
    const top = roomFor(paneKey);
    if (top === null) continue;
    const format = formatterFor(view.spec.format);
    const readings = readingsByPane.get(paneKey) ?? [];
    lines.push({
      id: paneKey,
      title: view.spec.title,
      topPx: top,
      entries: view.spec.series.map((spec, position) => {
        const value = readings[position]?.[readAt] ?? null;
        return {
          id: String(spec.id),
          label: spec.label,
          color: spec.color,
          // An em dash and never zero. See docs/explanation/layout.md#an-em-dash-and-never-zero
          value: value === null ? '—' : format(value),
        };
      }),
    });
  }
  return lines;
}
