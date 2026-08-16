/**
 * @jest-environment jsdom
 *
 * The style picker, and the arrow traversal this radio group never had.
 *
 * The keyboard clauses below are the ones the discrimination run removes the traversal against:
 * with the handler gone they fail, and with it back they pass.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import { StylePickerRegion } from '../src/react/workspace/StylePickerRegion';
import type { SeriesStyleChoice } from '../src/react/workspace/StylePickerRegion';
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

const CHOICES: readonly SeriesStyleChoice[] = [
  { key: 'lane-1::fast', label: 'Fast', color: '#4af', declared: 'line' },
  { key: 'lane-1::slow', label: 'Slow', color: '#fa4', declared: 'histogram' },
];

interface HarnessProps {
  readonly from?: WorkspaceSetup;
  readonly shapes?: readonly string[];
}

function Harness({ from = BASE, shapes }: HarnessProps): ReactElement {
  const [setup, setSetup] = useState(from);
  return (
    <WorkspaceChromeProvider>
      <WorkspaceSetupProvider setup={setup}>
        <StylePickerRegion
          choices={CHOICES}
          shapes={shapes}
          onChange={(key, shape) =>
            setSetup((current) => ({
              ...current,
              seriesStyles: { ...current.seriesStyles, [key]: shape },
            }))
          }
        />
      </WorkspaceSetupProvider>
    </WorkspaceChromeProvider>
  );
}

const trigger = (): HTMLElement => screen.getByRole('button', { name: 'Series style' });
const panel = (): HTMLElement | null => screen.queryByTestId('workspace-style-picker');
const groupOf = (series: string): HTMLElement =>
  screen.getByRole('radiogroup', { name: `Style of ${series}` });
const radiosOf = (series: string): HTMLButtonElement[] =>
  Array.from(groupOf(series).querySelectorAll('button'));
const checkedOf = (series: string): string[] =>
  radiosOf(series)
    .filter((radio) => radio.getAttribute('aria-checked') === 'true')
    .map((radio) => radio.getAttribute('aria-label') ?? '');

describe('the style picker', () => {
  it('opens on the trigger and closes on it again', () => {
    render(<Harness />);
    expect(panel()).toBeNull();
    fireEvent.click(trigger());
    expect(panel()).not.toBeNull();
    expect(trigger()).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(trigger());
    expect(panel()).toBeNull();
  });

  it('names each group after its own series, so two groups never sound alike', () => {
    render(<Harness />);
    fireEvent.click(trigger());
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2);
    expect(groupOf('Fast')).toBeInTheDocument();
    expect(groupOf('Slow')).toBeInTheDocument();
  });

  it('reflects the series’ OWN declaration while the setup holds no preference', () => {
    render(<Harness />);
    fireEvent.click(trigger());
    expect(checkedOf('Fast')).toEqual(['Draw Fast as line']);
    expect(checkedOf('Slow')).toEqual(['Draw Slow as histogram']);
  });

  it('reflects the setup over the declaration once someone has chosen', () => {
    render(<Harness from={{ ...BASE, seriesStyles: { 'lane-1::fast': 'histogram' } }} />);
    fireEvent.click(trigger());
    expect(checkedOf('Fast')).toEqual(['Draw Fast as histogram']);
    // The other series is untouched: a choice is per series, not per picker.
    expect(checkedOf('Slow')).toEqual(['Draw Slow as histogram']);
  });

  it('SETS the shape, and exactly one member of the group stays checked', () => {
    render(<Harness />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('radio', { name: 'Draw Fast as histogram' }));
    expect(checkedOf('Fast')).toEqual(['Draw Fast as histogram']);
    expect(checkedOf('Slow')).toEqual(['Draw Slow as histogram']);
  });

  it('carries exactly one tab stop per group, and it is the checked member', () => {
    render(<Harness />);
    fireEvent.click(trigger());
    for (const series of ['Fast', 'Slow']) {
      const radios = radiosOf(series);
      expect(radios.filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
      expect(radios.filter((radio) => radio.tabIndex === -1)).toHaveLength(radios.length - 1);
      expect(radios.find((radio) => radio.tabIndex === 0)).toHaveAttribute('aria-checked', 'true');
    }
  });

  it('gives the stop to the first member when nothing offered is the current shape', () => {
    // The declared shape is not among the offered ones, so no member is checked — and a group with
    // no tab stop is a group the keyboard cannot enter at all.
    render(<Harness shapes={['area', 'line']} from={{ ...BASE }} />);
    fireEvent.click(trigger());
    const radios = radiosOf('Slow');
    expect(checkedOf('Slow')).toEqual([]);
    expect(radios.filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
    expect(radios[0].tabIndex).toBe(0);
  });

  it('answers the arrows and wraps at both ends', () => {
    render(<Harness />);
    fireEvent.click(trigger());
    const radios = radiosOf('Fast');
    radios[0].focus();

    fireEvent.keyDown(groupOf('Fast'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(radios[1]);
    fireEvent.keyDown(groupOf('Fast'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(radios[0]);
    fireEvent.keyDown(groupOf('Fast'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(radios[1]);
  });

  it('answers Home and End', () => {
    render(<Harness shapes={['line', 'histogram', 'area']} />);
    fireEvent.click(trigger());
    const radios = radiosOf('Fast');
    radios[1].focus();

    fireEvent.keyDown(groupOf('Fast'), { key: 'End' });
    expect(document.activeElement).toBe(radios[2]);
    fireEvent.keyDown(groupOf('Fast'), { key: 'Home' });
    expect(document.activeElement).toBe(radios[0]);
  });

  it('keeps the arrow inside its own group and never crosses into the next series', () => {
    render(<Harness />);
    fireEvent.click(trigger());
    radiosOf('Fast')[1].focus();
    fireEvent.keyDown(groupOf('Fast'), { key: 'ArrowRight' });
    // Wrapped back to the head of THIS group, rather than walking on to Slow.
    expect(document.activeElement).toBe(radiosOf('Fast')[0]);
  });

  it('leaves a key that is not a traversal key alone', () => {
    render(<Harness />);
    fireEvent.click(trigger());
    const radios = radiosOf('Fast');
    radios[0].focus();
    const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    groupOf('Fast').dispatchEvent(event);
    // Not cancelled and no focus moved: a handler that swallowed every key would steal Tab and
    // every shortcut the host owns.
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(radios[0]);
  });
});
