/**
 * Channel shapes and frames — design.md §2.1 and §2.2. The adapter DECLARES the shape and only that shape's gap policy applies. See docs/explanation/port.md#three-channel-shapes-not-one-protocol
 */

import type { Bar, Scope, SeriesId } from '../domain/types';
import { sameScope } from '../domain/types';

export type ChannelShape = 'delta' | 'snapshot' | 'seeded-delta';

export interface ChannelDescriptor {
  readonly shape: ChannelShape;
  readonly scope: Scope;
  readonly seriesIds: readonly SeriesId[];
}

export type ResetCause = 'gap' | 'amend' | 'generation' | 'reconnect' | 'server' | 'stale-history';

/** Every variant carries `scope`, so the wrong-scope discard is structural. See docs/explanation/port.md#every-frame-carries-its-scope */
export type Frame =
  | {
      readonly kind: 'snapshot';
      readonly gen: number;
      readonly seq: number;
      readonly scope: Scope;
      readonly state: ReadonlyMap<SeriesId, number>;
      /** The live cursor, and the TIME of the last closed bar it counts. See docs/explanation/port.md#baselinetime-is-the-seam-anchor */
      readonly baseline?: number;
      readonly baselineTime?: number;
    }
  | {
      readonly kind: 'append';
      readonly gen: number;
      readonly seq: number;
      readonly scope: Scope;
      readonly bar: Bar;
      readonly points?: ReadonlyMap<SeriesId, number>;
    }
  | {
      readonly kind: 'amend';
      readonly gen: number;
      readonly seq: number;
      readonly scope: Scope;
      readonly bar: Bar;
    }
  /** `open` has NO `seq`: it is last-writer-wins and sits outside gap detection. */
  | {
      readonly kind: 'open';
      readonly gen: number;
      readonly scope: Scope;
      readonly bar: Bar;
      readonly points?: ReadonlyMap<SeriesId, number>;
    }
  | {
      readonly kind: 'member';
      readonly gen: number;
      readonly seq: number;
      readonly scope: Scope;
      readonly op: 'upsert' | 'remove';
      readonly key: string;
    }
  | {
      readonly kind: 'reset';
      readonly gen: number;
      readonly scope: Scope;
      readonly cause: ResetCause;
    };

export type LinkStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

/** I11 — accumulating snapshots per bar yields a DELTA channel, whatever the source declared. See docs/explanation/port.md#i11-accumulation-turns-a-snapshot-channel-into-a-delta */
export function resolveChannelShape(declared: ChannelShape, accumulatePerBar: boolean): ChannelShape {
  if (accumulatePerBar && declared === 'snapshot') return 'delta';
  return declared;
}

/** A pushed snapshot of the LIVE edge; the payload stays OPAQUE and the projection is handed in. See docs/explanation/port.md#the-live-envelope-keeps-the-payload-opaque */
export interface LiveEnvelope<TPayload> {
  /** Producer boot generation. A different one re-baselines rather than being read as stale. */
  readonly gen: number;
  readonly seq: number;
  readonly scope: Scope;
  readonly payload: TPayload;
}

/** The applied tip, keyed by `SeriesId` — the identity this package already uses for a line. */
export interface LiveTip {
  /** Generation of the envelope currently applied. `null` = nothing applied yet. */
  readonly gen: number | null;
  readonly seq: number | null;
  readonly values: ReadonlyMap<SeriesId, number>;
}

/** A constant, so a consumer that resets an already-empty tip pays nothing for it. */
export const EMPTY_LIVE_TIP: LiveTip = { gen: null, seq: null, values: new Map() };

/** Apply one envelope. Pure, and it returns the SAME REFERENCE when nothing is applied. See docs/explanation/port.md#identity-is-the-contract-and-order-is-part-of-the-clause */
export function applyLiveEnvelope<TPayload>(
  state: LiveTip,
  envelope: LiveEnvelope<TPayload>,
  scope: Scope,
  project: (payload: TPayload) => ReadonlyMap<SeriesId, number>,
): LiveTip {
  // The lane is multiplexed by scope, so demultiplexing is the consumer's job and it happens here.
  if (!sameScope(envelope.scope, scope)) return state;
  // Same gen, duplicate or out of order: discard. A DIFFERENT gen rebases — replace, never merge.
  if (state.gen === envelope.gen && state.seq !== null && envelope.seq <= state.seq) return state;
  return { gen: envelope.gen, seq: envelope.seq, values: project(envelope.payload) };
}
