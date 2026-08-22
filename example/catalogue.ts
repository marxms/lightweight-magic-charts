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
const DEMO_CATALOGUE: WorkspaceSetupPolicy = {
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

/**
 * The same policy, widened by whatever the third-party catalogue turned out to offer.
 *
 * IT IS A FUNCTION BECAUSE THE ANSWER ARRIVES LATE. `usePersistedTabs` coerces the stored payload
 * ONCE, in a `useState` initialiser, so a policy handed over after the mount would never be asked.
 * That is why `main.tsx` fetches the catalogue before it renders: a visitor who saved a third-party
 * study would otherwise come back to a workspace that dropped it, silently, as an id nothing
 * offered.
 *
 * `coerceStudySettings` is the SIBLING the seam declares: reading a parameter VALUE names the
 * host's business, so the host reads it — and it is absent, not empty, when there is no catalogue
 * to read against.
 */
export function demoSetupPolicy(
  offered: readonly string[],
  coerceStudySettings?: WorkspaceSetupPolicy['coerceStudySettings'],
): WorkspaceSetupPolicy {
  const known = new Set<string>([...DEMO_STUDY_IDS, ...offered]);
  return {
    ...DEMO_CATALOGUE,
    coerceIndicators: (raw) =>
      Array.isArray(raw)
        ? raw.filter((id): id is string => typeof id === 'string' && known.has(id))
        : [],
    ...(coerceStudySettings === undefined ? {} : { coerceStudySettings }),
  };
}
