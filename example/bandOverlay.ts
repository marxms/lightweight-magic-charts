/**
 * THE FILL, DRAWN BY THE HOST — the shading between two of a study's lines.
 *
 * The package publishes WHERE a primitive anchors and refuses to learn the rest. That is not
 * squeamishness: the alternative was measured at +986 B against the anchor's 30, and it would have
 * carried `transp`, `fillgaps`, `label_up` and `textHAlign` into `src/` with it. Those are the
 * vendor's words, and keeping them out here is the whole point of the seam.
 *
 * WE DRAW WHAT THE VENDOR EMITS, WHICH IS NOT ALWAYS WHAT ITS OWN DEMO PAINTS. Three divergences,
 * each re-measured here against the 186 fills the 320 offered rows emit at their own defaults, and
 * each corrected rather than reproduced:
 *
 *   1. The reference composes transparency by concatenating `transp.toString(16)` onto the colour.
 *      For the Kumo that is `'#43A047' + '5a'` — a VALID hex8 carrying alpha 0x5A, 35%, where
 *      PineScript's `transp: 90` means 10%. The shading comes out three and a half times too
 *      opaque and buries the candles under it. `composeFillColor` computes `1 - transp/100`.
 *      (An rgba base would make the same concatenation invalid CSS, and an invalid `fillStyle`
 *      assignment is IGNORED by the canvas spec, leaving the previous colour standing. Measured on
 *      this release, 0 of the 16 fills that carry `transp` have an rgba base, so that is a latent
 *      failure and not a live one.)
 *   2. The reference ignores `fills[].colors`, the per-bar array. Measured: 86 of the 186 carry one
 *      colour PER BAR and 76 of those really do change colour. The Ichimoku Kumo is one of them,
 *      and its green-above / red-below IS the signal — collapsing it deletes the reading.
 *   3. The reference resolves a bound only against plot keys and drops the rest in silence.
 *      Measured, 14 bound references name an `hlines` entry instead — by index, by exact title, by
 *      lower-cased title, or by bare title with no prefix at all. `resolveBound` answers all five
 *      spellings, and over the whole registry 247 of 247 bounds resolve.
 *
 * A BAR IS A RECTANGLE, NOT A POLYGON RUN. The interruption rule — a bar where either bound is not
 * finite is not painted — is then the ABSENCE of a rectangle, with no run state to keep. Measured,
 * 171 of the 186 have at least one such bar, so it is the common case and not an edge; and with a
 * colour per bar a polygon would need a new run at every colour change anyway.
 */
import type {
  Overlay,
  OverlayHost,
  Projection,
  RenderTarget,
  SourceResolution,
  UtcSeconds,
} from 'lightweight-magic-charts';
import {
  PRICE_PANE_ID,
  lanePaneId,
  laneSeriesId,
  priceOverlaySeriesId,
  seriesStyleKey,
  utcSeconds,
} from 'lightweight-magic-charts';

import type { StudyPass, VendorPoint, VendorResult } from './indicators';

/** One shaded region: two bounds against the SAME bars, and the colour between them. */
export interface Band {
  /** `null` = no value on this bar. The fill is INTERRUPTED there, never stretched across. */
  readonly upper: readonly (number | null)[];
  readonly lower: readonly (number | null)[];
  /** A composed CSS colour. One element serves every bar; N elements serve one bar each. */
  readonly colors: readonly string[];
}

/** A colour that paints nothing. The vendor writes it per bar to switch a fill off. */
const CLEAR = 'transparent';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * `transp` is PineScript transparency: 0 is solid and 100 is invisible, so alpha is its complement.
 * Applied to whatever the base colour is, never concatenated onto it.
 */
export function composeFillColor(color: string | undefined, transp: number | undefined): string {
  if (color === undefined || color === '') return CLEAR;
  if (transp === undefined || !Number.isFinite(transp)) return color;
  const alpha = clamp01(1 - transp / 100);
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color);
  if (hex !== null) {
    const [red, green, blue] = [0, 2, 4].map((at) => Number.parseInt(hex[1].slice(at, at + 2), 16));
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }
  const rgba = /^rgba?\(([^)]+)\)$/i.exec(color);
  if (rgba !== null) {
    const [red, green, blue] = rgba[1].split(',').map((part) => part.trim());
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }
  return color;
}

interface VendorHLine {
  readonly value?: number;
  readonly price?: number;
  readonly options?: { readonly title?: string };
}

export interface VendorFill {
  readonly plot1: string;
  readonly plot2: string;
  readonly colors?: readonly string[];
  readonly options?: { readonly color?: string; readonly transp?: number };
}

const levelOf = (line: VendorHLine | undefined): number | null => {
  const value = line?.value ?? line?.price;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};

/**
 * A bound is a plot key or a level, and the level is named in FIVE spellings the vendor actually
 * uses: `hline_<index>`, `hline_<exact title>`, `hline_<lower-cased title>`, and the bare title with
 * no prefix at all. Measured over the whole registry: 247 of 247 bounds resolve, none left over.
 */
export function resolveBound(
  reference: string,
  result: VendorResult,
  length: number,
): readonly (number | null)[] | null {
  const plot: readonly VendorPoint[] | undefined = result.plots?.[reference];
  if (plot !== undefined) {
    return Array.from({ length }, (_unused, at) => {
      const value = plot[at]?.value;
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    });
  }
  const lines = (result.hlines ?? []) as readonly VendorHLine[];
  const bare = reference.startsWith('hline_') ? reference.slice('hline_'.length) : reference;
  const index = Number.parseInt(bare, 10);
  const titled =
    lines.find((line) => line.options?.title === bare) ??
    lines.find((line) => (line.options?.title ?? '').toLowerCase() === bare.toLowerCase());
  const level = levelOf(titled ?? (Number.isInteger(index) ? lines[index] : undefined));
  return level === null ? null : Array.from({ length }, () => level);
}

/** Every fill the vendor emitted for this result, with both bounds resolved and the colour composed. */
export function bandsOf(result: VendorResult, length: number): readonly Band[] {
  const bands: Band[] = [];
  for (const fill of (result.fills ?? []) as readonly VendorFill[]) {
    const upper = resolveBound(fill.plot1, result, length);
    const lower = resolveBound(fill.plot2, result, length);
    // FILL-05: a fill whose bounds do not both resolve is not drawn half-way. Measured over the
    // whole registry the set is empty, which is why the clause is asserted rather than narrated.
    if (upper === null || lower === null) continue;
    const perBar = fill.colors;
    const colors =
      perBar === undefined || perBar.length === 0
        ? [composeFillColor(fill.options?.color, fill.options?.transp)]
        : perBar.map((colour) => colour ?? CLEAR);
    bands.push({ upper, lower, colors });
  }
  return bands;
}

/**
 * The primitive. Data arrives by PUSH — one call per resolve, never per frame — which is the shape
 * `DensityFieldOverlay` and `TroughProfileOverlay` already established: keep what you were given,
 * ask for a redraw, and read the live projection inside `draw`.
 */
export class BandFillOverlay implements Overlay {
  /** Under the lines it spans: the base library paints its bottom layer before any series. */
  readonly zOrder = 'behind' as const;
  private host: OverlayHost | null = null;
  private times: readonly UtcSeconds[] = [];
  private bands: readonly Band[] = [];

  constructor(readonly anchor: string) {}

  attached(host: OverlayHost): void {
    this.host = host;
  }

  detached(): void {
    this.host = null;
  }

  setBands(times: readonly UtcSeconds[], bands: readonly Band[]): void {
    this.times = times;
    this.bands = bands;
    this.host?.requestRedraw();
  }

  draw(target: RenderTarget, projection: Projection): void {
    if (this.bands.length === 0) return;
    target.useBitmapSpace(({ ctx, hRatio, vRatio }) => {
      const width = Math.max(1, projection.barSpacing);
      for (const band of this.bands) {
        for (let at = 0; at < this.times.length; at += 1) {
          const colour = band.colors[at] ?? band.colors[0];
          if (colour === undefined || colour === CLEAR) continue;
          const upper = band.upper[at];
          const lower = band.lower[at];
          if (upper === null || upper === undefined || lower === null || lower === undefined) continue;
          const x = projection.timeToX(this.times[at]);
          const top = projection.priceToY(upper);
          const bottom = projection.priceToY(lower);
          if (x === null || top === null || bottom === null) continue;
          ctx.fillStyle = colour;
          ctx.fillRect(
            Math.round((x - width / 2) * hRatio),
            Math.round(Math.min(top, bottom) * vRatio),
            Math.max(1, Math.round(width * hRatio)),
            Math.max(1, Math.round(Math.abs(bottom - top) * vRatio)),
          );
        }
      }
    });
  }
}

/**
 * THE CHANNEL: one primitive per slot, created once, fed once per resolve.
 *
 * A lane's index is the pick's LIST POSITION, so a lane hosts a different study on every reorder
 * while its series were created at mount. The overlays follow the same rule — two per position, one
 * anchored over the price and one in the lane, because the resolver decides which of the two a
 * study lands on by MEASURING its scale, not by reading its request.
 *
 * The anchor is plot ZERO of the slot, and that is a requirement rather than a preference: the base
 * library answers `null` from `priceToCoordinate` while a series has no first value, and plot zero
 * is the first line the resolver files, so it is the one guaranteed to have one.
 */
export interface BandChannel {
  /** Stable across renders. The host memoises this array once and never rebuilds it. */
  readonly overlays: readonly BandFillOverlay[];
  /** Called by the adapter each time a study recomputes. */
  readonly record: (pass: StudyPass) => void;
  /** Called once per resolve, after it: every slot is fed, including the empty ones. */
  readonly apply: (resolution: SourceResolution) => void;
}

export function bandChannel(capacity: number): BandChannel {
  const overPrice = Array.from({ length: capacity }, (_unused, lane) =>
    new BandFillOverlay(seriesStyleKey(PRICE_PANE_ID, priceOverlaySeriesId(lane, 0))));
  const inLane = Array.from({ length: capacity }, (_unused, lane) =>
    new BandFillOverlay(seriesStyleKey(lanePaneId(lane), laneSeriesId(lane, 0))));
  const passes = new Map<string, StudyPass>();
  return {
    overlays: [...overPrice, ...inLane],
    record: (pass) => {
      passes.set(pass.id, pass);
    },
    apply: (resolution) => {
      const fed = new Set<BandFillOverlay>();
      for (const view of resolution.views) {
        const held = passes.get(view.id);
        const slot = (view.overlay ? overPrice : inLane)[view.lane];
        if (slot === undefined || held?.result == null) continue;
        slot.setBands(
          held.grid.map((bar) => utcSeconds(bar.time)),
          bandsOf(held.result, held.grid.length),
        );
        fed.add(slot);
      }
      // A SLOT NOBODY OCCUPIES IS CLEARED, not left holding the last study's shading. Removing a
      // study detaches nothing — the series stay — so the stale bands would keep painting.
      for (const slot of [...overPrice, ...inLane]) if (!fed.has(slot)) slot.setBands([], []);
    },
  };
}
