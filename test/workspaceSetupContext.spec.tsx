/**
 * @jest-environment jsdom
 *
 * The write-once half of the setup context: a second write reaches only the consumers whose own
 * selection changed. Render counts, not assertions about the value, are what can tell the two apart.
 */
import { memo, useRef } from 'react';
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';

import {
  WorkspaceSetupProvider,
  useWorkspaceSetup,
  useWorkspaceSetupWriter,
} from '../src/react/workspace/setupContext';
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

/** Memoized on purpose: without it every child re-renders through the parent cascade. */
const TimeframeProbe = memo(function TimeframeProbe(): ReactElement {
  const timeframe = useWorkspaceSetup((setup) => setup.timeframe);
  const renders = useRef(0);
  renders.current += 1;
  return <span data-testid="timeframe">{`${timeframe as string}/${renders.current}`}</span>;
});

const AutoFitProbe = memo(function AutoFitProbe(): ReactElement {
  const autoFit = useWorkspaceSetup((setup) => setup.autoFit);
  const renders = useRef(0);
  renders.current += 1;
  return <span data-testid="autofit">{`${String(autoFit)}/${renders.current}`}</span>;
});

function Harness({ setup }: { readonly setup: WorkspaceSetup }): ReactElement {
  return (
    <WorkspaceSetupProvider setup={setup}>
      <TimeframeProbe />
      <AutoFitProbe />
    </WorkspaceSetupProvider>
  );
}

describe('the workspace setup context', () => {
  it('serves the selected field to a consumer under the provider', () => {
    render(<Harness setup={BASE} />);
    expect(screen.getByTestId('timeframe')).toHaveTextContent('1h/1');
    expect(screen.getByTestId('autofit')).toHaveTextContent('true/1');
  });

  it('re-renders the consumer whose field changed and NOT the one reading another field', () => {
    const { rerender } = render(<Harness setup={BASE} />);
    expect(screen.getByTestId('timeframe')).toHaveTextContent('1h/1');
    expect(screen.getByTestId('autofit')).toHaveTextContent('true/1');

    rerender(<Harness setup={{ ...BASE, timeframe: '4h' }} />);

    // The changed field reaches its reader — so the notification path is live, and the count below
    // is a bailout rather than a subscription that never fired.
    expect(screen.getByTestId('timeframe')).toHaveTextContent('4h/2');
    expect(screen.getByTestId('autofit')).toHaveTextContent('true/1');
  });

  it('leaves both consumers untouched when the setup is written again with equal fields', () => {
    const { rerender } = render(<Harness setup={BASE} />);
    rerender(<Harness setup={{ ...BASE }} />);
    expect(screen.getByTestId('timeframe')).toHaveTextContent('1h/1');
    expect(screen.getByTestId('autofit')).toHaveTextContent('true/1');
  });

  it('throws outside the provider instead of serving a filled default', () => {
    function Orphan(): ReactElement {
      const timeframe = useWorkspaceSetup((setup) => setup.timeframe);
      return <span>{timeframe as string}</span>;
    }
    const noise = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Orphan />)).toThrow(/outside WorkspaceSetupProvider/);
    noise.mockRestore();
  });
});

/**
 * The write door. That a patch REACHES the host is proved end to end by the section that uses it —
 * `paneListSection.spec.tsx`, where a switch changes what a second reader draws — so what is left
 * here are the two mountings where a write has nowhere to go.
 */
describe('the setup context write door', () => {
  let write: ((patch: Partial<WorkspaceSetup>) => void) | null = null;

  function WriterProbe(): ReactElement {
    write = useWorkspaceSetupWriter();
    return <span data-testid="writer" />;
  }

  it('throws when the provider was mounted read-only, instead of writing nowhere', () => {
    render(
      <WorkspaceSetupProvider setup={BASE}>
        <WriterProbe />
      </WorkspaceSetupProvider>,
    );
    // Silence here is indistinguishable from a control that is simply broken.
    expect(() => write?.({ timeframe: '4h' })).toThrow(/mounted without onChange/);
  });

  it('throws outside the provider, like the reader beside it', () => {
    const noise = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<WriterProbe />)).toThrow(/outside WorkspaceSetupProvider/);
    noise.mockRestore();
  });
});
