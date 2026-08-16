import { ChartWorkspace, resolutionPolicy, resolveSources } from 'lightweight-magic-charts';
import type { Bar } from 'lightweight-magic-charts';
import type { ReactElement } from 'react';

import { DEMO_CATALOGUE } from './catalogue';
import { demoEngine } from './engine';
import { DEMO_PANES } from './panes';
import { demoPort, demoRead } from './port';
import { DEMO_STUDY_CATALOGUE, demoLookup } from './studies';

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
const POLICY = resolutionPolicy({ lanes: 2, plotsPerLane: 3 });

export function App(): ReactElement {
  return (
    <ChartWorkspace
      catalogue={DEMO_CATALOGUE}
      panes={DEMO_PANES}
      data={{ port: demoPort, engine: demoEngine, symbol: 'DEMO-USD', read: demoRead }}
      layout={{ heightPx: 620 }}
      studies={{
        catalogue: DEMO_STUDY_CATALOGUE,
        // RESOLVED BY THE HOST, on demand. The library hands over the chosen ids and the bars in
        // view; what those ids mean is the host's dictionary, and `resolveSources` is the helper
        // the package publishes for exactly this call rather than a private one it keeps.
        resolve: (ids: readonly string[], bars: readonly Bar[]) =>
          resolveSources(ids, demoLookup, bars, POLICY),
        capacity: 6,
        // Without lanes there is nowhere for an own-pane study to go, and picking one would look
        // like nothing happening.
        lanes: { plots: 3, colors: ['#f5a623', '#4c9aff', '#c792ea'], heightPx: 120 },
      }}
    />
  );
}
