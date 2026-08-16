/**
 * THE FUTURE ROOM — columns right of the last real bar, so a drawing has somewhere to project.
 * See docs/explanation/domain.md#the-future-room-is-whitespace-not-candles
 */

import type { Bar } from './types';

/** The MOST the opening view shows past the last candle. See docs/explanation/domain.md#why-twelve */
export const INITIAL_ROOM_COLUMNS = 12;


/**
 * A TENTH of the history, never fewer than the short margin. Twelve columns read as much too short
 * in live use; the whole history read as half a screen of emptiness, because the opening view frames
 * the room along with the candles. A tenth is generous to draw into and still leaves the price
 * ninety per cent of the width.
 */
export function futureBarCount(requested: number | undefined, barCount: number): number {
  const proportional = Math.max(INITIAL_ROOM_COLUMNS, Math.floor(barCount / 10));
  if (requested === undefined) return proportional;
  if (!Number.isInteger(requested) || requested < 0) return proportional;
  return requested;
}

/** A time the scale knows and no price: the base library's whitespace point. */
export interface FuturePoint {
  readonly time: number;
}

/**
 * The columns past the last bar, spaced by what the last two bars measured.
 * See docs/explanation/domain.md#the-future-room-is-whitespace-not-candles
 */
export function futureTail(bars: readonly Bar[], count: number): readonly FuturePoint[] {
  if (count <= 0 || bars.length < 2) return [];
  const last = bars[bars.length - 1].time;
  const step = last - bars[bars.length - 2].time;
  // A step of zero or backwards would stack the tail on the last bar's column, or behind it.
  if (step <= 0) return [];
  return Array.from({ length: count }, (_unused, position) => ({ time: last + step * (position + 1) }));
}
