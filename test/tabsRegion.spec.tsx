/**
 * @jest-environment jsdom
 *
 * The tabs region, driven through the REAL reducer and mounted under the real chrome provider.
 *
 * IT IS THE PROVIDER AND NOT THE COMPOSED COMPONENT, since the composition started rendering a tab
 * strip of its own: mounting a second strip inside it would leave every query below choosing
 * between two, and a region suite has to judge the region it names.
 *
 * Every clause below asserts what the strip ENDS UP SHOWING, never that a callback fired. A region
 * that dispatched the right action into a reducer nobody applied would pass a call-counting suite
 * and would leave the user pressing a dead button.
 */
import { useReducer } from 'react';
import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { coerceWorkspaceSetup, defaultWorkspaceSetup } from '../src/tabs/setup';
import type { WorkspaceSetup, WorkspaceSetupPolicy } from '../src/tabs/setup';
import { MAX_WORKSPACE_TABS, exportTabsToFile, reduceTabs } from '../src/tabs/workspaceTabs';
import type { TabsState, WorkspaceTab } from '../src/tabs/workspaceTabs';
import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import { TabsRegion, workspaceTabPanelAria } from '../src/react/workspace/TabsRegion';
import type { TabsRegionNaming } from '../src/react/workspace/TabsRegion';

const POLICY: WorkspaceSetupPolicy = {
  catalogue: [{ id: 'price', defaultVisible: true, heightPx: 200 }],
  servedTimeframes: ['1h', '4h', '1d'],
  gridFallback: ['1h'],
  maxGridCells: 4,
  density: { floor: 0.1, gamma: 1 },
  showDensity: false,
  showProfile: false,
  autoFit: true,
  coerceIndicators: () => [],
};

const NAMING: TabsRegionNaming = {
  mint: (index) => ({ id: `minted-${index}`, name: `Copy ${index + 1}` }),
  defaultName: (index) => `Tab ${index + 1}`,
  coerceSetup: (raw) => coerceWorkspaceSetup(raw, POLICY),
};

/** A tab whose resolution is its own, so a caption proves WHICH setup a tab is carrying. */
function tab(id: string, name: string, timeframe: string | null): WorkspaceTab<WorkspaceSetup> {
  return { id, name, setup: { ...defaultWorkspaceSetup(POLICY), timeframe } };
}

const THREE: TabsState<WorkspaceSetup> = {
  tabs: [tab('a', 'Alpha', '1h'), tab('b', 'Beta', '4h'), tab('c', 'Gamma', '1d')],
  active: 1,
};

interface HarnessProps {
  readonly initial: TabsState<WorkspaceSetup>;
  readonly downloads?: string[];
}

/** The region inside the shell it will live in, over the reducer that actually owns the rules. */
function Harness({ initial, downloads }: HarnessProps): ReactElement {
  const [state, dispatch] = useReducer(reduceTabs<WorkspaceSetup>, initial);
  return (
    <WorkspaceChromeProvider>
      <TabsRegion
        state={state}
        onAction={dispatch}
        naming={NAMING}
        onExport={
          downloads === undefined
            ? undefined
            : () =>
                exportTabsToFile(state.tabs, 'tabs.json', {
                  download: (_name, payload) => downloads.push(payload),
                })
        }
      />
    </WorkspaceChromeProvider>
  );
}

const tabs = (): HTMLElement[] => screen.getAllByRole('tab');
const names = (): string[] => tabs().map((node) => node.textContent ?? '');
const selected = (): HTMLElement | undefined =>
  tabs().find((node) => node.getAttribute('aria-selected') === 'true');

describe('the tabs region', () => {
  it('shows every tab in order, each captioned with its own resolution', () => {
    render(<Harness initial={THREE} />);
    expect(names()).toEqual(['Alpha1h', 'Beta4h', 'Gamma1d']);
    expect(selected()).toHaveTextContent('Beta');
  });

  it('selects the tab that was pressed', () => {
    render(<Harness initial={THREE} />);
    fireEvent.click(screen.getByText('Gamma'));
    expect(selected()).toHaveTextContent('Gamma');
  });

  it('closes the pressed tab and keeps the user on the tab they were on', () => {
    render(<Harness initial={THREE} />);
    // Closing to the LEFT of the active tab: the strip loses Alpha and the selection must still be
    // Beta. A region that dispatched the wrong index would close Beta and pass a shorter assertion.
    fireEvent.click(screen.getByTestId('workspace-tabs-close-0'));
    expect(names()).toEqual(['Beta4h', 'Gamma1d']);
    expect(selected()).toHaveTextContent('Beta');
  });

  it('duplicates the ACTIVE tab, carrying its setup and not a fresh one', () => {
    render(<Harness initial={THREE} />);
    fireEvent.click(screen.getByTestId('workspace-tabs-add'));
    expect(names()).toEqual(['Alpha1h', 'Beta4h', 'Gamma1d', 'Copy 44h']);
    // `4h` is Beta's resolution, and the default setup has none: the caption is what separates a
    // clone of the active tab from a newly minted one.
    expect(selected()).toHaveTextContent('Copy 4');
  });

  it('renames the edited tab, and only that one', () => {
    render(<Harness initial={THREE} />);
    fireEvent.doubleClick(screen.getByText('Beta'));
    const field = screen.getByTestId('workspace-tabs-rename-1');
    fireEvent.change(field, { target: { value: 'Renamed' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(names()).toEqual(['Alpha1h', 'Renamed4h', 'Gamma1d']);
  });

  it('exports the set as it stands, not the set it was mounted with', () => {
    const downloads: string[] = [];
    render(<Harness initial={THREE} downloads={downloads} />);
    fireEvent.click(screen.getByText('Gamma'));
    fireEvent.click(screen.getByTestId('workspace-tabs-close-0'));
    fireEvent.click(screen.getByTestId('workspace-tabs-export'));
    expect(downloads).toHaveLength(1);
    const written = JSON.parse(downloads[0]) as ReadonlyArray<{ readonly name: string }>;
    expect(written.map((entry) => entry.name)).toEqual(['Beta', 'Gamma']);
  });

  it('offers no export control when the host wires none', () => {
    render(<Harness initial={THREE} />);
    expect(screen.queryByTestId('workspace-tabs-export')).toBeNull();
  });

  it('imports a picked file and REPLACES the set with it', async () => {
    render(<Harness initial={THREE} />);
    const payload = JSON.stringify([
      { id: 'x', name: 'Imported', setup: { timeframe: '1d' } },
      { id: 'y', name: 'Second', setup: { timeframe: '1h' } },
    ]);
    fireEvent.change(screen.getByTestId('workspace-tabs-import-input'), {
      target: { files: [new File([payload], 'tabs.json', { type: 'application/json' })] },
    });
    await waitFor(() => expect(names()).toEqual(['Imported1d', 'Second1h']));
    expect(selected()).toHaveTextContent('Imported');
  });

  it('leaves the set alone when the picked file is not a tab set', async () => {
    render(<Harness initial={THREE} />);
    fireEvent.change(screen.getByTestId('workspace-tabs-import-input'), {
      target: { files: [new File(['not json at all'], 'tabs.json')] },
    });
    // The failure this refuses: a corrupt file that empties the strip. Nothing to wait FOR, so the
    // reader is given a turn to land before the set is read back.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(names()).toEqual(['Alpha1h', 'Beta4h', 'Gamma1d']);
  });

  it('loads a tab written by an earlier version with its setup intact', async () => {
    render(<Harness initial={THREE} />);
    // THE EARLIER SHAPE: the setup fields sat FLAT on the tab, with no `setup` key at all.
    const legacy = JSON.stringify([{ id: 'old', name: 'Legacy', timeframe: '1d', autoFit: true }]);
    fireEvent.change(screen.getByTestId('workspace-tabs-import-input'), {
      target: { files: [new File([legacy], 'tabs.json')] },
    });
    await waitFor(() => expect(names()).toEqual(['Legacy1d']));
  });

  it('truncates a file longer than the cap, keeping the first ones and naming which', async () => {
    render(<Harness initial={THREE} />);
    const over = MAX_WORKSPACE_TABS + 6;
    const payload = JSON.stringify(
      Array.from({ length: over }, (_, index) => ({
        id: `w${index}`,
        name: `W${index}`,
        timeframe: '1h',
      })),
    );
    fireEvent.change(screen.getByTestId('workspace-tabs-import-input'), {
      target: { files: [new File([payload], 'tabs.json')] },
    });
    await waitFor(() => expect(tabs()).toHaveLength(MAX_WORKSPACE_TABS));
    // WHICH ones survived, not how many: the head of the file, in file order, cut at the cap.
    expect(names()).toEqual(
      Array.from({ length: MAX_WORKSPACE_TABS }, (_, index) => `W${index}1h`),
    );
  });

  it('points every tab at the panel, and the panel back at the tab that is selected', () => {
    render(<Harness initial={THREE} />);
    const pair = workspaceTabPanelAria('workspace', 'b');
    expect(tabs().map((node) => node.getAttribute('aria-controls'))).toEqual([
      pair.id,
      pair.id,
      pair.id,
    ]);
    expect(document.getElementById(pair['aria-labelledby'])).toBe(selected());

    // MOVES with the selection. A pair minted once and cached would keep naming Beta here, and the
    // panel would carry the name of a tab that is no longer showing.
    fireEvent.click(screen.getByText('Gamma'));
    const after = workspaceTabPanelAria('workspace', 'c');
    expect(after['aria-labelledby']).not.toBe(pair['aria-labelledby']);
    expect(document.getElementById(after['aria-labelledby'])).toBe(selected());
  });
});
