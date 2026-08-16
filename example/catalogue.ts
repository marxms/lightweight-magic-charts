import type { WorkspaceSetupPolicy } from 'lightweight-magic-charts';

import { DEMO_STUDY_IDS } from './studies';

/**
 * What this build offers: two panes, two intervals, and a coercion function for whatever a
 * previous visit stored. Titles are not identifiers — `price` is displayed as `Price action`,
 * so the only way to render that string is to have read `title`.
 *
 * THE OVERLAYS ARE ON, and that is a correction rather than a preference. The first published page
 * had `showDensity` and `showProfile` off and `coerceIndicators` returning an empty array, so the
 * density field, the volume trough and every study were unreachable — a visitor met the drop-in's
 * minimum and had no way to learn the rest existed. Defaults on a REFERENCE page are the feature
 * list; off, they are a feature list of nothing.
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
  showDensity: true,
  showProfile: true,
  autoFit: true,
  /**
   * KEEPS WHAT THIS BUILD STILL OFFERS, drops the rest. Returning `[]` unconditionally — which is
   * what the first version did — is indistinguishable from "the stored payload was invalid", so a
   * visitor's chosen studies vanished on every reload with nothing saying why.
   */
  coerceIndicators: (raw) =>
    Array.isArray(raw) ? raw.filter((id): id is string => DEMO_STUDY_IDS.includes(id as string)) : [],
};
