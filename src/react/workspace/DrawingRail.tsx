/**
 * The drawing rail, and the seam every other caller of the drawing layer goes through.
 * See docs/explanation/react-workspace.md#the-armed-tool-and-the-layer-sit-above-the-rail
 */
import { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';

import type { DrawingBinding, DrawingLayer } from '../../drawing/drawingLayer';
import { drawingMemoryFor } from '../../drawing/drawingMemory';
import type { MagnetMode } from '../../drawing/magnet';
import { useWorkspaceChrome } from '../chrome/ChromeContext';
import { DrawingToolbar } from '../DrawingToolbar';
import type { DrawingToolbarProps } from '../DrawingToolbar';

/**
 * Which tools exist, what they are called, and which key arms which. All of it the host's — and
 * taken FROM the toolbar's own declaration, so the two cannot drift apart on the next tool added.
 */
export interface DrawingVocabulary
  extends Pick<DrawingToolbarProps, 'tools' | 'allTools' | 'toolGroups' | 'labels'> {
  /** `event.code` -> tool id, for the root's keymap. The rail itself never reads it. */
  readonly shortcuts?: Readonly<Record<string, string>>;
}

/**
 * What every drawing control reads, whoever draws it. The MAGNET lives here for the same reason
 * `activeTool` does: it is a mode a keyboard shortcut may arm and a control must show, and a value
 * with two homes disagrees with itself the first time one of them is written to.
 * See docs/explanation/drawing.md#the-magnet-is-a-rule-not-a-placement
 */
export interface DrawingRailValue {
  readonly vocabulary: DrawingVocabulary;
  readonly activeTool: string | null;
  readonly arm: (toolId: string | null) => void;
  /** Off until a host says otherwise: the library never defaults to the behaviour complained of. */
  readonly magnet: MagnetMode;
  readonly setMagnet: (mode: MagnetMode) => void;
  /** The binding the canvas attaches. `undefined` = no layer, and every operation below is inert. */
  readonly bind: DrawingBinding | undefined;
  readonly count: number;
  readonly onCount: (count: number) => void;
  readonly deleteSelection: () => void;
  readonly clearAll: () => void;
}

const DrawingRailContext = createContext<DrawingRailValue | null>(null);

export interface DrawingRailProviderProps {
  readonly vocabulary: DrawingVocabulary;
  /** The host's implementation. Absent, the rail draws and every control is a no-op. */
  readonly binding?: DrawingBinding;
  /** Which market the drawings belong to: replaying anchors over another market draws noise. */
  readonly market: string;
  /** Told after the layer deleted, so a host can react to an edit it did not initiate. */
  readonly onDeleteSelection?: () => void;
  readonly children: ReactNode;
}

export const DrawingRailProvider = memo(function DrawingRailProvider({
  vocabulary,
  binding,
  market,
  onDeleteSelection,
  children,
}: DrawingRailProviderProps): ReactElement {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [magnet, setMagnet] = useState<MagnetMode>('off');
  const [count, setCount] = useState(0);
  const layer = useRef<DrawingLayer | null>(null);
  // Through refs. See docs/explanation/react-workspace.md#market-and-delete-teller-through-refs
  const marketRef = useRef(market);
  marketRef.current = market;
  const told = useRef(onDeleteSelection);
  told.current = onDeleteSelection;

  const bind = useMemo<DrawingBinding | undefined>(() => {
    if (binding === undefined) return undefined;
    return (host, events) => {
      const created = binding(host, events);
      layer.current = created;
      // The market at BIRTH. See docs/explanation/react-workspace.md#the-market-at-birth
      const memory = drawingMemoryFor(marketRef.current);
      // The LIVE layer first. See docs/explanation/react-workspace.md#the-live-layer-before-the-snapshot
      const inherited = memory.live?.serialize?.() ?? memory.snapshot;
      if (inherited !== null && inherited !== undefined) created.restore?.(inherited);
      memory.live = created;
      return {
        setActiveTool: (id) => created.setActiveTool(id),
        deleteSelection: () => created.deleteSelection(),
        clearAll: () => created.clearAll(),
        detach: () => {
          // The market NOW, not the one at birth: the surface outlives an instrument change, so the
          // snapshot has to land where the drawings currently belong.
          const home = drawingMemoryFor(marketRef.current);
          home.snapshot = created.serialize?.() ?? null;
          if (home.live === created) home.live = null;
          if (memory.live === created) memory.live = null;
          if (layer.current === created) layer.current = null;
          created.detach();
        },
      };
    };
  }, [binding]);

  /**
   * THE INSTRUMENT CHANGED UNDER A LIVE LAYER. The surface mounts once and never remounts on a
   * symbol change, so without this the drawings of the market the user left stay on screen — priced
   * for a range that no longer exists. Measured: one layer is created for both markets.
   * See docs/explanation/react-workspace.md#the-instrument-can-change-under-a-live-layer
   */
  const cameFrom = useRef(market);
  useEffect(() => {
    const leaving = cameFrom.current;
    if (leaving === market) return;
    cameFrom.current = market;
    const live = layer.current;
    if (live === null) return;
    const from = drawingMemoryFor(leaving);
    from.snapshot = live.serialize?.() ?? null;
    if (from.live === live) from.live = null;
    live.clearAll();
    const to = drawingMemoryFor(market);
    if (to.snapshot !== null && to.snapshot !== undefined) live.restore?.(to.snapshot);
    to.live = live;
  }, [market]);

  const value = useMemo<DrawingRailValue>(
    () => ({
      vocabulary,
      activeTool,
      arm: setActiveTool,
      magnet,
      setMagnet,
      bind,
      count,
      onCount: setCount,
      deleteSelection: () => {
        layer.current?.deleteSelection();
        told.current?.();
      },
      clearAll: () => layer.current?.clearAll(),
    }),
    [vocabulary, activeTool, magnet, bind, count],
  );

  return <DrawingRailContext.Provider value={value}>{children}</DrawingRailContext.Provider>;
});

/** The one door to the drawing layer. Outside the provider it throws rather than pretending. */
export function useDrawingRail(): DrawingRailValue {
  const value = useContext(DrawingRailContext);
  if (value === null) {
    // See docs/explanation/react-workspace.md#the-rail-throws-outside-its-provider
    throw new Error(
      'useDrawingRail was called outside DrawingRailProvider. Mount it above rail and canvas.',
    );
  }
  return value;
}

const COLUMN: CSSProperties = { flexShrink: 0, paddingRight: 4 };

export interface DrawingRailProps {
  /** The measured residual, so the rail is exactly as tall as the chart beside it. */
  readonly heightPx: number;
}

export const DrawingRail = memo(function DrawingRail({ heightPx }: DrawingRailProps): ReactElement {
  const { labels, testIdPrefix } = useWorkspaceChrome();
  const { vocabulary, activeTool, arm, count, deleteSelection, clearAll } = useDrawingRail();

  return (
    <div data-testid={`${testIdPrefix}-tools`} style={COLUMN}>
      <DrawingToolbar
        tools={vocabulary.tools}
        allTools={vocabulary.allTools}
        toolGroups={vocabulary.toolGroups}
        activeToolId={activeTool}
        onSelect={arm}
        onDeleteSelection={deleteSelection}
        onClearAll={clearAll}
        drawingCount={count}
        heightPx={heightPx}
        orientation="vertical"
        labels={vocabulary.labels ?? labels.drawingToolbar}
        testIdPrefix={`${testIdPrefix}-drawing`}
      />
    </div>
  );
});
