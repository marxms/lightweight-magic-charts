/**
 * The series menu: categories down the side, a search that spans all of them, and a SELECTION the
 * host owns. See docs/explanation/react.md#the-menu-knows-only-chosen-never-where
 */
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from 'react';

import type { SeriesProvider } from '../extension/plugins';
import type { WorkspaceSection } from './chrome/ChromeContext';
import { DEFAULT_WORKSPACE_CHROME_LABELS } from './chrome/labels';
import { nextRovingIndex } from './chrome/rovingFocus';
import { useHoverIntent } from './hoverIntent';
import { DEFAULT_WORKSPACE_THEME, type WorkspaceTheme } from './theme';

export interface SeriesCatalogueEntry {
  /** The instance the host built. Handed straight back on assignment, so no lookup table is needed. */
  readonly provider: SeriesProvider;
  readonly label: string;
  readonly category: string;
  /** Shown on hover. The host's own words about what this computes. */
  readonly hint?: string;
}

export interface SeriesMenuLabels {
  readonly title: string;
  readonly search: string;
  readonly searchResults: string;
  readonly categories: string;
  /** `capacity` is `null` when the host declared no ceiling: say the count and nothing more. */
  readonly chosenCount: (chosen: number, capacity: number | null) => string;
  readonly atCapacity: string;
  readonly empty: string;
  /** Name of the close button. OPTIONAL for compatibility. See docs/explanation/react.md#the-optional-close-label */
  readonly close?: string;
}

/** The same object the whole contract carries — a second copy would drift on the first edit. */
export const DEFAULT_SERIES_MENU_LABELS: SeriesMenuLabels = DEFAULT_WORKSPACE_CHROME_LABELS.seriesMenu;

export interface SeriesMenuProps {
  readonly catalogue: readonly SeriesCatalogueEntry[];
  /** Entry ids the host currently holds. Drives the pressed state, and nothing else. */
  readonly selected?: readonly string[];
  /** Reported, never interpreted: adding, removing or replacing is the host's decision. */
  readonly onSelect: (entry: SeriesCatalogueEntry) => void;
  /** A ceiling the HOST enforces, stated here so the user does not discover it by being refused. */
  readonly capacity?: number;
  readonly labels?: SeriesMenuLabels;
  readonly theme?: WorkspaceTheme;
  readonly testIdPrefix?: string;
  /** Bounds the rendered list. A catalogue of thousands is a scroll container nobody reads. */
  readonly maxResults?: number;
  /**
   * The host's OWN sections, ahead of the catalogue categories on the same rail: the host brings
   * the label, the count and the body, and the lib lends only the rail and the tab semantics.
   */
  readonly sections?: readonly WorkspaceSection[];
  /** When present, the header gains the prototype's close button. */
  readonly onClose?: () => void;
}

/** Ids are the host's strings and may hold spaces or accents; a DOM id may not. */
const domId = (prefix: string, value: string): string =>
  `${prefix}-${value.replace(/[^a-zA-Z0-9]+/g, '-')}`;

function chipStyle(theme: WorkspaceTheme, active: boolean): CSSProperties {
  return {
    padding: '4px 10px',
    margin: '0 5px 5px 0',
    cursor: 'pointer',
    borderRadius: 4,
    border: `1px solid ${active ? theme.accent : theme.border}`,
    fontSize: 11.5,
    background: active ? theme.accentFill : 'transparent',
    color: active ? theme.accentText : theme.text,
    textAlign: 'left',
  };
}

export function SeriesMenu({
  catalogue,
  selected: chosenIds = [],
  onSelect,
  capacity,
  labels = DEFAULT_SERIES_MENU_LABELS,
  theme = DEFAULT_WORKSPACE_THEME,
  testIdPrefix = 'series-menu',
  maxResults = 160,
  sections = [],
  onClose,
}: SeriesMenuProps): ReactElement {
  const categories = useMemo(
    () => [...new Set(catalogue.map((entry) => entry.category))].sort(),
    [catalogue],
  );
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const searching = query.trim().length > 0;
  const selected = category ?? sections[0]?.id ?? categories[0] ?? null;
  const activeSection = searching ? undefined : sections.find((entry) => entry.id === selected);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalogue
      .filter((entry) => (searching ? entry.label.toLowerCase().includes(needle) : entry.category === selected))
      .slice(0, maxResults);
  }, [catalogue, maxResults, query, searching, selected]);

  const chosen = new Set(chosenIds);
  const ceiling = capacity ?? null;
  const atCapacity = ceiling !== null && chosen.size >= ceiling;
  const panelId = `${testIdPrefix}-results`;

  const hover = useHoverIntent();
  const railRef = useRef<HTMLDivElement | null>(null);

  /** THE CLICK: declared intent. Pins the section at once and drops the search, the other mode. */
  const pickSection = (id: string): void => {
    hover.cancel();
    setCategory(id);
    setQuery('');
  };

  /**
   * THE POINTER: the same switch, delayed — and IGNORED while a search is typed in.
   * See docs/explanation/react.md#hover-switches-sections-except-while-searching
   */
  const hoverSection = (id: string): void => {
    if (searching) return;
    hover.open(() => setCategory(id));
  };

  /**
   * The rail's arrow keys, with AUTOMATIC activation and DOM-read order.
   * See docs/explanation/react.md#arrows-and-one-tab-stop-on-the-tablist-rail
   */
  const tabIds: readonly string[] = [...sections.map((entry) => entry.id), ...categories];
  const onRailKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const items = Array.from(railRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);
    const next = nextRovingIndex(
      event.key,
      items.indexOf(document.activeElement as HTMLElement),
      items.length,
      'vertical',
    );
    if (next === null) return;
    event.preventDefault(); // otherwise the arrow scrolls the rail out from under the focus
    items[next]?.focus();
    const id = tabIds[next];
    if (id !== undefined) pickSection(id);
  };

  /**
   * A rail has ONE tab stop, not one per tab; with a search typed in, it is the first one.
   * See docs/explanation/react.md#arrows-and-one-tab-stop-on-the-tablist-rail
   */
  const selectedTabIndex = searching ? -1 : tabIds.indexOf(selected ?? '');
  const tabStopIndex = selectedTabIndex === -1 ? 0 : selectedTabIndex;

  return (
    <div
      data-testid={testIdPrefix}
      style={{
        display: 'flex',
        flexDirection: 'column',
        background: theme.surface,
        color: theme.text,
        fontFamily: theme.fontFamily,
        border: `1px solid ${theme.border}`,
        maxHeight: 420,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8 }}>
        <strong style={{ fontSize: 11.5 }}>{labels.title}</strong>
        <input
          type="search"
          aria-label={labels.search}
          placeholder={labels.search}
          data-testid={`${testIdPrefix}-search`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          style={{
            background: theme.control,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            borderRadius: 4,
            padding: '5px 9px',
            fontSize: 11.5,
            width: 280,
          }}
        />
        <span style={{ fontSize: 10.5, opacity: 0.7 }} data-testid={`${testIdPrefix}-count`}>
          {labels.chosenCount(chosen.size, ceiling)}
          {atCapacity ? ` · ${labels.atCapacity}` : ''}
        </span>
        {onClose === undefined ? null : (
          <button
            type="button"
            data-testid={`${testIdPrefix}-close`}
            aria-label={labels.close ?? DEFAULT_SERIES_MENU_LABELS.close}
            onClick={onClose}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: `1px solid ${theme.border}`,
              borderRadius: 4,
              color: theme.text,
              cursor: 'pointer',
              fontSize: 11,
              padding: '3px 8px',
            }}
          >
            {labels.close ?? DEFAULT_SERIES_MENU_LABELS.close}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', minHeight: 0 }}>
        {/* Arrow traversal is the obligation `role="tablist"` carries; it sits on the RAIL. */}
        <div
          ref={railRef}
          role="tablist"
          aria-orientation="vertical"
          aria-label={labels.categories}
          onKeyDown={onRailKeyDown}
          style={{
            width: 190,
            borderRight: `1px solid ${theme.border}`,
            overflowY: 'auto',
            padding: '6px 0',
            flexShrink: 0,
          }}
        >
          {sections.map((entry, index) => {
            const active = !searching && entry.id === selected;
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                id={domId(`${testIdPrefix}-tab`, entry.id)}
                aria-selected={active}
                aria-controls={panelId}
                tabIndex={index === tabStopIndex ? 0 : -1}
                data-testid={domId(`${testIdPrefix}-section`, entry.id)}
                onClick={() => pickSection(entry.id)}
                onMouseEnter={() => hoverSection(entry.id)}
                onMouseLeave={hover.cancel}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                  textAlign: 'left',
                  padding: '5px 10px',
                  cursor: 'pointer',
                  border: 'none',
                  borderLeft: `2px solid ${active ? theme.accent : 'transparent'}`,
                  background: active ? theme.accentFill : 'transparent',
                  color: active ? theme.accentText : theme.text,
                  fontSize: 11.5,
                }}
              >
                <span>{entry.label}</span>
                {entry.count > 0 ? (
                  <span style={{ fontSize: 10, opacity: 0.7 }}>{entry.count}</span>
                ) : null}
              </button>
            );
          })}
          {categories.map((name, index) => {
            // While a query is present NO tab is selected. See docs/explanation/react.md#the-search-overrides-the-rail
            const active = !searching && name === selected;
            return (
              <button
                key={name}
                type="button"
                role="tab"
                id={domId(`${testIdPrefix}-tab`, name)}
                aria-selected={active}
                aria-controls={panelId}
                tabIndex={sections.length + index === tabStopIndex ? 0 : -1}
                data-testid={domId(`${testIdPrefix}-category`, name)}
                onClick={() => pickSection(name)}
                onMouseEnter={() => hoverSection(name)}
                onMouseLeave={hover.cancel}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '5px 10px',
                  cursor: 'pointer',
                  border: 'none',
                  borderLeft: `2px solid ${active ? theme.accent : 'transparent'}`,
                  background: active ? theme.accentFill : 'transparent',
                  color: active ? theme.accentText : theme.text,
                  fontSize: 11.5,
                }}
              >
                {name}
              </button>
            );
          })}
        </div>

        <div
          id={panelId}
          role="tabpanel"
          data-testid={panelId}
          {...(searching
            ? { 'aria-label': labels.searchResults }
            : selected === null
              ? {}
              : { 'aria-labelledby': domId(`${testIdPrefix}-tab`, selected) })}
          style={{ padding: 8, overflowY: 'auto', flex: 1, minHeight: 0 }}
        >
          {activeSection !== undefined ? (
            <activeSection.Body />
          ) : results.length === 0 ? (
            <span style={{ fontSize: 11, opacity: 0.6 }}>{labels.empty}</span>
          ) : (
            results.map((entry) => {
              const id = String(entry.provider.id);
              const active = chosen.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  // `aria-pressed`, never `radio`: choosing one entry does not unchoose another.
                  aria-pressed={active}
                  title={entry.hint ?? entry.category}
                  data-testid={domId(`${testIdPrefix}-entry`, id)}
                  onClick={() => onSelect(entry)}
                  style={chipStyle(theme, active)}
                >
                  {entry.label}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default SeriesMenu;
