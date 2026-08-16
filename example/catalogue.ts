import type { WorkspaceSetupPolicy } from 'lightweight-magic-charts';

/**
 * What this build offers: two panes, two intervals, and a coercion function for whatever a
 * previous visit stored. Titles are not identifiers — `price` is displayed as `Price action`,
 * so the only way to render that string is to have read `title`.
 */
export const DEMO_CATALOGUE: WorkspaceSetupPolicy = {
  catalogue: [
    { id: 'price', defaultVisible: true, heightPx: 320, title: 'Price action' },
    { id: 'volume', defaultVisible: true, heightPx: 110, title: 'Traded volume' },
  ],
  servedTimeframes: ['1h', '4h'],
  gridFallback: ['1h'],
  maxGridCells: 4,
  density: { floor: 0.1, gamma: 1 },
  showDensity: false,
  showProfile: false,
  autoFit: true,
  coerceIndicators: () => [],
};
