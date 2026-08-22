/**
 * @jest-environment jsdom
 *
 * The column stack, pinned as the browser reads it.
 *
 * Six declarations repeated `display: 'flex', flexDirection: 'column'`, and collapsing them into
 * one shared value is only safe if the SERIALISED declaration is unchanged — React writes inline
 * styles in insertion order, so a shared value spread at the wrong position repaints the same
 * pixels through a different `style` attribute. Same reasoning as `rowDeclaration.spec.tsx` and
 * `seriesMenuRailStyle.spec.tsx`; every string below was captured from the tree BEFORE the collapse.
 *
 * THE PRIMITIVE IS THE ONE THAT CAN LOSE MORE THAN AN ATTRIBUTE. `Column` ends its declaration with
 * the caller's own `...style`, so the shared value has to stay in FRONT of it: spread last, it would
 * silently overrule every caller that ever laid a column out sideways. That clause is asserted with
 * a caller that does exactly that, because an order pin alone would pass either way.
 *
 * The three declarations that need a heavy harness are pinned where that harness already lives:
 * `compactCell.spec.tsx`, `compactGrid.spec.tsx` and `chartWorkspace.spec.tsx`.
 */
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';

import type { SeriesProvider } from '../src/extension/plugins';
import { SeriesMenu } from '../src/react/SeriesMenu';
import type { SeriesCatalogueEntry } from '../src/react/SeriesMenu';
import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import type { WorkspaceSection } from '../src/react/chrome/ChromeContext';
import { Column } from '../src/react/chrome/primitives';
import { PaneListSection } from '../src/react/workspace/PaneListSection';
import { WorkspaceSetupProvider } from '../src/react/workspace/setupContext';
import type { WorkspaceSetup } from '../src/tabs/setup';

const styleOf = (element: Element | null | undefined): string =>
  element?.getAttribute('style') ?? '';

/** The two properties the shared value is answerable for, in the order every site declared them. */
const LEAD = 'display: flex; flex-direction: column;';

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

describe('the column stack, serialised as it was before the collapse', () => {
  it('leads the studies menu’s panel', () => {
    render(
      <WorkspaceChromeProvider sections={SECTIONS}>
        <SeriesMenu catalogue={CATALOGUE} sections={SECTIONS} onSelect={() => undefined} />
      </WorkspaceChromeProvider>,
    );
    expect(styleOf(screen.getByTestId('series-menu'))).toBe(
      'display: flex; flex-direction: column; background: rgb(11, 14, 19);' +
        ' color: rgb(184, 188, 196); font-family: Inter, system-ui, sans-serif;' +
        ' border: 1px solid rgba(255,255,255,0.14); max-height: 420px;',
    );
  });

  it('follows the stripped-set declaration in the pane list', () => {
    render(
      <WorkspaceChromeProvider sections={SECTIONS}>
        <WorkspaceSetupProvider setup={SETUP} onChange={() => undefined}>
          <PaneListSection />
        </WorkspaceSetupProvider>
      </WorkspaceChromeProvider>,
    );
    expect(styleOf(screen.getByTestId('workspace-panes'))).toBe(
      'margin: 0px; padding: 0px; display: flex; flex-direction: column;' +
        ' color: rgb(184, 188, 196); font-family: Inter, system-ui, sans-serif; font-size: 11px;',
    );
  });

  it('leads the Column primitive, with and without the two optional properties', () => {
    render(
      <>
        <Column gap={4} align="center" testId="dressed">
          <span>x</span>
        </Column>
        <Column testId="bare" />
      </>,
    );
    expect(styleOf(screen.getByTestId('dressed'))).toBe(
      'display: flex; flex-direction: column; gap: 4px; align-items: center;',
    );
    expect(styleOf(screen.getByTestId('bare'))).toBe('display: flex; flex-direction: column;');
  });

  it('leaves the Column primitive’s caller able to overrule the direction', () => {
    // THE CLAUSE AN ORDER PIN CANNOT STATE. `Column` ends with the caller's own `...style`, so a
    // shared value spread LAST would win over every caller and the override below would vanish —
    // and the two pins above would still be green, because neither of them passes a `style`.
    render(<Column testId="sideways" style={{ flexDirection: 'row' }} />);
    expect(styleOf(screen.getByTestId('sideways'))).toBe('display: flex; flex-direction: row;');
  });

  it('opens the light declarations with the same two properties, in the same order', () => {
    render(
      <WorkspaceChromeProvider sections={SECTIONS}>
        <SeriesMenu catalogue={CATALOGUE} sections={SECTIONS} onSelect={() => undefined} />
      </WorkspaceChromeProvider>,
    );
    expect(styleOf(screen.getByTestId('series-menu')).startsWith(LEAD)).toBe(true);
  });
});
