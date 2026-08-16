/**
 * @jest-environment jsdom
 *
 * The grid controls, over a LIVE setup: the host applies each action and the region reads the
 * result back. The ceiling is asserted by pressing until the control goes away, never by reading
 * the number the test itself handed over.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import { GridControls } from '../src/react/workspace/GridControls';
import { WorkspaceSetupProvider } from '../src/react/workspace/setupContext';
import type { WorkspaceSetup } from '../src/tabs/setup';

const BASE: WorkspaceSetup = {
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

const MAX_CELLS = 3;

interface HarnessProps {
  readonly from?: WorkspaceSetup;
}

/** The two providers the shell mounts, over a setup the host can actually move. */
function Harness({ from = BASE }: HarnessProps): ReactElement {
  const [setup, setSetup] = useState(from);
  return (
    <WorkspaceChromeProvider>
      <WorkspaceSetupProvider setup={setup}>
        <GridControls
          grid={{
            maxCells: MAX_CELLS,
            onToggleMode: () =>
              setSetup((current) => ({
                ...current,
                layoutMode: current.layoutMode === 'grade' ? 'foco' : 'grade',
              })),
            onAddCell: () =>
              setSetup((current) => ({ ...current, gridCells: [...current.gridCells, '4h'] })),
          }}
        />
        <span data-testid="cells">{setup.gridCells.join(',')}</span>
      </WorkspaceSetupProvider>
    </WorkspaceChromeProvider>
  );
}

const modeChip = (): HTMLElement => screen.getByRole('button', { name: 'Grid' });
const addCell = (): HTMLElement | null => screen.queryByRole('button', { name: 'Add a cell' });

describe('the grid controls', () => {
  it('starts unpressed, and pressing it puts the workspace in grid mode', () => {
    render(<Harness />);
    expect(modeChip()).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(modeChip());
    expect(modeChip()).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles BACK, so the chip is a switch and not a one-way trip', () => {
    render(<Harness from={{ ...BASE, layoutMode: 'grade' }} />);
    fireEvent.click(modeChip());
    expect(modeChip()).toHaveAttribute('aria-pressed', 'false');
  });

  it('offers no cell action outside grid mode, and offers it as soon as the mode is on', () => {
    render(<Harness />);
    expect(addCell()).toBeNull();
    fireEvent.click(modeChip());
    expect(addCell()).not.toBeNull();
  });

  it('adds a cell, and the added one is the one the host chose', () => {
    render(<Harness from={{ ...BASE, layoutMode: 'grade' }} />);
    fireEvent.click(addCell() as HTMLElement);
    expect(screen.getByTestId('cells')).toHaveTextContent('1h,4h');
  });

  it('withdraws the action AT the ceiling, reached by pressing rather than by reading it', () => {
    render(<Harness from={{ ...BASE, layoutMode: 'grade' }} />);
    // One cell in, ceiling of three: two presses land and the third has nothing to press. Counting
    // presses is what makes the limit behavioural — asserting `maxCells` would restate the input.
    fireEvent.click(addCell() as HTMLElement);
    expect(addCell()).not.toBeNull();
    fireEvent.click(addCell() as HTMLElement);
    expect(screen.getByTestId('cells')).toHaveTextContent('1h,4h,4h');
    expect(addCell()).toBeNull();
  });

  it('starts with the action already withdrawn when the setup arrives at the ceiling', () => {
    const full = { ...BASE, layoutMode: 'grade' as const, gridCells: ['1h', '4h', '1d'] };
    render(<Harness from={full} />);
    expect(addCell()).toBeNull();
    // The chip beside it still works, so the absence above is the ceiling and not a dead region.
    fireEvent.click(modeChip());
    expect(modeChip()).toHaveAttribute('aria-pressed', 'false');
  });
});
