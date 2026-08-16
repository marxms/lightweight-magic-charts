/**
 * @jest-environment jsdom
 *
 * The highest-traffic role, against the defects a screenshot approves.
 *
 * A `div` with `role="button"` and a `<button>` are pixel for pixel identical and only one of them
 * is reachable by keyboard. An action button that announces `aria-pressed="false"` draws the same as
 * one that announces nothing, and tells the screen reader there is a state that does not exist. Both
 * errors are invisible precisely to whoever reviews them by looking.
 */
import { fireEvent, render, screen } from '@testing-library/react';

import { Pill } from '../src/react/chrome/Pill';
import { DEFAULT_WORKSPACE_THEME } from '../src/react/theme';

const theme = DEFAULT_WORKSPACE_THEME;

describe('LMC-56 — a NATIVE interactive element, not a role pasted onto an inert element', () => {
  it('renders a `button` of type `button`, and not an element with `role="button"`', () => {
    render(
      <Pill theme={theme} state={{ kind: 'action' }}>
        Volume
      </Pill>,
    );
    const pill = screen.getByRole('button', { name: 'Volume' });
    expect(pill.tagName).toBe('BUTTON');
    expect(pill).toHaveAttribute('type', 'button');
    expect(pill.getAttribute('role')).toBeNull();
  });

  it('takes the accessible name from its own visible content', () => {
    render(
      <Pill theme={theme} state={{ kind: 'action' }}>
        Moving average
      </Pill>,
    );
    expect(screen.getByRole('button', { name: 'Moving average' })).toBeInTheDocument();
  });

  it('uses the NATIVE `disabled` attribute, which is what takes it out of the tab order', () => {
    render(
      <Pill theme={theme} state={{ kind: 'action' }} disabled>
        Export
      </Pill>,
    );
    const pill = screen.getByRole('button', { name: 'Export' });
    expect(pill).toBeDisabled();
    // No `tabindex` of its own: `disabled` already settles it, and an explicit `tabindex` would
    // bring it back.
    expect(pill).not.toHaveAttribute('tabindex');
  });

  it('calls the host when fired, and does not call it when disabled', () => {
    const onSelect = jest.fn();
    const { rerender } = render(
      <Pill theme={theme} state={{ kind: 'action' }} onSelect={onSelect}>
        Export
      </Pill>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(onSelect).toHaveBeenCalledTimes(1);

    rerender(
      <Pill theme={theme} state={{ kind: 'action' }} onSelect={onSelect} disabled>
        Export
      </Pill>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

describe('LMC-58 — the state the control does NOT have is not announced', () => {
  it('emits no pressed state at all when the pill is an ACTION', () => {
    render(
      <Pill theme={theme} state={{ kind: 'action' }}>
        Clear
      </Pill>,
    );
    const pill = screen.getByRole('button', { name: 'Clear' });
    expect(pill).not.toHaveAttribute('aria-pressed');
    expect(pill).not.toHaveAttribute('aria-checked');
    expect(pill).not.toHaveAttribute('aria-expanded');
  });

  it('emits the pressed state REFLECTING the value when the pill toggles', () => {
    const { rerender } = render(
      <Pill theme={theme} state={{ kind: 'toggle', pressed: true }}>
        Grid
      </Pill>,
    );
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'true');

    rerender(
      <Pill theme={theme} state={{ kind: 'toggle', pressed: false }}>
        Grid
      </Pill>,
    );
    expect(screen.getByRole('button', { name: 'Grid' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('announces choice through `radio`/`aria-checked`, never through a pressed state', () => {
    const { rerender } = render(
      <Pill theme={theme} state={{ kind: 'radio', checked: true }}>
        1h
      </Pill>,
    );
    const checked = screen.getByRole('radio', { name: '1h' });
    expect(checked).toHaveAttribute('aria-checked', 'true');
    expect(checked).not.toHaveAttribute('aria-pressed');

    rerender(
      <Pill theme={theme} state={{ kind: 'radio', checked: false }}>
        1h
      </Pill>,
    );
    expect(screen.getByRole('radio', { name: '1h' })).toHaveAttribute('aria-checked', 'false');
  });

  it('announces a panel through `aria-expanded` and `aria-haspopup`, never through pressed', () => {
    const { rerender } = render(
      <Pill theme={theme} state={{ kind: 'menu', expanded: false }}>
        Series
      </Pill>,
    );
    const trigger = screen.getByRole('button', { name: 'Series' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).not.toHaveAttribute('aria-pressed');

    rerender(
      <Pill theme={theme} state={{ kind: 'menu', expanded: true }}>
        Series
      </Pill>,
    );
    expect(screen.getByRole('button', { name: 'Series' })).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('LMC-60 — the focus ring belongs to the browser, in all four states', () => {
  it('declares no focus ring in any of the four `kind`s', () => {
    render(
      <>
        <Pill theme={theme} state={{ kind: 'action' }}>
          a
        </Pill>
        <Pill theme={theme} state={{ kind: 'toggle', pressed: true }}>
          b
        </Pill>
        <Pill theme={theme} state={{ kind: 'radio', checked: true }}>
          c
        </Pill>
        <Pill theme={theme} state={{ kind: 'menu', expanded: true }}>
          d
        </Pill>
      </>,
    );
    for (const name of ['a', 'b', 'c', 'd']) {
      const pill = screen.getByText(name);
      expect(pill.style.outline).toBe('');
      expect(pill.style.outlineWidth).toBe('');
    }
  });
});
