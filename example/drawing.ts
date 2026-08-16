/**
 * The drawing seam, filled — the second adapter a host writes, and the one the library refuses to
 * write for you.
 *
 * `DrawingBinding` is a function, not a dependency: `src/drawing/drawingLayer.ts` declares what a
 * layer must do and nothing about who does it. That refusal is the point. Which drawing engine a
 * product uses is a dependency decision with its own licence, bundle cost and tool vocabulary, and a
 * charting library that made it for you would be making it for everyone.
 *
 * Here it is answered with `lightweight-charts-drawing`, a devDependency of the EXAMPLE only. It
 * never appears in the package's own manifest, which still has zero runtime dependencies.
 */
import type {
  DrawingBinding,
  DrawingTool,
  DrawingToolGroup,
  DrawingToolOption,
  DrawingVocabulary,
} from 'lightweight-magic-charts';
import { DrawingManager } from 'lightweight-charts-drawing';

import { realChartOf } from './engine';

/**
 * THE CURATED RAIL — eight, not sixty-seven. The plugin ships 67 tool types; a rail that showed all
 * of them would be a menu wearing a toolbar's clothes. These are the ones a reader recognises, and
 * everything else stays one click away in the flyout below.
 */
const RAIL: readonly DrawingTool[] = [
  { id: 'trend-line', label: 'Trend line', glyph: '╱', shortcut: 'Alt+T' },
  { id: 'horizontal-line', label: 'Horizontal line', glyph: '─', shortcut: 'Alt+H' },
  { id: 'vertical-line', label: 'Vertical line', glyph: '│', shortcut: 'Alt+V' },
  { id: 'ray', label: 'Ray', glyph: '→' },
  { id: 'rectangle', label: 'Rectangle', glyph: '▭' },
  { id: 'ellipse', label: 'Ellipse', glyph: '◯' },
  { id: 'fib-retracement', label: 'Fibonacci retracement', glyph: '≡' },
  { id: 'text', label: 'Text', glyph: 'T' },
];

/** The rest, in families, so sixty-seven entries are searchable rather than merely present. */
const GROUPS: readonly DrawingToolGroup[] = [
  { id: 'lines', label: 'Lines', glyph: '╱' },
  { id: 'shapes', label: 'Shapes', glyph: '▭' },
  { id: 'fibonacci', label: 'Fibonacci', glyph: '≡' },
  { id: 'marks', label: 'Marks and notes', glyph: 'T' },
];

const ALL: readonly DrawingToolOption[] = [
  { id: 'trend-line', name: 'Trend line', group: 'lines' },
  { id: 'horizontal-line', name: 'Horizontal line', group: 'lines' },
  { id: 'vertical-line', name: 'Vertical line', group: 'lines' },
  { id: 'cross-line', name: 'Cross line', group: 'lines' },
  { id: 'ray', name: 'Ray', group: 'lines' },
  { id: 'extended-line', name: 'Extended line', group: 'lines' },
  { id: 'arrow', name: 'Arrow', group: 'lines' },
  { id: 'parallel-channel', name: 'Parallel channel', group: 'lines' },
  { id: 'disjoint-channel', name: 'Disjoint channel', group: 'lines' },
  { id: 'andrews-pitchfork', name: "Andrews' pitchfork", group: 'lines' },
  { id: 'rectangle', name: 'Rectangle', group: 'shapes' },
  { id: 'ellipse', name: 'Ellipse', group: 'shapes' },
  { id: 'circle', name: 'Circle', group: 'shapes' },
  { id: 'triangle', name: 'Triangle', group: 'shapes' },
  { id: 'arc', name: 'Arc', group: 'shapes' },
  { id: 'curve', name: 'Curve', group: 'shapes' },
  { id: 'brush', name: 'Brush', group: 'shapes' },
  { id: 'fib-retracement', name: 'Fibonacci retracement', group: 'fibonacci' },
  { id: 'fib-extension', name: 'Fibonacci extension', group: 'fibonacci' },
  { id: 'fib-channel', name: 'Fibonacci channel', group: 'fibonacci' },
  { id: 'fib-arcs', name: 'Fibonacci arcs', group: 'fibonacci' },
  { id: 'fib-circles', name: 'Fibonacci circles', group: 'fibonacci' },
  { id: 'fib-time-zone', name: 'Fibonacci time zone', group: 'fibonacci' },
  { id: 'fib-wedge', name: 'Fibonacci wedge', group: 'fibonacci' },
  { id: 'text', name: 'Text', group: 'marks' },
  { id: 'callout', name: 'Callout', group: 'marks' },
  { id: 'comment', name: 'Comment', group: 'marks' },
  { id: 'anchored-text', name: 'Anchored text', group: 'marks' },
  { id: 'arrow-marker', name: 'Arrow marker', group: 'marks' },
  { id: 'arrow-mark-up', name: 'Arrow up', group: 'marks' },
  { id: 'arrow-mark-down', name: 'Arrow down', group: 'marks' },
  { id: 'price-range', name: 'Price range', group: 'marks' },
  { id: 'date-range', name: 'Date range', group: 'marks' },
];

export const DEMO_DRAWING_VOCABULARY: DrawingVocabulary = {
  tools: RAIL,
  allTools: ALL,
  toolGroups: GROUPS,
  // `event.code`, not `key`: the root reads the physical key so a non-US layout still arms the tool.
  shortcuts: { KeyT: 'trend-line', KeyH: 'horizontal-line', KeyV: 'vertical-line' },
};

/**
 * The binding: the library hands the surface, the host hands back something that can draw on it.
 *
 * `deleteSelection` is composed rather than called — the plugin exposes selection and removal
 * separately, and with nothing selected the right behaviour is to do nothing rather than to clear.
 */
export const demoDrawingBinding: DrawingBinding = (host, events) => {
  const manager = new DrawingManager();
  const chart = realChartOf(host.chart);

  // NO CHART, NO LAYER — and it says so by being inert rather than by throwing. A binding that
  // threw here would take down a mount whose only fault is a renderer this adapter does not know.
  if (chart !== undefined) {
    manager.attach(chart, host.series as never, host.container);
  }

  const report = (): void => events.onCountChange(manager.getAllDrawings().length);
  const off = [
    manager.on('drawing:added', () => {
      report();
      // The tool disarms once its shape is finished, which is what the rail shows as "not armed".
      events.onToolFinished();
    }),
    manager.on('drawing:removed', report),
    manager.on('drawing:cleared', report),
  ];

  return {
    setActiveTool: (toolId) => manager.setActiveTool(toolId),
    deleteSelection: () => {
      const selected = manager.getSelectedDrawing();
      if (selected !== null) manager.removeDrawing(selected.id);
    },
    clearAll: () => manager.clearAll(),
    serialize: () => manager.exportDrawings(),
    detach: () => {
      for (const unsubscribe of off) unsubscribe();
      manager.detach();
    },
  };
};
