/**
 * LINES-01 / LINES-03 — a reading filed against a series NOBODY DECLARED is not a drawn line.
 *
 * The package resolving a line and the chart drawing one are different events, and this feature
 * exists because they were being counted as one. `resolveSources` files a reading under
 * `ovl<lane>p<plot>` for every plot that came alive; `useSeriesData` iterates the series the HOST
 * declared and never asks for a reading it has no spec for. So a resolution wider than the host's
 * declaration is dropped in silence, and the panel reports the drop as a drawn line.
 *
 * Measured before this task, against the real `resolveSources` on the demo's bars: the Ichimoku
 * Cloud filed five readings — `ovl1p1..ovl1p5` — the host declared `ovl1p1` alone, and ONE line
 * reached the screen while the view claimed three.
 *
 * The check is the intersection of the two sides, and it is written with the SAME positive control
 * the architectural gates carry: the narrow width that produced the defect is planted here and has
 * to come back red, or the clause would be passing over an empty set for the rest of its life.
 *
 * MOUNTING IS NOT WHAT THIS ASSERTS. Whether a declared series then paints is the e2e's question
 * (`scripts/e2e-demo.mjs` reads the legend); this one is about the resource existing at all, which
 * is the half that was missing and the half no rendered assertion can reach: a line with no slot
 * produces no pixel to read and no error to catch.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import { STUDY_CAPACITY, demoPanes } from '../example/panes';
import type { ManifestWidths } from '../example/studyValues';
import { laneSeriesId } from '../src/catalogue/lanes';
import { resolutionPolicy } from '../src/catalogue/sources';
import type { PlottableSource } from '../src/catalogue/sources';
import { resolveSources } from '../src/indicator/resolution';
import type { Bar } from '../src/domain/types';
import { seriesId, utcSeconds } from '../src/domain/types';

/* ---- the committed artefact, read the way the gates read one ----------------------------- */

/**
 * FROM DISK, NOT THROUGH THE ADAPTER. `example/indicators.ts` reaches the manifest with a default
 * import of a `.json`, which esbuild synthesises for the page and this compiler — `esModuleInterop`
 * off, `allowSyntheticDefaultImports` on — resolves to `undefined`. Reading the file is what makes
 * the assertion about the artefact the page actually ships rather than about a module system.
 */
const MANIFEST = JSON.parse(
  readFileSync(join(__dirname, '..', 'example', 'indicators', 'manifest.json'), 'utf8'),
) as {
  readonly widths: ManifestWidths;
  readonly indicators: readonly { readonly placement: string; readonly plotIds: readonly string[] }[];
};

/** The same number, re-derived from the rows the file carries — never from the generator's code. */
const widestRow = (placement: string): number =>
  MANIFEST.indicators
    .filter((row) => row.placement === placement)
    .reduce((most, row) => Math.max(most, row.plotIds.length), 0);

const WIDTHS: ManifestWidths = MANIFEST.widths;

/* ---- the two sides ---------------------------------------------------------------------- */

const BARS: readonly Bar[] = Array.from({ length: 40 }, (_unused, at) => ({
  time: utcSeconds(1_700_000_000 + at * 60),
  open: 100 + at,
  high: 101 + at,
  low: 99 + at,
  close: 100.5 + at,
  volume: 10 + at,
}));

/** Every identity a reading could be filed under and actually be drawn: the host's, plus the lanes'. */
const declaredSeries = (widths: ManifestWidths): ReadonlySet<string> => {
  const ids = new Set<string>();
  for (const pane of demoPanes(widths)) {
    for (const spec of pane.series) ids.add(String(spec.id));
  }
  for (let lane = 0; lane < STUDY_CAPACITY; lane += 1) {
    for (let plot = 0; plot < widths.ownPane; plot += 1) ids.add(laneSeriesId(lane, plot));
  }
  return ids;
};

/** A study of `plots` lines, every one of them alive, asking for the placement named. */
const studyOf = (id: string, placement: 'over-price' | 'own-pane', plots: number): PlottableSource => ({
  id,
  label: id,
  placement,
  series: () =>
    Array.from({ length: plots }, (_unused, plot) => ({
      spec: { id: seriesId(`${id}-${plot}`), label: `${id} ${plot}`, shape: 'line' as const, color: '#4c9aff' },
      // Over-price asks to sit ON the price scale, so its values have to be price-shaped or the
      // resolver measures it off-scale and files it in a lane instead — which would test the wrong
      // thing. A lane study is deliberately far from the price for the same reason.
      provider: {
        id: seriesId(`${id}-${plot}`),
        compute: (bars: readonly Bar[]) =>
          bars.map((bar) => ({
            time: bar.time,
            value: placement === 'over-price' ? bar.close + plot * 0.01 : plot + 1,
          })),
      },
    })),
});

const unclaimed = (source: PlottableSource, widths: ManifestWidths): readonly string[] => {
  const resolution = resolveSources(
    [source.id],
    (id) => (id === source.id ? source : undefined),
    BARS,
    resolutionPolicy({ lanes: STUDY_CAPACITY }),
  );
  const declared = declaredSeries(widths);
  return [...resolution.readings.keys()].map(String).filter((key) => !declared.has(key));
};

/* ---- the check -------------------------------------------------------------------------- */

describe('LINES-01/03 — every resolved line has a declared series to be drawn into', () => {
  it('declares each width as the widest row written under it, not as a typed number', () => {
    expect({ overPrice: WIDTHS.overPrice, ownPane: WIDTHS.ownPane }).toEqual({
      overPrice: widestRow('over-price'),
      ownPane: widestRow('own-pane'),
    });
    // Measured on the committed catalogue: `auto-support` at 56 over the price, and
    // `bulls-bears-control` at 14 in a lane of its own.
    expect({ overPrice: WIDTHS.overPrice, ownPane: WIDTHS.ownPane }).toEqual({ overPrice: 56, ownPane: 14 });
  });

  it('leaves NOTHING unclaimed for an over-price study as wide as the catalogue declares', () => {
    expect(unclaimed(studyOf('widest-overlay', 'over-price', WIDTHS.overPrice), WIDTHS)).toEqual([]);
  });

  it('leaves NOTHING unclaimed for a lane study as wide as the catalogue declares', () => {
    expect(unclaimed(studyOf('widest-lane', 'own-pane', WIDTHS.ownPane), WIDTHS)).toEqual([]);
  });

  it('leaves NOTHING unclaimed for the five-plot shape the Ichimoku Cloud has', () => {
    expect(unclaimed(studyOf('ichimoku-shaped', 'over-price', 5), WIDTHS)).toEqual([]);
  });

  /* ---- POSITIVE CONTROL: the width that produced the defect, planted --------------------- */

  it('POSITIVE CONTROL — one over-price slot per lane leaves the other four of five unclaimed', () => {
    expect(unclaimed(studyOf('ichimoku-shaped', 'over-price', 5), { overPrice: 1, ownPane: 14 })).toEqual([
      'ovl1p2',
      'ovl1p3',
      'ovl1p4',
      'ovl1p5',
    ]);
  });

  it('POSITIVE CONTROL — a lane narrower than the study leaves the excess unclaimed', () => {
    expect(unclaimed(studyOf('five-in-a-lane', 'own-pane', 5), { overPrice: 56, ownPane: 3 })).toEqual([
      'ind1p4',
      'ind1p5',
    ]);
  });
});
