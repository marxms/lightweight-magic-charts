/**
 * Where a drawn value comes from: what the host RESOLVED, then what the host already had, then the
 * tip that fills the bar in progress. See docs/explanation/react-workspace.md#the-tip-fills-the-bar-in-progress
 */

import { readingWithTip } from '../../indicator/liveTip';
import type { SourceResolution } from '../../indicator/resolution';
import type { LiveTip } from '../../port/frames';
import type { SeriesReader } from '../surface/ChartSurface';

const NONE: readonly never[] = [];

/** Nothing computed. A host drawing only candles never has to say so. */
const NO_READINGS: SeriesReader = () => NONE;

export function studyReader(
  resolved: SourceResolution | undefined,
  host: SeriesReader | undefined,
  tip: LiveTip | undefined,
): SeriesReader {
  return (pane, series) =>
    readingWithTip(
      series.id,
      resolved?.readings.get(series.id) ?? (host ?? NO_READINGS)(pane, series),
      tip,
    );
}
