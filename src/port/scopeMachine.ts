/**
 * The per-scope state machine — design.md §2.4, where I1..I14 stop being a table. Pure and
 * synchronous: every operation takes a state and returns a new one. See docs/explanation/port.md#the-scope-state-machine
 */

import type { Bar, Scope, SeriesId } from '../domain/types';
import { sameScope } from '../domain/types';
import type { ChannelShape, Frame, ResetCause } from './frames';

export type ScopePhase = 'seeding' | 'live' | 'reset' | 'discarded';

/** Whether the seam CAN be proven, DECLARED instead of inferred from a null. See docs/explanation/port.md#seamstate-is-declared-not-inferred */
export type SeamState = 'none' | 'anchored' | 'unanchored';

export interface ScopeState {
  readonly phase: ScopePhase;
  readonly scope: Scope;
  readonly shape: ChannelShape;
  /** null until the first frame names a generation. */
  readonly gen: number | null;
  readonly baseline: number;
  /** Time of the last closed bar the baseline counts. null when there is no anchor. */
  readonly baselineTime: number | null;
  /** Whether the seam is provable. Read it before trusting `bars` after a seed. */
  readonly seam: SeamState;
  readonly bars: readonly Bar[];
  readonly series: ReadonlyMap<SeriesId, number>;
  readonly members: ReadonlySet<string>;
  /** Held while the seam is unverified (I12). Never applied out of order. */
  readonly buffered: readonly Frame[];
  readonly resetCause: ResetCause | null;
  /** Frames refused, for observability. A rising count with no reset means a wrong-scope feed. */
  readonly discarded: number;
}

/** A buffer this deep means the history fetch is not coming back. See docs/explanation/port.md#the-buffer-cap-is-a-refusal-to-grow-without-bound */
export const MAX_BUFFERED_FRAMES = 4096;

const EMPTY_SERIES: ReadonlyMap<SeriesId, number> = new Map();
const EMPTY_MEMBERS: ReadonlySet<string> = new Set();

export function createScopeState(scope: Scope, shape: ChannelShape): ScopeState {
  return {
    phase: 'seeding',
    scope,
    shape,
    gen: null,
    baseline: 0,
    baselineTime: null,
    seam: 'none',
    bars: [],
    series: EMPTY_SERIES,
    members: EMPTY_MEMBERS,
    buffered: [],
    resetCause: null,
    discarded: 0,
  };
}

const lastBarTime = (bars: readonly Bar[]): number | null =>
  bars.length > 0 ? bars[bars.length - 1].time : null;

/** I6. Newer appends; equal replaces; older is REJECTED — never silently reordered. */
function upsertBar(bars: readonly Bar[], bar: Bar): readonly Bar[] | null {
  const last = lastBarTime(bars);
  if (last === null || bar.time > last) return [...bars, bar];
  if (bar.time === last) return [...bars.slice(0, -1), bar];
  return null;
}

function withPoints(
  series: ReadonlyMap<SeriesId, number>,
  points?: ReadonlyMap<SeriesId, number>,
): ReadonlyMap<SeriesId, number> {
  if (points === undefined || points.size === 0) return series;
  const next = new Map(series);
  points.forEach((value, key) => {
    next.set(key, value);
  });
  return next;
}

function toReset(state: ScopeState, cause: ResetCause): ScopeState {
  return { ...state, phase: 'reset', resetCause: cause, buffered: [] };
}

/** I10. A different generation invalidates the cursor and lands in `reset`, not `seeding`. See docs/explanation/port.md#i10-a-generation-change-lands-in-reset */
function rebase(state: ScopeState, gen: number): ScopeState {
  return {
    ...createScopeState(state.scope, state.shape),
    gen,
    discarded: state.discarded,
    phase: 'reset',
    resetCause: 'generation',
  };
}

export function applyFrame(state: ScopeState, frame: Frame): ScopeState {
  // I1 — a frame for another scope is DISCARDED, never applied. Structural, not a courtesy.
  if (!sameScope(frame.scope, state.scope)) {
    return { ...state, discarded: state.discarded + 1 };
  }
  if (state.phase === 'discarded') return state;

  // I10 — rebase before anything else, so no new-generation frame meets an old cursor.
  if (state.gen !== null && frame.gen !== state.gen) {
    return applyFrame(rebase(state, frame.gen), frame);
  }
  const adopted = state.gen === null ? { ...state, gen: frame.gen } : state;

  switch (frame.kind) {
    case 'reset':
      return toReset(adopted, frame.cause);

    case 'snapshot':
      return applySnapshot(adopted, frame);

    case 'append':
      return applyAppend(adopted, frame);

    case 'amend':
      // I4 — a closed bucket cannot be patched in place. See docs/explanation/port.md#i4-an-amend-resets
      return toReset(adopted, 'amend');

    case 'open':
      return applyOpen(adopted, frame);

    case 'member':
      return applyMember(adopted, frame);

    default:
      return adopted;
  }
}

function applySnapshot(
  state: ScopeState,
  frame: Extract<Frame, { kind: 'snapshot' }>,
): ScopeState {
  if (state.shape === 'snapshot' || state.shape === 'seeded-delta') {
    // I9 — at or behind the cursor in the same generation is a NO-OP, gated on PHASE. See docs/explanation/port.md#i9-is-gated-on-phase-not-on-a-zero-baseline
    if (state.phase === 'live' && frame.seq <= state.baseline) return state;

    if (state.shape === 'snapshot') {
      // This frame IS the state, so it restores the scope by itself, even out of a reset.
      return { ...state, phase: 'live', baseline: frame.seq, series: frame.state, resetCause: null };
    }
    // `seeded-delta` advances cursor and series WITHOUT going live. See docs/explanation/port.md#seeded-delta-is-not-a-snapshot-channel
    return { ...state, baseline: frame.seq, series: frame.state };
  }

  // Delta channel: the snapshot establishes the cursor and the seam anchor, and nothing else. See docs/explanation/port.md#a-snapshot-on-a-delta-channel-carries-no-history
  const baseline = frame.baseline ?? frame.seq;
  const anchored = baseline > 0 && frame.baselineTime !== undefined && frame.baselineTime !== null;
  return {
    ...state,
    baseline,
    baselineTime: anchored ? (frame.baselineTime as number) : null,
    // A cursor without an anchor is `unanchored`, NOT `none`. See docs/explanation/port.md#unanchored-is-not-none
    seam: baseline > 0 ? (anchored ? 'anchored' : 'unanchored') : 'none',
    resetCause: null,
  };
}

function applyAppend(state: ScopeState, frame: Extract<Frame, { kind: 'append' }>): ScopeState {
  // I12 — nothing is applied before the seam is verified. Buffer, in arrival order.
  if (state.phase === 'seeding') {
    if (state.buffered.length >= MAX_BUFFERED_FRAMES) return toReset(state, 'gap');
    return { ...state, buffered: [...state.buffered, frame] };
  }

  // RESET is terminal until a refetch: refuse and COUNT. See docs/explanation/port.md#reset-is-terminal-until-a-refetch
  if (state.phase === 'reset') return { ...state, discarded: state.discarded + 1 };

  // I3 — a non-contiguous sequence is a RESET, never a partial application that hides the hole.
  if (frame.seq !== state.baseline + 1) return toReset(state, 'gap');

  const bars = upsertBar(state.bars, frame.bar);
  if (bars === null) {
    // I6 — out of order but contiguous, so NOT a gap: advance the cursor and drop the bar.
    return { ...state, baseline: frame.seq };
  }
  return {
    ...state,
    bars,
    baseline: frame.seq,
    baselineTime: frame.bar.time,
    series: withPoints(state.series, frame.points),
    resetCause: null,
  };
}

function applyOpen(state: ScopeState, frame: Extract<Frame, { kind: 'open' }>): ScopeState {
  if (state.phase === 'seeding') {
    if (state.buffered.length >= MAX_BUFFERED_FRAMES) return toReset(state, 'gap');
    return { ...state, buffered: [...state.buffered, frame] };
  }
  // Same reason as `applyAppend`: a scope awaiting a refetch draws nothing.
  if (state.phase === 'reset') return { ...state, discarded: state.discarded + 1 };
  const bars = upsertBar(state.bars, frame.bar);
  // I5 — an open bar NEVER advances the baseline: no seq, last-writer-wins, so the cursor stands.
  if (bars === null) return state;
  return { ...state, bars, series: withPoints(state.series, frame.points) };
}

function applyMember(state: ScopeState, frame: Extract<Frame, { kind: 'member' }>): ScopeState {
  // I12, for the shape it exists to serve. See docs/explanation/port.md#applymember-was-the-only-applier-without-a-phase-guard
  if (state.phase === 'seeding') {
    if (state.buffered.length >= MAX_BUFFERED_FRAMES) return toReset(state, 'gap');
    return { ...state, buffered: [...state.buffered, frame] };
  }
  if (state.phase === 'reset') return { ...state, discarded: state.discarded + 1 };
  if (state.baseline > 0 && frame.seq <= state.baseline) return state;
  const members = new Set(state.members);
  if (frame.op === 'upsert') members.add(frame.key);
  else members.delete(frame.key);
  return { ...state, members, baseline: frame.seq, phase: 'live' };
}

export type SeedVerdict =
  /** The window contains the anchor, or there was no seam to check. Safe to go live. */
  | 'verified'
  /** The window does not reach the live edge. Refetch — never accept the next delta (I13). */
  | 'stale'
  /** The producer sent a cursor with no anchor. Live, but the seam is UNPROVEN and said so. */
  | 'unverifiable';

export interface SeedApplication {
  readonly state: ScopeState;
  readonly verdict: SeedVerdict;
}

/** Apply the history and release the buffer — I13 presence, I14 cursor survival. See docs/explanation/port.md#seedhistory-i13-presence-and-i14-cursor-survival */
export function seedHistory(state: ScopeState, bars: readonly Bar[]): SeedApplication {
  if (state.phase === 'discarded') return { state, verdict: 'stale' };

  if (state.seam === 'anchored') {
    const anchor = state.baselineTime as number;
    if (!bars.some((b) => b.time === anchor)) {
      // Returned UNCHANGED — still `seeding`, buffer intact. See docs/explanation/port.md#a-stale-window-must-not-clear-the-buffer
      return { state, verdict: 'stale' };
    }
  }

  // The window replaces the bars; the CURSOR survives untouched (I14).
  let next: ScopeState = { ...state, phase: 'live', bars: [...bars], buffered: [] };
  for (const frame of state.buffered) {
    next = applyFrame(next, frame);
  }
  return { state: next, verdict: state.seam === 'unanchored' ? 'unverifiable' : 'verified' };
}

/** The reset valve — a scope whose data cannot be repaired incrementally starts over. */
export function restartScope(state: ScopeState): ScopeState {
  return { ...createScopeState(state.scope, state.shape), discarded: state.discarded };
}

/** I7 — after this, no frame and no in-flight fetch may reach the consumer. */
export function discardScope(state: ScopeState): ScopeState {
  return { ...state, phase: 'discarded', buffered: [] };
}

export const needsRefetch = (state: ScopeState): boolean => state.phase === 'reset';
