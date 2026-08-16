/**
 * @jest-environment jsdom
 *
 * The footer, and the one property that makes it a footer rather than a second canvas: it COMPUTES
 * NOTHING.
 *
 * Every reading below is impossible to derive from what the footer can see — a pane nothing declares,
 * a ratio no layout would produce, a report no builder would phrase. A footer that recomputed any of
 * them would disagree with what it was handed, and disagreeing is what these cases look for. Feeding
 * plausible values instead would let a recomputing footer pass by coincidence.
 */
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ReactElement } from 'react';

import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import type { StatusFooterLabels } from '../src/react/chrome/labels';
import { StatusFooter } from '../src/react/workspace/StatusFooter';
import type { StatusReading } from '../src/react/workspace/StatusFooter';

/** Host wording, none of it a package default: a footer with its own copy shows the wrong face. */
const LABELS: StatusFooterLabels = {
  loading: 'Fetching… ',
  shrunk: (percent) => ` · panes squeezed to ${percent}%`,
  evicted: (panes) => ` · panes dropped for lack of room: ${panes.join(', ')}`,
  alerts: (names) => ` · alert tripped: ${names.join(', ')}`,
};

interface HarnessProps {
  readonly state?: string;
  readonly loading?: boolean;
  readonly reading?: StatusReading;
  readonly labels?: StatusFooterLabels;
}

function Harness({
  state = 'BTC/USDT · 1h · 2 visible panes: Price, Volume',
  loading,
  reading,
  labels = LABELS,
}: HarnessProps): ReactElement {
  return (
    // The wording arrives on the CHROME channel, which is the only door into it: a footer that took
    // its own `labels` prop would be a second place a host has to remember to translate.
    <WorkspaceChromeProvider labels={{ status: labels }}>
      <StatusFooter id="state" state={state} loading={loading} reading={reading} />
    </WorkspaceChromeProvider>
  );
}

const said = (): string => screen.getByTestId('workspace-state').textContent ?? '';
const reported = (): string => screen.getByTestId('workspace-report').textContent ?? '';

describe('the status footer', () => {
  it('says what it was handed, and nothing it was not', () => {
    render(<Harness />);
    expect(said()).toBe('BTC/USDT · 1h · 2 visible panes: Price, Volume');
    expect(reported()).toBe('');
  });

  it('repeats a pane scale no layout of these panes would ever produce', () => {
    // 0.37 against a state that claims two visible panes: derived, it would be 1.
    render(<Harness reading={{ paneScale: 0.37 }} />);
    expect(said()).toContain(' · panes squeezed to 37%');
  });

  it('stays silent about shrinking when the panes are at target', () => {
    render(<Harness reading={{ paneScale: 1 }} />);
    expect(said()).not.toContain('squeezed');
  });

  it('names evicted panes that appear nowhere in what it is drawing', () => {
    // Neither name is in the state sentence: a footer reading the sentence could not produce them.
    render(<Harness reading={{ evicted: ['Ghost flow', 'Nonexistent pane'] }} />);
    expect(said()).toContain(' · panes dropped for lack of room: Ghost flow, Nonexistent pane');
  });

  it('names fired alerts it has no price and no level to derive them from', () => {
    render(<Harness reading={{ firedAlerts: ['999999.99'] }} />);
    expect(said()).toContain(' · alert tripped: 999999.99');
  });

  it('prints the coverage report exactly as it arrived, phrased by somebody else', () => {
    render(<Harness reading={{ report: 'coverage: 3/4 · density unavailable' }} />);
    expect(reported()).toBe('coverage: 3/4 · density unavailable');
  });

  it('reports a wrong coverage line WHILE the canvas description is right', () => {
    // This is what separates a footer failure from a canvas failure: the two are independent, and
    // only one of them is this region's.
    render(
      <Harness
        state="BTC/USDT · 1h · 2 visible panes: Price, Volume"
        reading={{ report: 'nothing loaded' }}
      />,
    );
    expect(said()).toBe('BTC/USDT · 1h · 2 visible panes: Price, Volume');
    expect(reported()).toBe('nothing loaded');
  });

  it('prefixes the loading word only while loading', () => {
    const view = render(<Harness loading />);
    expect(said()).toContain('Fetching… ');
    view.rerender(<Harness loading={false} />);
    expect(said()).not.toContain('Fetching');
  });

  it('keeps the report OUT of the live region, which holds no per-tick reading', () => {
    render(<Harness reading={{ report: 'coverage: 3/4' }} />);
    const live = screen.getByTestId('workspace-state');
    expect(live).toHaveAttribute('role', 'status');
    expect(live.textContent).not.toContain('coverage');
    expect(screen.getByTestId('workspace-report')).not.toHaveAttribute('role');
    // Exactly one live region in the footer: a second would double every announcement.
    expect(screen.getByTestId('workspace-footer').querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it('answers to the id the canvas describes itself by', () => {
    render(<Harness />);
    expect(screen.getByTestId('workspace-state')).toHaveAttribute('id', 'state');
  });

  it('leaves the aggregate report out of the per-series legend model', () => {
    // Neighbours by accident: a legend line is per series, this report is per workspace, and fusing
    // them would tax the composed surface's remaining budget for a gain that is only the footer's.
    const legend = readFileSync(
      join(__dirname, '..', 'src', 'layout', 'legendModel.ts'),
      'utf8',
    );
    expect(legend).not.toContain('WorkspaceReport');
    expect(legend).not.toContain('buildWorkspaceReport');
    expect(legend).not.toContain('formatWorkspaceReport');
    // POSITIVE CONTROL: the report really does live somewhere, and that somewhere is not here.
    const coverage = readFileSync(
      join(__dirname, '..', 'src', 'indicator', 'coverage.ts'),
      'utf8',
    );
    expect(coverage).toContain('export function formatWorkspaceReport');
  });
});
