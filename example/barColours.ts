/**
 * THE BARS A STUDY RECOLOURS — 52 offered indicators emit 45,209 of these and none of them landed.
 *
 * `barcolor()` in PineScript is GLOBAL to the chart: it repaints the candles, not the study's own
 * line, and measured on this catalogue 23 of the 52 emitters are drawn in a lane of their own while
 * still recolouring the price. So this is not a per-series channel and it is not a point colour —
 * it is one array against the bars, which is exactly the shape `SurfaceData.barColors` takes.
 *
 * BY TIME, NOT BY INDEX. The vendor emits `{ time, color }` and skips the bars it has no opinion
 * about — measured, `wavetrend` colours 7 bars of 60 and `buying-selling-volume` colours all of
 * them. Projecting by position would slide every colour to the left by the number of bars skipped.
 *
 * THE LAST STUDY TO SPEAK WINS, and saying so is the point of taking one array. With six studies
 * chosen two can colour the same bar; the package refuses to arbitrate because which study matters
 * is the host's judgement, and the resolution's own order — the reader's pick order — is the only
 * ranking this host has.
 */
import type { SourceResolution } from 'lightweight-magic-charts';

import type { StudyPass } from './indicators';

interface VendorBarColor {
  readonly time?: number;
  readonly color?: string;
}

const NONE: readonly (string | null)[] = [];

export interface BarColourChannel {
  /** Called by the adapter each time a study recomputes. */
  readonly record: (pass: StudyPass) => void;
  /** CACHED ON THE RESOLUTION IDENTITY: the write effect depends on the array. */
  readonly colours: (resolution: SourceResolution) => readonly (string | null)[];
}

export function barColourChannel(): BarColourChannel {
  const passes = new Map<string, StudyPass>();
  let lastResolution: SourceResolution | null = null;
  let lastColours: readonly (string | null)[] = NONE;
  return {
    record: (pass) => {
      passes.set(pass.id, pass);
    },
    colours: (resolution) => {
      if (resolution === lastResolution) return lastColours;
      let painted: (string | null)[] | null = null;
      for (const view of resolution.views) {
        const held = passes.get(view.id);
        const raw = (held?.result as { barColors?: readonly VendorBarColor[] } | null)?.barColors;
        if (held === undefined || raw === undefined || raw.length === 0) continue;
        const byTime = new Map<number, string>();
        for (const entry of raw) {
          if (typeof entry.time === 'number' && typeof entry.color === 'string' && entry.color !== '') {
            byTime.set(entry.time, entry.color);
          }
        }
        const onto = (painted ??= held.grid.map(() => null));
        held.grid.forEach((bar, at) => {
          const colour = byTime.get(bar.time as number);
          // A BAR NOBODY COLOURED KEEPS WHAT IT HAD. `null` is "the convention decides", never
          // "paint it nothing", so a sparse emitter does not blank the bars it skipped.
          if (colour !== undefined) onto[at] = colour;
        });
      }
      lastResolution = resolution;
      lastColours = painted ?? NONE;
      return lastColours;
    },
  };
}
