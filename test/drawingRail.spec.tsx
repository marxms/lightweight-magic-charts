/**
 * @jest-environment jsdom
 *
 * THE RAIL IN TRADINGVIEW'S IDIOM: narrow in width, whole in height, and one flyout per family in
 * place of the `<select>`.
 *
 * The reported defect has two axes and they pull against each other. The rail was SHORT (it stopped
 * where the content ended, leaving a dead band beside the chart) and WIDE (the 124px `<select>`
 * dictated the width of the whole column). Swapping the select for a flyout gives the width back to
 * the rail — the tool's name comes to be read OUTSIDE it — and that is what these assertions pin:
 * not the appearance, but the two measurements and the reach.
 *
 * WHAT AN APPEARANCE TEST WOULD NOT CATCH: a pretty flyout unreachable by keyboard, or a grouping
 * that erases the tool with no family. Both have already happened in this palette (the `<optgroup>`
 * was born with that trap), so each has a case of its own with a positive control.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';

import {
  DrawingToolbar,
  type DrawingTool,
  type DrawingToolGroup,
  type DrawingToolOption,
} from '../src/react/DrawingToolbar';
import type { MagnetMode } from '../src/drawing/magnet';
import { HOVER_CLOSE_DELAY_MS, HOVER_OPEN_DELAY_MS } from '../src/react/hoverIntent';

const TOOLS: readonly DrawingTool[] = [
  { id: 'trend-line', label: 'Trend line', glyph: '╱', shortcut: 'Alt+T' },
  { id: 'rectangle', label: 'Rectangle', glyph: '▭' },
];

/** Two declared families, a family the host did NOT declare, and an entry with no family. */
const CATALOGUE: readonly DrawingToolOption[] = [
  { id: 'trend-line', name: 'Trend line', group: 'lines', shortcut: 'Alt+T' },
  { id: 'ray', name: 'Ray', group: 'lines' },
  { id: 'parallel-channel', name: 'Parallel channel', group: 'channels' },
  { id: 'wormhole', name: 'Wormhole', group: 'teleport' },
  { id: 'nameless', name: 'Nameless' },
];

const GROUPS: readonly DrawingToolGroup[] = [
  { id: 'lines', label: 'Lines', glyph: '╱' },
  { id: 'channels', label: 'Channels', glyph: '⫽' },
];

function mount(props: Partial<ComponentProps<typeof DrawingToolbar>> = {}) {
  const chosen: Array<string | null> = [];
  const view = render(
    <DrawingToolbar
      tools={TOOLS}
      allTools={CATALOGUE}
      toolGroups={GROUPS}
      activeToolId={null}
      onSelect={(id) => chosen.push(id)}
      {...props}
    />,
  );
  return { chosen, view };
}

const px = (value: string): number => Number.parseFloat(value);

describe('DrawingToolbar — the box: narrow in width, whole in height', () => {
  it('it is NARROW: the width is that of an icon button, not of the control that went away', () => {
    mount();

    const rail = screen.getByTestId('drawing-toolbar');
    const button = screen.getByTestId('drawing-tool-rectangle');
    // The OLD measurement was 124px of `<select>` + 8 of padding = 132: the rail's column was worth
    // nearly four buttons of width to fit a tool name nobody read up close.
    expect(px(rail.style.width)).toBeLessThan(124);
    // And the floor: the rail cannot be wider than the button it stacks, plus its own padding.
    expect(px(rail.style.width)).toBeLessThanOrEqual(px(button.style.width) + 12);
  });

  it('takes the HEIGHT the host measured and scrolls inside when it does not fit', () => {
    mount({ heightPx: 480 });

    const rail = screen.getByTestId('drawing-toolbar');
    expect(rail.style.height).toBe('480px');
    // Its OWN scrolling: without it a tall catalogue would push the workspace footer out, which is
    // the defect the measured height exists in order not to recreate.
    expect(screen.getByTestId('drawing-rail-scroll').style.overflowY).toBe('auto');
  });

  it('POSITIVE CONTROL: with no height from the host the rail does not invent one', () => {
    mount();
    // A fixed `height: 100%` here would break every host that mounts the rail outside a measured box.
    expect(screen.getByTestId('drawing-toolbar').style.height).toBe('');
  });
});

/**
 * THE RADIO GROUP, and the promise it made without keeping.
 *
 * `role="radiogroup"` promises the screen reader what a NATIVE radio group delivers for free: one
 * tab stop for the whole group, and arrow keys to move within it. The rail declared the role and
 * answered no key at all — ten tab stops and no arrow, which is the most expensive way to navigate
 * a rail and the only one available to whoever does not use a mouse.
 */
describe("LMC-61 — the arrow traverses the rail's radio group", () => {
  it('moves forward and backward, wrapping around, and ARMS whatever receives focus', () => {
    const { chosen } = mount();
    const rail = screen.getByRole('radiogroup');
    screen.getByTestId('drawing-tool-cursor').focus();

    fireEvent.keyDown(rail, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('drawing-tool-trend-line'));
    fireEvent.keyDown(rail, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('drawing-tool-rectangle'));
    // The wrap: stopping at the end is indistinguishable from a handler that was never wired.
    fireEvent.keyDown(rail, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('drawing-tool-cursor'));
    fireEvent.keyDown(rail, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByTestId('drawing-tool-rectangle'));

    // AUTOMATIC ACTIVATION, as in a native group: focus and checking travel together. Separating
    // them would leave the `tabindex` pointing at an item different from the highlighted one.
    expect(chosen).toEqual(['trend-line', 'rectangle', null, 'rectangle']);
  });

  it('Home goes to the first member and End to the last', () => {
    mount();
    const rail = screen.getByRole('radiogroup');
    screen.getByTestId('drawing-tool-cursor').focus();

    fireEvent.keyDown(rail, { key: 'End' });
    expect(document.activeElement).toBe(screen.getByTestId('drawing-tool-rectangle'));
    fireEvent.keyDown(rail, { key: 'Home' });
    expect(document.activeElement).toBe(screen.getByTestId('drawing-tool-cursor'));
  });

  it('in a rail LYING DOWN the arrows are the horizontal ones, and only those', () => {
    mount({ orientation: 'horizontal' });
    const rail = screen.getByRole('radiogroup');
    screen.getByTestId('drawing-tool-cursor').focus();

    fireEvent.keyDown(rail, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByTestId('drawing-tool-trend-line'));
    // POSITIVE CONTROL: the other axis' arrow does not belong to the group, and swallowing it would
    // steal page scrolling from whoever had focus here.
    fireEvent.keyDown(rail, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('drawing-tool-trend-line'));
  });

  it('does not cancel a key that is not a traversal key', () => {
    mount();
    const rail = screen.getByRole('radiogroup');
    expect(fireEvent.keyDown(rail, { key: 'ArrowDown' })).toBe(false);
    expect(fireEvent.keyDown(rail, { key: 'Tab' })).toBe(true);
  });
});

describe('LMC-62 — the group has ONE tab stop, not one per item', () => {
  const stops = () =>
    screen.getAllByRole('radio').map((radio) => radio.getAttribute('tabindex'));

  it('the stop is the CHECKED item, and all the others leave the tab order', () => {
    mount({ activeToolId: 'trend-line' });
    // Without this, a rail of ten tools costs ten Tabs to cross, and the arrow — which is the cheap
    // path — did not exist.
    expect(stops()).toEqual(['-1', '0', '-1']);
  });

  it('with NOTHING armed in the rail, the stop falls back to the first member', () => {
    // POSITIVE CONTROL: the tool chosen in the flyout is none of the curated icons, so no item of
    // the rail is checked. Without the fallback, the whole group would leave the tab order and be
    // unreachable by keyboard exactly when the user needs to get back to the cursor.
    mount({ activeToolId: 'wormhole' });
    expect(stops()).toEqual(['0', '-1', '-1']);
    expect(screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true'))
      .toHaveLength(0);
  });
});

describe("LMC-56 — the rail's glyph-only buttons speak through the icon role", () => {
  it('the name goes to the accessible label AND the native tip, because a glyph is not a name', () => {
    mount();
    const tool = screen.getByTestId('drawing-tool-trend-line');

    expect(tool.tagName).toBe('BUTTON');
    expect(tool).toHaveAttribute('aria-label', 'Trend line (Alt+T)');
    // Inside a scrolling container, a tip panel of its own would be clipped and without a portal
    // there is no escaping that: the native tip is the way out, and it never diverges from the name
    // because it is the same string.
    expect(tool).toHaveAttribute('title', 'Trend line (Alt+T)');
    expect(tool.style.outline).toBe('');
  });
});

describe('DrawingToolbar — the flyout per family', () => {
  it("gives a trigger per DECLARED family, in the host's order, and none for an empty family", () => {
    mount({ allTools: [{ id: 'ray', name: 'Ray', group: 'lines' }] });

    expect(screen.getByTestId('drawing-group-lines')).toHaveAccessibleName('Lines');
    // "Channels" was declared and has no tool at all in this mount: a trigger that opens an empty
    // flyout is a dead button taking up height on the axis the host pays for.
    expect(screen.queryByTestId('drawing-group-channels')).not.toBeInTheDocument();
  });

  it('the trigger declares that it opens a popup and says whether it is open', () => {
    mount();

    const trigger = screen.getByTestId('drawing-group-lines');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // `aria-controls` with no target is worse than absent: the reader promises a panel that does
    // not exist.
    expect(document.getElementById(trigger.getAttribute('aria-controls') ?? '')).not.toBeNull();
  });

  it('lists the tools of THAT family, with a legible name and the shortcut beside it', () => {
    mount();

    fireEvent.click(screen.getByTestId('drawing-group-lines'));
    const flyout = screen.getByTestId('drawing-flyout');
    expect(within(flyout).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Trend lineAlt+T',
      'Ray',
    ]);
    // The section header is the host's label — the lib never reads the string's content.
    expect(flyout).toHaveTextContent('Lines');
    // And only one family at a time: opening the second closes the first.
    fireEvent.click(screen.getByTestId('drawing-group-channels'));
    expect(screen.getAllByTestId('drawing-flyout')).toHaveLength(1);
    expect(screen.getByTestId('drawing-group-lines')).toHaveAttribute('aria-expanded', 'false');
  });

  it('NOTHING VANISHES: every tool in the catalogue is reachable through some flyout', () => {
    mount();

    const reached = new Set<string>();
    for (const trigger of screen.getAllByTestId(/^drawing-group-/)) {
      fireEvent.click(trigger);
      for (const item of within(screen.getByTestId('drawing-flyout')).getAllByRole('menuitem')) {
        reached.add(item.getAttribute('data-testid') ?? '');
      }
    }

    // POSITIVE CONTROL for the grouping: the tool of an UNDECLARED family (`teleport`) and the tool
    // with NO family would have vanished from a rail that only draws what it recognises.
    expect(reached).toEqual(
      new Set(CATALOGUE.map((option) => `drawing-option-${option.id}`)),
    );
  });

  it('choosing an item arms the tool, closes the panel and returns focus to the trigger', () => {
    const { chosen } = mount();
    const trigger = screen.getByTestId('drawing-group-lines');

    fireEvent.click(trigger);
    fireEvent.click(screen.getByTestId('drawing-option-ray'));

    expect(chosen).toEqual(['ray']);
    expect(screen.queryByTestId('drawing-flyout')).not.toBeInTheDocument();
    // Orphan focus is the classic popup defect: the next Tab would restart from the top of the page.
    expect(document.activeElement).toBe(trigger);
  });

  it('with no catalogue the rail creates no trigger at all', () => {
    mount({ allTools: undefined });
    expect(screen.queryAllByTestId(/^drawing-group-/)).toHaveLength(0);
  });

  it('with no declared families, the whole catalogue lands in one flyout — never on the floor', () => {
    mount({ toolGroups: undefined });

    const triggers = screen.getAllByTestId(/^drawing-group-/);
    expect(triggers).toHaveLength(1);
    expect(triggers[0]).toHaveAccessibleName('All tools');
    fireEvent.click(triggers[0]);
    expect(within(screen.getByTestId('drawing-flyout')).getAllByRole('menuitem')).toHaveLength(
      CATALOGUE.length,
    );
  });
});

describe('DrawingToolbar — the flyout by keyboard', () => {
  it('opens with focus on the first item: a panel open behind the focus is an invisible panel', () => {
    mount();

    const trigger = screen.getByTestId('drawing-group-lines');
    trigger.focus();
    // A real `<button>`: Enter and Space already fire the click through the platform.
    fireEvent.click(trigger);

    expect(document.activeElement).toBe(screen.getByTestId('drawing-option-trend-line'));
  });

  it('the arrows run through the items and wrap around', () => {
    mount();
    fireEvent.click(screen.getByTestId('drawing-group-lines'));
    const flyout = screen.getByTestId('drawing-flyout');

    fireEvent.keyDown(flyout, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('drawing-option-ray'));
    fireEvent.keyDown(flyout, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByTestId('drawing-option-trend-line'));
    fireEvent.keyDown(flyout, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByTestId('drawing-option-ray'));
  });

  it('Escape closes and returns focus to the trigger', () => {
    mount();
    const trigger = screen.getByTestId('drawing-group-lines');
    fireEvent.click(trigger);

    fireEvent.keyDown(screen.getByTestId('drawing-flyout'), { key: 'Escape' });

    expect(screen.queryByTestId('drawing-flyout')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('a click outside closes the panel', () => {
    mount();
    fireEvent.click(screen.getByTestId('drawing-group-lines'));

    fireEvent.mouseDown(document.body);

    expect(screen.queryByTestId('drawing-flyout')).not.toBeInTheDocument();
  });
});

/**
 * jsdom does no layout: every rectangle is 0×0. Without these faked measurements, "the panel opens
 * at the item's height" and "the panel opens at the top of the rail" produce exactly the same
 * assertion — which is how the reported defect would pass any rendering test.
 */
function stubGeometry(boxes: Readonly<Record<string, { top: number; height: number }>>): () => void {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function measured(this: Element): DOMRect {
    const box = boxes[this.getAttribute('data-testid') ?? ''] ?? { top: 0, height: 0 };
    return {
      top: box.top,
      bottom: box.top + box.height,
      height: box.height,
      left: 0,
      right: 0,
      width: 0,
      x: 0,
      y: box.top,
      toJSON: () => ({}),
    } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

describe('DrawingToolbar — the flyout by POINTER (an addition, never a replacement)', () => {
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

  it('the pointer opens the family — and ONLY after the intent delay', () => {
    mount();
    const trigger = screen.getByTestId('drawing-group-lines');

    fireEvent.mouseEnter(trigger);
    // POSITIVE CONTROL: without the delay, the panel would already be open at this instant — and it
    // would also open the one of every family the pointer brushed on its way to something else.
    tick(HOVER_OPEN_DELAY_MS - 1);
    expect(screen.queryByTestId('drawing-flyout')).not.toBeInTheDocument();

    tick(1);
    expect(screen.getByTestId('drawing-flyout')).toHaveAccessibleName('Lines');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('crossing the rail does not open what was on the way', () => {
    mount();

    fireEvent.mouseEnter(screen.getByTestId('drawing-group-lines'));
    tick(HOVER_OPEN_DELAY_MS - 40);
    fireEvent.mouseLeave(screen.getByTestId('drawing-group-lines'));
    fireEvent.mouseEnter(screen.getByTestId('drawing-group-channels'));
    tick(HOVER_OPEN_DELAY_MS);

    expect(screen.getAllByTestId('drawing-flyout')).toHaveLength(1);
    expect(screen.getByTestId('drawing-group-lines')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('drawing-group-channels')).toHaveAttribute('aria-expanded', 'true');
  });

  it('the path from trigger to panel is FORGIVEN: the pointer over the flyout does not close', () => {
    mount();
    const trigger = screen.getByTestId('drawing-group-lines');
    fireEvent.mouseEnter(trigger);
    tick(HOVER_OPEN_DELAY_MS);

    fireEvent.mouseLeave(trigger);
    tick(HOVER_CLOSE_DELAY_MS - 100); // the gap between the trigger and the panel
    fireEvent.mouseEnter(screen.getByTestId('drawing-flyout'));
    tick(HOVER_CLOSE_DELAY_MS * 3);

    expect(screen.getByTestId('drawing-flyout')).toBeInTheDocument();
  });

  it('leaving the panel closes it, after the delay', () => {
    mount();
    fireEvent.mouseEnter(screen.getByTestId('drawing-group-lines'));
    tick(HOVER_OPEN_DELAY_MS);
    const flyout = screen.getByTestId('drawing-flyout');

    fireEvent.mouseLeave(flyout);
    tick(HOVER_CLOSE_DELAY_MS - 1);
    expect(screen.getByTestId('drawing-flyout')).toBeInTheDocument();

    tick(1);
    expect(screen.queryByTestId('drawing-flyout')).not.toBeInTheDocument();
  });

  it('the CLICK still opens and closes without waiting on any clock', () => {
    mount();
    const trigger = screen.getByTestId('drawing-group-lines');

    fireEvent.click(trigger);
    expect(screen.getByTestId('drawing-flyout')).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByTestId('drawing-flyout')).not.toBeInTheDocument();
  });

  it('opening by HOVER never steals focus; opening by CLICK still hands it to the first item', () => {
    mount();
    const trigger = screen.getByTestId('drawing-group-lines');
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    fireEvent.mouseEnter(trigger);
    tick(HOVER_OPEN_DELAY_MS);
    // Stealing focus on hover would rip the caret out of wherever the user was typing.
    expect(document.activeElement).toBe(outside);

    // POSITIVE CONTROL: through the click the old contract still holds.
    fireEvent.click(screen.getByTestId('drawing-group-channels'));
    expect(document.activeElement).toBe(screen.getByTestId('drawing-option-parallel-channel'));
    outside.remove();
  });

  it('closing by pointer REFUSES while focus is inside the panel', () => {
    mount();
    fireEvent.click(screen.getByTestId('drawing-group-lines')); // opens WITH focus on the first item

    fireEvent.mouseLeave(screen.getByTestId('drawing-flyout'));
    tick(HOVER_CLOSE_DELAY_MS * 3);

    // Closing here would drop the focus onto `<body>` for whoever is navigating by keyboard.
    expect(screen.getByTestId('drawing-flyout')).toBeInTheDocument();
  });
});

describe('DrawingToolbar — where the flyout appears', () => {
  it('opens ALIGNED to the item that opened it, not at the top of the rail', () => {
    const restore = stubGeometry({
      'drawing-toolbar': { top: 0, height: 400 },
      'drawing-group-channels': { top: 120, height: 30 },
      'drawing-flyout': { top: 0, height: 90 },
    });
    try {
      mount({ heightPx: 400 });
      fireEvent.click(screen.getByTestId('drawing-group-channels'));

      // POSITIVE CONTROL: the previous behaviour was `top: 0` for EVERY family — the tenth tool's
      // panel opened 400px away from the trigger the user had just touched.
      expect(screen.getByTestId('drawing-flyout')).toHaveStyle({ top: '120px' });
    } finally {
      restore();
    }
  });

  it('RISES the minimum needed when it does not fit to the end of the screen — never clipped', () => {
    const restore = stubGeometry({
      'drawing-toolbar': { top: 0, height: 400 },
      'drawing-group-channels': { top: 350, height: 30 },
      'drawing-flyout': { top: 0, height: 200 },
    });
    try {
      mount({ heightPx: 400 });
      fireEvent.click(screen.getByTestId('drawing-group-channels'));

      // 350 + 200 = 550 > 400. It rises to 200 — the minimum that makes the whole panel fit — not 0.
      expect(screen.getByTestId('drawing-flyout')).toHaveStyle({ top: '200px' });
    } finally {
      restore();
    }
  });

  it('it never rises above the top: a panel taller than the box starts at 0 and scrolls', () => {
    const restore = stubGeometry({
      'drawing-toolbar': { top: 0, height: 200 },
      'drawing-group-lines': { top: 60, height: 30 },
      'drawing-flyout': { top: 0, height: 360 },
    });
    try {
      mount({ heightPx: 200 });
      fireEvent.click(screen.getByTestId('drawing-group-lines'));

      const flyout = screen.getByTestId('drawing-flyout');
      expect(flyout).toHaveStyle({ top: '0px' });
      expect(flyout.style.overflowY).toBe('auto');
    } finally {
      restore();
    }
  });
});

/**
 * SCROLLING THE RAIL WITH THE PANEL OPEN.
 *
 * The trigger lives INSIDE the box that scrolls; the panel is its sibling, anchored to the rail.
 * Scrolling moves one and not the other, and the panel stayed at the height of where the trigger
 * HAD BEEN — the same misalignment the original `top: 0` produced, only reintroduced by scrolling.
 */
describe("DrawingToolbar — the flyout follows the rail's scrolling", () => {
  it("repositions on the scroller's OWN event, and not before it", () => {
    // Mutable ON PURPOSE: the stub reads the box at call time, so moving the trigger here is the
    // only honest way to stage a scroll in a DOM that does no layout.
    const boxes: Record<string, { top: number; height: number }> = {
      'drawing-toolbar': { top: 0, height: 400 },
      'drawing-group-channels': { top: 120, height: 30 },
      'drawing-flyout': { top: 0, height: 90 },
    };
    const restore = stubGeometry(boxes);
    try {
      mount({ heightPx: 400 });
      fireEvent.click(screen.getByTestId('drawing-group-channels'));
      expect(screen.getByTestId('drawing-flyout')).toHaveStyle({ top: '120px' });

      // The rail scrolled 80px: the trigger moved up.
      boxes['drawing-group-channels'] = { top: 40, height: 30 };

      // POSITIVE CONTROL: without the event, nothing recomputes — it is what proves the assertion
      // that follows measures the REPOSITIONING and not a re-render that would have happened anyway.
      expect(screen.getByTestId('drawing-flyout')).toHaveStyle({ top: '120px' });

      fireEvent.scroll(screen.getByTestId('drawing-rail-scroll'));
      expect(screen.getByTestId('drawing-flyout')).toHaveStyle({ top: '40px' });
    } finally {
      restore();
    }
  });

  it('respects the ceiling on reposition: scrolling does not push the panel out of the box', () => {
    const boxes: Record<string, { top: number; height: number }> = {
      'drawing-toolbar': { top: 0, height: 400 },
      'drawing-group-channels': { top: 100, height: 30 },
      'drawing-flyout': { top: 0, height: 200 },
    };
    const restore = stubGeometry(boxes);
    try {
      mount({ heightPx: 400 });
      fireEvent.click(screen.getByTestId('drawing-group-channels'));
      expect(screen.getByTestId('drawing-flyout')).toHaveStyle({ top: '100px' });

      // Scrolling upward takes the trigger to 380: 380 + 200 overflows the box of 400.
      boxes['drawing-group-channels'] = { top: 380, height: 30 };
      fireEvent.scroll(screen.getByTestId('drawing-rail-scroll'));

      // The same ceiling as the opening case, applied to the new path — without it the scroll fix
      // would reopen the clipping the initial position already solved.
      expect(screen.getByTestId('drawing-flyout')).toHaveStyle({ top: '200px' });
    } finally {
      restore();
    }
  });
});


describe('DrawingToolbar — the magnet is a two-state control the rail draws', () => {
  /**
   * The state has to be READABLE, not merely held. A toggle that flips a mode and looks identical
   * either way tells a screen reader nothing and tells a sighted reader only what they remember
   * doing, which is the same absence of a magnet the feature exists to remove.
   */
  it('reports the mode as `aria-pressed`, and takes its name from the label channel', () => {
    const { view } = mount({ magnet: { mode: 'on', onChange: () => undefined } });

    const toggle = screen.getByTestId('drawing-magnet');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    // The NAME is the host's word, never a sentence the component holds.
    expect(toggle).toHaveAccessibleName('Magnet');

    // CONTROL POSITIVE: the same control with the mode off reports the other value, so the
    // attribute tracks the mode instead of being painted on.
    view.rerender(
      <DrawingToolbar
        tools={TOOLS}
        activeToolId={null}
        onSelect={() => undefined}
        magnet={{ mode: 'off', onChange: () => undefined }}
      />,
    );
    expect(screen.getByTestId('drawing-magnet')).toHaveAttribute('aria-pressed', 'false');
  });

  it('asks for the OTHER mode on click, and holds no copy of the one it was given', () => {
    const asked: MagnetMode[] = [];
    const { view } = mount({ magnet: { mode: 'off', onChange: (mode) => asked.push(mode) } });

    fireEvent.click(screen.getByTestId('drawing-magnet'));
    expect(asked).toEqual(['on']);
    // Still off: the control is told, and the mode is the caller's to change. A local copy would
    // have flipped here and disagreed with the provider on the next render.
    expect(screen.getByTestId('drawing-magnet')).toHaveAttribute('aria-pressed', 'false');

    view.rerender(
      <DrawingToolbar
        tools={TOOLS}
        activeToolId={null}
        onSelect={() => undefined}
        magnet={{ mode: 'on', onChange: (mode) => asked.push(mode) }}
      />,
    );
    fireEvent.click(screen.getByTestId('drawing-magnet'));
    expect(asked).toEqual(['on', 'off']);
  });

  it('draws NO toggle when the host brings no magnet group — the rail it had is the rail it keeps', () => {
    mount();

    expect(screen.queryByTestId('drawing-magnet')).toBeNull();
    // CONTROL POSITIVE: the two fixed controls beside it are still drawn, so the absence above is
    // the magnet being absent and not the rail failing to render its actions at all.
    expect(screen.getByTestId('drawing-delete')).toBeInTheDocument();
    expect(screen.getByTestId('drawing-clear')).toBeInTheDocument();
  });
});
