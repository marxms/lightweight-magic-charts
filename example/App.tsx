import { ChartWorkspace } from 'lightweight-magic-charts';
import type { ReactElement } from 'react';

import { DEMO_CATALOGUE } from './catalogue';
import { demoEngine } from './engine';
import { demoPort } from './port';

/**
 * The drop-in, mounted with the three required prop groups and nothing else: what may be drawn
 * (`catalogue`), where the numbers come from (`data`) and how much height it may use (`layout`).
 *
 * No theme, no chrome role, no label, no section body. Every region that appears below is there
 * because the composition owns it, not because this file asked for it.
 */
export function App(): ReactElement {
  return (
    <ChartWorkspace
      catalogue={DEMO_CATALOGUE}
      data={{ port: demoPort, engine: demoEngine, symbol: 'DEMO-USD' }}
      layout={{ heightPx: 520 }}
    />
  );
}
