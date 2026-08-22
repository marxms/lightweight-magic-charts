/** Lanes: the pre-created drawing slots. See docs/explanation/catalogue.md#why-lanes-exist-at-all */

import type { ValueFormat } from '../domain/types';
import type { PaneDraft, SeriesDraft } from './draft';

/** One-based in the text, zero-based in the argument. See docs/explanation/catalogue.md#the-lane-identifiers */
export const lanePaneId = (lane: number): string => `ind${lane + 1}`;
export const laneSeriesId = (lane: number, plot: number): string => `ind${lane + 1}p${plot + 1}`;
export const priceOverlaySeriesId = (lane: number, plot: number): string =>
  `ovl${lane + 1}p${plot + 1}`;

export interface LaneDraftOptions<TBinding> {
  /** Zero-based position of the lane among the pre-created ones. */
  readonly lane: number;
  /** A label of last resort. See docs/explanation/catalogue.md#the-fallback-title */
  readonly title: string;
  readonly format: ValueFormat;
  readonly plots: number;
  /** Cycled by position. No default. See docs/explanation/catalogue.md#the-palette-does-not-rise */
  readonly colors: readonly string[];
  readonly targetHeightPx?: number;
  /** What the consumer needs to remember about each line, keyed by the field just minted. */
  readonly bind: (field: string) => TBinding;
}

/** The empty lane, pre-created. See docs/explanation/catalogue.md#the-lane-is-born-collapsed */
export function laneDraft<TBinding>(options: LaneDraftOptions<TBinding>): PaneDraft<TBinding> {
  const { lane, title, format, plots, colors, targetHeightPx, bind } = options;
  if (colors.length === 0) {
    throw new Error('laneDraft: the palette is empty, so a line would have no colour to take');
  }
  const series: SeriesDraft<TBinding>[] = Array.from({ length: plots }, (_unused, plot) => {
    const field = laneSeriesId(lane, plot);
    return {
      id: field,
      label: '',
      shape: 'line' as const,
      color: colors[plot % colors.length],
      lineWidth: 1 as const,
      binding: bind(field),
    };
  });
  return {
    id: lanePaneId(lane),
    title,
    format,
    defaultVisible: false,
    ...(targetHeightPx === undefined ? {} : { targetHeightPx }),
    series,
  };
}
