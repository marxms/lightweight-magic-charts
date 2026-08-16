/**
 * @jest-environment jsdom
 *
 * The interval chips, painted by the library and traversed by the keyboard.
 */
import { fireEvent, render, screen } from '@testing-library/react';

import { TimeframeChips } from '../src/react/TimeframeChips';
import { DEFAULT_WORKSPACE_THEME } from '../src/react/theme';

const OPTIONS = ['5m', '15m', '30m', '2h', '4h'];

const chips = (): HTMLButtonElement[] =>
  Array.from(screen.getByRole('group', { name: 'Timeframe' }).querySelectorAll('button'));

describe('the interval chips', () => {
  it('shows the interval on the face and lets the host name it for the reader', () => {
    render(
      <TimeframeChips
        options={OPTIONS}
        active="2h"
        onChange={() => undefined}
        describe={(timeframe) => `${timeframe} · janela`}
      />,
    );
    expect(screen.getByRole('button', { name: '2h · janela' })).toHaveTextContent('2h');
    // Without a describer the name is the face, and the two cannot diverge.
    expect(screen.queryByRole('button', { name: '2h' })).toBeNull();
  });

  it('marks the active chip as pressed and nothing else', () => {
    render(<TimeframeChips options={OPTIONS} active="2h" onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: '2h' })).toHaveAttribute('aria-pressed', 'true');
    expect(chips().filter((chip) => chip.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });

  it('carries exactly one tab stop, and it is the active chip', () => {
    render(<TimeframeChips options={OPTIONS} active="2h" onChange={() => undefined} />);
    expect(chips().filter((chip) => chip.tabIndex === 0)).toHaveLength(1);
    expect(chips().find((chip) => chip.tabIndex === 0)).toHaveTextContent('2h');
  });

  it('gives the tab stop to the first chip when nothing served is active', () => {
    render(<TimeframeChips options={OPTIONS} active="1w" onChange={() => undefined} />);
    // A group with no tab stop is a group the keyboard cannot enter at all.
    expect(chips().filter((chip) => chip.tabIndex === 0)).toHaveLength(1);
    expect(chips()[0].tabIndex).toBe(0);
  });

  it('answers the arrows, Home and End, and wraps at both ends', () => {
    render(<TimeframeChips options={OPTIONS} active="5m" onChange={() => undefined} />);
    const group = screen.getByRole('group', { name: 'Timeframe' });
    chips()[0].focus();

    fireEvent.keyDown(group, { key: 'ArrowRight' });
    expect(document.activeElement).toHaveTextContent('15m');
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(document.activeElement).toHaveTextContent('5m');
    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    expect(document.activeElement).toHaveTextContent('4h');
    fireEvent.keyDown(group, { key: 'Home' });
    expect(document.activeElement).toHaveTextContent('5m');
    fireEvent.keyDown(group, { key: 'End' });
    expect(document.activeElement).toHaveTextContent('4h');
  });

  it('leaves a key that is not a traversal alone, so the host keeps Tab and its shortcuts', () => {
    render(<TimeframeChips options={OPTIONS} active="5m" onChange={() => undefined} />);
    const group = screen.getByRole('group', { name: 'Timeframe' });
    chips()[0].focus();
    const handled = fireEvent.keyDown(group, { key: 'Tab' });
    expect(handled).toBe(true);
    expect(document.activeElement).toHaveTextContent('5m');
  });

  it('reports the chosen interval', () => {
    const heard: string[] = [];
    render(<TimeframeChips options={OPTIONS} active="2h" onChange={(tf) => heard.push(tf)} />);
    fireEvent.click(screen.getByRole('button', { name: '30m' }));
    expect(heard).toEqual(['30m']);
  });

  it('paints from theme tokens only — no class name reaches the DOM', () => {
    render(<TimeframeChips options={OPTIONS} active="2h" onChange={() => undefined} />);
    const group = screen.getByRole('group', { name: 'Timeframe' });
    expect(group.className).toBe('');
    for (const chip of chips()) expect(chip.className).toBe('');
    expect(group).toHaveStyle({ fontFamily: DEFAULT_WORKSPACE_THEME.fontFamily });
  });
});
