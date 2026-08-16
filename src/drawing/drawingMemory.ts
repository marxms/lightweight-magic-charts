/**
 * Drawings that outlive a mount, kept per market in a bounded least-recently-used map.
 * See docs/explanation/drawing.md#drawings-that-outlive-a-mount
 */
import type { DrawingLayer, DrawingSnapshot } from './drawingLayer';

export const MAX_DRAWING_MEMORY = 8;

export interface DrawingMemory {
  live: DrawingLayer | null;
  snapshot: DrawingSnapshot;
}

const DRAWING_MEMORY = new Map<string, DrawingMemory>();

/** INVARIANT: reading COUNTS as use — the delete+set keeps eviction LRU. See docs/explanation/drawing.md#reading-counts-as-use */
export function drawingMemoryFor(symbol: string): DrawingMemory {
  const existing = DRAWING_MEMORY.get(symbol);
  if (existing !== undefined) {
    DRAWING_MEMORY.delete(symbol);
    DRAWING_MEMORY.set(symbol, existing);
    return existing;
  }
  const created: DrawingMemory = { live: null, snapshot: null };
  DRAWING_MEMORY.set(symbol, created);
  while (DRAWING_MEMORY.size > MAX_DRAWING_MEMORY) {
    const oldest = DRAWING_MEMORY.keys().next().value;
    if (oldest === undefined) break;
    DRAWING_MEMORY.delete(oldest);
  }
  return created;
}

/** What a drawing belongs to: the INSTRUMENT on its EXCHANGE — never the timeframe. */
export interface DrawingScope {
  readonly symbol: string;
  readonly venue?: string;
  readonly market?: string;
}

/**
 * The memory key. Timeframe is deliberately absent: a line drawn on the 1h is the same line on the
 * 4h, and the anchors are times, which every timeframe shares. Venue and market ARE present: the same
 * ticker on two exchanges is two instruments, and replaying one over the other draws noise at prices
 * that never traded there.
 * See docs/explanation/drawing.md#the-key-is-the-instrument-not-the-view
 */
export function drawingScopeKey(scope: DrawingScope): string {
  return [scope.venue ?? '', scope.market ?? '', scope.symbol].join('\u00b7');
}

export function rememberedMarkets(): readonly string[] {
  return Array.from(DRAWING_MEMORY.keys());
}

export function clearDrawingMemory(): void {
  DRAWING_MEMORY.clear();
}
