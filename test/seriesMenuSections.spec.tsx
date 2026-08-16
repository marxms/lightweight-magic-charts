/**
 * @jest-environment jsdom
 *
 * One section shape, and it is the component type. The legacy `body: ReactNode` captured a tree, so
 * the descriptor had to be rebuilt on every interaction — and a rebuilt descriptor churns the chrome
 * context, which re-renders every consumer including the ones that never look at sections.
 */
import { memo, useState } from 'react';
import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { SeriesMenu } from '../src/react/SeriesMenu';
import type { SeriesCatalogueEntry } from '../src/react/SeriesMenu';
import { WorkspaceChromeProvider, useWorkspaceChrome } from '../src/react/chrome/ChromeContext';
import type { WorkspaceSection } from '../src/react/chrome/ChromeContext';
import type { SeriesProvider } from '../src/extension/plugins';

const provider = (id: string): SeriesProvider => ({
  id,
  spec: { id, label: id, shape: 'line', color: '#fff' },
  points: () => [],
}) as unknown as SeriesProvider;

const CATALOGUE: readonly SeriesCatalogueEntry[] = [
  { provider: provider('rsi'), label: 'RSI', category: 'Momentum' },
];

let bodyRenders = 0;
/** Hoisted, which is only possible because `Body` is a type and not a captured tree. */
function AuthoredBody(): ReactElement {
  bodyRenders += 1;
  return <span data-testid="section-body">corpo autorais</span>;
}

const STABLE_SECTIONS: readonly WorkspaceSection[] = [
  { id: 'autorais', label: '★ Autorais', count: 2, Body: AuthoredBody },
];

let chromeRenders = 0;
const ChromeConsumer = memo(function ChromeConsumer(): ReactElement {
  const { testIdPrefix } = useWorkspaceChrome();
  chromeRenders += 1;
  return <span data-testid="chrome-consumer">{testIdPrefix}</span>;
});

function Host({ rebuilt }: { readonly rebuilt: boolean }): ReactElement {
  const [tick, setTick] = useState(0);
  // The legacy shape forced this branch: a captured tree cannot be hoisted, so the descriptor is a
  // new object on every render and the context value changes with it.
  const sections: readonly WorkspaceSection[] = rebuilt
    ? [{ id: 'autorais', label: '★ Autorais', count: tick, Body: AuthoredBody }]
    : STABLE_SECTIONS;
  return (
    <>
      <button type="button" onClick={() => setTick((value) => value + 1)}>
        bump
      </button>
      <WorkspaceChromeProvider sections={sections}>
        <ChromeConsumer />
      </WorkspaceChromeProvider>
    </>
  );
}

beforeEach(() => {
  bodyRenders = 0;
  chromeRenders = 0;
});

describe('the section body is a component type', () => {
  it('renders the body inside the tabpanel, mounted rather than embedded as a captured tree', () => {
    render(<SeriesMenu catalogue={CATALOGUE} selected={[]} onSelect={() => undefined} sections={STABLE_SECTIONS} />);
    expect(screen.getByTestId('section-body')).toHaveTextContent('corpo autorais');
    expect(bodyRenders).toBe(1);
  });

  it('leaves the context consumers alone when the descriptor can be hoisted', () => {
    render(<Host rebuilt={false} />);
    expect(chromeRenders).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'bump' }));
    fireEvent.click(screen.getByRole('button', { name: 'bump' }));

    // The churn is gone: two interactions, and the consumer that never looks at sections has not
    // reconciled once.
    expect(chromeRenders).toBe(1);
  });

  it('re-renders every context consumer when the descriptor is rebuilt per interaction', () => {
    // POSITIVE CONTROL — the measurement above is an absence, and an absence measured by a probe
    // that never re-renders would pass with any implementation. This is the legacy behaviour.
    const noise = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    render(<Host rebuilt />);
    expect(chromeRenders).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'bump' }));
    fireEvent.click(screen.getByRole('button', { name: 'bump' }));

    expect(chromeRenders).toBe(3);
    noise.mockRestore();
  });
});
