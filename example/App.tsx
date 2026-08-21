import { ChartWorkspace, resolutionPolicy, resolveSources } from 'lightweight-magic-charts';
import type { Bar } from 'lightweight-magic-charts';
import type { ReactElement } from 'react';

import { DEMO_CATALOGUE } from './catalogue';
import { DEMO_DRAWING_VOCABULARY, demoDrawingBinding } from './drawing';
import { demoEngine } from './engine';
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
 */
/**
 * `lanes` IS THE TOTAL STUDY CAP, not the number of lanes left over after the overlays.
 * `resolveSources` starts with `laneOrder(active, policy.lanes)`, which truncates the chosen list
 * to that many entries — overlays included. Set to 2 while the panel offered `capacity: 6`, it let
 * a visitor pick six studies and silently resolved the first two. The two numbers are one number,
 * so they are written as one.
 */
const POLICY = resolutionPolicy({ lanes: STUDY_CAPACITY, plotsPerLane: 3 });

export function App(): ReactElement {
  return (
    <ChartWorkspace
      catalogue={DEMO_CATALOGUE}
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
      studies={{
        catalogue: DEMO_STUDY_CATALOGUE,
        // RESOLVED BY THE HOST, on demand. The library hands over the chosen ids and the bars in
        // view; what those ids mean is the host's dictionary, and `resolveSources` is the helper
        // the package publishes for exactly this call rather than a private one it keeps.
        resolve: (ids: readonly string[], bars: readonly Bar[]) =>
          resolveSources(ids, demoLookup, bars, POLICY),
        capacity: STUDY_CAPACITY,
        // Without lanes there is nowhere for an own-pane study to go, and picking one would look
        // like nothing happening.
        lanes: { plots: 3, colors: ['#f5a623', '#4c9aff', '#c792ea'], heightPx: 120 },
      }}
    />
  );
}
