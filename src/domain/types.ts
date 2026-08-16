/**
 * Domain types — design.md §1. No business name may appear here, or the boundary guard (task 3.2)
 * fails. See docs/explanation/domain.md#the-domain-may-not-name-a-business-concept
 */

export type UtcSeconds = number & { readonly __brand: 'UtcSeconds' };
export type SeriesId = string & { readonly __brand: 'SeriesId' };
export type PaneId = string & { readonly __brand: 'PaneId' };

export const utcSeconds = (n: number): UtcSeconds => n as UtcSeconds;
export const seriesId = (s: string): SeriesId => s as SeriesId;
export const paneId = (s: string): PaneId => s as PaneId;

export interface Scope {
  readonly instrument: string;
  readonly resolution: string;
  readonly venue?: string;
  readonly market?: string;
}

/** Stable identity for a scope. Two scopes are the same iff all four coordinates match. */
export function scopeKey(scope: Scope): string {
  return `${scope.venue ?? ''}|${scope.market ?? ''}|${scope.instrument}|${scope.resolution}`;
}

export function sameScope(a: Scope, b: Scope): boolean {
  return scopeKey(a) === scopeKey(b);
}

export interface Bar {
  readonly time: UtcSeconds;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly volume?: number;
}

/** A point without `value` is a DECLARED GAP, not a zero. See docs/explanation/domain.md#a-gap-is-not-a-zero */
export type Point =
  | { readonly time: UtcSeconds; readonly value: number }
  | { readonly time: UtcSeconds };

export const isGap = (p: Point): boolean => !('value' in p);

export type ValueFormat =
  | { readonly kind: 'price'; readonly minMove: number }
  | { readonly kind: 'percent'; readonly decimals: number }
  | { readonly kind: 'compact'; readonly decimals: number }
  | { readonly kind: 'ratio'; readonly decimals: number }
  | { readonly kind: 'custom'; readonly format: (v: number) => string; readonly minMove: number };

export interface SeriesSpec {
  readonly id: SeriesId;
  readonly label: string;
  readonly shape: 'line' | 'histogram' | 'area';
  readonly color: string;
  readonly lineWidth?: 1 | 2;
  readonly signColoring?: boolean;
  /** Colour each point by ITS BAR's direction. See docs/explanation/domain.md#the-bar-needs-its-own-flag */
  readonly barDirectionColoring?: boolean;
  /** This series' own unit, when it does not share its pane's axis. See docs/explanation/domain.md#a-unit-of-its-own */
  readonly format?: ValueFormat;
  /** Draw this series on a scale of its OWN. See docs/explanation/domain.md#own-scale-on-the-price-pane */
  readonly ownScale?: boolean;
  readonly mirrored?: boolean;
  /** Carries the last value across a gap. Valid ONLY for a step function. */
  readonly stepCarry?: boolean;
}

export interface PaneSpec {
  readonly id: PaneId;
  readonly title: string;
  readonly format: ValueFormat;
  readonly series: readonly SeriesSpec[];
  /** Target height in px. The price pane does not declare one: it receives the residual. */
  readonly targetHeightPx?: number;
  readonly referenceLine?: number;
  readonly defaultVisible: boolean;
}

export type Direction = 'up' | 'down' | 'flat';

/** The channels a mark can carry direction on. Hue is one of three, not the only one. */
export type DirectionChannel = 'color' | 'position' | 'shape';

/** The shape channel's value — a TOKEN, not a glyph. See docs/explanation/domain.md#the-glyph-is-a-token */
export type DirectionGlyph = 'apex-up' | 'apex-down' | 'none';

/** Which colour means up. See docs/explanation/domain.md#no-hard-coded-colour-convention */
export interface PriceScaleConvention {
  readonly upColor: string;
  readonly downColor: string;
  /** Direction must also be carried by something other than hue. */
  readonly encodeDirectionBy: readonly DirectionChannel[];
}

/** One direction, resolved onto every declared channel. See docs/explanation/domain.md#flat-has-no-colour */
export interface DirectionEncoding {
  readonly direction: Direction;
  /** `null` when the convention does not declare the colour channel, or when there is no direction. */
  readonly color: string | null;
  /** Side of the reference line: +1 above, -1 below. 0 = on it, or the channel is not declared. */
  readonly side: 1 | 0 | -1;
  readonly glyph: DirectionGlyph;
}

const ALL_DIRECTION_CHANNELS: readonly DirectionChannel[] = ['color', 'position', 'shape'];

/** The channels a colour-blind reader can still use. Emptiness here is the failure condition. */
export function nonChromaticChannels(
  convention: PriceScaleConvention,
): readonly DirectionChannel[] {
  return convention.encodeDirectionBy.filter((channel) => channel !== 'color');
}

/** The only sanctioned way to build a convention. See docs/explanation/domain.md#two-invariants-the-type-cannot-hold */
export function directionConvention(input: {
  readonly upColor: string;
  readonly downColor: string;
  readonly encodeDirectionBy?: readonly DirectionChannel[];
}): PriceScaleConvention {
  const channels = input.encodeDirectionBy ?? ALL_DIRECTION_CHANNELS;
  if (new Set(channels).size !== channels.length) {
    throw new Error(`directionConvention: repeated channel in [${channels.join(', ')}]`);
  }
  if (channels.length === 0) {
    throw new Error('directionConvention: no channel declared — nothing would carry direction');
  }
  if (channels.includes('color') && input.upColor.toLowerCase() === input.downColor.toLowerCase()) {
    throw new Error(`directionConvention: up and down share the colour ${input.upColor}`);
  }
  if (nonChromaticChannels({ ...input, encodeDirectionBy: channels }).length === 0) {
    throw new Error(
      'directionConvention: hue is the only declared channel — direction must also be carried by position or shape',
    );
  }
  return { upColor: input.upColor, downColor: input.downColor, encodeDirectionBy: [...channels] };
}

/** The east-asian flip, as one call. See docs/explanation/domain.md#the-flip-inverts-hue-only */
export function invertConvention(convention: PriceScaleConvention): PriceScaleConvention {
  return { ...convention, upColor: convention.downColor, downColor: convention.upColor };
}

/** Throws on a non-finite value instead of calling it `flat`. See docs/explanation/domain.md#a-gap-has-no-direction */
export function directionOf(value: number, reference = 0): Direction {
  if (!Number.isFinite(value) || !Number.isFinite(reference)) {
    throw new Error(`directionOf: not a measurement (value=${value}, reference=${reference})`);
  }
  if (value > reference) return 'up';
  if (value < reference) return 'down';
  return 'flat';
}

/** Resolve a value into every declared channel. See docs/explanation/domain.md#undeclared-channels-come-back-inert */
export function encodeDirection(
  convention: PriceScaleConvention,
  value: number,
  reference = 0,
): DirectionEncoding {
  const direction = directionOf(value, reference);
  const declares = (channel: DirectionChannel): boolean =>
    convention.encodeDirectionBy.includes(channel);

  if (direction === 'flat') return { direction, color: null, side: 0, glyph: 'none' };
  const up = direction === 'up';
  return {
    direction,
    color: declares('color') ? (up ? convention.upColor : convention.downColor) : null,
    side: declares('position') ? (up ? 1 : -1) : 0,
    glyph: declares('shape') ? (up ? 'apex-up' : 'apex-down') : 'none',
  };
}

export interface DirectionEncodingViolation {
  readonly pane: PaneId;
  readonly series: SeriesId;
  readonly reason: string;
}

/** Which series carry direction, and on what channel. See docs/explanation/domain.md#the-catalogue-half-of-the-rule */
export function auditDirectionEncoding(
  panes: readonly PaneSpec[],
): readonly DirectionEncodingViolation[] {
  const violations: DirectionEncodingViolation[] = [];
  for (const pane of panes) {
    if (pane.referenceLine !== undefined) continue;
    for (const series of pane.series) {
      if (series.signColoring !== true && series.mirrored !== true) continue;
      violations.push({
        pane: pane.id,
        series: series.id,
        reason: 'encodes direction but its pane declares no reference line — hue is the only channel',
      });
    }
  }
  return violations;
}

/** State that cannot be represented cannot be validated at runtime — design.md §4. */
export type PaneState =
  | { readonly kind: 'visible'; readonly heightPx: number }
  | { readonly kind: 'collapsed' };

/** An error is a value here, not a control-flow exception. */
export type PortResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly reason: 'aborted' | 'transport' | 'contract';
      readonly detail: string;
    };
