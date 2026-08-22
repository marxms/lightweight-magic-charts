/**
 * The floating studies menu: the trigger, the panel of what is already chosen, and the catalogue.
 *
 * IT FLOATS RATHER THAN PUSHES. In flow, opening the menu would shrink the chart and the screen
 * would jump on every consultation.
 *
 * THE PANEL SITS ABOVE THE CATALOGUE and stays visible the whole time the menu is open. One tab
 * away it would be one click from exactly the person who just added something and wants to check
 * it — and removing would go back to hunting for a marked entry among hundreds.
 */
import { memo, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactElement } from 'react';

import type { ResolvedSourceView } from '../../indicator/resolution';
import { useWorkspaceChrome } from '../chrome/ChromeContext';
import type { StudiesPanelLabels } from '../chrome/labels';
import { useHoverDismiss } from '../hoverIntent';
import { CENTER_ROW } from '../theme';
import { SeriesMenu } from '../SeriesMenu';
import type { SeriesCatalogueEntry } from '../SeriesMenu';

export interface ActiveIndicators {
  /** Resolved by the HOST: this region shows, removes and reorders — it computes nothing. */
  readonly views: readonly ResolvedSourceView[];
  readonly capacity: number;
  readonly onRemove: (id: string) => void;
  readonly onMove: (id: string, direction: -1 | 1) => void;
}

export interface SeriesMenuRegionProps {
  readonly catalogue: readonly SeriesCatalogueEntry[];
  readonly indicators: ActiveIndicators;
  /** Reported, never interpreted: what a pick means to the list is the host's decision. */
  readonly onSelect: (entry: SeriesCatalogueEntry) => void;
}

const OVERLAY: CSSProperties = { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 };
const ROW: CSSProperties = { ...CENTER_ROW, flexWrap: 'wrap', gap: 4 };

/**
 * What the panel says about a source drawn incompletely, or not at all.
 *
 * The three states look like a broken app — blank lane, stub at the edge, missing lines — and none
 * of them is one. The sentence is what separates "it broke" from "this window does not hold this
 * study", and the data that does exist stays drawn either way.
 */
function noteOf(view: ResolvedSourceView, labels: StudiesPanelLabels): string {
  if (view.availability === 'empty') return labels.noData;
  if (view.availability === 'warmup') return labels.warmUp(view.warmUpBars, view.windowBars);
  return '';
}

export const SeriesMenuRegion = memo(function SeriesMenuRegion({
  catalogue,
  indicators,
  onSelect,
}: SeriesMenuRegionProps): ReactElement {
  const { theme, components, labels, sections, testIdPrefix } = useWorkspaceChrome();
  const text = labels.studies;
  const { Pill, IconButton } = components;
  const [open, setOpen] = useState(false);
  const overlay = useRef<HTMLDivElement | null>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const { views, capacity, onRemove, onMove } = indicators;
  const close = (): void => setOpen(false);

  // Leaving with the pointer closes the overlay — but NOT over a drag that began inside it, and not
  // while the keyboard is in there. Both refusals live in the hook, and they are why hover is an
  // addition to the trigger instead of the only way in or out.
  useHoverDismiss(overlay, { enabled: open, onDismiss: close });

  // Escape is bound to the DOCUMENT rather than to the overlay.
  // See docs/explanation/react-workspace.md#escape-cannot-be-bound-to-the-overlay
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      returnFocusTo.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <Pill
        theme={theme}
        state={{ kind: 'toggle', pressed: open }}
        onSelect={() =>
          setOpen((shown) => {
            // Captured on the way IN, because the trigger is a slot the host may replace and the
            // contract carries no ref. What opened it is what Escape hands focus back to.
            if (!shown) returnFocusTo.current = document.activeElement as HTMLElement | null;
            return !shown;
          })
        }
      >
        {text.trigger}
      </Pill>
      {open ? (
        <div ref={overlay} data-testid={`${testIdPrefix}-series-menu`} style={OVERLAY}>
          {/* A REAL `fieldset`: the element the platform has for a named set of controls. */}
          <fieldset
            aria-label={text.panel(views.length, capacity)}
            style={{
              ...ROW,
              margin: 0,
              padding: '4px 8px',
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderBottom: 'none',
              color: theme.text,
              fontFamily: theme.fontFamily,
              fontSize: 11,
            }}
          >
            {views.length === 0 ? <span style={{ opacity: 0.55 }}>{text.none}</span> : null}
            {views.map((view, position) => {
              const name = view.label ?? view.id;
              const note = noteOf(view, text);
              return (
                <span
                  key={view.id}
                  data-testid={`${testIdPrefix}-active-${view.id}`}
                  style={{ ...ROW, border: `1px solid ${theme.border}`, borderRadius: 4, gap: 2 }}
                >
                  <span style={{ padding: '0 4px' }}>{name}</span>
                  {note === '' ? null : <span style={{ opacity: 0.7 }}>{note}</span>}
                  <IconButton
                    theme={theme}
                    label={text.up(name)}
                    disabled={position === 0}
                    onSelect={() => onMove(view.id, -1)}
                  >
                    ▲
                  </IconButton>
                  <IconButton
                    theme={theme}
                    label={text.down(name)}
                    disabled={position === views.length - 1}
                    onSelect={() => onMove(view.id, 1)}
                  >
                    ▼
                  </IconButton>
                  <IconButton
                    theme={theme}
                    label={text.remove(name)}
                    onSelect={() => onRemove(view.id)}
                  >
                    ✕
                  </IconButton>
                </span>
              );
            })}
          </fieldset>
          <SeriesMenu
            catalogue={catalogue}
            selected={views.map((view) => view.id)}
            capacity={capacity}
            onSelect={onSelect}
            onClose={close}
            labels={labels.seriesMenu}
            sections={sections}
            theme={theme}
            testIdPrefix={`${testIdPrefix}-catalogue`}
          />
        </div>
      ) : null}
    </>
  );
});
