/**
 * @jest-environment jsdom
 *
 * THE FLOATING PANEL, against the defects a screenshot signs off on.
 *
 * A panel that is pretty and unreachable by keyboard renders exactly like a navigable one. A panel
 * that closes leaving focus on the `<body>` renders like one that hands it back to the trigger —
 * and the difference only shows on the next Tab, which restarts from the top of the page, far from
 * where anyone would investigate.
 *
 * THE THREE CLOSING PATHS get a case each because they are three different decisions about focus:
 * Escape and picking an item hand it back to the trigger; a click outside only hands it back if it
 * was inside the panel.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useRef, useState } from 'react';

import { FlyoutMenu, type FlyoutMenuItem } from '../src/react/chrome/FlyoutMenu';
import { DEFAULT_WORKSPACE_THEME } from '../src/react/theme';

const ITEMS: readonly FlyoutMenuItem[] = [
  { id: 'trend line', label: 'Trend line', hint: 'Alt+T' },
  { id: 'ray', label: 'Ray' },
  { id: 'channel', label: 'Parallel channel', selected: true },
];

interface HarnessProps {
  readonly openedByPointer?: boolean;
  readonly onSelected?: (id: string) => void;
  readonly onClosed?: () => void;
}

/**
 * The arrangement the panel demands: trigger INSIDE the scroller, panel its SIBLING and the root's
 * child.
 *
 * It is not a scenario of convenience — it is the only layout in which a popup escapes `overflow`
 * without a portal, and it is the one the drawing rail uses.
 */
function Harness({ openedByPointer, onSelected, onClosed }: HarnessProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(true);

  return (
    <div ref={rootRef} data-testid="root" style={{ position: 'relative' }}>
      <div data-testid="scroller" style={{ overflowY: 'auto' }}>
        <button
          type="button"
          ref={triggerRef}
          data-testid="trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls="rail-flyout"
          onClick={() => setOpen((current) => !current)}
        >
          ╱
        </button>
      </div>
      {open ? (
        <FlyoutMenu
          id="rail-flyout"
          label="Lines"
          items={ITEMS}
          onSelect={(id) => onSelected?.(id)}
          onClose={() => {
            setOpen(false);
            onClosed?.();
          }}
          rootRef={rootRef}
          triggerRef={triggerRef}
          theme={DEFAULT_WORKSPACE_THEME}
          openedByPointer={openedByPointer}
          availableHeightPx={400}
          testIdPrefix="rail"
        />
      ) : null}
    </div>
  );
}

describe('LMC-56 — the panel is a real menu, with real items', () => {
  it('declares the menu role with an accessible name and draws one item per entry', () => {
    render(<Harness />);

    const panel = screen.getByTestId('rail-flyout');
    expect(panel).toHaveAttribute('role', 'menu');
    expect(panel).toHaveAccessibleName('Lines');
    expect(within(panel).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Trend lineAlt+T',
      'Ray',
      'Parallel channel',
    ]);
  });

  it("the panel's `id` is the target of the trigger's `aria-controls` — sanitised from the host", () => {
    render(<Harness />);

    const trigger = screen.getByTestId('trigger');
    expect(document.getElementById(trigger.getAttribute('aria-controls') ?? '')).toBe(
      screen.getByTestId('rail-flyout'),
    );
    // `trend line` has a space in it, which is an invalid DOM `id`: demanding of the host a rule it
    // has no way to know costs more than sanitising.
    expect(screen.getByTestId('rail-option-trend-line')).toBeInTheDocument();
  });

  it('picking an item reports to the host and closes the panel', () => {
    const chosen: string[] = [];
    render(<Harness onSelected={(id) => chosen.push(id)} />);

    fireEvent.click(screen.getByTestId('rail-option-ray'));

    expect(chosen).toEqual(['ray']);
    expect(screen.queryByTestId('rail-flyout')).not.toBeInTheDocument();
  });
});

describe('LMC-61 — arrow, Home and End traverse the menu items', () => {
  it('the arrows walk the items and wrap around at both ends', () => {
    render(<Harness />);
    const panel = screen.getByTestId('rail-flyout');

    fireEvent.keyDown(panel, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('rail-option-ray'));
    fireEvent.keyDown(panel, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('rail-option-channel'));
    // The wrap: sticking at the end is indistinguishable from a handler that was never wired up.
    fireEvent.keyDown(panel, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('rail-option-trend-line'));
    fireEvent.keyDown(panel, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByTestId('rail-option-channel'));
  });

  it('Home goes to the first item and End to the last', () => {
    render(<Harness />);
    const panel = screen.getByTestId('rail-flyout');

    fireEvent.keyDown(panel, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByTestId('rail-option-channel'));
    fireEvent.keyDown(panel, { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByTestId('rail-option-trend-line'));
  });

  it('the arrow is CANCELLED and a foreign key is not: swallowing all would steal host typing', () => {
    render(<Harness />);
    const panel = screen.getByTestId('rail-flyout');

    // Without the cancellation, the arrow would scroll the panel out from under focus.
    expect(fireEvent.keyDown(panel, { key: 'ArrowDown' })).toBe(false);
    // POSITIVE CONTROL: a key that is not a traversal key carries on its normal way.
    expect(fireEvent.keyDown(panel, { key: 'a' })).toBe(true);
  });
});

describe('LMC-62 and LMC-65 — the three closing paths and what each does with focus', () => {
  it('Escape closes, hands focus back to the trigger and does NOT propagate the event', () => {
    const outer = jest.fn();
    render(
      // biome-ignore lint/a11y/noStaticElementInteractions: stages the host keymap behind the panel
      <div onKeyDown={outer}>
        <Harness />
      </div>,
    );

    fireEvent.keyDown(screen.getByTestId('rail-flyout'), { key: 'Escape' });

    expect(screen.queryByTestId('rail-flyout')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByTestId('trigger'));
    // The panel's Escape is not the Escape of the chart behind it: closing one thing must not
    // disarm another.
    expect(outer).not.toHaveBeenCalled();
  });

  it('picking an item hands focus back to the trigger', () => {
    render(<Harness />);

    fireEvent.click(screen.getByTestId('rail-option-ray'));

    // Orphaned focus is the classic popup defect: the next Tab would restart from the page top.
    expect(document.activeElement).toBe(screen.getByTestId('trigger'));
  });

  it('a click outside WITH focus inside the panel closes and hands focus back to the trigger', () => {
    render(<Harness />);
    // Opened by keyboard, focus is on the first item — the arrangement in which the defect bit.
    expect(document.activeElement).toBe(screen.getByTestId('rail-option-trend-line'));

    fireEvent.mouseDown(document.body);

    expect(screen.queryByTestId('rail-flyout')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByTestId('trigger'));
  });

  it('a click outside WITH focus outside does not steal focus back', () => {
    render(<Harness openedByPointer />);
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    fireEvent.mouseDown(outside);

    // POSITIVE CONTROL of the check: the person has already chosen where to go, and pulling focus
    // back to the trigger would undo their own action.
    expect(screen.queryByTestId('rail-flyout')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('a click INSIDE the root does not close: the neighbouring trigger is what decides', () => {
    render(<Harness />);

    fireEvent.mouseDown(screen.getByTestId('trigger'));

    expect(screen.getByTestId('rail-flyout')).toBeInTheDocument();
  });
});

describe('LMC-62 — whoever opened the panel decides whether focus moves', () => {
  it('opened by KEYBOARD or click, focus goes to the first item', () => {
    render(<Harness />);
    // A panel opened behind focus exists only for whoever uses the mouse — and the trigger has just
    // promised, through `aria-expanded`, that something opened.
    expect(document.activeElement).toBe(screen.getByTestId('rail-option-trend-line'));
  });

  it('opened by POINTER, focus stays where it was', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    render(<Harness openedByPointer />);

    // Stealing focus on hover would rip the caret out of wherever the person was typing.
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
