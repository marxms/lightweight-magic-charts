/**
 * @jest-environment jsdom
 *
 * The library's only error surface — and the only one that may carry a live region.
 *
 * The two halves of the contract balance each other. An error severity that announces politely
 * arrives after what the user has already done; a streaming reading inside a live region interrupts
 * the screen reader on every tick and drowns the queue with numbers nobody asked for. That is why
 * the test covers both ends: the Notice announces with the right insistence, and no other role
 * announces anything at all.
 */
import { fireEvent, render, screen } from '@testing-library/react';

import { IconButton } from '../src/react/chrome/IconButton';
import { Notice } from '../src/react/chrome/Notice';
import { Pill } from '../src/react/chrome/Pill';
import { Text } from '../src/react/chrome/primitives';
import { Toggle } from '../src/react/chrome/Toggle';
import { DEFAULT_WORKSPACE_THEME } from '../src/react/theme';

const theme = DEFAULT_WORKSPACE_THEME;

describe('LMC-66 — the severity decides the insistence of the announcement', () => {
  it('announces an ERROR assertively', () => {
    render(
      <Notice theme={theme} severity="error">
        The connection dropped
      </Notice>,
    );
    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent('The connection dropped');
  });

  it('announces a WARNING assertively, through the same role as the error', () => {
    render(
      <Notice theme={theme} severity="warning">
        Delayed data
      </Notice>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Delayed data');
  });

  it('announces INFORMATION politely, and not through the assertive role', () => {
    render(
      <Notice theme={theme} severity="info">
        Catalogue loaded
      </Notice>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Catalogue loaded');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not hand the assertive role to information nor the polite one to an error', () => {
    const { rerender } = render(
      <Notice theme={theme} severity="error">
        The connection dropped
      </Notice>,
    );
    expect(screen.queryByRole('status')).toBeNull();

    rerender(
      <Notice theme={theme} severity="info">
        Catalogue loaded
      </Notice>,
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('LMC-66 — the dismiss button follows the IconButton contract', () => {
  it('draws no button at all when the host did not ask for a dismissal', () => {
    render(
      <Notice theme={theme} severity="info">
        Catalogue loaded
      </Notice>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('draws a native `button` with an accessible name, and hands the dismissal to the host', () => {
    const onDismiss = jest.fn();
    render(
      <Notice theme={theme} severity="error" onDismiss={onDismiss} dismissLabel="Dismiss">
        The connection dropped
      </Notice>,
    );
    const dismiss = screen.getByRole('button', { name: 'Dismiss' });
    expect(dismiss.tagName).toBe('BUTTON');
    expect(dismiss).toHaveAttribute('type', 'button');
    expect(dismiss).toHaveAttribute('aria-label', 'Dismiss');

    fireEvent.click(dismiss);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('names the dismissal even when the host brings no label, instead of shipping an unnamed button', () => {
    render(
      <Notice theme={theme} severity="error" onDismiss={jest.fn()}>
        The connection dropped
      </Notice>,
    );
    const dismiss = screen.getByRole('button');
    expect(dismiss.getAttribute('aria-label')).toBeTruthy();
  });
});

describe('LMC-67 — a streaming reading does NOT go into a live region', () => {
  it('no other chrome role carries a live region, and that is where readings are painted', () => {
    const { container } = render(
      <>
        <Text theme={theme}>1.2345</Text>
        <Pill theme={theme} state={{ kind: 'toggle', pressed: true }}>
          1.2345
        </Pill>
        <Toggle theme={theme} label="Density" checked onChange={jest.fn()} />
        <IconButton theme={theme} label="Undo">
          ↶
        </IconButton>
      </>,
    );
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(0);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the live region belongs to the notice ITSELF, not to a wrapper that fences readings in', () => {
    render(
      <Notice theme={theme} severity="info">
        <Text theme={theme}>Catalogue loaded</Text>
      </Notice>,
    );
    // Exactly one live region in the tree: the notice's.
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});
