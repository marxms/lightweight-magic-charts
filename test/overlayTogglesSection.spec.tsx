/**
 * @jest-environment jsdom
 *
 * The overlay chips, the sliders that belong to one of them, and the FAN-OUT COUNT.
 *
 * The count is written down here because three fields is one under the ceiling of four: whoever
 * adds the fourth is adding the last one that fits, and should learn that from a failing name
 * rather than by measuring.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import type { WorkspaceSection } from '../src/react/chrome/ChromeContext';
import { OverlayTogglesSection } from '../src/react/workspace/OverlayTogglesSection';
import { WorkspaceSetupProvider, useWorkspaceSetup } from '../src/react/workspace/setupContext';
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

/** The second reader: the overlay state as the drawing side of the host would consume it. */
function OverlayProbe(): ReactElement {
  const showDensity = useWorkspaceSetup((setup) => setup.showDensity);
  const showProfile = useWorkspaceSetup((setup) => setup.showProfile);
  const floor = useWorkspaceSetup((setup) => setup.density.floor);
  return <span data-testid="overlays">{`${showDensity}/${showProfile}/${floor}`}</span>;
}

function Harness({ from = BASE }: { readonly from?: WorkspaceSetup }): ReactElement {
  const [setup, setSetup] = useState(from);
  return (
    <WorkspaceChromeProvider>
      <WorkspaceSetupProvider
        setup={setup}
        onChange={(patch) => setSetup((current) => ({ ...current, ...patch }))}
      >
        <OverlayTogglesSection />
        <OverlayProbe />
      </WorkspaceSetupProvider>
    </WorkspaceChromeProvider>
  );
}

const chip = (name: string): HTMLElement => screen.getByRole('button', { name });
const sliders = (): HTMLElement | null => screen.queryByTestId('workspace-density-tuning');
const overlays = (): string => screen.getByTestId('overlays').textContent ?? '';

/**
 * THE FAN-OUT SWEEP. Every field of the setup, each changed on its own, against the fields this
 * section is allowed to read. The base has the field ON so the tuning has somewhere to show.
 */
const LIT: WorkspaceSetup = { ...BASE, showDensity: true };

const CHANGES: readonly (readonly [keyof WorkspaceSetup, Partial<WorkspaceSetup>])[] = [
  ['timeframe', { timeframe: '4h' }],
  ['layoutMode', { layoutMode: 'grade' }],
  ['gridCells', { gridCells: ['4h', '1d'] }],
  ['panes', { panes: [] }],
  ['density', { density: { floor: 0.3, gamma: 2 } }],
  ['showDensity', { showDensity: false }],
  ['showProfile', { showProfile: true }],
  ['autoFit', { autoFit: false }],
  ['indicators', { indicators: ['rsi'] }],
  ['seriesStyles', { seriesStyles: { price: 'line' } }],
];

const READ: readonly (keyof WorkspaceSetup)[] = ['density', 'showDensity', 'showProfile'];

/** The gate next door: no file reads more than four distinct setup fields. */
const FAN_OUT_CEILING = 4;

const markupOf = (setup: WorkspaceSetup): string => {
  const { container, unmount } = render(<Harness from={setup} />);
  const html = container.innerHTML;
  unmount();
  return html;
};

describe('the overlay toggles section', () => {
  it('reflects each field’s state on its own chip', () => {
    render(<Harness from={{ ...BASE, showProfile: true }} />);
    expect(chip('Liquidation heatmap')).toHaveAttribute('aria-pressed', 'false');
    expect(chip('Profile')).toHaveAttribute('aria-pressed', 'true');
  });

  it('TURNS the heatmap on, and the drawing side sees it', () => {
    render(<Harness />);
    expect(overlays()).toBe('false/false/0.1');
    fireEvent.click(chip('Liquidation heatmap'));
    expect(overlays()).toBe('true/false/0.1');
    expect(chip('Liquidation heatmap')).toHaveAttribute('aria-pressed', 'true');
  });

  it('turns the heatmap off again, leaving the other field alone', () => {
    render(<Harness from={{ ...BASE, showDensity: true, showProfile: true }} />);
    fireEvent.click(chip('Liquidation heatmap'));
    expect(overlays()).toBe('false/true/0.1');
  });

  it('toggles the profile without touching the heatmap', () => {
    render(<Harness from={{ ...BASE, showDensity: true }} />);
    fireEvent.click(chip('Profile'));
    expect(overlays()).toBe('true/true/0.1');
    expect(chip('Profile')).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the sliders out while the field is off, and brings them in when it is on', () => {
    render(<Harness />);
    expect(sliders()).toBeNull();
    fireEvent.click(chip('Liquidation heatmap'));
    expect(sliders()).not.toBeNull();
    fireEvent.click(chip('Liquidation heatmap'));
    expect(sliders()).toBeNull();
  });

  it('writes the tuning back when a slider moves', () => {
    render(<Harness from={LIT} />);
    fireEvent.change(screen.getByTestId('workspace-density-floor'), { target: { value: '0.25' } });
    expect(overlays()).toBe('true/false/0.25');
  });

  it('reads THREE fields of the setup, one under the ceiling of four', () => {
    expect(READ).toHaveLength(3);
    expect(READ.length).toBeLessThan(FAN_OUT_CEILING);
    // The sweep has to cover the whole setup, or a field added later would go unmeasured here.
    expect(CHANGES.map(([field]) => field).sort()).toEqual(
      (Object.keys(LIT) as (keyof WorkspaceSetup)[]).sort(),
    );

    const base = markupOf(LIT);
    for (const [field, patch] of CHANGES) {
      const changed = markupOf({ ...LIT, ...patch });
      // Named pairs, so a failure says WHICH field crossed the line rather than "false !== true".
      expect([field, changed !== base]).toEqual([field, READ.includes(field)]);
    }
  });

  it('is a section body: it takes NO props, and renders as one', () => {
    const section: WorkspaceSection = {
      id: 'overlays',
      label: 'Overlays',
      count: 1,
      Body: OverlayTogglesSection,
    };
    render(
      <WorkspaceChromeProvider>
        <WorkspaceSetupProvider setup={BASE}>
          <section.Body />
        </WorkspaceSetupProvider>
      </WorkspaceChromeProvider>,
    );
    expect(chip('Profile')).toBeInTheDocument();
  });
});
