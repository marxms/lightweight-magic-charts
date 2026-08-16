/**
 * Folding a live tip into the LAST point of a loaded series — the one bar a push speaks for.
 * See docs/explanation/indicator.md#the-division-of-labour-between-history-and-push
 */

import type { SeriesId } from '../domain/types';
import type { LiveTip } from '../port/frames';

/** Returns the SAME array when nothing changed. See docs/explanation/indicator.md#identity-is-the-contract */
export function applyTipToLastPoint<T>(series: readonly T[], tip: LiveTip): readonly T[] {
  if (series.length === 0) return series;
  const last = series[series.length - 1] as T & Record<string, unknown>;
  const patched: Record<string, unknown> = { ...last };
  let changed = false;
  tip.values.forEach((value, key: SeriesId) => {
    const field = key as unknown as string;
    if (patched[field] === value) return;
    patched[field] = value;
    changed = true;
  });
  return changed ? [...series.slice(0, -1), patched as T] : series;
}

export function readingWithTip(
  id: SeriesId,
  values: readonly (number | null)[],
  tip?: LiveTip,
): readonly (number | null)[] {
  if (tip === undefined || values.length === 0) return values;
  const field = id as unknown as string;
  const row = { [field]: values[values.length - 1] };
  const [tipped] = applyTipToLastPoint([row], tip);
  return tipped === row ? values : [...values.slice(0, -1), tipped[field]];
}
