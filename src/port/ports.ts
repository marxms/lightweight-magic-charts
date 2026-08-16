/** The data port — design.md §2.3. History and live are SEPARATE ports (ISP). See docs/explanation/port.md#history-and-live-are-separate-ports */

import type { Bar, Point, Scope, SeriesId } from '../domain/types';
import type { ChannelDescriptor, Frame, LinkStatus } from './frames';

/** M5. The closure IS the token — no subscriber id anywhere. See docs/explanation/port.md#the-closure-is-the-token */
export type Unsubscribe = () => void;

export interface HistoryRequest {
  readonly scope: Scope;
  /** SEMI-OPEN window `[from, to)`. `to` is never included. */
  readonly from: number;
  readonly to: number;
  /** When present, takes PRIORITY over the window: "the last N bars ending before `to`". */
  readonly barCount?: number;
  readonly signal: AbortSignal;
}

export interface HistoryResult {
  readonly bars: readonly Bar[];
  readonly series?: ReadonlyMap<SeriesId, readonly Point[]>;
  /** M6. OUT OF BAND: an empty array is ambiguous. See docs/explanation/port.md#exhausted-is-out-of-band */
  readonly exhausted: boolean;
  readonly nextAvailable?: number;
}

export interface HistoryPort {
  fetchBars(req: HistoryRequest): Promise<HistoryResult>;
}

export interface FrameSink {
  onFrame(frame: Frame): void;
  onStatus(status: LinkStatus): void;
}

export interface LivePort {
  describe(scope: Scope): readonly ChannelDescriptor[];
  subscribe(scope: Scope, sink: FrameSink): Unsubscribe;
}

export interface MarketDataPort extends HistoryPort, LivePort {}

/** Narrowing helpers, so a consumer can accept the smaller port without an `any`. */
export const isHistoryPort = (p: unknown): p is HistoryPort =>
  typeof (p as HistoryPort | null)?.fetchBars === 'function';

export const isLivePort = (p: unknown): p is LivePort =>
  typeof (p as LivePort | null)?.subscribe === 'function' &&
  typeof (p as LivePort | null)?.describe === 'function';
