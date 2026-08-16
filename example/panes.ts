/**
 * The AUTHORED panes — what makes the difference between a titled empty box and a drawn one.
 *
 * `ChartWorkspace` says it in the prop's own comment: absent `panes`, each catalogue entry is drawn
 * as a titled empty pane. That is correct behaviour and it is exactly what shipped on the published
 * page — a lane labelled `Traded volume` with nothing in it, over bars that carried volume the whole
 * time. Nobody had declared the series that would draw it.
 *
 * So this file is the other half of the catalogue: the catalogue says a lane MAY exist, this says
 * what goes in it.
 */
import type { PaneSpec } from 'lightweight-magic-charts';
import { paneId, seriesId } from 'lightweight-magic-charts';

export const DEMO_PANES: readonly PaneSpec[] = [
  {
    id: paneId('price'),
    title: 'Price action',
    // The price pane declares no target height: it receives the residual.
    format: { kind: 'price', minMove: 0.01 },
    defaultVisible: true,
    series: [],
  },
  {
    id: paneId('volume'),
    title: 'Traded volume',
    // Compact, because a raw count of contracts reads as noise beside a price.
    format: { kind: 'compact', decimals: 1 },
    targetHeightPx: 110,
    defaultVisible: true,
    series: [
      {
        id: seriesId('volume'),
        label: 'Traded volume',
        shape: 'histogram',
        color: '#4c9aff',
        // COLOURED BY ITS OWN BAR's direction rather than by its own change: volume has no
        // direction of its own, and reading one into it would be inventing a fact.
        signColoring: true,
      },
    ],
  },
];
