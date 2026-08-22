/**
 * THE MARKS A STUDY PUTS ON ITS OWN BARS — 77 offered indicators emit them and none of them drew.
 *
 * The door has been on the port since it was written and the docblock beside it always said an
 * adapter had to add the plugin. `example/engine.ts` is now that adapter; this is the other half —
 * the map from a resolved study to the series its marks belong on.
 *
 * ON THE STUDY'S OWN SERIES, not on the candles. The vendor's reference implementation pins every
 * mark to the price pane, so an oscillator's signal lands on a scale it was never measured against.
 * Keyed by `seriesStyleKey` the mark rides the line it describes, which is both more faithful and
 * cheaper — no second decision about which pane a mark belongs to.
 *
 * FOUR SHAPES, NOT TWELVE. `SeriesMarkerPoint` is exactly `lightweight-charts`' own
 * `SeriesMarkerShape`, and measured over the 320 offered rows, 1,558 of 2,109 marks name one of the
 * eight shapes the base library cannot draw. Those are not silently redrawn as something else: a
 * mark whose shape has no destination is DROPPED here, which is a visible absence rather than a
 * lie, and the remaining shapes ride the door that now exists.
 */
import type { SeriesMarkerPoint, SourceResolution } from 'lightweight-magic-charts';
import {
  PRICE_PANE_ID,
  lanePaneId,
  laneSeriesId,
  priceOverlaySeriesId,
  seriesStyleKey,
} from 'lightweight-magic-charts';

import type { StudyPass } from './indicators';

/** What the base library draws. Anything else the vendor emits has nowhere to go. */
const DRAWABLE = new Set(['circle', 'square', 'arrowUp', 'arrowDown']);
const PLACED = new Set(['aboveBar', 'belowBar', 'inBar']);

interface VendorMarker {
  readonly time?: number;
  readonly position?: string;
  readonly shape?: string;
  readonly color?: string;
  readonly text?: string;
}

const EMPTY: ReadonlyMap<string, readonly SeriesMarkerPoint[]> = new Map();

/**
 * One vendor mark, narrowed — or `null` when nothing on this chart can carry it.
 *
 * `loaded` is the window the study was computed over, and a mark whose bar is not in it is dropped
 * here rather than handed on: the base library places a mark by looking its time up in the series'
 * own data, so a time nothing holds is a mark with no coordinate. Measured across all 72
 * marker-emitting rows at their own defaults — 10,103 marks — this vendor produces ZERO of them and
 * zero non-finite times, so the clause is asserted with synthetic marks in `test/studyMarks.spec.ts`
 * rather than left to a catalogue that cannot exercise it.
 *
 * MEMBERSHIP SUBSUMES FINITENESS. `Number.isFinite` used to stand here as its own clause; a set of
 * bar times holds neither `NaN` nor `Infinity`, so it was a second test of the same question and
 * the suite could not tell the two apart. The `typeof` guard stays because it is what types `time`.
 */
function markOf(raw: VendorMarker, loaded: ReadonlySet<number>): SeriesMarkerPoint | null {
  const { time, position, shape, color } = raw;
  if (typeof time !== 'number' || !loaded.has(time)) return null;
  if (shape === undefined || !DRAWABLE.has(shape)) return null;
  if (position === undefined || !PLACED.has(position)) return null;
  if (typeof color !== 'string' || color === '') return null;
  return {
    time,
    position: position as SeriesMarkerPoint['position'],
    shape: shape as SeriesMarkerPoint['shape'],
    color,
    ...(typeof raw.text === 'string' && raw.text !== '' ? { text: raw.text } : {}),
  };
}

export interface MarkChannel {
  /** Called by the adapter each time a study recomputes. */
  readonly record: (pass: StudyPass) => void;
  /**
   * The map the composition hands to the surface. CACHED ON THE RESOLUTION IDENTITY, because the
   * effect that applies it depends on the map: a fresh one per render would resend every mark on
   * every render, and the worst frame this catalogue can produce carries about 7,400 of them.
   */
  readonly map: (resolution: SourceResolution) => ReadonlyMap<string, readonly SeriesMarkerPoint[]>;
}

export function markChannel(): MarkChannel {
  const passes = new Map<string, StudyPass>();
  let lastResolution: SourceResolution | null = null;
  let lastMap: ReadonlyMap<string, readonly SeriesMarkerPoint[]> = EMPTY;
  return {
    record: (pass) => {
      passes.set(pass.id, pass);
    },
    map: (resolution) => {
      if (resolution === lastResolution) return lastMap;
      const built = new Map<string, readonly SeriesMarkerPoint[]>();
      for (const view of resolution.views) {
        const pass = passes.get(view.id);
        const raw = (pass?.result as { markers?: readonly VendorMarker[] } | null)?.markers;
        if (raw === undefined || raw.length === 0) continue;
        const loaded = new Set<number>((pass?.grid ?? []).map((bar) => bar.time as number));
        const marks = raw
          .map((mark) => markOf(mark, loaded))
          .filter((mark): mark is SeriesMarkerPoint => mark !== null);
        if (marks.length === 0) continue;
        const key = view.overlay
          ? seriesStyleKey(PRICE_PANE_ID, priceOverlaySeriesId(view.lane, 0))
          : seriesStyleKey(lanePaneId(view.lane), laneSeriesId(view.lane, 0));
        built.set(key, marks);
      }
      lastResolution = resolution;
      lastMap = built;
      return built;
    },
  };
}
