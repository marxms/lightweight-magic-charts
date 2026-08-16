/**
 * @jest-environment jsdom
 *
 * THE SERIES MENU RAIL TRAVERSED BY THE POINTER — and the keyboard intact beside it.
 *
 * The reported defect: navigating between sections required one CLICK per section, and leaving
 * required finding the close button. Hovering is the gesture the interface was asking for. The risk
 * of doing it the naive way is known and is what these cases pin down: a rail that switches section
 * at every pixel travelled (with no intent delay) and a `role="tablist"` that only answers the
 * mouse — which is a broken tablist, because the platform promises arrow keys to whoever reads the
 * role.
 *
 * The click is NOT replaced in any case: it is the TOUCH gesture, and hover does not exist on touch.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';

import type { ReactElement } from 'react';
import type { WorkspaceSection } from '../src/react/chrome/ChromeContext';
import type { SeriesProvider } from '../src/extension/plugins';
import {
  DEFAULT_SERIES_MENU_LABELS,
  SeriesMenu,
  type SeriesCatalogueEntry,
} from '../src/react/SeriesMenu';
import { HOVER_OPEN_DELAY_MS } from '../src/react/hoverIntent';

const provider = (id: string): SeriesProvider =>
  ({ id, build: () => ({ points: [] }) }) as unknown as SeriesProvider;

const CATALOGUE: readonly SeriesCatalogueEntry[] = [
  { provider: provider('alpha'), label: 'Alpha', category: 'Averages' },
  { provider: provider('beta'), label: 'Beta', category: 'Averages' },
  { provider: provider('gamma'), label: 'Gamma', category: 'Bands' },
  { provider: provider('delta'), label: 'Delta', category: 'Channels' },
];

/** Hoisted to module scope: `Body` is a TYPE, and a new one per render remounts the panel. */
const AuthoredBody = (): ReactElement => <span>authored body</span>;
const OverlaysBody = (): ReactElement => <span>overlays body</span>;

const SECTIONS: readonly WorkspaceSection[] = [
  { id: 'autorais', label: '★ Authored', count: 2, Body: AuthoredBody },
  { id: 'sobreposicoes', label: 'Overlays', count: 0, Body: OverlaysBody },
];

function mount() {
  const chosen: string[] = [];
  render(
    <SeriesMenu
      catalogue={CATALOGUE}
      selected={[]}
      onSelect={(entry) => chosen.push(String(entry.provider.id))}
      sections={SECTIONS}
    />,
  );
  return chosen;
}

const tick = (ms: number): void => {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
};

const selectedTab = (): string | null =>
  screen.getAllByRole('tab').find((tab) => tab.getAttribute('aria-selected') === 'true')
    ?.textContent ?? null;

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('SeriesMenu — running the pointer along the rail switches the section', () => {
  it('switches to the section under the pointer, after the intent delay', () => {
    mount();
    expect(selectedTab()).toBe('★ Authored2');

    fireEvent.mouseEnter(screen.getByTestId('series-menu-category-Bands'));
    // POSITIVE CONTROL: with no delay, the section would already have switched — and it would
    // switch for EVERY row the pointer crossed on the way to the one the user wants.
    tick(HOVER_OPEN_DELAY_MS - 1);
    expect(selectedTab()).toBe('★ Authored2');

    tick(1);
    expect(selectedTab()).toBe('Bands');
    expect(screen.getByTestId('series-menu-entry-gamma')).toBeInTheDocument();
  });

  it('crossing the rail leaves no trail: only the section where the pointer STOPPED is shown', () => {
    mount();

    fireEvent.mouseEnter(screen.getByTestId('series-menu-category-Bands'));
    tick(HOVER_OPEN_DELAY_MS - 40);
    fireEvent.mouseLeave(screen.getByTestId('series-menu-category-Bands'));
    fireEvent.mouseEnter(screen.getByTestId('series-menu-category-Channels'));
    tick(HOVER_OPEN_DELAY_MS);

    expect(selectedTab()).toBe('Channels');
    expect(screen.queryByTestId('series-menu-entry-gamma')).not.toBeInTheDocument();
  });

  it('leaving the rail without stopping on anything switches no section at all', () => {
    mount();

    fireEvent.mouseEnter(screen.getByTestId('series-menu-category-Bands'));
    tick(HOVER_OPEN_DELAY_MS - 40);
    fireEvent.mouseLeave(screen.getByTestId('series-menu-category-Bands'));
    tick(HOVER_OPEN_DELAY_MS * 4);

    expect(selectedTab()).toBe('★ Authored2');
  });

  it('the CLICK still pins the section at once — it is the touch path', () => {
    mount();

    fireEvent.click(screen.getByTestId('series-menu-section-sobreposicoes'));

    expect(selectedTab()).toBe('Overlays');
    expect(screen.getByTestId('series-menu-results')).toHaveTextContent('overlays body');
  });

  it('with a search typed in the pointer is IGNORED — but the click still counts', () => {
    mount();
    fireEvent.change(screen.getByTestId('series-menu-search'), { target: { value: 'gamma' } });

    fireEvent.mouseEnter(screen.getByTestId('series-menu-category-Channels'));
    tick(HOVER_OPEN_DELAY_MS);
    // With a search typed in, the panel IS the search result: swapping it under the pointer would
    // erase what the user has just written without them having asked for anything.
    expect(screen.getByTestId('series-menu-results')).toHaveAccessibleName('Search results');

    // And it did not move the section behind the scenes: clearing the search gives back exactly
    // where one was.
    fireEvent.change(screen.getByTestId('series-menu-search'), { target: { value: '' } });
    expect(selectedTab()).toBe('★ Authored2');

    // POSITIVE CONTROL: the click — which is a declared intent — switches and clears the search.
    fireEvent.change(screen.getByTestId('series-menu-search'), { target: { value: 'gamma' } });
    fireEvent.click(screen.getByTestId('series-menu-category-Channels'));
    expect(selectedTab()).toBe('Channels');
  });
});

/**
 * THE OTHER HALF OF THE PATTERN — the one that was missing, and the one the first one's existence
 * hid.
 *
 * The arrow keys already existed and were tested, so the rail LOOKED navigable. What was missing is
 * what makes the arrow key necessary: one tab stop for the whole rail. Without it, crossing six
 * categories costs six Tabs, which is exactly the cost the arrow key exists to remove.
 */
describe('LMC-62 — the rail has ONE tab stop, not one per tab', () => {
  const stops = () => screen.getAllByRole('tab').map((tab) => tab.getAttribute('tabindex'));

  it('the stop is the SELECTED tab, and all the rest leave the tab order', () => {
    mount();
    // Five tabs: two host sections and three catalogue categories. The first one is selected.
    expect(stops()).toEqual(['0', '-1', '-1', '-1', '-1']);

    fireEvent.click(screen.getByTestId('series-menu-category-Channels'));
    expect(stops()).toEqual(['-1', '-1', '-1', '-1', '0']);
  });

  it('with a SEARCH typed in no tab is selected, and the stop falls back to the first', () => {
    mount();
    fireEvent.change(screen.getByTestId('series-menu-search'), { target: { value: 'gamma' } });

    // POSITIVE CONTROL: without the fallback the whole rail would leave the tab order while one
    // types — and the search is exactly the moment one wants to get back to the rail by keyboard.
    expect(selectedTab()).toBeNull();
    expect(stops()).toEqual(['0', '-1', '-1', '-1', '-1']);
  });
});

describe('SeriesMenu — the close label comes from the label group', () => {
  it('the default is English, like every default in this library', () => {
    render(
      <SeriesMenu
        catalogue={CATALOGUE}
        selected={[]}
        onSelect={() => undefined}
        onClose={() => undefined}
      />,
    );
    // It used to be a Portuguese literal hammered into the component — the only string in the lib
    // the host could not translate, in a file whose other seven labels it could.
    const close = screen.getAllByTestId('series-menu-close').at(-1) as HTMLElement;
    expect(close).toHaveAccessibleName('Close');
    expect(close).toHaveTextContent('Close');
  });

  it('the host swaps the label through the group, as it swaps the others', () => {
    render(
      <SeriesMenu
        catalogue={CATALOGUE}
        selected={[]}
        onSelect={() => undefined}
        onClose={() => undefined}
        labels={{ ...DEFAULT_SERIES_MENU_LABELS, close: 'Fechar' }}
      />,
    );
    expect(screen.getAllByTestId('series-menu-close').at(-1)).toHaveAccessibleName('Fechar');
  });
});

describe('SeriesMenu — the rail by keyboard (it is a tablist; the arrows are the role promise)', () => {
  it('the arrow keys traverse the rail, activate the section and wrap around', () => {
    mount();
    const tabs = screen.getAllByRole('tab');
    tabs[0].focus();

    fireEvent.keyDown(tabs[0], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(tabs[1]);
    expect(selectedTab()).toBe('Overlays');

    fireEvent.keyDown(tabs[1], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(tabs[0]);

    // It wraps around: stopping at the end is indistinguishable from a broken handler.
    fireEvent.keyDown(tabs[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
  });

  it('Home and End go to the ends', () => {
    mount();
    const tabs = screen.getAllByRole('tab');
    tabs[0].focus();

    fireEvent.keyDown(tabs[0], { key: 'End' });
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);

    fireEvent.keyDown(tabs[tabs.length - 1], { key: 'Home' });
    expect(document.activeElement).toBe(tabs[0]);
    expect(selectedTab()).toBe('★ Authored2');
  });

  it('POSITIVE CONTROL: a key that is not a navigation key moves nothing', () => {
    mount();
    const tabs = screen.getAllByRole('tab');
    tabs[0].focus();

    fireEvent.keyDown(tabs[0], { key: 'a' });

    expect(document.activeElement).toBe(tabs[0]);
    expect(selectedTab()).toBe('★ Authored2');
  });
});
