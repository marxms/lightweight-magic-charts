/**
 * @jest-environment jsdom
 *
 * The binary shaped like a widget, against the classic mistake of the role.
 *
 * `role="switch"` with `aria-pressed` is the wrong combination and it is the most written one: the
 * role already defines the state as `aria-checked`, and emitting both announces two overlapping
 * states for the same control. It renders the same, it reads wrong.
 */
import { createEvent, fireEvent, render, screen } from '@testing-library/react';

import { Toggle } from '../src/react/chrome/Toggle';
import { DEFAULT_WORKSPACE_THEME } from '../src/react/theme';

const theme = DEFAULT_WORKSPACE_THEME;

describe('LMC-59 — the role is `switch`, and the state is `aria-checked`', () => {
  it('exposes `role="switch"` with `aria-checked` reflecting the value', () => {
    const { rerender } = render(
      <Toggle theme={theme} label="Density" checked={false} onChange={jest.fn()} />,
    );
    const toggle = screen.getByRole('switch', { name: 'Density' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    rerender(<Toggle theme={theme} label="Density" checked onChange={jest.fn()} />);
    expect(screen.getByRole('switch', { name: 'Density' })).toHaveAttribute('aria-checked', 'true');
  });

  it('NEVER emits the pressed-state attribute, which is the classic mistake of this role', () => {
    render(<Toggle theme={theme} label="Density" checked onChange={jest.fn()} />);
    expect(screen.getByRole('switch', { name: 'Density' })).not.toHaveAttribute('aria-pressed');
  });

  it('takes the accessible name from `label`, because the control has no visible text of its own', () => {
    render(<Toggle theme={theme} label="Trough profile" checked={false} onChange={jest.fn()} />);
    expect(screen.getByRole('switch', { name: 'Trough profile' })).toHaveAttribute(
      'aria-label',
      'Trough profile',
    );
  });
});

describe("LMC-56 — toggling by Enter and Space is the NATIVE `button`'s", () => {
  /**
   * Why the contract is proved in three parts, and not in one.
   *
   * The full keyboard simulation exists in `@testing-library/user-event`, and it works: a
   * `keyboard('{enter}')` does end up calling the handler. What is missing is the library being a
   * development dependency of THIS lib — today it resolves by workspace hoisting, and a test that
   * depended on it would break the moment the package left the monorepo, which is the point of the
   * feature.
   *
   * So the contract is proved by what does not depend on it: the element is the native `button` the
   * browser activates by keyboard, nothing intercepts the key on the way, and activation toggles.
   * An implementation that swapped the button for a `div`, or that swallowed the key, fails one of
   * the three. Declaring the dependency and using the direct simulation is the packaging slice's
   * work.
   */
  it('is a `button` of type `button`, which is the element the browser activates by keyboard', () => {
    render(<Toggle theme={theme} label="Density" checked={false} onChange={jest.fn()} />);
    const toggle = screen.getByRole('switch', { name: 'Density' });
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle).toHaveAttribute('type', 'button');
  });

  it('intercepts neither Enter nor Space — neither key is cancelled on the way', () => {
    render(<Toggle theme={theme} label="Density" checked={false} onChange={jest.fn()} />);
    const toggle = screen.getByRole('switch', { name: 'Density' });

    for (const key of ['Enter', ' ']) {
      const event = createEvent.keyDown(toggle, { key });
      fireEvent(toggle, event);
      expect(event.defaultPrevented).toBe(false);
    }
  });

  it('toggles when activated, handing the NEXT value to the host', () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <Toggle theme={theme} label="Density" checked={false} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('switch', { name: 'Density' }));
    expect(onChange).toHaveBeenLastCalledWith(true);

    rerender(<Toggle theme={theme} label="Density" checked onChange={onChange} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Density' }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('uses the NATIVE `disabled` attribute, which is what takes it out of the tab order', () => {
    render(<Toggle theme={theme} label="Density" checked={false} onChange={jest.fn()} disabled />);
    const toggle = screen.getByRole('switch', { name: 'Density' });
    expect(toggle).toBeDisabled();
    expect(toggle).not.toHaveAttribute('tabindex');
  });
});

describe("LMC-60 — the focus ring is the browser's", () => {
  it('declares no focus ring in either of the two states', () => {
    const { rerender } = render(
      <Toggle theme={theme} label="Density" checked={false} onChange={jest.fn()} />,
    );
    expect(screen.getByRole('switch', { name: 'Density' }).style.outline).toBe('');

    rerender(<Toggle theme={theme} label="Density" checked onChange={jest.fn()} />);
    const on = screen.getByRole('switch', { name: 'Density' });
    expect(on.style.outline).toBe('');
    expect(on.style.outlineWidth).toBe('');
  });
});
