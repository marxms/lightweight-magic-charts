/**
 * THE EYE-LINE — the only part of a pane redeclared AFTER mounting, reconciled on every change.
 * See docs/explanation/react-surface.md#the-eye-line-is-reconciled-not-created-once
 */

import { useEffect, useMemo, useRef } from 'react';

import type { PaneSpec } from '../../domain/types';
import type { PriceLineHandle } from '../../port/chartApi';
import { seriesKey } from '../../render/seriesFactory';
import type { WorkspaceTheme } from '../theme';
import type { ChartHandles } from './chartHandles';

/** One pane's eye-line, resolved to the series that carries it. `price` undefined = none declared. */
interface PaneReference {
  readonly paneKey: string;
  readonly seriesKey: string;
  readonly price?: number;
}

/** What the eye-line needs from a pane: its declaration. */
export interface ReferencePaneView {
  readonly spec: PaneSpec;
}

/** The base library's `LineStyle.Dashed`. An ordinal, because the enum is a value we cannot import. */
const DASHED = 2;

/** The declaration reduced to what matters, SORTED — reordering the stack moves no line at all. */
function referenceKeyOf(panes: readonly ReferencePaneView[]): string {
  return panes
    .map((pane) => `${String(pane.spec.id)}=${pane.spec.referenceLine ?? ''}`)
    .sort()
    .join('|');
}

function referencesOf(panes: readonly ReferencePaneView[]): readonly PaneReference[] {
  return panes.flatMap((pane): PaneReference[] => {
    // The line belongs to the pane's FIRST series' price scale; no series, no scale to hang it on.
    const anchor = pane.spec.series[0];
    if (anchor === undefined) return [];
    return [
      {
        paneKey: String(pane.spec.id),
        seriesKey: seriesKey(String(pane.spec.id), String(anchor.id)),
        price: pane.spec.referenceLine,
      },
    ];
  });
}

export function useReferenceLines(
  handles: ChartHandles | null,
  panes: readonly ReferencePaneView[],
  theme: WorkspaceTheme,
): void {
  const referenceKey = referenceKeyOf(panes);
  // THE KEY, and never `panes`: the key is derived from `panes` by a pure function in the same
  // render, so it never goes stale. See docs/explanation/react-surface.md#the-key-is-the-dependency
  // biome-ignore lint/correctness/useExhaustiveDependencies: the key IS the dependency; see above
  const references = useMemo(() => referencesOf(panes), [referenceKey]);

  /** THE COLOUR COMES BY REF: the effect watches the DECLARATION, never the theme. */
  const colorRef = useRef(theme.referenceLine);
  colorRef.current = theme.referenceLine;

  const drawnRef = useRef(new Map<string, PriceLineHandle>());

  useEffect(() => {
    if (handles === null) return;
    const drawn = drawnRef.current;
    for (const reference of references) {
      const series = handles.series.get(reference.seriesKey);
      if (series === undefined) continue;

      const existing = drawn.get(reference.paneKey);
      if (existing !== undefined) {
        series.removePriceLine(existing);
        drawn.delete(reference.paneKey);
      }
      if (reference.price === undefined) continue;
      drawn.set(
        reference.paneKey,
        series.createPriceLine({
          price: reference.price,
          color: colorRef.current,
          lineWidth: 1,
          lineStyle: DASHED,
          axisLabelVisible: false,
          title: '',
          lineVisible: true,
        }),
      );
    }
  }, [handles, references]);
}
