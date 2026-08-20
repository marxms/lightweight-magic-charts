/**
 * @jest-environment jsdom
 *
 * The two pieces of chrome, held to the things that look fine and are not.
 *
 * A rail of ten toggle buttons renders identically to a radio group and describes itself wrongly. A
 * search scoped to the selected category renders identically to one that spans them and answers "not
 * found" for an entry that is right there. Neither is visible in a screenshot.
 */
import { fireEvent, render, screen } from '@testing-library/react';

import { seriesId } from '../src/domain/types';
import type { SeriesProvider } from '../src/extension/plugins';
import {
  DEFAULT_DRAWING_TOOLBAR_LABELS,
  DrawingToolbar,
  type DrawingTool,
} from '../src/react/DrawingToolbar';
import { SeriesMenu, type SeriesCatalogueEntry } from '../src/react/SeriesMenu';
import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import {
  DEFAULT_WORKSPACE_CHROME_LABELS,
  resolveWorkspaceLabels,
} from '../src/react/chrome/labels';
import { DEFAULT_WORKSPACE_THEME, type WorkspaceTheme } from '../src/react/theme';

const TOOLS: readonly DrawingTool[] = [
  { id: 'trend-line', label: 'Trend line', glyph: '╱', shortcut: 'Alt+T' },
  { id: 'rectangle', label: 'Rectangle', glyph: '▭' },
];

const provider = (id: string): SeriesProvider => ({ id: seriesId(id), compute: () => [] });

const CATALOGUE: readonly SeriesCatalogueEntry[] = [
  { provider: provider('alpha'), label: 'Alpha average', category: 'Averages' },
  { provider: provider('beta'), label: 'Beta average', category: 'Averages' },
  { provider: provider('gamma'), label: 'Gamma band', category: 'Bands & channels' },
];

describe('DrawingToolbar', () => {
  it('states MUTUAL EXCLUSION, so exactly one member is checked at all times', () => {
    const chosen: Array<string | null> = [];
    render(
      <DrawingToolbar tools={TOOLS} activeToolId="trend-line" onSelect={(id) => chosen.push(id)} />,
    );

    const radios = screen.getAllByRole('radio');
    // Three: the two tools and the "no tool" member the rail owns.
    expect(radios).toHaveLength(3);
    expect(radios.filter((radio) => radio.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    expect(screen.getByTestId('drawing-tool-trend-line')).toHaveAttribute('aria-checked', 'true');

    // CONTROL POSITIVE: with NOTHING armed the group is still fully described — the cursor member is
    // checked. A rail without it would report every member unchecked, which is a broken radio group
    // for a state the user reaches constantly (the state the chart pans in).
    render(<DrawingToolbar tools={TOOLS} activeToolId={null} onSelect={() => undefined} />);
    expect(screen.getAllByTestId('drawing-tool-cursor')[1]).toHaveAttribute('aria-checked', 'true');
  });

  it('puts the label and its shortcut in the ACCESSIBLE NAME, since the glyph is not a name', () => {
    render(<DrawingToolbar tools={TOOLS} activeToolId={null} onSelect={() => undefined} />);

    expect(screen.getByRole('radio', { name: 'Trend line (Alt+T)' })).toBeInTheDocument();
    // CONTROL POSITIVE: a tool with no shortcut is named by its label alone, not by an empty
    // parenthesis — the name is built from what exists rather than from a fixed template.
    expect(screen.getByRole('radio', { name: 'Rectangle' })).toBeInTheDocument();
  });

  it('reports null for the cursor and the tool id for a tool', () => {
    const chosen: Array<string | null> = [];
    render(<DrawingToolbar tools={TOOLS} activeToolId="rectangle" onSelect={(id) => chosen.push(id)} />);

    fireEvent.click(screen.getByTestId('drawing-tool-cursor'));
    fireEvent.click(screen.getByTestId('drawing-tool-rectangle'));
    expect(chosen).toEqual([null, 'rectangle']);
  });

  // REPOINTED, NOT WEAKENED. The four cases below interrogated the "all tools" `<select>` — the
  // control the flyout replaced, because it charged 124px of rail width to display a name nobody
  // read up close. The QUESTION of each one survives whole (reach of the catalogue, family order
  // coming from the host, the family-less tool that must not vanish, no dead control when there is
  // no catalogue); only the instrument changed. The fifth — "gives the select reading width" — was
  // WITHDRAWN for loss of object: it pinned the cut-off name to a control that inherited the rail's
  // width, and in the flyout the name is read outside the rail, where there is no rail width to cut
  // it. Width is now measured on the rail instead, in `drawingRail.spec.tsx`. The NEW suite covers
  // keyboard, focus and closing, which the `<select>` got from the platform and the flyout has to
  // prove.
  it('exhausts the registry through the "all tools" flyout, beside the curated rail', () => {
    const chosen: Array<string | null> = [];
    render(
      <DrawingToolbar
        tools={TOOLS}
        allTools={[
          { id: 'gann-fan', name: 'Gann fan' },
          { id: 'vertical-line', name: 'Vertical line' },
        ]}
        activeToolId={null}
        onSelect={(id) => chosen.push(id)}
      />,
    );

    const trigger = screen.getByTestId('drawing-group-__other__');
    expect(trigger).toHaveAccessibleName('All tools');
    // A tool the rail does not curate is still reachable — that is the flyout's whole job.
    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId('drawing-option-vertical-line'));
    expect(chosen).toEqual(['vertical-line']);
  });

  it('groups the catalogue by family, in the order the host hands the groups over', () => {
    render(
      <DrawingToolbar
        tools={TOOLS}
        allTools={[
          { id: 'gann-fan', name: 'Gann fan', group: 'gann' },
          { id: 'fib-retracement', name: 'Fib retracement', group: 'fib' },
          { id: 'fib-fan', name: 'Fib fan', group: 'fib' },
        ]}
        toolGroups={[
          { id: 'gann', label: 'Gann', glyph: '✦' },
          { id: 'fib', label: 'Fibonacci', glyph: '≣' },
        ]}
        activeToolId={null}
        onSelect={() => undefined}
      />,
    );

    // THE ORDER IS THE HOST'S, not the alphabet's: whoever knows the domain decides which family
    // comes first.
    expect(
      screen.getAllByTestId(/^drawing-group-/).map((trigger) => trigger.getAttribute('aria-label')),
    ).toEqual(['Gann', 'Fibonacci']);
    // Entries of the same family stay TOGETHER even when they arrive apart in the list.
    fireEvent.click(screen.getByTestId('drawing-group-fib'));
    expect(
      Array.from(screen.getByTestId('drawing-flyout').querySelectorAll('[role="menuitem"]')).map(
        (item) => item.getAttribute('data-testid'),
      ),
    ).toEqual(['drawing-option-fib-retracement', 'drawing-option-fib-fan']);
  });

  it('does NOT lose the tool the host did not group — grouping must not cost reach', () => {
    const chosen: Array<string | null> = [];
    render(
      <DrawingToolbar
        tools={TOOLS}
        allTools={[
          { id: 'fib-fan', name: 'Fib fan', group: 'fib' },
          { id: 'mystery-tool', name: 'Mystery tool' },
        ]}
        toolGroups={[{ id: 'fib', label: 'Fibonacci', glyph: '≣' }]}
        activeToolId={null}
        onSelect={(id) => chosen.push(id)}
      />,
    );

    // CONTROL POSITIVE for the case above: a grouping that only drew the declared families would
    // leave the ungrouped tool out of the DOM, and the user would lose a tool the registry HAS.
    const other = screen.getByTestId('drawing-group-__other__');
    expect(other).toHaveAccessibleName('Other tools');
    fireEvent.click(other);
    fireEvent.click(screen.getByTestId('drawing-option-mystery-tool'));
    expect(chosen).toEqual(['mystery-tool']);
  });

  it('draws no flyout trigger when the host brings no registry — the rail must not grow a dead control', () => {
    render(<DrawingToolbar tools={TOOLS} activeToolId={null} onSelect={() => undefined} />);
    // CONTROL POSITIVE for the flyout test above: same rail, no `allTools`, no control.
    expect(screen.queryAllByTestId(/^drawing-group-/)).toHaveLength(0);
  });

  it('disables the destructive actions the host did not wire, instead of hiding them', () => {
    render(
      <DrawingToolbar
        tools={TOOLS}
        activeToolId={null}
        onSelect={() => undefined}
        edits={{ onClear: () => undefined, count: 3 }}
      />,
    );

    expect(screen.getByTestId('drawing-clear')).toBeEnabled();
    // A rail whose buttons come and go changes size as the user works, and the control under the
    // pointer becomes a different one.
    expect(screen.getByTestId('drawing-delete')).toBeDisabled();
    expect(screen.getByTestId('drawing-count')).toHaveTextContent('3');
  });

  /**
   * The theme is READ, not received — and the pair of mounts is what makes that measurable.
   *
   * A rail that ignored the mounted chrome and always painted the package default would pass the
   * second assertion alone; one that demanded a provider would pass the first alone. The rail paints
   * its own box AND hands the tokens down to every icon, so both surfaces are asserted.
   */
  const CANARY: WorkspaceTheme = {
    ...DEFAULT_WORKSPACE_THEME,
    surface: 'rgb(1, 2, 3)',
    text: 'rgb(4, 5, 6)',
    fontFamily: 'Canary Mono',
  };

  it('paints with the provider tokens, and no theme prop exists to pass', () => {
    render(
      <WorkspaceChromeProvider theme={CANARY}>
        <DrawingToolbar tools={TOOLS} activeToolId={null} onSelect={() => undefined} />
      </WorkspaceChromeProvider>,
    );
    const box = screen.getByTestId('drawing-toolbar');
    expect(box).toHaveStyle({ background: CANARY.surface, fontFamily: CANARY.fontFamily });
    // Relayed, not merely held: the icons are children that still take the tokens as props.
    expect(screen.getByTestId('drawing-tool-trend-line')).toHaveStyle({ color: CANARY.text });
  });

  it('mounted outside every provider, it still paints with the package default', () => {
    render(<DrawingToolbar tools={TOOLS} activeToolId={null} onSelect={() => undefined} />);
    expect(screen.getByTestId('drawing-toolbar')).toHaveStyle({
      background: DEFAULT_WORKSPACE_THEME.surface,
      fontFamily: DEFAULT_WORKSPACE_THEME.fontFamily,
    });
    expect(DEFAULT_WORKSPACE_THEME.surface).not.toBe(CANARY.surface);
  });
});

describe('the labels contract names the magnet', () => {
  /**
   * The mode is the library's; the WORD for it is not. A rail that hard-coded "Magnet" would ship
   * one control in English on an otherwise translated screen, which is the defect `chrome.labels`
   * exists to make impossible.
   */
  it('supplies a default word, so a host that overrides nothing still has one', () => {
    expect(DEFAULT_WORKSPACE_CHROME_LABELS.drawingToolbar.magnet).toBe('Magnet');
    // The SAME object, not a second copy: two defaults drift apart on the first edit.
    expect(DEFAULT_DRAWING_TOOLBAR_LABELS).toBe(DEFAULT_WORKSPACE_CHROME_LABELS.drawingToolbar);
    expect(DEFAULT_DRAWING_TOOLBAR_LABELS.magnet).toBe('Magnet');
  });

  it('overrides the magnet ALONE, leaving every other word of the group at the default', () => {
    const labels = resolveWorkspaceLabels({ drawingToolbar: { magnet: 'Snap to bar' } });

    expect(labels.drawingToolbar.magnet).toBe('Snap to bar');
    // CONTROL POSITIVE: the group is a per-group `Partial`, so naming one field replaces one field.
    // A spread would have erased the four words below and left the rail unnamed.
    expect(labels.drawingToolbar.cursor).toBe('Cursor');
    expect(labels.drawingToolbar.deleteSelection).toBe('Delete selected');
    expect(labels.drawingToolbar.clearAll).toBe('Clear all');
    expect(labels.drawingToolbar.count(3)).toBe('3');
    // And the default itself is untouched: the merge returns a copy.
    expect(DEFAULT_WORKSPACE_CHROME_LABELS.drawingToolbar.magnet).toBe('Magnet');
  });
});

describe('SeriesMenu', () => {
  /**
   * REPOINTED with the death of the slot model in the app. The menu never knew what a slot was, but
   * it SPOKE of them: `slots`, `onAssign` and "N/M slots" gave the package a vocabulary that
   * belonged to a consumer's model. The contract is now the generic one it always should have been
   * — which ids are chosen, what to do when one is chosen, and an optional ceiling the host is the
   * one that enforces.
   */
  const mount = (selected: readonly string[] = [], capacity = 2) => {
    const chosen: string[] = [];
    render(
      <SeriesMenu
        catalogue={CATALOGUE}
        selected={selected}
        capacity={capacity}
        onSelect={(entry) => chosen.push(String(entry.provider.id))}
      />,
    );
    return chosen;
  };

  it('derives its categories from the injected catalogue and nothing else', () => {
    mount();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Averages',
      'Bands & channels',
    ]);
    // The first category is selected by default, so the panel is never empty on open.
    expect(screen.getByTestId('series-menu-entry-alpha')).toBeInTheDocument();
    // CONTROL POSITIVE: an entry from the OTHER category is absent, so the panel really is filtered
    // and not just rendering the whole catalogue.
    expect(screen.queryByTestId('series-menu-entry-gamma')).not.toBeInTheDocument();
  });

  it('searches across EVERY category, not within the selected one', () => {
    mount();
    // 'Averages' is selected. The match lives in the other category.
    fireEvent.change(screen.getByTestId('series-menu-search'), { target: { value: 'gamma' } });

    expect(screen.getByTestId('series-menu-entry-gamma')).toBeInTheDocument();
    expect(screen.queryByTestId('series-menu-entry-alpha')).not.toBeInTheDocument();
    // And no tab claims the results: they are not that category's contents.
    expect(screen.getAllByRole('tab').every((tab) => tab.getAttribute('aria-selected') === 'false')).toBe(
      true,
    );
    expect(screen.getByTestId('series-menu-results')).toHaveAccessibleName('Search results');
  });

  it('hands the PROVIDER back, so the host needs no lookup table', () => {
    const chosen = mount();
    fireEvent.click(screen.getByTestId('series-menu-entry-beta'));
    expect(chosen).toEqual(['beta']);
  });

  it('marks the chosen entries and says when the ceiling has been reached', () => {
    mount(['alpha', 'gamma']);

    expect(screen.getByTestId('series-menu-entry-alpha')).toHaveAttribute('aria-pressed', 'true');
    // CONTROL POSITIVE: an unchosen entry in the same list is NOT marked, so the flag tracks the
    // selection rather than being painted on everything.
    expect(screen.getByTestId('series-menu-entry-beta')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('series-menu-count')).toHaveTextContent('2/2');
    expect(screen.getByTestId('series-menu-count')).toHaveTextContent('at capacity');
  });

  it('states a COUNT with no ceiling when the host declares none', () => {
    // CONTROL POSITIVE for the case above: the ceiling is optional and it is the host's. Without it
    // the menu counts and stays quiet — it invents no limit and does not pretend the list is full.
    render(
      <SeriesMenu catalogue={CATALOGUE} selected={['alpha']} onSelect={() => undefined} />,
    );
    const count = screen.getAllByTestId('series-menu-count').at(-1) as HTMLElement;
    expect(count).toHaveTextContent('1');
    expect(count).not.toHaveTextContent('/');
    expect(count).not.toHaveTextContent('at capacity');
  });

  it('offers no radio and no positional control — choosing is what an entry does', () => {
    // The consumer's slot menu was read as "pick a position". A `radio` here would be the same
    // promise by another route: mutual exclusion between entries that are not exclusive.
    mount(['alpha']);
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.getByTestId('series-menu-entry-alpha').tagName).toBe('BUTTON');
  });

  it('says nothing matches rather than rendering an empty panel', () => {
    mount();
    fireEvent.change(screen.getByTestId('series-menu-search'), { target: { value: 'zzz' } });
    expect(screen.getByTestId('series-menu-results')).toHaveTextContent('nothing matches');
  });
});
