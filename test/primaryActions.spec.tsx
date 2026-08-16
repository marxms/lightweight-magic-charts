/**
 * @jest-environment jsdom
 *
 * The two primary header actions. The new level is asserted AGAINST the close it was built from,
 * with two different closes, so a fixed number cannot satisfy both.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { sideOf } from '../src/alerts/priceAlerts';
import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import { PrimaryActions, newAlertLevel } from '../src/react/workspace/PrimaryActions';
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
  autoFit: false,
  indicators: [],
  seriesStyles: {},
};

interface HarnessProps {
  readonly lastClose: number | null;
  readonly added?: number[];
}

function Harness({ lastClose, added = [] }: HarnessProps): ReactElement {
  const [setup, setSetup] = useState(BASE);
  return (
    <WorkspaceChromeProvider>
      <WorkspaceSetupProvider setup={setup}>
        <PrimaryActions
          onAutoFitToggle={() => setSetup((current) => ({ ...current, autoFit: !current.autoFit }))}
          priceLine={{ lastClose, onAdd: (price) => added.push(price) }}
        />
      </WorkspaceSetupProvider>
    </WorkspaceChromeProvider>
  );
}

const autoFit = (): HTMLElement => screen.getByRole('button', { name: 'Auto-fit' });
const addLine = (): HTMLElement => screen.getByRole('button', { name: 'Add line' });

describe('the primary header actions', () => {
  it('toggles auto-fit on and back off', () => {
    render(<Harness lastClose={100} />);
    expect(autoFit()).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(autoFit());
    expect(autoFit()).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(autoFit());
    expect(autoFit()).toHaveAttribute('aria-pressed', 'false');
  });

  it('leaves the price line alone while auto-fit moves — the two share nothing', () => {
    const added: number[] = [];
    render(<Harness lastClose={100} added={added} />);
    fireEvent.click(autoFit());
    expect(added).toEqual([]);
    expect(addLine()).not.toBeDisabled();
  });

  it('places the new line NEAR the last close, for two different closes', () => {
    for (const close of [100, 68_412.5]) {
      const added: number[] = [];
      const view = render(<Harness lastClose={close} added={added} />);
      fireEvent.click(addLine());
      expect(added).toHaveLength(1);
      const level = added[0];
      // NEAR: within one percent OF THIS CLOSE. A fixed level satisfies one of the two closes at
      // most, which is the whole reason there are two.
      expect(Math.abs(level - close) / close).toBeLessThan(0.01);
      expect(level).not.toBe(close);
      view.unmount();
    }
  });

  it('places it clear of the price, so a fresh line is not already crossed', () => {
    // The rule the alert machine applies: the close must still be BELOW the level that was just
    // placed, or the line fires on arrival with nothing having happened.
    for (const close of [100, 68_412.5]) {
      expect(sideOf(close, newAlertLevel(close))).toBe('below');
    }
  });

  it('offers no line to place when there are no bars', () => {
    const added: number[] = [];
    render(<Harness lastClose={null} added={added} />);
    expect(addLine()).toBeDisabled();
    fireEvent.click(addLine());
    expect(added).toEqual([]);
  });
});
