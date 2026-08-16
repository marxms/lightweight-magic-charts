/**
 * @jest-environment jsdom
 *
 * The studies menu region. Every operation is asserted through the PANEL — what the region shows
 * after the host applied the change — and the last clause is the one a rewrite forgets: the pointer
 * leaving does not close a menu whose slider is mid-drag.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import type { WorkspaceSection } from '../src/react/chrome/ChromeContext';
import { HOVER_CLOSE_DELAY_MS } from '../src/react/hoverIntent';
import type { SeriesProvider } from '../src/extension/plugins';
import type { SeriesCatalogueEntry } from '../src/react/SeriesMenu';
import { SeriesMenuRegion } from '../src/react/workspace/SeriesMenuRegion';
import type { ResolvedSourceView } from '../src/indicator/resolution';

const provider = (id: string): SeriesProvider =>
  ({ id, compute: () => [] }) as unknown as SeriesProvider;

const CATALOGUE: readonly SeriesCatalogueEntry[] = [
  { provider: provider('alpha'), label: 'Alpha', category: 'Trend' },
  { provider: provider('beta'), label: 'Beta', category: 'Trend' },
  { provider: provider('gamma'), label: 'Gamma', category: 'Volume' },
];

const LOOKUP: Readonly<Record<string, string>> = { alpha: 'Alpha', beta: 'Beta', gamma: 'Gamma' };

/** A resolved view carries what a panel shows; the host is what produced it. */
function viewOf(id: string, lane: number): ResolvedSourceView {
  return {
    id,
    lane,
    paneId: `lane-${lane}`,
    label: LOOKUP[id] ?? null,
    overlay: false,
    drawn: 2,
    truncated: 0,
    availability: 'ok',
    warmUpBars: 0,
    windowBars: 0,
  };
}

/** A host section carrying a real slider — the shape that made the drag refusal necessary. */
function SliderBody(): ReactElement {
  return <input type="range" aria-label="Density floor" data-testid="host-slider" />;
}

const SECTIONS: readonly WorkspaceSection[] = [
  { id: 'overlays', label: 'Overlays', count: 1, Body: SliderBody },
];

interface HarnessProps {
  readonly start?: readonly string[];
  readonly sections?: readonly WorkspaceSection[];
}

/** The host owns the list; the region reports intent and shows whatever comes back. */
function Harness({ start = ['alpha'], sections }: HarnessProps): ReactElement {
  const [active, setActive] = useState<readonly string[]>(start);
  const move = (id: string, direction: -1 | 1): void =>
    setActive((current) => {
      const from = current.indexOf(id);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= current.length) return current;
      const next = [...current];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });
  return (
    <WorkspaceChromeProvider sections={sections}>
      <SeriesMenuRegion
        catalogue={CATALOGUE}
        indicators={{
          views: active.map(viewOf),
          capacity: 4,
          onRemove: (id) => setActive((current) => current.filter((entry) => entry !== id)),
          onMove: move,
        }}
        onSelect={(entry) => {
          const id = String(entry.provider.id);
          setActive((current) => (current.includes(id) ? current : [...current, id]));
        }}
      />
    </WorkspaceChromeProvider>
  );
}

/** Views handed in already resolved, for the states a healthy list never reaches. */
function NotesHarness({ views }: { readonly views: readonly ResolvedSourceView[] }): ReactElement {
  return (
    <WorkspaceChromeProvider>
      <SeriesMenuRegion
        catalogue={CATALOGUE}
        indicators={{ views, capacity: 4, onRemove: () => undefined, onMove: () => undefined }}
        onSelect={() => undefined}
      />
    </WorkspaceChromeProvider>
  );
}

const trigger = (): HTMLElement => screen.getByRole('button', { name: 'Studies' });
const overlay = (): HTMLElement | null => screen.queryByTestId('workspace-series-menu');
const panel = (): HTMLElement => screen.getByRole('group', { name: /Active studies/ });
const chosen = (): string[] =>
  Array.from(panel().children)
    .filter((node) => node.getAttribute('data-testid')?.startsWith('workspace-active-') === true)
    .map((node) => node.firstElementChild?.textContent ?? '');

describe('the studies menu region', () => {
  it('opens on the trigger and closes on it again', () => {
    render(<Harness />);
    expect(overlay()).toBeNull();
    expect(trigger()).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(trigger());
    expect(overlay()).not.toBeNull();
    expect(trigger()).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(trigger());
    expect(overlay()).toBeNull();
  });

  it('closes from the menu’s own close control', () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByTestId('workspace-catalogue-close'));
    expect(overlay()).toBeNull();
  });

  it('shows what is already chosen, and says how many against the ceiling', () => {
    render(<Harness start={['alpha', 'gamma']} />);
    fireEvent.click(trigger());
    expect(chosen()).toEqual(['Alpha', 'Gamma']);
    expect(panel()).toHaveAccessibleName('Active studies 2/4');
  });

  it('reflects a CHOICE from the catalogue in the panel above it', () => {
    render(<Harness start={[]} />);
    fireEvent.click(trigger());
    expect(screen.getByText('Nothing chosen — pick one below to draw it.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('workspace-catalogue-entry-beta'));
    expect(chosen()).toEqual(['Beta']);
  });

  it('reflects a REMOVAL in the panel', () => {
    render(<Harness start={['alpha', 'beta']} />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alpha' }));
    expect(chosen()).toEqual(['Beta']);
  });

  it('reflects a MOVE in the panel, and the ends have nowhere to go', () => {
    render(<Harness start={['alpha', 'beta', 'gamma']} />);
    fireEvent.click(trigger());
    expect(screen.getByRole('button', { name: 'Move Alpha up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Gamma down' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move Beta up' }));
    expect(chosen()).toEqual(['Beta', 'Alpha', 'Gamma']);
    fireEvent.click(screen.getByRole('button', { name: 'Move Beta down' }));
    expect(chosen()).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('reports what a source did not draw instead of leaving it looking broken', () => {
    render(
      <NotesHarness
        views={[
          viewOf('alpha', 0),
          { ...viewOf('beta', 1), availability: 'warmup', warmUpBars: 724, windowBars: 800 },
          { ...viewOf('gamma', 2), drawn: 4, truncated: 3 },
        ]}
      />,
    );
    fireEvent.click(trigger());
    // A healthy source says nothing: a note on everything is a note nobody reads.
    expect(screen.queryByText('no data in this window')).toBeNull();
    expect(screen.getByText('warms up after 724 of 800 bars')).toBeInTheDocument();
    expect(screen.getByText('4 of 7 lines')).toBeInTheDocument();
  });
});

describe('the pointer leaving the menu', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('closes it once the pointer is gone and the delay has run out', () => {
    render(<Harness sections={SECTIONS} />);
    fireEvent.click(trigger());
    fireEvent.mouseLeave(overlay() as HTMLElement);
    act(() => {
      jest.advanceTimersByTime(HOVER_CLOSE_DELAY_MS);
    });
    expect(overlay()).toBeNull();
  });

  it('does NOT close it while a slider that started inside is being dragged', () => {
    render(<Harness sections={SECTIONS} />);
    fireEvent.click(trigger());
    const slider = screen.getByTestId('host-slider');

    // The real sequence: press ON the slider, drag the pointer out of the box, release outside. The
    // press is what marks the drag, and it is dispatched on the slider itself because several
    // sliders stop propagation on mousedown — a bubbling listener would never see it.
    fireEvent.mouseDown(slider);
    fireEvent.mouseLeave(overlay() as HTMLElement);
    act(() => {
      jest.advanceTimersByTime(HOVER_CLOSE_DELAY_MS * 2);
    });
    expect(overlay()).not.toBeNull();

    // And it is not stuck open either: releasing ends the drag, and the next leave closes it.
    fireEvent.mouseUp(window);
    fireEvent.mouseLeave(overlay() as HTMLElement);
    act(() => {
      jest.advanceTimersByTime(HOVER_CLOSE_DELAY_MS);
    });
    expect(overlay()).toBeNull();
  });

  it('does not close it while the keyboard is inside', () => {
    render(<Harness sections={SECTIONS} />);
    fireEvent.click(trigger());
    screen.getByTestId('host-slider').focus();
    fireEvent.mouseLeave(overlay() as HTMLElement);
    act(() => {
      jest.advanceTimersByTime(HOVER_CLOSE_DELAY_MS);
    });
    expect(overlay()).not.toBeNull();
  });
});
