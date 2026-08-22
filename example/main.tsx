import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { publishStudyRows } from './studyForm';

const host = document.getElementById('root');
if (host === null) throw new Error('example: #root is missing from index.html');

const root = createRoot(host);
const mount = (indicators: typeof import('./indicators') | null): void => {
  root.render(
    <StrictMode>
      <App indicators={indicators} />
    </StrictMode>,
  );
};

/**
 * THE CATALOGUE IS FETCHED BEFORE THE WORKSPACE MOUNTS. THE LIBRARY IS NOT.
 *
 * Two different artefacts, and conflating them is what this file exists to prevent. The 320 NAMES
 * live in a committed manifest; the ARITHMETIC is 1.05 MB and is fetched behind the visitor's first
 * study, from inside the adapter. Only the first is awaited here, and it is awaited rather than
 * raced because `usePersistedTabs` coerces a stored payload ONCE, at mount, against the policy it is
 * handed: a catalogue arriving afterwards would be a catalogue the coercion never saw, and a visitor
 * who saved a third-party study would come back to a workspace that had quietly dropped it.
 *
 * A FAILED FETCH IS NOT A FAILED PAGE. The workspace mounts either way; without the catalogue it
 * offers the demo's own studies and says nothing about a library it never got.
 */
void import('./indicators').then(
  (indicators) => {
    publishStudyRows(indicators.MANIFEST_ROWS);
    mount(indicators);
  },
  (error: unknown) => {
    console.warn('example: the indicator catalogue did not load; mounting without it.', error);
    mount(null);
  },
);
