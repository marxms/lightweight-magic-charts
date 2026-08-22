/**
 * @jest-environment jsdom
 *
 * The centred row, pinned as the browser reads it.
 *
 * Eleven declarations across nine files opened with the same two properties, and collapsing them
 * into one shared value is only safe if the SERIALISED declaration is unchanged. Inline-style ORDER
 * is part of that: React writes the properties in insertion order, so a shared value spread at the
 * wrong position repaints the same pixels through a different `style` attribute and nothing else in
 * this suite would notice — the same reason `seriesMenuRailStyle.spec.tsx` exists.
 *
 * EVERY STRING BELOW WAS CAPTURED FROM THE TREE BEFORE THE COLLAPSE, not written from the code
 * afterwards. That is what makes these assertions a statement about "unchanged" rather than a
 * restatement of whatever the components happen to render now. The three declarations that need a
 * heavy harness are pinned where that harness already lives: `compactCell.spec.tsx`,
 * `chartWorkspace.spec.tsx` and `seriesMenuRegion.spec.tsx`.
 *
 * THE ORDER CLAUSE IS ASSERTED SEPARATELY from the whole attribute. A pin of the full string would
 * go red for any change at all, which tells the reader nothing about which property moved; the
 * leading-pair assertion says exactly what the shared value is responsible for.
 */
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';

import type { SeriesProvider } from '../src/extension/plugins';
import { SeriesMenu } from '../src/react/SeriesMenu';
import type { SeriesCatalogueEntry } from '../src/react/SeriesMenu';
import { WorkspaceTabsBar } from '../src/react/WorkspaceTabsBar';
import type { WorkspaceTabsBarItem } from '../src/react/WorkspaceTabsBar';
import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import type { WorkspaceSection } from '../src/react/chrome/ChromeContext';
import { FlyoutMenu } from '../src/react/chrome/FlyoutMenu';
import { Notice } from '../src/react/chrome/Notice';
import { DEFAULT_WORKSPACE_THEME } from '../src/react/theme';
import { OverlayTogglesSection } from '../src/react/workspace/OverlayTogglesSection';
import { PaneListSection } from '../src/react/workspace/PaneListSection';
import { WorkspaceSetupProvider } from '../src/react/workspace/setupContext';
import type { WorkspaceSetup } from '../src/tabs/setup';

const styleOf = (element: Element | null | undefined): string =>
  element?.getAttribute('style') ?? '';

/** The two properties the shared value is answerable for, in the order every site declared them. */
const LEAD = 'display: flex; align-items: center;';

const provider = (id: string): SeriesProvider =>
  ({
    id,
    spec: { id, label: id, shape: 'line', color: '#fff' },
    points: () => [],
  }) as unknown as SeriesProvider;

const CATALOGUE: readonly SeriesCatalogueEntry[] = [
  { provider: provider('rsi'), label: 'RSI', category: 'Momentum' },
];

function SectionBody(): ReactElement {
  return <span>authored</span>;
}

const SECTIONS: readonly WorkspaceSection[] = [
  { id: 'authored', label: 'Authored', count: 2, Body: SectionBody },
];

const TABS: readonly WorkspaceTabsBarItem[] = [{ id: 'a', name: 'Swing', caption: '4h' }];

const SETUP: WorkspaceSetup = {
  timeframe: '1h',
  layoutMode: 'foco',
  gridCells: ['1h'],
  panes: [{ id: 'price', visible: true, heightPx: 200 }],
  density: { floor: 0.1, gamma: 1 },
  showDensity: false,
  showProfile: false,
  autoFit: true,
  indicators: [],
  seriesStyles: {},
};

function mountTabsBar(): void {
  render(
    <WorkspaceTabsBar
      tabs={TABS}
      activeIndex={0}
      panelId="panel-1"
      onSelect={() => undefined}
      onClose={() => undefined}
      onDuplicate={() => undefined}
      onExport={() => undefined}
    />,
  );
}

function mountInSetup(body: ReactElement): void {
  render(
    <WorkspaceChromeProvider sections={SECTIONS}>
      <WorkspaceSetupProvider setup={SETUP} onChange={() => undefined}>
        {body}
      </WorkspaceSetupProvider>
    </WorkspaceChromeProvider>,
  );
}

describe('the centred row, serialised as it was before the collapse', () => {
  it('leads the tab strip’s tab and keeps the box declaration behind it', () => {
    mountTabsBar();
    expect(styleOf(screen.getByTestId('workspace-tabs-tab-0'))).toBe(
      'display: flex; align-items: center; border-bottom: 2px solid #2962FF;' +
        ' background: rgba(41, 98, 255, 0.22);',
    );
  });

  it('follows a property that was already there, in the tab strip’s action group', () => {
    // THE ONE SITE WHERE THE SHARED VALUE IS NOT THE LEAD. `margin-left` is declared first and has
    // to stay first: a spread hoisted to the front would push it after `align-items` and the group
    // would stop being pushed to the end of the bar.
    mountTabsBar();
    const group = screen.getByTestId('workspace-tabs-export').parentElement;
    expect(styleOf(group)).toBe('margin-left: auto; display: flex; align-items: center; gap: 2px;');
  });

  it('leads the studies menu’s header', () => {
    render(
      <WorkspaceChromeProvider sections={SECTIONS}>
        <SeriesMenu catalogue={CATALOGUE} sections={SECTIONS} onSelect={() => undefined} />
      </WorkspaceChromeProvider>,
    );
    expect(styleOf(screen.getByTestId('series-menu-search').parentElement)).toBe(
      'display: flex; align-items: center; gap: 10px; padding: 8px;',
    );
  });

  it('leads the notice panel, which builds its declaration in a function', () => {
    const view = render(
      <Notice severity="info" theme={DEFAULT_WORKSPACE_THEME}>
        anything
      </Notice>,
    );
    expect(styleOf(view.container.firstElementChild)).toBe(
      'display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 4px;' +
        ' border: 1px solid rgba(255,255,255,0.14); background: transparent;' +
        ' color: rgb(184, 188, 196); font-family: Inter, system-ui, sans-serif;' +
        ' box-sizing: border-box;',
    );
  });

  it('leads the flyout item, which builds its declaration from the theme and a flag', () => {
    render(
      <FlyoutMenu
        id="flyout"
        label="Flyout"
        items={[{ id: 'one', label: 'One', selected: true }]}
        onSelect={() => undefined}
        onClose={() => undefined}
        rootRef={{ current: null }}
        triggerRef={{ current: null }}
        theme={DEFAULT_WORKSPACE_THEME}
        testIdPrefix="fly"
      />,
    );
    expect(styleOf(screen.getByTestId('fly-option-one'))).toBe(
      'display: flex; align-items: center; justify-content: space-between; gap: 16px;' +
        ' width: 100%; padding: 6px 8px; cursor: pointer; text-align: left;' +
        ' border: 1px solid #2962ff; border-radius: 4px; background: rgba(41, 98, 255, 0.22);' +
        ' color: rgb(255, 255, 255); font-size: 12px; font-family: inherit;',
    );
  });

  it('leads the overlay chips row', () => {
    const view = render(
      <WorkspaceChromeProvider sections={SECTIONS}>
        <WorkspaceSetupProvider setup={SETUP} onChange={() => undefined}>
          <OverlayTogglesSection />
        </WorkspaceSetupProvider>
      </WorkspaceChromeProvider>,
    );
    expect(styleOf(view.container.firstElementChild)).toBe(
      'display: flex; align-items: center; flex-wrap: wrap; gap: 8px;',
    );
  });

  it('follows the stripped-set declaration in a pane row, and stays ahead of the drag state', () => {
    // TWO SPREADS IN ONE DECLARATION. `BARE_SET` was already first and has to stay first, and the
    // drag border has to stay last: it is the only property that changes while a row is dragged.
    mountInSetup(<PaneListSection />);
    expect(styleOf(screen.getByTestId('workspace-pane-row-price'))).toBe(
      'margin: 0px; padding: 0px; display: flex; align-items: center; gap: 8px; cursor: grab;' +
        ' border-top: 2px solid transparent; opacity: 1;',
    );
  });

  it('opens every one of them with the same two properties, in the same order', () => {
    // The clause the per-site pins cannot state on their own: what makes these ONE declaration is
    // that the pair is identical and leading. A shared value that serialised `align-items` first
    // would satisfy no site above, and one that only reached some of them would satisfy all of the
    // others — this asserts the set.
    mountTabsBar();
    const tab = styleOf(screen.getByTestId('workspace-tabs-tab-0'));
    const group = styleOf(screen.getByTestId('workspace-tabs-export').parentElement);
    expect(tab.startsWith(LEAD)).toBe(true);
    expect(group.startsWith('margin-left: auto; ')).toBe(true);
    expect(group).toContain(LEAD);
  });
});
