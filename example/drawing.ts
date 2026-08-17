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
import { DrawingManager, getToolRegistry } from 'lightweight-charts-drawing';

import { DrawingPreviewPrimitive, type PreviewAnchor } from './drawingPreview';
import { realChartOf } from './engine';

/**
 * THE VOCABULARY IS DERIVED FROM THE PACKAGE'S OWN REGISTRY, not written out here.
 *
 * `DrawingToolDefinition` already carries `name`, `category` and `requiredAnchors`, and the registry
 * offers `getAll`. A hand-written map of ids to families — which is what this file had — is a second
 * taxonomy that has to be reconciled on every release of the package, and the first tool added
 * upstream is born outside it. Only the RAIL is a choice: eight recognisable tools, because a rail
 * showing all sixty-seven is a menu wearing a toolbar's clothes.
 */
const registry = getToolRegistry();

const RAIL_IDS = [
  'trend-line',
  'horizontal-line',
  'vertical-line',
  'ray',
  'rectangle',
  'ellipse',
  'fib-retracement',
  'text-annotation',
] as const;

/**
 * A GLYPH PER CATEGORY, because the fallback was a literal empty box.
 *
 * `DrawingToolGroup.glyph` is required by the type and I gave every family the same `\u25A1` — an
 * outlined square, which renders as exactly what it is: a placeholder nobody replaced. The flyout
 * showed ten identical boxes. The vocabulary is closed at `DrawingCategory`
 * (`lightweight-charts-drawing/dist/index.d.ts:1086`), so this map can be exhaustive rather than
 * defensive, and a family added upstream is a compile error here rather than another empty box.
 */
const CATEGORY_GLYPH: Readonly<Record<string, string>> = {
  line: '\u2571',
  channel: '\u2261',
  fibonacci: '\u4E28',
  gann: '\u25E5',
  pitchfork: '\u03A8',
  shape: '\u25AD',
  annotation: 'T',
  trading: '\u21C5',
  forecasting: '\u2933',
  measurement: '\u2194',
};

const CATEGORY_LABEL: Readonly<Record<string, string>> = {
  line: 'Lines',
  channel: 'Channels',
  fibonacci: 'Fibonacci',
  gann: 'Gann',
  pitchfork: 'Pitchforks',
  shape: 'Shapes',
  annotation: 'Notes and text',
  trading: 'Positions',
  forecasting: 'Forecasts',
  measurement: 'Measurements',
};

const GLYPH: Readonly<Record<string, string>> = {
  'trend-line': '\u2571',
  'horizontal-line': '\u2500',
  'vertical-line': '\u2502',
  ray: '\u2192',
  rectangle: '\u25AD',
  ellipse: '\u25EF',
  'fib-retracement': '\u2261',
  'text-annotation': 'T',
};

const RAIL: readonly DrawingTool[] = RAIL_IDS.flatMap((id) => {
  const tool = registry.get(id);
  // No silent box here either: a rail id with no glyph is a mistake in RAIL_IDS, not a tool to draw
  // as a blank square, so it is dropped and the rail is shorter rather than wrong.
  const glyph = GLYPH[id];
  return tool === undefined || glyph === undefined ? [] : [{ id, label: tool.name, glyph }];
});

const ALL: readonly DrawingToolOption[] = registry
  .getAll()
  .map((tool) => ({ id: tool.type, name: tool.name, group: tool.category }));

const GROUPS: readonly DrawingToolGroup[] = registry
  .getCategories()
  .map((category) => ({
    id: category,
    label: CATEGORY_LABEL[category] ?? category,
    glyph: CATEGORY_GLYPH[category] ?? '\u2022',
  }));

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
  const chart = realChartOf(host.chart);
  // NO CHART, NO LAYER — inert rather than throwing. A binding that threw would take down a mount
  // whose only fault is a renderer this adapter does not know.
  if (chart === undefined) {
    return {
      setActiveTool: () => undefined,
      deleteSelection: () => undefined,
      clearAll: () => undefined,
      detach: () => undefined,
    };
  }

  const manager = new DrawingManager();
  manager.attach(chart, host.series as never, host.container);

  const report = (): void => events.onCountChange(manager.getAllDrawings().length);
  const off = [
    manager.on('drawing:added', report),
    manager.on('drawing:removed', report),
    manager.on('drawing:cleared', report),
  ];

  /**
   * THE CREATION THE PACKAGE DOES NOT HAVE — and it is not an oversight of this file.
   *
   * `DrawingManager.handleClick` returns early whenever a tool is armed, and `setActiveTool` records
   * a string nothing consumes. So arming a tool and clicking produced no drawing and no error: a
   * perfect silent failure. Collecting the anchors and building the drawing is the caller's job.
   *
   * It works for all sixty-seven tools at once because `requiredAnchors` is declarative on the
   * registry entry — one line, not a switch over tool types.
   */
  let activeTool: string | null = null;
  let pending: PreviewAnchor[] = [];
  let created = 0;

  // THE FEEDBACK BETWEEN CLICKS. Built and hung inside one try: a preview that fails has to degrade
  // to "no preview", never take the drawing layer down with it.
  let preview: DrawingPreviewPrimitive | null = null;
  try {
    preview = new DrawingPreviewPrimitive();
    host.series.attachPrimitive(preview);
  } catch {
    preview = null;
  }

  const onClick = (param: { point?: { x: number; y: number }; time?: unknown; paneIndex?: number }): void => {
    if (activeTool === null || param.point === undefined) return;
    // `point` is LOCAL TO THE PANE clicked, so y only prices on pane 0. Any other pane would read
    // the wrong scale, and there is no honest guard other than the index itself.
    if (param.paneIndex !== undefined && param.paneIndex !== 0) return;
    const time = param.time ?? host.chart.timeScale().coordinateToTime?.(param.point.x);
    const price = host.series.coordinateToPrice(param.point.y);
    if (time === null || time === undefined || price === null) return;

    pending.push({ time: time as PreviewAnchor['time'], price });
    if (pending.length < (registry.get(activeTool)?.requiredAnchors ?? 2)) return;

    created += 1;
    try {
      const drawing = registry.createDrawing(activeTool, `demo-${activeTool}-${created}`, pending as never);
      if (drawing !== null) manager.addDrawing(drawing);
    } catch {
      // A tool the package cannot build in this window is one drawing fewer, never a crash.
    }
    pending = [];
    preview?.setState(null);
    events.onToolFinished(); // back to the cursor, as every chart app does
  };
  host.chart.subscribeClick?.(onClick as never);

  /**
   * The cursor enters through the SAME pair the click uses — `point` and `paneIndex` — with the same
   * pane guard. Pricing y against another pane's scale would draw the trace somewhere it will not
   * land, which is worse than drawing nothing.
   */
  const onCrosshair = (param: { point?: { x: number; y: number }; time?: unknown; paneIndex?: number }): void => {
    if (activeTool === null || param.point === undefined || (param.paneIndex ?? 0) !== 0) {
      preview?.setState(null);
      return;
    }
    const time = param.time ?? host.chart.timeScale().coordinateToTime?.(param.point.x);
    const price = host.series.coordinateToPrice(param.point.y);
    if (time === null || time === undefined || price === null) {
      preview?.setState(null);
      return;
    }
    preview?.setState({ tool: activeTool, anchors: pending, cursor: { time: time as PreviewAnchor['time'], price } });
  };
  host.chart.subscribeCrosshairMove(onCrosshair as never);

  return {
    setActiveTool: (toolId) => {
      // The anchors belong to the ARMED tool. Switching without clearing would finish the next
      // drawing with a point the visitor placed for a different one.
      activeTool = toolId;
      pending = [];
      preview?.setState(null);
      manager.setActiveTool(toolId);
    },
    deleteSelection: () => {
      const selected = manager.getSelectedDrawing();
      if (selected !== null) manager.removeDrawing(selected.id);
    },
    clearAll: () => manager.clearAll(),
    serialize: () => manager.exportDrawings(),
    detach: () => {
      host.chart.unsubscribeClick?.(onClick as never);
      host.chart.unsubscribeCrosshairMove(onCrosshair as never);
      if (preview !== null) host.series.detachPrimitive(preview);
      for (const unsubscribe of off) unsubscribe();
      manager.detach();
    },
  };
};
