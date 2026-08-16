/**
 * WHEN THE OPENING VIEW IS REDONE — the decision alone, so it can be measured without a chart.
 * See docs/explanation/react-surface.md#a-partial-load-is-not-the-dataset
 */

export interface ReframeInput {
  /** Another market or another interval: always a fresh framing. */
  readonly datasetChanged: boolean;
  readonly barCount: number;
  /** How many bars were on screen the last time THIS dataset was framed. `null` = never framed. */
  readonly framedAt: number | null;
  readonly autoFit: boolean;
}

/**
 * A closing bar adds exactly ONE. Anything more is a load arriving, and the view framed before it
 * was framed for a partial dataset.
 */
export const LIVE_BAR_GROWTH = 1;

export function shouldReframe(input: ReframeInput): boolean {
  if (input.barCount === 0) return false;
  if (input.datasetChanged || input.framedAt === null) return true;
  if (input.autoFit) return true;
  // ANY change that is not "gained exactly one bar" is a new load, in EITHER direction. Growing was
  // the obvious half; shrinking is the one the deploy caught — the identity changes a render before
  // the bars do, so the framing is made for the interval being LEFT and the arriving one starts
  // small underneath it.
  const step = input.barCount - input.framedAt;
  return step !== 0 && step !== LIVE_BAR_GROWTH;
}
