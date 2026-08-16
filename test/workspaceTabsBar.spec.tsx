/**
 * @jest-environment jsdom
 *
 * The tab strip, held to the semantics that do not show in a screenshot.
 *
 * A tablist that also declares the "+" and the export pair as tabs describes itself wrongly; a
 * close button that says "close tab" N times never says WHICH; a close that disappears on the last
 * tab changes the bar's geometry under the pointer. Each is pinned here.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';

import {
  WorkspaceTabsBar,
  workspaceTabButtonId,
  type WorkspaceTabsBarItem,
} from '../src/react/WorkspaceTabsBar';

const TABS: readonly WorkspaceTabsBarItem[] = [
  { id: 'a', name: 'Swing', caption: '4h' },
  { id: 'b', name: 'Scalp', caption: '15m' },
];

function mount(overrides: Partial<Parameters<typeof WorkspaceTabsBar>[0]> = {}) {
  const calls = {
    select: [] as number[],
    close: [] as number[],
    duplicate: 0,
    exported: 0,
    imported: [] as File[],
    renamed: [] as Array<readonly [string, string]>,
  };
  render(
    <WorkspaceTabsBar
      tabs={TABS}
      activeIndex={0}
      panelId="panel-1"
      onSelect={(index) => calls.select.push(index)}
      onClose={(index) => calls.close.push(index)}
      onDuplicate={() => {
        calls.duplicate += 1;
      }}
      onExport={() => {
        calls.exported += 1;
      }}
      onImportFile={(file) => calls.imported.push(file)}
      onRename={(id, name) => calls.renamed.push([id, name] as const)}
      {...overrides}
    />,
  );
  return calls;
}

/**
 * THE KEYBOARD CONTRACT THE BAR DECLARED AND DID NOT KEEP.
 *
 * This suite never simulated a key event against the tab list — and that is how a `role="tablist"`
 * bar with no answer to any arrow got through a whole suite. The role promises the screen reader
 * what a native list delivers: one tab stop for the list and an arrow to move inside it. Each tab
 * was its own stop, and there was no end-to-end jump.
 */
const THREE: readonly WorkspaceTabsBarItem[] = [
  { id: 'a', name: 'Swing', caption: '4h' },
  { id: 'b', name: 'Scalp', caption: '15m' },
  { id: 'c', name: 'Position', caption: '1d' },
];

describe('LMC-61 — the horizontal arrow crosses the tabs', () => {
  const tabs = () => screen.getAllByRole('tab');

  it('moves right and left, wrapping around at both ends', () => {
    mount({ tabs: THREE });
    tabs()[0].focus();
    const list = screen.getByRole('tablist');

    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs()[1]);
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs()[2]);
    // Sticking at the end is indistinguishable from a handler that was never wired.
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(tabs()[0]);
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(tabs()[2]);
  });

  it('Home goes to the first tab and End to the last', () => {
    mount({ tabs: THREE });
    tabs()[0].focus();
    const list = screen.getByRole('tablist');

    fireEvent.keyDown(list, { key: 'End' });
    expect(document.activeElement).toBe(tabs()[2]);
    fireEvent.keyDown(list, { key: 'Home' });
    expect(document.activeElement).toBe(tabs()[0]);
  });

  it('the VERTICAL arrow is not this bar’s, and it does not swallow it', () => {
    mount({ tabs: THREE });
    tabs()[0].focus();
    const list = screen.getByRole('tablist');

    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(tabs()[0]);
    // CONTROL POSITIVE: cancelling a key that is not yours would steal page scrolling from whoever
    // had focus in here.
    expect(fireEvent.keyDown(list, { key: 'ArrowDown' })).toBe(true);
    expect(fireEvent.keyDown(list, { key: 'ArrowRight' })).toBe(false);
  });

  it('MANUAL ACTIVATION: the arrow moves focus and does NOT switch the tab', () => {
    const calls = mount({ tabs: THREE });
    tabs()[0].focus();

    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });

    // A tab here is a whole workspace setup: activating on focus would rebuild the chart on every
    // arrow crossed. Enter and Space activate, because the tab is a real `button`.
    expect(calls.select).toEqual([]);
    fireEvent.click(document.activeElement as HTMLElement);
    expect(calls.select).toEqual([1]);
  });
});

describe('LMC-62 — the list has ONE tab stop, not one per tab', () => {
  it('the stop is the ACTIVE tab, and all the others leave the tab order', () => {
    mount({ tabs: THREE, activeIndex: 1 });
    expect(screen.getAllByRole('tab').map((tab) => tab.getAttribute('tabindex'))).toEqual([
      '-1',
      '0',
      '-1',
    ]);
  });
});

describe('LMC-60 — the rename field does not suppress the focus indicator', () => {
  it('declares no focus ring, in the only place in the bar where one types', () => {
    mount();
    fireEvent.doubleClick(screen.getByRole('tab', { name: /Swing/ }));

    const field = screen.getByTestId('workspace-tabs-rename-0');
    // The field is BORN focused. Suppressing the ring here erases the indicator exactly where it
    // matters most, and the highlight border does not replace it: it is the same with and without
    // focus.
    expect(document.activeElement).toBe(field);
    expect(field.style.outline).toBe('');
    expect(field.style.outlineWidth).toBe('');
  });
});

describe('WorkspaceTabsBar', () => {
  it('declares a tablist holding ONLY the tabs — the actions are not tabs', () => {
    mount();
    const tablist = screen.getByRole('tablist');
    expect(within(tablist).getAllByRole('tab')).toHaveLength(2);
    // The strip's actions live OUTSIDE the tablist, so a reader never counts them as tabs.
    expect(within(tablist).queryByTestId('workspace-tabs-add')).toBeNull();
    expect(within(tablist).queryByTestId('workspace-tabs-export')).toBeNull();
    // CONTROL POSITIVE: they do exist, just elsewhere in the bar.
    expect(screen.getByTestId('workspace-tabs-add')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-tabs-export')).toBeInTheDocument();
  });

  it('states selection on the tab and wires the panel it controls', () => {
    mount();
    const [first, second] = screen.getAllByRole('tab');
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(second).toHaveAttribute('aria-selected', 'false');
    expect(first).toHaveAttribute('aria-controls', 'panel-1');
  });

  it('names WHICH tab each close button closes, and reports intents by index', () => {
    const calls = mount();
    fireEvent.click(screen.getByRole('tab', { name: /Scalp/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Swing' }));
    expect(calls.select).toEqual([1]);
    expect(calls.close).toEqual([0]);
  });

  it('disables — never hides — the close on the last tab', () => {
    const calls = mount({ tabs: [TABS[0]] });
    const close = screen.getByTestId('workspace-tabs-close-0');
    expect(close).toBeDisabled();
    expect(close).toHaveAccessibleName('The last tab cannot be closed');
    fireEvent.click(close);
    expect(calls.close).toEqual([]);
    // CONTROL POSITIVE: with two tabs the same button is live. (The single-tab bar above has no
    // close-1, so this queries the two-tab bar unambiguously.)
    const two = mount({ tabs: TABS });
    fireEvent.click(screen.getByTestId('workspace-tabs-close-1'));
    expect(two.close).toEqual([1]);
  });

  it('duplicates via the + and hands a picked file to the host', () => {
    const calls = mount();
    fireEvent.click(screen.getByTestId('workspace-tabs-add'));
    expect(calls.duplicate).toBe(1);

    const file = new File(['[]'], 'tabs.json', { type: 'application/json' });
    const input = screen.getByTestId('workspace-tabs-import-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(calls.imported).toEqual([file]);
    // Cleared so picking the SAME file twice fires change again.
    expect(input.value).toBe('');

    fireEvent.click(screen.getByTestId('workspace-tabs-export'));
    expect(calls.exported).toBe(1);
  });
});

/**
 * Renaming, held to the semantics a screenshot cannot show.
 *
 * The trap this whole block exists for: swapping the `<button role="tab">` for an `<input>` draws
 * the same thing and silently leaves the tablist with N-1 tabs, and the host's tabpanel pointing
 * its `aria-labelledby` at an id that no longer exists. So every case here asserts the STRIP is
 * intact while one of its labels is being edited.
 */
describe('WorkspaceTabsBar — renaming a tab', () => {
  const openEditor = (name: RegExp = /Swing/): HTMLInputElement => {
    fireEvent.doubleClick(screen.getByRole('tab', { name }));
    return screen.getByTestId('workspace-tabs-rename-0') as HTMLInputElement;
  };

  it('edits IN PLACE: the tablist keeps every tab and the labelled id survives', () => {
    mount();
    const input = openEditor();
    expect(input).toHaveValue('Swing');
    expect(input).toHaveAccessibleName('Rename Swing');

    const tablist = screen.getByRole('tablist');
    // N, never N-1: an input that REPLACED the tab would make this 1.
    expect(within(tablist).getAllByRole('tab')).toHaveLength(2);
    // The id the host's tabpanel points `aria-labelledby` at is still there, still on the tab…
    const labelled = document.getElementById(workspaceTabButtonId('workspace-tabs', 'a'));
    expect(labelled).toHaveAttribute('role', 'tab');
    // …and the input carries an id of its OWN, so nothing in the document is duplicated.
    expect(input.id).not.toBe(workspaceTabButtonId('workspace-tabs', 'a'));
    expect(document.querySelectorAll(`[id="${input.id}"]`)).toHaveLength(1);
  });

  it('Enter confirms, reporting the tab by ID and the name trimmed', () => {
    const calls = mount();
    const input = openEditor();
    fireEvent.change(input, { target: { value: '  Macro  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(calls.renamed).toEqual([['a', 'Macro']]);
    expect(screen.queryByTestId('workspace-tabs-rename-0')).toBeNull();
  });

  it('blur confirms too — clicking away is a commit, not a loss', () => {
    const calls = mount();
    const input = openEditor();
    fireEvent.change(input, { target: { value: 'Macro' } });
    fireEvent.blur(input);
    expect(calls.renamed).toEqual([['a', 'Macro']]);
    expect(screen.queryByTestId('workspace-tabs-rename-0')).toBeNull();
  });

  it('Escape cancels: nothing is reported and the previous label is back', () => {
    const calls = mount();
    const input = openEditor();
    fireEvent.change(input, { target: { value: 'Discarded' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(calls.renamed).toEqual([]);
    expect(screen.queryByTestId('workspace-tabs-rename-0')).toBeNull();
    expect(screen.getByRole('tab', { name: /Swing/ })).toBeInTheDocument();
    // Reopening starts from the tab's name, never from the discarded draft.
    expect(openEditor()).toHaveValue('Swing');
  });

  it('REFUSES a blank name, by Enter and by blur alike', () => {
    const calls = mount();
    for (const blank of ['', '   ']) {
      const byEnter = openEditor();
      fireEvent.change(byEnter, { target: { value: blank } });
      fireEvent.keyDown(byEnter, { key: 'Enter' });

      const byBlur = openEditor();
      fireEvent.change(byBlur, { target: { value: blank } });
      fireEvent.blur(byBlur);
    }
    expect(calls.renamed).toEqual([]);
    expect(screen.getByRole('tab', { name: /Swing/ })).toBeInTheDocument();
    // CONTROL POSITIVE: the same two paths DO report a name that is not blank.
    const live = openEditor();
    fireEvent.change(live, { target: { value: 'Macro' } });
    fireEvent.keyDown(live, { key: 'Enter' });
    expect(calls.renamed).toEqual([['a', 'Macro']]);
  });

  it('CONTAINS the Escape that cancels — the host never sees it', () => {
    // The workspace this bar ships inside reads Escape BEFORE it checks whether the target is a
    // text field, so a bubbling Escape would disarm its drawing tool or collapse its fullscreen
    // while the user only meant to abandon a rename.
    const hostEscapes: string[] = [];
    render(
      // biome-ignore lint/a11y/noStaticElementInteractions: the host listener IS the assertion
      <div onKeyDown={(event) => hostEscapes.push(event.key)}>
        <WorkspaceTabsBar
          tabs={TABS}
          activeIndex={0}
          panelId="panel-host"
          onSelect={() => undefined}
          onClose={() => undefined}
          onDuplicate={() => undefined}
          onRename={() => undefined}
          testIdPrefix="hosted-tabs"
        />
      </div>,
    );
    fireEvent.doubleClick(screen.getByRole('tab', { name: /Swing/ }));
    fireEvent.keyDown(screen.getByTestId('hosted-tabs-rename-0'), { key: 'Escape' });
    expect(hostEscapes).toEqual([]);
    // CONTROL POSITIVE: the listener is really wired — any OTHER key still reaches the host.
    fireEvent.doubleClick(screen.getByRole('tab', { name: /Swing/ }));
    fireEvent.keyDown(screen.getByTestId('hosted-tabs-rename-0'), { key: 'a' });
    expect(hostEscapes).toEqual(['a']);
  });

  it('does not report a rename that changes nothing', () => {
    const calls = mount();
    const input = openEditor();
    fireEvent.change(input, { target: { value: '  Swing  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(calls.renamed).toEqual([]);
  });

  it('renames the tab the user opened, not the active one', () => {
    const calls = mount();
    fireEvent.doubleClick(screen.getByRole('tab', { name: /Scalp/ }));
    const input = screen.getByTestId('workspace-tabs-rename-1') as HTMLInputElement;
    expect(input).toHaveValue('Scalp');
    fireEvent.change(input, { target: { value: 'Intraday' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(calls.renamed).toEqual([['b', 'Intraday']]);
  });

  it('without onRename the bar is EXACTLY the bar of today', () => {
    mount({ onRename: undefined });
    fireEvent.doubleClick(screen.getByRole('tab', { name: /Swing/ }));
    expect(screen.queryByTestId('workspace-tabs-rename-0')).toBeNull();
    expect(within(screen.getByRole('tablist')).getAllByRole('tab')).toHaveLength(2);
    // CONTROL POSITIVE: the same double click opens the editor once the port is wired.
    mount();
    expect(screen.getAllByTestId('workspace-tabs-tab-0')).toHaveLength(2); // two bars mounted
    fireEvent.doubleClick(screen.getAllByRole('tab', { name: /Swing/ })[1]);
    expect(screen.getAllByTestId('workspace-tabs-rename-0')).toHaveLength(1);
  });
});

// Portuguese labels are what the consuming app injects; the bar must carry them verbatim.
const PT_LABELS = {
  group: 'Abas de workspace',
  duplicate: 'Duplicar a aba atual',
  close: (name: string) => `Fechar ${name}`,
  // non-english-fixture: a host label in another language — English here would prove nothing
  lastTabClose: 'A última aba não pode ser fechada',
  exportAction: 'exportar',
  importAction: 'importar',
  importTitle: 'Carregar um JSON — SUBSTITUI as abas atuais',
  rename: (name: string) => `Renomear ${name}`,
  renameHint: 'Duplo clique para renomear',
};

// The default mount above already uses the default labels for structure; the app's labels ride the
// same prop every other component in this package uses.
function mountPt() {
  return mount({ labels: PT_LABELS });
}

describe('WorkspaceTabsBar — injected labels', () => {
  it('speaks the labels the host injected', () => {
    mountPt();
    expect(screen.getByRole('tablist', { name: 'Abas de workspace' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicar a aba atual' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar Scalp' })).toBeInTheDocument();
  });

  it('names the rename field in the host’s language too', () => {
    mountPt();
    fireEvent.doubleClick(screen.getByRole('tab', { name: /Swing/ }));
    expect(screen.getByTestId('workspace-tabs-rename-0')).toHaveAccessibleName('Renomear Swing');
  });
});
