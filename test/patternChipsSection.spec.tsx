/**
 * @jest-environment jsdom
 *
 * The candle-pattern chips, and the two things that make the active set SESSION state.
 *
 * NOTHING HERE MOUNTS A SETUP PROVIDER. That is the assertion, not an omission: a section reading
 * even one field of the tab would throw on the first render, so every test below is also a proof
 * that this one reads none.
 */
import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import type { WorkspaceSection } from '../src/react/chrome/ChromeContext';
import {
  CandlePatternsProvider,
  PatternChipsSection,
} from '../src/react/workspace/PatternChipsSection';
import type { CandlePatternChoice } from '../src/react/workspace/PatternChipsSection';

const PATTERNS: readonly CandlePatternChoice[] = [
  { id: 'hammer', label: 'Ham', name: 'Hammer' },
  { id: 'doji', label: 'Doji' },
  { id: 'engulfing', label: 'Eng', name: 'Bullish engulfing' },
];

interface HarnessProps {
  /** What a tab switch does to the panel that holds this section: it rebuilds it. */
  readonly tab?: string;
  readonly patterns?: readonly CandlePatternChoice[];
  readonly onActiveChange?: (active: readonly string[]) => void;
}

function Harness({ tab = 'alpha', patterns = PATTERNS, onActiveChange }: HarnessProps): ReactElement {
  return (
    <WorkspaceChromeProvider>
      <CandlePatternsProvider patterns={patterns} onActiveChange={onActiveChange}>
        <PatternChipsSection key={tab} />
      </CandlePatternsProvider>
    </WorkspaceChromeProvider>
  );
}

const chip = (name: string): HTMLElement => screen.getByRole('button', { name });
const pressed = (): string[] =>
  screen
    .getAllByRole('button')
    .filter((node) => node.getAttribute('aria-pressed') === 'true')
    .map((node) => node.textContent ?? '');

describe('the pattern chips section', () => {
  it('shows one chip per pattern the host declared, in the declared order', () => {
    render(<Harness />);
    expect(
      screen.getAllByRole('button').map((node) => node.textContent),
    ).toEqual(['Ham', 'Doji', 'Eng']);
  });

  it('renders an empty group when the host declared no patterns', () => {
    render(<Harness patterns={[]} />);
    expect(screen.getByRole('group', { name: 'Candle patterns' })).toBeEmptyDOMElement();
  });

  it('names a chip by its full name, and by its face when there is no other name', () => {
    render(<Harness />);
    expect(chip('Hammer')).toHaveTextContent('Ham');
    expect(chip('Doji')).toBeInTheDocument();
  });

  it('TOGGLES a chip on and off again, one chip at a time', () => {
    render(<Harness />);
    expect(pressed()).toEqual([]);
    fireEvent.click(chip('Hammer'));
    expect(pressed()).toEqual(['Ham']);
    fireEvent.click(chip('Doji'));
    expect(pressed()).toEqual(['Ham', 'Doji']);
    fireEvent.click(chip('Hammer'));
    expect(pressed()).toEqual(['Doji']);
  });

  it('reports the active set to the host, and reports it empty on mount', () => {
    const seen: string[][] = [];
    render(<Harness onActiveChange={(active) => seen.push([...active])} />);
    // The mount report is what keeps the drawing side from holding somebody else's marks.
    expect(seen).toEqual([[]]);
    fireEvent.click(chip('Doji'));
    expect(seen).toEqual([[], ['doji']]);
  });

  it('does NOT survive a tab switch, and does not come back on the return', () => {
    const seen: string[][] = [];
    const record = (active: readonly string[]): void => {
      seen.push([...active]);
    };
    const { rerender } = render(<Harness tab="alpha" onActiveChange={record} />);
    fireEvent.click(chip('Hammer'));
    expect(pressed()).toEqual(['Ham']);

    rerender(<Harness tab="beta" onActiveChange={record} />);
    expect(pressed()).toEqual([]);

    // The return is the discriminating half: a set kept per tab — in the setup, or in a module-scope
    // cache — would come back here, and a test that only switched away could not tell the two apart.
    rerender(<Harness tab="alpha" onActiveChange={record} />);
    expect(pressed()).toEqual([]);
    expect(seen).toEqual([[], ['hammer'], [], []]);
  });

  it('is a section body: it takes NO props, and renders as one', () => {
    const section: WorkspaceSection = {
      id: 'patterns',
      label: 'Patterns',
      count: 0,
      Body: PatternChipsSection,
    };
    render(
      <WorkspaceChromeProvider>
        <CandlePatternsProvider patterns={PATTERNS}>
          <section.Body />
        </CandlePatternsProvider>
      </WorkspaceChromeProvider>,
    );
    expect(chip('Hammer')).toBeInTheDocument();
  });
});
