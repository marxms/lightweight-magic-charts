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
import type { PaneSpec, SeriesSpec } from 'lightweight-magic-charts';
import { paneId, seriesId } from 'lightweight-magic-charts';

import type { ManifestWidths } from './studyValues';

/** How many studies the workspace accepts. Kept beside the slots it sizes. */
export const STUDY_CAPACITY = 6;

/** The palette cycles by position, exactly as the lanes' does, so two overlays never share a hue. */
const OVERLAY_COLORS = ['#4c9aff', '#c792ea', '#26c6da', '#f5a623', '#66bb6a', '#ef5350'];

/**
 * THE OVERLAY SLOTS, DECLARED BY THE HOST — one per line the catalogue says a study can draw.
 *
 * A study whose scale sits near the price resolves as an OVERLAY, and its readings are filed under
 * `ovl<lane>p<plot>`. Nothing in the library adds a series to the price pane, so a slot that is not
 * declared here has a reading and no line to draw it on. Resolving a line and drawing one are
 * different events, and this file is where the second one is paid for.
 *
 * THE WIDTH COMES FROM THE MANIFEST, which derives it from the rows it writes. It used to be ONE —
 * `ovl<lane>p1` and nothing further — so the Ichimoku Cloud filed five readings, reported three and
 * drew a single line. The number is DECLARED, never observed: `auto-support` brings 24 of its 56
 * plots alive over 240 bars and 40 over 1024, so a width sized by what a window showed would drop
 * the rest the moment the window grew.
 *
 * The label is empty, exactly as `laneDraft` builds a lane's: an unoccupied slot with a name is a
 * legend chip that identifies nothing, and there are 336 of them.
 */
const overlaySlots = (width: number): readonly SeriesSpec[] =>
  Array.from({ length: STUDY_CAPACITY }, (_unused, lane) =>
    Array.from({ length: width }, (_ignored, plot) => ({
      id: seriesId(`ovl${lane + 1}p${plot + 1}`),
      label: '',
      shape: 'line' as const,
      color: OVERLAY_COLORS[plot % OVERLAY_COLORS.length],
      lineWidth: 2 as const,
    })),
  ).flat();

export const demoPanes = (widths: ManifestWidths): readonly PaneSpec[] => [
  {
    id: paneId('price'),
    title: 'Price action',
    // The price pane declares no target height: it receives the residual.
    format: { kind: 'price', minMove: 0.01 },
    defaultVisible: true,
    series: overlaySlots(widths.overPrice),
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
