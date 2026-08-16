/**
 * @jest-environment jsdom
 *
 * The costliest of the five roles: dismissible, hoverable and persistent, with no portal.
 *
 * The three properties fail in different ways and none of them shows up in a screenshot. A tooltip
 * that only opens to the pointer is invisible to whoever navigates by keyboard. One that closes on
 * leaving the trigger is impossible to read when the text is long — the pointer has to travel
 * across to it. And an Escape that bubbles closes the tooltip AND whatever is behind it, which here
 * is the chart.
 */
import type { ReactElement } from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { Tooltip } from '../src/react/chrome/Tooltip';
import { HOVER_CLOSE_DELAY_MS, HOVER_OPEN_DELAY_MS } from '../src/react/hoverIntent';
import { DEFAULT_WORKSPACE_THEME } from '../src/react/theme';

const theme = DEFAULT_WORKSPACE_THEME;

function Trigger(): ReactElement {
  return (
    <Tooltip theme={theme} content="Undoes the last drawing">
      <button type="button">Undo</button>
    </Tooltip>
  );
}

function elapse(ms: number): void {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('LMC-63 — the tooltip appears on keyboard FOCUS, not only on the pointer', () => {
  it('opens on receiving focus, without any pointer having come near', () => {
    render(<Trigger />);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.focus(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Undoes the last drawing');
  });

  it('closes on losing focus', () => {
    render(<Trigger />);
    const trigger = screen.getByRole('button', { name: 'Undo' });
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens to the pointer after the intent delay, and not before', () => {
    const { container } = render(<Trigger />);
    const wrapper = container.firstElementChild as HTMLElement;

    fireEvent.mouseEnter(wrapper);
    elapse(HOVER_OPEN_DELAY_MS - 1);
    expect(screen.queryByRole('tooltip')).toBeNull();

    elapse(2);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('describes the panel from the trigger, and NEVER labels the trigger with it', () => {
    render(<Trigger />);
    const trigger = screen.getByRole('button', { name: 'Undo' });
    fireEvent.focus(trigger);

    const panel = screen.getByRole('tooltip');
    expect(trigger).toHaveAttribute('aria-describedby', panel.id);
    expect(panel.id).toBeTruthy();
    expect(trigger).not.toHaveAttribute('aria-labelledby');
    // The accessible name is still the trigger's own, not the tooltip's text.
    expect(trigger).toHaveAccessibleName('Undo');
  });
});

describe('LMC-64 — the tooltip stays while the pointer is over the PANEL itself', () => {
  it('does not close when the pointer leaves the trigger and enters the panel', () => {
    const { container } = render(<Trigger />);
    const wrapper = container.firstElementChild as HTMLElement;

    fireEvent.mouseEnter(wrapper);
    elapse(HOVER_OPEN_DELAY_MS);
    const panel = screen.getByRole('tooltip');

    // The pointer's real path: it leaves the trigger, it enters the panel. The two live inside the
    // same wrapper, so the wrapper was never left — and it is the wrapper that listens.
    fireEvent.mouseLeave(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.mouseEnter(panel);
    elapse(HOVER_CLOSE_DELAY_MS * 2);

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('CONTROL: it closes when the pointer leaves the whole wrapper', () => {
    const { container } = render(<Trigger />);
    const wrapper = container.firstElementChild as HTMLElement;

    fireEvent.mouseEnter(wrapper);
    elapse(HOVER_OPEN_DELAY_MS);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.mouseLeave(wrapper);
    elapse(HOVER_CLOSE_DELAY_MS + 1);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('LMC-65 — Escape closes the tooltip and does not reach the chart behind it', () => {
  it('closes, and the event does not bubble to whoever listens above', () => {
    const onKeyDown = jest.fn();
    render(
      // The chart behind the tooltip is exactly the listener this test needs in order to prove
      // that Escape does not leak out of it.
      // biome-ignore lint/a11y/noStaticElementInteractions: see the comment above.
      <div onKeyDown={onKeyDown}>
        <Trigger />
      </div>,
    );
    const trigger = screen.getByRole('button', { name: 'Undo' });
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(onKeyDown).not.toHaveBeenCalled();
  });

  it('CONTROL: another key still bubbles, so that Escape is the exception and not the rule', () => {
    const onKeyDown = jest.fn();
    render(
      // biome-ignore lint/a11y/noStaticElementInteractions: see above.
      <div onKeyDown={onKeyDown}>
        <Trigger />
      </div>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Undo' }), { key: 'ArrowDown' });
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });
});

describe('switched off, the tooltip falls back to the browser’s NATIVE label', () => {
  /**
   * It is the way out inside a scrolling container. With no portal there is no escaping the
   * clipping, and a readable `title` is worth more than a box cut in half.
   */
  it('hands the text to the trigger’s `title` and draws no panel at all', () => {
    render(
      <Tooltip theme={theme} content="Undoes the last drawing" disabled>
        <button type="button">Undo</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 'Undo' });
    expect(trigger).toHaveAttribute('title', 'Undoes the last drawing');

    fireEvent.focus(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('the panel is not a dialog — no portal, no focus trap', () => {
  it('does not steal focus from the trigger when it opens', () => {
    render(<Trigger />);
    const trigger = screen.getByRole('button', { name: 'Undo' });
    // REAL focus, not simulated: it is the only way the assertion on the active element is worth
    // anything.
    act(() => {
      trigger.focus();
    });

    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('draws the panel as a SIBLING of the trigger, inside the positioned wrapper', () => {
    const { container } = render(<Trigger />);
    const wrapper = container.firstElementChild as HTMLElement;
    fireEvent.focus(screen.getByRole('button', { name: 'Undo' }));

    const panel = screen.getByRole('tooltip');
    expect(panel.parentElement).toBe(wrapper);
    expect(wrapper.style.position).toBe('relative');
  });

});
