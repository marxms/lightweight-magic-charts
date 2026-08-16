/**
 * @jest-environment jsdom
 *
 * The canvas row, and the residual it measures.
 *
 * THE FAILURE IS POSITIONAL, so the assertions are positional. The column is modelled with a header
 * above the row and a footer below it, and what is checked is where the time axis ENDS relative to
 * the footer's top edge — never a pixel count, which would pass for a row whose numbers happen to
 * line up and say nothing about the overlap the user sees.
 *
 * THE TEARDOWN IS CHECKED BY WHAT IS LEFT IN FLIGHT, not by whether a disposer ran. A disposer that
 * disconnects the observer and forgets the frame passes every "cleanup was called" assertion.
 */
import { act, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';

import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import { CanvasRow } from '../src/react/workspace/CanvasRow';
import type { StackApplication } from '../src/layout/application';

/** The column, as the host lays it out: chrome above, the flexing row, chrome below. */
const COLUMN_PX = 600;
const HEADER_PX = 40;
const FOOTER_PX = 60;
const ROW_PX = COLUMN_PX - HEADER_PX - FOOTER_PX;
const FOOTER_TOP = HEADER_PX + ROW_PX;

interface Observed {
  readonly target: Element;
}

class StubResizeObserver {
  static instances: StubResizeObserver[] = [];
  readonly observed: Observed[] = [];
  disconnected = false;
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    StubResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.push({ target });
  }

  unobserve(): void {}

  disconnect(): void {
    this.disconnected = true;
  }

  emit(height: number): void {
    const entry = { contentRect: { height } } as unknown as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
}

let frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 1;

function installMeasurement(): void {
  StubResizeObserver.instances = [];
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = StubResizeObserver;
  frames = new Map();
  nextFrameId = 1;
  window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
    const id = nextFrameId++;
    frames.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = (id: number): void => {
    frames.delete(id);
  };
}

afterEach(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = undefined;
});

const observer = (): StubResizeObserver => StubResizeObserver.instances[0];
const pendingFrames = (): number => frames.size;

function flushFrames(): void {
  const due = [...frames.values()];
  frames.clear();
  for (const callback of due) callback(0);
}

interface HarnessProps {
  readonly heightPx?: number;
  readonly onLayout?: (application: StackApplication) => void;
}

function Harness({ heightPx = COLUMN_PX, onLayout }: HarnessProps): ReactElement {
  return (
    <WorkspaceChromeProvider>
      <div>
        <div data-testid="header" style={{ height: HEADER_PX }} />
        <CanvasRow heightPx={heightPx} onLayout={onLayout}>
          {(surfacePx) => <div data-testid="canvas" data-height={surfacePx} />}
        </CanvasRow>
        <div data-testid="footer" style={{ height: FOOTER_PX }} />
      </div>
    </WorkspaceChromeProvider>
  );
}

/** Where the drawn canvas ends: the row starts under the header and is as tall as it was granted. */
function axisBottom(): number {
  return HEADER_PX + Number(screen.getByTestId('canvas').dataset.height);
}

describe('the canvas row', () => {
  it('keeps the time axis above the footer once the row itself has been measured', () => {
    installMeasurement();
    render(<Harness />);
    act(() => {
      observer().emit(ROW_PX);
      flushFrames();
    });
    expect(axisBottom()).toBeLessThanOrEqual(FOOTER_TOP);
  });

  it('pushes the time axis under the footer when a constant stands in for the measurement', () => {
    // POSITIVE CONTROL, and it is the defect written in the origin: with no box to measure, the
    // residual is the host budget minus a fixed guess, and the guess does not know what the footer
    // took. If this ever stops overlapping, the assertion above has stopped discriminating.
    render(<Harness />);
    expect(axisBottom()).toBeGreaterThan(FOOTER_TOP);
  });

  it('observes the row it renders, and only it', () => {
    installMeasurement();
    render(<Harness />);
    expect(observer().observed).toHaveLength(1);
    expect(observer().observed[0].target).toBe(screen.getByTestId('workspace-canvas-row'));
  });

  it('is the box the surface and the grid share, so nothing may cap its width', () => {
    // THE ROW IS THE THIRD WAY TO PAINT A BLANK SCREEN, and until this clause existed it was the
    // one nothing read at all. The two members inside it are pinned where they are declared
    // (`compactGrid.spec.tsx`, `chartSurface.spec.tsx`); this is the box that HOLDS them, and a cap
    // of zero here takes both down at once — measured in Chromium, `surface=0, grid=0 of row=0`.
    // Asserted as an absence, because the defect is a declaration arriving, not one going missing.
    installMeasurement();
    render(<Harness />);
    const row = screen.getByTestId('workspace-canvas-row');
    expect(row.style.maxWidth).toBe('');
    // CONTROL POSITIVE, and the reason `flex` is read differently here than on the two members: the
    // row IS the flex item of the column above it, so `flex: 1` is correct HERE and wrong THERE.
    // Without this line the clause above would also pass over a row that stopped stretching at all.
    expect(row).toHaveStyle({ display: 'flex', flex: '1', minHeight: '0' });
  });

  it('ignores a zero-height observation instead of granting the canvas nothing', () => {
    installMeasurement();
    render(<Harness />);
    act(() => {
      observer().emit(ROW_PX);
      flushFrames();
    });
    const granted = Number(screen.getByTestId('canvas').dataset.height);
    act(() => {
      observer().emit(0);
      flushFrames();
    });
    expect(Number(screen.getByTestId('canvas').dataset.height)).toBe(granted);
  });

  it('keeps at most one frame in flight across a storm of resizes', () => {
    installMeasurement();
    render(<Harness />);
    act(() => {
      observer().emit(ROW_PX);
      observer().emit(ROW_PX - 10);
      observer().emit(ROW_PX - 20);
    });
    expect(pendingFrames()).toBe(1);
  });

  it('leaves no frame pending when the row unmounts', () => {
    installMeasurement();
    const view = render(<Harness />);
    act(() => {
      observer().emit(ROW_PX);
    });
    // The frame really is in flight before the unmount — without this the count below would be
    // satisfied by a row that never scheduled anything.
    expect(pendingFrames()).toBe(1);
    view.unmount();
    expect(pendingFrames()).toBe(0);
  });

  it('turns the observer off when the row unmounts', () => {
    installMeasurement();
    const view = render(<Harness />);
    expect(observer().disconnected).toBe(false);
    view.unmount();
    expect(observer().disconnected).toBe(true);
  });

  it('reports a residual that cannot hold a chart instead of drawing panes at the floor', () => {
    const reported: StackApplication[] = [];
    render(<Harness heightPx={0} onLayout={(application) => reported.push(application)} />);
    expect(screen.queryByTestId('canvas')).toBeNull();
    expect(reported).toHaveLength(1);
    expect(reported[0].kind).toBe('degenerate');
    expect(reported[0].kind === 'degenerate' ? reported[0].totalPx : 1).toBeLessThanOrEqual(0);
  });

  it('draws instead of reporting when the residual can hold a chart', () => {
    const reported: StackApplication[] = [];
    render(<Harness onLayout={(application) => reported.push(application)} />);
    expect(screen.getByTestId('canvas')).toBeInTheDocument();
    expect(reported).toEqual([]);
  });
});
