/**
 * @jest-environment jsdom
 *
 * WHERE THE PANEL LANDS — with faked geometry, because jsdom does no layout.
 *
 * Every rectangle in jsdom is 0×0. Without these staged measurements, "the panel opens at the
 * trigger's height" and "the panel opens at the top of the rail" produce exactly the SAME assertion
 * — which is how the positioning defect got through a whole rendering suite before.
 *
 * THE ARRANGEMENT IS PART OF THE CONTRACT: the panel is the root's child, the scroller's SIBLING.
 * The coordinates are measured against the root, and that is what the cases discriminate — a
 * calculation relative to the scroller would give another number for the same screen.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';

import { useFlyoutPosition } from '../src/react/chrome/useFlyoutPosition';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Reads the box AT CALL TIME, so that moving a rectangle stages a scroll. */
function stubGeometry(boxes: Readonly<Record<string, Box>>): () => void {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function measured(this: Element): DOMRect {
    const box = boxes[this.getAttribute('data-testid') ?? ''] ?? {
      top: 0,
      left: 0,
      width: 0,
      height: 0,
    };
    return {
      top: box.top,
      bottom: box.top + box.height,
      left: box.left,
      right: box.left + box.width,
      width: box.width,
      height: box.height,
      x: box.left,
      y: box.top,
      toJSON: () => ({}),
    } as DOMRect;
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

function Harness({
  availableHeightPx,
  availableWidthPx,
}: {
  availableHeightPx?: number;
  availableWidthPx?: number;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const { topPx, leftPx, reposition } = useFlyoutPosition({
    rootRef,
    triggerRef,
    panelRef,
    availableHeightPx,
    availableWidthPx,
  });

  return (
    <div ref={rootRef} data-testid="root" style={{ position: 'relative' }}>
      <div data-testid="scroller" onScroll={reposition} style={{ overflowY: 'auto' }}>
        <button type="button" ref={triggerRef} data-testid="trigger">
          t
        </button>
      </div>
      {/* SIBLING of the scroller, never a child: it is what escapes the clip without a portal. */}
      <div
        ref={panelRef}
        data-testid="panel"
        style={{ position: 'absolute', top: topPx, left: leftPx }}
      />
    </div>
  );
}

const RAIL = {
  root: { top: 0, left: 0, width: 42, height: 400 },
  scroller: { top: 50, left: 0, width: 42, height: 350 },
  trigger: { top: 120, left: 4, width: 34, height: 30 },
  panel: { top: 0, left: 0, width: 208, height: 90 },
};

function mount(boxes: Record<string, Box>, props: Parameters<typeof Harness>[0] = {}) {
  const restore = stubGeometry(boxes);
  try {
    render(<Harness {...props} />);
  } catch (error) {
    restore();
    throw error;
  }
  return restore;
}

describe('LMC-11 — the trigger is measured against the ROOT, not against the scroller', () => {
  it('aligns the panel to the trigger height, in root coordinates', () => {
    const restore = mount({ ...RAIL });
    try {
      // POSITIVE CONTROL of the reference: the scroller starts at 50. A calculation relative to IT
      // would give 70 for the same screen — and the panel, the scroller's sibling, would show up
      // 50px above the trigger.
      expect(screen.getByTestId('panel')).toHaveStyle({ top: '120px' });
    } finally {
      restore();
    }
  });
});

describe('LMC-11 — the panel is clamped on all FOUR sides of the available box', () => {
  it('BOTTOM edge: rises the minimum needed instead of being cut off', () => {
    const restore = mount(
      {
        ...RAIL,
        trigger: { top: 350, left: 4, width: 34, height: 30 },
        panel: { top: 0, left: 0, width: 208, height: 200 },
      },
      { availableHeightPx: 400 },
    );
    try {
      // 350 + 200 = 550 overflows the box of 400. It rises to 200 — the minimum that makes it fit
      // whole — and not to 0, which would throw the panel far from the trigger that was touched.
      expect(screen.getByTestId('panel')).toHaveStyle({ top: '200px' });
    } finally {
      restore();
    }
  });

  it('TOP edge: a trigger scrolled above the root does not push the panel out', () => {
    const restore = mount(
      {
        ...RAIL,
        root: { top: 100, left: 0, width: 42, height: 400 },
        trigger: { top: 60, left: 4, width: 34, height: 30 },
      },
      { availableHeightPx: 400 },
    );
    try {
      // The wanted value is -40: without the floor, the panel would open above the top of the box.
      expect(screen.getByTestId('panel')).toHaveStyle({ top: '0px' });
    } finally {
      restore();
    }
  });

  it('RIGHT edge: pulls back the minimum needed for the panel to fit the host box', () => {
    const restore = mount(
      { ...RAIL, root: { top: 0, left: 0, width: 300, height: 400 } },
      { availableHeightPx: 400, availableWidthPx: 400 },
    );
    try {
      // Sitting against the root's edge would ask for 300; with a panel of 208 in a box of 400,
      // the limit is 192. It is the axis the previous version of this measurement did not handle
      // at all.
      expect(screen.getByTestId('panel')).toHaveStyle({ left: '192px' });
    } finally {
      restore();
    }
  });

  it('LEFT edge: a panel wider than the box starts at 0, and not at a negative number', () => {
    const restore = mount(
      { ...RAIL, panel: { top: 0, left: 0, width: 300, height: 90 } },
      { availableHeightPx: 400, availableWidthPx: 100 },
    );
    try {
      expect(screen.getByTestId('panel')).toHaveStyle({ left: '0px' });
    } finally {
      restore();
    }
  });

  it('with no declared width there is no horizontal limit: the panel sits at the root edge', () => {
    const restore = mount({ ...RAIL }, { availableHeightPx: 400 });
    try {
      // The root is 42 wide and the panel 208: a limit taken from the ROOT's box would pull it to
      // 0, on top of the rail itself. Outside the root is where it is meant to overflow.
      expect(screen.getByTestId('panel')).toHaveStyle({ left: '42px' });
    } finally {
      restore();
    }
  });
});

describe('LMC-11 — recalculates on scrolling the CONTAINER that scrolls, never the window', () => {
  it("repositions on the scroller's own event, and not before it", () => {
    const boxes: Record<string, Box> = { ...RAIL };
    const restore = mount(boxes, { availableHeightPx: 400 });
    try {
      expect(screen.getByTestId('panel')).toHaveStyle({ top: '120px' });

      // The rail scrolled 80px: the trigger went up and the panel, the scroller's sibling, did not.
      boxes.trigger = { top: 40, left: 4, width: 34, height: 30 };

      // POSITIVE CONTROL: with no event nothing recalculates — that is what proves the next
      // assertion measures the REPOSITIONING, and not a re-render that would have happened anyway.
      expect(screen.getByTestId('panel')).toHaveStyle({ top: '120px' });

      fireEvent.scroll(screen.getByTestId('scroller'));
      expect(screen.getByTestId('panel')).toHaveStyle({ top: '40px' });
    } finally {
      restore();
    }
  });

  it('scrolling the WINDOW does not reposition: there the trigger and the panel move together', () => {
    const boxes: Record<string, Box> = { ...RAIL };
    const restore = mount(boxes, { availableHeightPx: 400 });
    try {
      boxes.trigger = { top: 40, left: 4, width: 34, height: 30 };
      fireEvent.scroll(window);

      // A listener on `window` would cost an install, a removal and one recalculation per scroll
      // frame to change nothing — and here it would show up as the same measure as the case above.
      expect(screen.getByTestId('panel')).toHaveStyle({ top: '120px' });
    } finally {
      restore();
    }
  });

  it('respects the ceiling when repositioning: scrolling does not push the panel out of the box', () => {
    const boxes: Record<string, Box> = {
      ...RAIL,
      panel: { top: 0, left: 0, width: 208, height: 200 },
    };
    const restore = mount(boxes, { availableHeightPx: 400 });
    try {
      boxes.trigger = { top: 380, left: 4, width: 34, height: 30 };
      fireEvent.scroll(screen.getByTestId('scroller'));

      // Without this, the scroll correction would reopen the clipping the initial position solved.
      expect(screen.getByTestId('panel')).toHaveStyle({ top: '200px' });
    } finally {
      restore();
    }
  });
});
