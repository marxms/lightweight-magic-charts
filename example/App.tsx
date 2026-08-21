import { ChartWorkspace, resolutionPolicy, resolveSources } from 'lightweight-magic-charts';
import type { Bar, SeriesCatalogueEntry, StudySettings } from 'lightweight-magic-charts';
import { useMemo, useRef, useState, type ReactElement } from 'react';

import { demoSetupPolicy } from './catalogue';
import { DEMO_DRAWING_VOCABULARY, demoDrawingBinding } from './drawing';
import { demoEngine } from './engine';
// TYPE ONLY, so the specifier is erased and 182 KB of committed catalogue never reaches the boot
// chunk. `main.tsx` fetches the module itself and hands the whole namespace over.
import type * as Indicators from './indicators';
import type { IndicatorLibrary } from './indicators';
import { DEMO_PANES, STUDY_CAPACITY } from './panes';
import { DEMO_DENSITY, demoPort, demoRead } from './port';
import { DEMO_STUDY_CATALOGUE, demoLookup } from './studies';
import { STUDY_PARAM_SECTIONS } from './studyForm';

/**
 * The drop-in, mounted the way a HOST mounts it.
 *
 * IT USED TO MOUNT THE MINIMUM, and that was the right file for a contract test and the wrong one
 * for a published page. `0.1.0` shipped showing three required prop groups and nothing else: an
 * empty volume lane, a studies panel with nothing in it, no density, no trough. Every absence was
 * correct behaviour for what it was given, which is precisely why it read as broken — the page
 * demonstrated the library's floor and was presented as its shape.
 *
 * What it shows now is the seam, in both directions: the library composes, lays out, labels and
 * keyboard-reaches; the host supplies the vocabulary (`panes`, `studies`) and the numbers (`data`).
 * Nothing below computes a chart, and nothing below styles one.
 *
 * THE THIRD-PARTY CATALOGUE ARRIVES IN TWO SEPARATE PIECES, and the order is the point. The NAMES
 * are 320 rows of committed manifest, fetched before this mounts, so the menu is populated with
 * nothing of the library present. The ARITHMETIC is 1.05 MB and is fetched behind the visitor's
 * first study, never at boot. `indicators` being `null` is the third case: the fetch failed, and
 * the workspace mounts with the demo's own studies rather than not mounting.
 */
/**
 * `lanes` IS THE TOTAL STUDY CAP, not the number of lanes left over after the overlays.
 * `resolveSources` starts with `laneOrder(active, policy.lanes)`, which truncates the chosen list
 * to that many entries — overlays included. Set to 2 while the panel offered `capacity: 6`, it let
 * a visitor pick six studies and silently resolved the first two. The two numbers are one number,
 * so they are written as one.
 */
const POLICY = resolutionPolicy({ lanes: STUDY_CAPACITY, plotsPerLane: 3 });

export interface AppProps {
  /** `null` when the catalogue could not be fetched. The page still draws. */
  readonly indicators: typeof Indicators | null;
}

export function App({ indicators }: AppProps): ReactElement {
  const [library, setLibrary] = useState<IndicatorLibrary | null>(null);
  const asked = useRef(false);

  const rows = indicators?.MANIFEST_ROWS ?? [];
  const offered = useMemo(() => new Set(rows.map((row) => row.id)), [rows]);
  const catalogue = useMemo(
    () => demoSetupPolicy([...offered], indicators?.coerceStudySettingsFor()),
    [offered, indicators],
  );
  const entries = useMemo<readonly SeriesCatalogueEntry[]>(
    () => [...DEMO_STUDY_CATALOGUE, ...(indicators === null ? [] : indicators.catalogueEntries())],
    [indicators],
  );

  /**
   * `resolve` is the ONLY place this host learns that a study was chosen, so it is where the
   * library is asked for. Idempotent by construction — the loader remembers its own promise, and
   * nothing is written to state synchronously, which is what would make this a render-phase update
   * of somebody else's component.
   */
  const studies = useMemo(
    () => ({
      catalogue: entries,
      resolve: (ids: readonly string[], bars: readonly Bar[], settings?: Readonly<Record<string, StudySettings>>) => {
        if (indicators !== null && !asked.current && ids.some((id) => offered.has(id))) {
          asked.current = true;
          indicators.loadIndicatorLibrary().then(setLibrary, () => {
            asked.current = false;
          });
        }
        const vendor = indicators?.sourceLookupFor(library, settings, rows);
        return resolveSources(
          ids,
          (id) => demoLookup(id) ?? vendor?.(id),
          bars,
          POLICY,
        );
      },
      capacity: STUDY_CAPACITY,
      // Without lanes there is nowhere for an own-pane study to go, and picking one would look
      // like nothing happening.
      lanes: { plots: 3, colors: ['#f5a623', '#4c9aff', '#c792ea'], heightPx: 120 },
    }),
    // `library` is a dependency because the arithmetic arriving has to invalidate the memo the
    // composition holds — otherwise the study stays a name with no line under it.
    [entries, indicators, library, offered, rows],
  );

  return (
    <ChartWorkspace
      catalogue={catalogue}
      panes={DEMO_PANES}
      data={{
        port: demoPort,
        engine: demoEngine,
        symbol: 'DEMO-USD',
        read: demoRead,
        density: DEMO_DENSITY,
      }}
      layout={{ heightPx: 620 }}
      /**
       * THE HOST'S OWN SECTION, and it is a module-scope constant for a measured reason: a
       * `sections` array built in this render would hand `SeriesMenu` a new `Body` every time, and
       * a new `Body` is a new element type — a remount, and the caret dies on the first character
       * typed into it. One section, declared once, never reordered.
       */
      chrome={{ sections: STUDY_PARAM_SECTIONS }}
      drawing={{ vocabulary: DEMO_DRAWING_VOCABULARY, binding: demoDrawingBinding }}
      studies={studies}
    />
  );
}
