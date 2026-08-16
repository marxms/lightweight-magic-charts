/**
 * The drawing rail: one armed tool at a time, in a column of icons, plus a flyout per family.
 * See docs/explanation/react.md#radio-not-aria-pressed and docs/explanation/react.md#a-flyout-not-another-select
 */
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  useCallback,
  useRef,
  useState,
} from 'react';

import { useChromeTheme } from './chrome/ChromeContext';
import { DEFAULT_WORKSPACE_CHROME_LABELS } from './chrome/labels';
import { FlyoutMenu } from './chrome/FlyoutMenu';
import { IconButton } from './chrome/IconButton';
import { nextRovingIndex } from './chrome/rovingFocus';
import { bucketDrawingTools } from './drawingToolBuckets';
import type { DrawingToolGroup, DrawingToolOption } from './drawingToolBuckets';
import { useHoverIntent } from './hoverIntent';

export type {
  DrawingToolBucket,
  DrawingToolGroup,
  DrawingToolOption,
} from './drawingToolBuckets';

export interface DrawingTool {
  readonly id: string;
  readonly label: string;
  /** One character or glyph. The visible content; never the accessible name. */
  readonly glyph: string;
  /** Rendered into the accessible name, e.g. `Alt+T`. The host owns the binding itself. */
  readonly shortcut?: string;
}

export interface DrawingToolbarLabels {
  readonly group: string;
  readonly cursor: string;
  readonly deleteSelection: string;
  readonly clearAll: string;
  /** Names the single flyout a host gets when it declares no families at all. */
  readonly allTools: string;
  /** Names the family of last resort: entries the host did not group, or grouped under no `toolGroups` id. */
  readonly otherTools: string;
  /** Takes the count so a host can pluralise in its own language. */
  readonly count: (drawings: number) => string;
}

/** The same object the whole contract carries — a second copy would drift on the first edit. */
export const DEFAULT_DRAWING_TOOLBAR_LABELS: DrawingToolbarLabels =
  DEFAULT_WORKSPACE_CHROME_LABELS.drawingToolbar;

export interface DrawingToolbarProps {
  readonly tools: readonly DrawingTool[];
  /** Everything beyond the curated rail. Omitted = no flyout; an empty list draws none either. */
  readonly allTools?: readonly DrawingToolOption[];
  /** The families of `allTools`, in the order the host wants them. Omitted = a single family. */
  readonly toolGroups?: readonly DrawingToolGroup[];
  /** `null` = nothing armed, which is a state and not an absence. */
  readonly activeToolId: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly onDeleteSelection?: () => void;
  readonly onClearAll?: () => void;
  readonly drawingCount?: number;
  /**
   * The height of the box the rail lives in — MEASURED by the host, never guessed here.
   * See docs/explanation/react.md#height-scrolling-and-the-flyout-anchor
   */
  readonly heightPx?: number;
  readonly orientation?: 'vertical' | 'horizontal';
  readonly labels?: DrawingToolbarLabels;
  readonly testIdPrefix?: string;
}

const CURSOR_ID = '__cursor__';
const GLYPH_WIDTH_PX = 28;
const RAIL_PADDING_PX = 4;
/** The rail's width: one icon button plus the padding, and nothing else. */
const RAIL_WIDTH_PX = GLYPH_WIDTH_PX + RAIL_PADDING_PX * 2 + 2;
/** A host `id` may be an invalid DOM `id`. See docs/explanation/react.md#sanitising-host-ids-for-the-dom */
const domSafe = (value: string): string => value.replace(/[^\w-]/g, '-');

export function DrawingToolbar({
  tools,
  allTools,
  toolGroups,
  activeToolId,
  onSelect,
  onDeleteSelection,
  onClearAll,
  drawingCount,
  heightPx,
  orientation = 'vertical',
  labels = DEFAULT_DRAWING_TOOLBAR_LABELS,
  testIdPrefix = 'drawing',
}: DrawingToolbarProps): ReactElement {
  const theme = useChromeTheme();
  const vertical = orientation === 'vertical';
  const entries: readonly DrawingTool[] = [
    { id: CURSOR_ID, label: labels.cursor, glyph: '✛' },
    ...tools,
  ];
  const buckets =
    allTools === undefined || allTools.length === 0
      ? []
      : bucketDrawingTools(allTools, toolGroups ?? [], labels);

  /**
   * The opening carries HOW it happened, and not only what.
   * See docs/explanation/react.md#the-open-state-carries-how-it-happened
   */
  const [open, setOpen] = useState<{ readonly id: string; readonly byPointer: boolean } | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  /** The OPEN family's trigger, registered by the button itself: no map to keep up to date. */
  const openTriggerRef = useRef<HTMLButtonElement | null>(null);
  const openBucket = buckets.find((bucket) => bucket.id === open?.id) ?? null;
  const hover = useHoverIntent();

  const close = useCallback(() => {
    hover.cancel();
    setOpen(null);
  }, [hover]);

  /** Closing by POINTER: refused while the keyboard is inside. */
  const closeByPointer = useCallback(() => {
    hover.close(() => {
      if (rootRef.current?.contains(document.activeElement) === true) return;
      setOpen(null);
    });
  }, [hover]);

  const armedId = (tool: DrawingTool): boolean =>
    tool.id === CURSOR_ID ? activeToolId === null : activeToolId === tool.id;
  /**
   * The group's ONLY TAB STOP, and why it is not always the checked item.
   * See docs/explanation/react.md#the-single-tab-stop-of-the-rail
   */
  const armedIndex = entries.findIndex(armedId);
  const stopIndex = armedIndex === -1 ? 0 : armedIndex;

  const onRailKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const nodes = Array.from(railRef.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []);
    const next = nextRovingIndex(
      event.key,
      nodes.indexOf(document.activeElement as HTMLElement),
      nodes.length,
      vertical ? 'vertical' : 'horizontal',
    );
    if (next === null) return;
    // Only after knowing the key is ours: else the arrow scrolls the rail out from under focus.
    event.preventDefault();
    nodes[next]?.focus();
    // AUTOMATIC ACTIVATION, as in a native radio group: focus and checking travel together.
    const tool = entries[next];
    if (tool !== undefined) onSelect(tool.id === CURSOR_ID ? null : tool.id);
  };

  const nameOf = (tool: DrawingTool): string =>
    tool.shortcut === undefined ? tool.label : `${tool.label} (${tool.shortcut})`;

  const action = (label: string, glyph: string, id: string, onClick?: () => void): ReactElement => (
    // Disabled rather than hidden: a rail that changes size moves the control under the pointer.
    <IconButton
      label={label}
      theme={theme}
      disabled={onClick === undefined}
      onSelect={onClick}
      testId={`${testIdPrefix}-${id}`}
    >
      {glyph}
    </IconButton>
  );

  return (
    <div
      ref={rootRef}
      data-testid={`${testIdPrefix}-toolbar`}
      style={{
        // `relative` anchors the flyout. See docs/explanation/react.md#height-scrolling-and-the-flyout-anchor
        position: 'relative',
        boxSizing: 'border-box',
        ...(vertical ? { width: RAIL_WIDTH_PX, height: heightPx } : {}),
        padding: RAIL_PADDING_PX,
        background: theme.surface,
        color: theme.text,
        fontFamily: theme.fontFamily,
        [vertical ? 'borderRight' : 'borderBottom']: `1px solid ${theme.border}`,
        flexShrink: 0,
      }}
    >
      <div
        data-testid={`${testIdPrefix}-rail-scroll`}
        style={{
          display: 'flex',
          flexDirection: vertical ? 'column' : 'row',
          alignItems: 'center',
          height: heightPx === undefined ? undefined : '100%',
          // Scrolling only where there is a height to respect, and only on the VERTICAL axis.
          overflowY: heightPx === undefined || !vertical ? undefined : 'auto',
          overflowX: vertical ? 'hidden' : undefined,
        }}
      >
        {/* Arrow traversal is the obligation `role="radiogroup"` carries; it sits on the GROUP. */}
        <div
          ref={railRef}
          role="radiogroup"
          aria-label={labels.group}
          aria-orientation={vertical ? 'vertical' : 'horizontal'}
          onKeyDown={onRailKeyDown}
          style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', flexShrink: 0 }}
        >
          {entries.map((tool, index) => (
            <IconButton
              key={tool.id}
              label={nameOf(tool)}
              theme={theme}
              state={{ kind: 'radio', checked: armedId(tool) }}
              tabIndex={index === stopIndex ? 0 : -1}
              testId={`${testIdPrefix}-tool-${tool.id === CURSOR_ID ? 'cursor' : tool.id}`}
              onSelect={() => onSelect(tool.id === CURSOR_ID ? null : tool.id)}
            >
              {tool.glyph}
            </IconButton>
          ))}
        </div>

        {buckets.length === 0 ? null : (
          <>
            <div
              style={{ width: 24, height: 1, background: theme.border, margin: '6px 0', flexShrink: 0 }}
            />
            {buckets.map((bucket) => {
              const expanded = bucket.id === open?.id;
              return (
                <IconButton
                  key={bucket.id}
                  label={bucket.label}
                  theme={theme}
                  state={{ kind: 'menu', expanded }}
                  controls={`${testIdPrefix}-flyout-${domSafe(bucket.id)}`}
                  testId={`${testIdPrefix}-group-${domSafe(bucket.id)}`}
                  onSelect={() => {
                    // A click is an intent ALREADY declared: no clock, no pending hover reopening it.
                    hover.cancel();
                    setOpen(expanded ? null : { id: bucket.id, byPointer: false });
                  }}
                  hover={{
                    // THE POINTER OPENS — delayed, else crossing the rail opens all on the way.
                    onEnter: () => {
                      if (expanded) hover.cancel();
                      else hover.open(() => setOpen({ id: bucket.id, byPointer: true }));
                    },
                    onLeave: closeByPointer,
                  }}
                  // Registered by the OPEN family's button: the only one the panel needs.
                  ref={(node) => {
                    if (node !== null && expanded) openTriggerRef.current = node;
                  }}
                >
                  {bucket.glyph}
                </IconButton>
              );
            })}
          </>
        )}

        <div style={{ [vertical ? 'height' : 'width']: 8, flexShrink: 0 }} />
        {action(labels.deleteSelection, '⌫', 'delete', onDeleteSelection)}
        {action(labels.clearAll, '🗑', 'clear', onClearAll)}
        {drawingCount === undefined ? null : (
          <div
            data-testid={`${testIdPrefix}-count`}
            style={{ fontSize: 10, opacity: 0.6, paddingTop: 4 }}
          >
            {labels.count(drawingCount)}
          </div>
        )}
      </div>

      {openBucket === null ? null : (
        <FlyoutMenu
          // Remounts per family, so focus and position effects are born with the panel.
          key={openBucket.id}
          id={`${testIdPrefix}-flyout-${domSafe(openBucket.id)}`}
          label={openBucket.label}
          items={openBucket.options.map((option) => ({
            id: option.id,
            label: option.name,
            hint: option.shortcut,
            selected: option.id === activeToolId,
          }))}
          onSelect={onSelect}
          onClose={close}
          rootRef={rootRef}
          triggerRef={openTriggerRef}
          theme={theme}
          openedByPointer={open?.byPointer}
          hover={{ onEnter: hover.cancel, onLeave: closeByPointer }}
          availableHeightPx={heightPx}
          testIdPrefix={testIdPrefix}
        />
      )}
    </div>
  );
}

export default DrawingToolbar;
