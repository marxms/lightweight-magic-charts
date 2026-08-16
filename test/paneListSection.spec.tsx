/**
 * @jest-environment jsdom
 *
 * The pane list: what it shows, what the switch does, and the two ways a row is moved.
 *
 * THE PROBE IS THE POINT. Every write is asserted on a SECOND reader of the same setup, never on
 * the row that was clicked — a section keeping the change to itself would look identical in the row
 * and would leave the canvas drawing the old list.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import type { WorkspaceSection } from '../src/react/chrome/ChromeContext';
import { PaneListSection } from '../src/react/workspace/PaneListSection';
import { WorkspaceSetupProvider, useWorkspaceSetup } from '../src/react/workspace/setupContext';
import type { WorkspaceSetup } from '../src/tabs/setup';

const BASE: WorkspaceSetup = {
  timeframe: '1h',
  layoutMode: 'foco',
  gridCells: ['1h'],
  panes: [
    { id: 'price', visible: true, heightPx: 200 },
    { id: 'volume', visible: false, heightPx: 90 },
    { id: 'flow', visible: true, heightPx: 90 },
  ],
  density: { floor: 0.1, gamma: 1 },
  showDensity: false,
  showProfile: false,
  autoFit: true,
  indicators: [],
  seriesStyles: {},
};

/** The second reader: what the canvas would draw, read from the shared setup and not from a row. */
function DrawnProbe(): ReactElement {
  const panes = useWorkspaceSetup((setup) => setup.panes);
  const drawn = panes.filter((pane) => pane.visible).map((pane) => pane.id);
  return <span data-testid="drawn">{drawn.join(',')}</span>;
}

function Harness({ from = BASE }: { readonly from?: WorkspaceSetup }): ReactElement {
  const [setup, setSetup] = useState(from);
  return (
    <WorkspaceChromeProvider>
      <WorkspaceSetupProvider
        setup={setup}
        onChange={(patch) => setSetup((current) => ({ ...current, ...patch }))}
      >
        <PaneListSection />
        <DrawnProbe />
      </WorkspaceSetupProvider>
    </WorkspaceChromeProvider>
  );
}

const GROUP = 'Visible panes';

const rows = (): string[] =>
  screen
    .getAllByRole('group')
    .map((node) => node.getAttribute('aria-label') ?? '')
    .filter((label) => label !== GROUP);

const rowOf = (pane: string): HTMLElement => screen.getByTestId(`workspace-pane-row-${pane}`);
const switchOf = (pane: string): HTMLElement => screen.getByRole('switch', { name: `Show ${pane}` });
const arrow = (name: string): HTMLElement => screen.getByRole('button', { name });
const drawn = (): string => screen.getByTestId('drawn').textContent ?? '';

/** A drag payload jsdom does not provide, with the two calls the row makes on it. */
function transfer(seeded?: string): DataTransfer {
  const held = new Map<string, string>(seeded === undefined ? [] : [['text/plain', seeded]]);
  return {
    effectAllowed: '',
    dropEffect: '',
    setData: (format: string, value: string) => held.set(format, value),
    getData: (format: string) => held.get(format) ?? '',
  } as unknown as DataTransfer;
}

describe('the pane list section', () => {
  it('shows every pane of the setup, in the setup’s own order', () => {
    render(<Harness />);
    expect(rows()).toEqual([
      'price, position 1 of 3',
      'volume, position 2 of 3',
      'flow, position 3 of 3',
    ]);
  });

  it('reflects each pane’s visibility on its own switch', () => {
    render(<Harness />);
    expect(switchOf('price')).toHaveAttribute('aria-checked', 'true');
    expect(switchOf('volume')).toHaveAttribute('aria-checked', 'false');
  });

  it('SWITCHES a pane on, and the drawn list gains it', () => {
    render(<Harness />);
    expect(drawn()).toBe('price,flow');
    fireEvent.click(switchOf('volume'));
    expect(drawn()).toBe('price,volume,flow');
    expect(switchOf('volume')).toHaveAttribute('aria-checked', 'true');
  });

  it('switches a pane off, and the drawn list loses that one only', () => {
    render(<Harness />);
    fireEvent.click(switchOf('price'));
    expect(drawn()).toBe('flow');
    expect(switchOf('flow')).toHaveAttribute('aria-checked', 'true');
  });

  it('moves a MIDDLE row down by its arrow, so the move is a real reorder', () => {
    render(<Harness />);
    fireEvent.click(arrow('Move volume down'));
    expect(rows()).toEqual([
      'price, position 1 of 3',
      'flow, position 2 of 3',
      'volume, position 3 of 3',
    ]);
  });

  it('moves a middle row up by its arrow', () => {
    render(<Harness />);
    fireEvent.click(arrow('Move volume up'));
    expect(rows()).toEqual([
      'volume, position 1 of 3',
      'price, position 2 of 3',
      'flow, position 3 of 3',
    ]);
  });

  it('disables the arrow that would walk a row off the list, at both ends', () => {
    render(<Harness />);
    expect(arrow('Move price up')).toBeDisabled();
    expect(arrow('Move flow down')).toBeDisabled();
    expect(arrow('Move price down')).not.toBeDisabled();
    expect(arrow('Move flow up')).not.toBeDisabled();
  });

  it('reorders by DRAG, dropping one row onto another', () => {
    render(<Harness />);
    const payload = transfer();
    fireEvent.dragStart(rowOf('flow'), { dataTransfer: payload });
    fireEvent.drop(rowOf('price'), { dataTransfer: payload });
    expect(rows()).toEqual([
      'flow, position 1 of 3',
      'price, position 2 of 3',
      'volume, position 3 of 3',
    ]);
  });

  it('leaves the order alone when a row is dropped on itself', () => {
    render(<Harness />);
    const payload = transfer();
    fireEvent.dragStart(rowOf('volume'), { dataTransfer: payload });
    fireEvent.drop(rowOf('volume'), { dataTransfer: payload });
    expect(rows()).toEqual([
      'price, position 1 of 3',
      'volume, position 2 of 3',
      'flow, position 3 of 3',
    ]);
  });

  it('leaves the order alone when the payload names a pane this tab does not hold', () => {
    // A drag that began somewhere else. Without the guard the splice runs at position minus one
    // and the list comes back scrambled rather than unchanged.
    render(<Harness />);
    fireEvent.drop(rowOf('price'), { dataTransfer: transfer('ghost') });
    expect(rows()).toEqual([
      'price, position 1 of 3',
      'volume, position 2 of 3',
      'flow, position 3 of 3',
    ]);
  });

  it('is a section body: it takes NO props, and renders as one', () => {
    // The assignment is the assertion — a component declaring any required prop fails to compile
    // as a `Body`, which is what "zero props" has to mean for a section.
    const section: WorkspaceSection = {
      id: 'panes',
      label: 'Panes',
      count: 2,
      Body: PaneListSection,
    };
    render(
      <WorkspaceChromeProvider>
        <WorkspaceSetupProvider setup={BASE}>
          <section.Body />
        </WorkspaceSetupProvider>
      </WorkspaceChromeProvider>,
    );
    expect(screen.getByRole('group', { name: GROUP })).toBeInTheDocument();
  });
});
