/**
 * @jest-environment jsdom
 *
 * POINTER INTENT, in isolation — because it is the part that goes wrong in silence.
 *
 * A menu that opens on a bare `onMouseEnter` opens ALL the ones in the pointer's path, and one that
 * closes on a bare `onMouseLeave` closes before the pointer has crossed the gap between the trigger
 * and the panel. Both failures yield a screen that "works" in any rendering test and is unusable by
 * hand. Each case below pins down a delay or a refusal, and none really sleeps: the clock is fake,
 * otherwise the suite would trade determinism for seconds of waiting.
 *
 * THE REFUSALS ARE THE HEART. Closing by pointer can never undo what the KEYBOARD is doing (focus
 * inside) nor what a DRAG is doing (a slider taken outside the box) — both are known ways for a
 * "close on leave" to turn into lost user work.
 */
import { act, render, renderHook } from '@testing-library/react';
import { useRef } from 'react';

import {
  HOVER_CLOSE_DELAY_MS,
  HOVER_OPEN_DELAY_MS,
  useHoverDismiss,
  useHoverIntent,
} from '../src/react/hoverIntent';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const tick = (ms: number): void => {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
};

describe('useHoverIntent — the delay is what separates "meant to" from "passed over"', () => {
  it('opens ONLY after the intent delay', () => {
    const { result } = renderHook(() => useHoverIntent());
    let opened = 0;

    act(() => result.current.open(() => (opened += 1)));
    // POSITIVE CONTROL: an `onMouseEnter` with no delay would already have opened here.
    tick(HOVER_OPEN_DELAY_MS - 1);
    expect(opened).toBe(0);

    tick(1);
    expect(opened).toBe(1);
  });

  it('closes with a LONGER delay: the path from trigger to panel has to be forgiven', () => {
    const { result } = renderHook(() => useHoverIntent());
    let closed = 0;

    act(() => result.current.close(() => (closed += 1)));
    tick(HOVER_OPEN_DELAY_MS);
    expect(closed).toBe(0); // the closing delay is not the opening one
    tick(HOVER_CLOSE_DELAY_MS - HOVER_OPEN_DELAY_MS);
    expect(closed).toBe(1);
    expect(HOVER_CLOSE_DELAY_MS).toBeGreaterThan(HOVER_OPEN_DELAY_MS);
  });

  it('ONE pending at a time: scheduling again replaces, and cancelling disarms', () => {
    const { result } = renderHook(() => useHoverIntent());
    const fired: string[] = [];

    act(() => result.current.open(() => fired.push('a')));
    act(() => result.current.open(() => fired.push('b')));
    tick(HOVER_OPEN_DELAY_MS);
    // Without the replacement, crossing the rail would fire one `open` per family touched.
    expect(fired).toEqual(['b']);

    act(() => result.current.close(() => fired.push('c')));
    act(() => result.current.cancel());
    tick(HOVER_CLOSE_DELAY_MS * 2);
    expect(fired).toEqual(['b']);
  });

  it('unmounting disarms the pending one — a timer that survives writes into a dead component', () => {
    const { result, unmount } = renderHook(() => useHoverIntent());
    let opened = 0;
    act(() => result.current.open(() => (opened += 1)));

    unmount();
    tick(HOVER_OPEN_DELAY_MS * 4);

    expect(opened).toBe(0);
  });
});

interface DismissProbeProps {
  readonly enabled: boolean;
  readonly onDismiss: () => void;
}

function DismissProbe({ enabled, onDismiss }: DismissProbeProps): React.ReactElement {
  const boxRef = useRef<HTMLDivElement | null>(null);
  useHoverDismiss(boxRef, { enabled, onDismiss });
  return (
    <div>
      <div data-testid="box" ref={boxRef}>
        <button type="button" data-testid="inside">
          inside
        </button>
      </div>
      <button type="button" data-testid="outside">
        outside
      </button>
    </div>
  );
}

describe('useHoverDismiss — leaving closes, and the refusals that keep that from costing work', () => {
  const mountProbe = (enabled = true) => {
    let dismissed = 0;
    const view = render(<DismissProbe enabled={enabled} onDismiss={() => (dismissed += 1)} />);
    const box = view.getByTestId('box');
    return {
      box,
      view,
      count: () => dismissed,
    };
  };

  it('closes on leaving, after the delay — without depending on any button', () => {
    const probe = mountProbe();

    act(() => {
      probe.box.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    });
    tick(HOVER_CLOSE_DELAY_MS - 1);
    expect(probe.count()).toBe(0);

    tick(1);
    expect(probe.count()).toBe(1);
  });

  it('coming back before the deadline CANCELS: the gap between two controls does not close it', () => {
    const probe = mountProbe();

    act(() => {
      probe.box.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    });
    tick(HOVER_CLOSE_DELAY_MS - 50);
    act(() => {
      probe.box.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    });
    tick(HOVER_CLOSE_DELAY_MS * 2);

    expect(probe.count()).toBe(0);
  });

  it('REFUSES to close while focus is inside — the pointer does not undo what the keyboard does', () => {
    const probe = mountProbe();
    (probe.view.getByTestId('inside') as HTMLElement).focus();

    act(() => {
      probe.box.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    });
    tick(HOVER_CLOSE_DELAY_MS * 2);
    expect(probe.count()).toBe(0);

    // POSITIVE CONTROL: with focus OUTSIDE the same leave closes — the refusal comes from the
    // focus, not from the handler.
    (probe.view.getByTestId('outside') as HTMLElement).focus();
    act(() => {
      probe.box.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    });
    tick(HOVER_CLOSE_DELAY_MS);
    expect(probe.count()).toBe(1);
  });

  it('REFUSES to close during a drag started inside — a slider taken outside does not close it', () => {
    const probe = mountProbe();
    const inside = probe.view.getByTestId('inside');

    act(() => {
      inside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      probe.box.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    });
    tick(HOVER_CLOSE_DELAY_MS * 2);
    expect(probe.count()).toBe(0);

    // Once the button is released, the next leave closes again: the refusal lasts the drag, not the
    // session.
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      probe.box.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    });
    tick(HOVER_CLOSE_DELAY_MS);
    expect(probe.count()).toBe(1);
  });

  it('switched off, it closes nothing — the host is what says when the box is open', () => {
    const probe = mountProbe(false);

    act(() => {
      probe.box.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    });
    tick(HOVER_CLOSE_DELAY_MS * 2);

    expect(probe.count()).toBe(0);
  });
});
