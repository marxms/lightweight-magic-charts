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

/** How many studies the workspace accepts. Kept beside the slots it sizes. */
export const STUDY_CAPACITY = 6;

/** The palette cycles by position, exactly as the lanes' does, so two overlays never share a hue. */
const OVERLAY_COLORS = ['#4c9aff', '#c792ea', '#26c6da', '#f5a623', '#66bb6a', '#ef5350'];

const OVERLAY_SLOTS = Array.from({ length: STUDY_CAPACITY }, (_unused, lane) => ({
  id: seriesId(`ovl${lane + 1}p1`),
  label: 'Study',
  shape: 'line' as const,
  color: OVERLAY_COLORS[lane % OVERLAY_COLORS.length],
  lineWidth: 2 as const,
}));

export const DEMO_PANES: readonly PaneSpec[] = [
  {
    id: paneId('price'),
    title: 'Price action',
    // The price pane declares no target height: it receives the residual.
    format: { kind: 'price', minMove: 0.01 },
    defaultVisible: true,
    /**
     * THE OVERLAY SLOTS, DECLARED BY THE HOST — one per study the workspace will accept.
     *
     * A study whose scale sits near the price resolves as an OVERLAY, and its readings are filed
     * under `ovl<lane>p<plot>`. Nothing in the library adds a series to the price pane, so a slot
     * that is not declared here has a reading and no line to draw it on.
     *
     * THE COUNT IS THE STUDY CAPACITY, not a smaller number that looked like enough. With two slots
     * and a capacity of six, picking a third study over the price resolved it, filed its readings,
     * and drew nothing — the panel said 3/6 and the chart showed two. Every cap in this example is
     * the same cap: `App.tsx` exports `STUDY_CAPACITY`, and this list is that long.
     */
    series: OVERLAY_SLOTS,
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
