/**
 * @jest-environment jsdom
 *
 * The drawing rail REGION — the toolbar, the captured layer, and the seam both callers share.
 *
 * THE OPERATION HAS TWO CALLERS AND ONE OF THEM LIVES OUTSIDE THIS REGION. Deleting a selection is
 * reached from the rail's own button and from the root's keymap, so a suite that only pressed the
 * button would leave half the contract untested. The stand-in root below is deliberately the
 * thinnest thing that can hold a keymap: what is asserted is that both paths land on the same layer
 * call, not how the root spells its handler.
 *
 * THE VOCABULARY IS PROVED BY SWAPPING IT. Every label and every tool below differs from the
 * package defaults, so a rail that hard-coded any of them shows the wrong face.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import type { ReactElement, ReactNode } from 'react';

import type {
  DrawingBinding,
  DrawingLayer,
  DrawingSnapshot,
  DrawingSurfaceHost,
} from '../src/drawing/drawingLayer';
import { clearDrawingMemory } from '../src/drawing/drawingMemory';
import { WorkspaceChromeProvider } from '../src/react/chrome/ChromeContext';
import {
  DrawingRail,
  DrawingRailProvider,
  useDrawingRail,
} from '../src/react/workspace/DrawingRail';
import type { DrawingVocabulary } from '../src/react/workspace/DrawingRail';

/** Nothing here matches a package default: that is what makes the injection observable. */
const VOCABULARY: DrawingVocabulary = {
  tools: [
    // non-english-fixture: a host label in another language — English here would prove nothing
    { id: 'trend-line', label: 'Linha de tendência', glyph: '/', shortcut: 'Alt+T' },
    { id: 'rectangle', label: 'Retângulo', glyph: '[]' },
  ],
  labels: {
    group: 'Ferramentas de desenho',
    cursor: 'Cursor do host',
    deleteSelection: 'Apagar seleção',
    clearAll: 'Limpar tudo',
    // non-english-fixture: a host label in another language — English here would prove nothing
    allTools: 'Todas as ferramentas',
    otherTools: 'Outras',
    count: (drawings) => `${drawings} desenhos`,
  },
  shortcuts: { KeyT: 'trend-line' },
};

interface Recorded {
  readonly calls: string[];
  readonly restored: DrawingSnapshot[];
  layers: FakeLayer[];
  /** The events the canvas handed the layer, so a test can report a count the way a layer does. */
  report: ((count: number) => void) | null;
}

class FakeLayer implements DrawingLayer {
  detached = false;
  private held: string;

  constructor(
    private readonly log: Recorded,
    seed: string,
  ) {
    this.held = seed;
  }

  setActiveTool(toolId: string | null): void {
    this.log.calls.push(`arm:${toolId ?? 'none'}`);
  }

  deleteSelection(): void {
    this.log.calls.push('delete');
  }

  clearAll(): void {
    this.log.calls.push('clear');
    this.held = 'empty';
  }

  serialize(): DrawingSnapshot {
    return this.held;
  }

  restore(state: DrawingSnapshot): void {
    this.held = String(state);
    this.log.restored.push(state);
  }

  detach(): void {
    this.detached = true;
  }
}

function recorder(): Recorded {
  return { calls: [], restored: [], layers: [], report: null };
}

function bindingOf(log: Recorded, seed = 'two-drawings'): DrawingBinding {
  return (_host, events) => {
    const layer = new FakeLayer(log, seed);
    log.layers.push(layer);
    log.report = events.onCountChange;
    return layer;
  };
}

/** Stands in for the canvas: it is what calls the binding and, on the way out, `detach`. */
function FakeCanvas(): ReactElement {
  const { bind, onCount } = useDrawingRail();
  useEffect(() => {
    if (bind === undefined) return;
    const layer = bind({} as DrawingSurfaceHost, { onCountChange: onCount, onToolFinished: () => {} });
    return () => layer.detach();
  }, [bind, onCount]);
  return <div data-testid="canvas" />;
}

/** Stands in for the root: it owns a keymap, and the keymap reaches the layer through the seam. */
function FakeRoot({ children }: { readonly children: ReactNode }): ReactElement {
  const { deleteSelection } = useDrawingRail();
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: stands in for the root's own keymap
    <div
      data-testid="root"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== 'Delete' && event.key !== 'Backspace') return;
        event.preventDefault();
        deleteSelection();
      }}
    >
      {children}
    </div>
  );
}

interface HarnessProps {
  readonly binding?: DrawingBinding;
  readonly market?: string;
  readonly onDeleteSelection?: () => void;
  readonly canvas?: boolean;
}

function Harness({
  binding,
  market = 'BTCUSDT',
  onDeleteSelection,
  canvas = true,
}: HarnessProps): ReactElement {
  return (
    <WorkspaceChromeProvider>
      <DrawingRailProvider
        vocabulary={VOCABULARY}
        binding={binding}
        market={market}
        onDeleteSelection={onDeleteSelection}
      >
        <FakeRoot>
          <DrawingRail heightPx={400} />
          {canvas ? <FakeCanvas /> : null}
        </FakeRoot>
      </DrawingRailProvider>
    </WorkspaceChromeProvider>
  );
}

const armed = (): string[] =>
  screen
    .getAllByRole('radio')
    .filter((node) => node.getAttribute('aria-checked') === 'true')
    .map((node) => node.getAttribute('aria-label') ?? node.textContent ?? '');

beforeEach(() => {
  clearDrawingMemory();
});

describe('the drawing rail region', () => {
  it('shows the tools and the labels the host injected, not any of its own', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-label', 'Ferramentas de desenho');
    expect(screen.getAllByRole('radio').map((node) => node.getAttribute('aria-label'))).toEqual([
      'Cursor do host',
      // non-english-fixture: a host label in another language — English here would prove nothing
      'Linha de tendência (Alt+T)',
      'Retângulo',
    ]);
    expect(screen.getByRole('button', { name: 'Apagar seleção' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpar tudo' })).toBeInTheDocument();
  });

  it('highlights exactly the tool that is armed, and the cursor is what disarms', () => {
    render(<Harness />);
    expect(armed()).toEqual(['Cursor do host']);
    fireEvent.click(screen.getByRole('radio', { name: 'Retângulo' }));
    expect(armed()).toEqual(['Retângulo']);
    // non-english-fixture: a host label in another language — English here would prove nothing
    fireEvent.click(screen.getByRole('radio', { name: 'Linha de tendência (Alt+T)' }));
    // non-english-fixture: a host label in another language — English here would prove nothing
    expect(armed()).toEqual(['Linha de tendência (Alt+T)']);
    fireEvent.click(screen.getByRole('radio', { name: 'Cursor do host' }));
    expect(armed()).toEqual(['Cursor do host']);
  });

  it('reaches the layer from the rail button, for both editing operations', () => {
    const log = recorder();
    render(<Harness binding={bindingOf(log)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apagar seleção' }));
    fireEvent.click(screen.getByRole('button', { name: 'Limpar tudo' }));
    expect(log.calls).toEqual(['delete', 'clear']);
  });

  it('reaches the same layer operation from the root keymap as from the rail button', () => {
    const fromButton = recorder();
    const button = render(<Harness binding={bindingOf(fromButton)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apagar seleção' }));
    button.unmount();

    const fromKeyboard = recorder();
    render(<Harness binding={bindingOf(fromKeyboard)} />);
    fireEvent.keyDown(screen.getByTestId('root'), { key: 'Delete' });

    expect(fromKeyboard.calls).toEqual(fromButton.calls);
    expect(fromKeyboard.calls).toEqual(['delete']);
  });

  it('tells the host about a deletion whichever caller started it', () => {
    const told: string[] = [];
    const log = recorder();
    render(<Harness binding={bindingOf(log)} onDeleteSelection={() => told.push('told')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Apagar seleção' }));
    fireEvent.keyDown(screen.getByTestId('root'), { key: 'Backspace' });
    expect(told).toEqual(['told', 'told']);
  });

  it('carries the count the layer reports back to the rail, in the host wording', () => {
    const log = recorder();
    render(<Harness binding={bindingOf(log)} />);
    expect(screen.queryByText('3 desenhos')).toBeNull();
    // The layer reports on its own schedule — a click, a package event — and the seam is what
    // carries the number from the canvas across to the rail.
    act(() => log.report?.(3));
    expect(screen.getByText('3 desenhos')).toBeInTheDocument();
  });

  it('renders inert and mounts without throwing when the host brought no binding', () => {
    render(<Harness binding={undefined} />);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    // EVERY control, not a sample: an inert seam that threw on one of them is the failure.
    expect(() => {
      fireEvent.click(screen.getByRole('radio', { name: 'Retângulo' }));
      fireEvent.click(screen.getByRole('radio', { name: 'Cursor do host' }));
      fireEvent.click(screen.getByRole('button', { name: 'Apagar seleção' }));
      fireEvent.click(screen.getByRole('button', { name: 'Limpar tudo' }));
      fireEvent.keyDown(screen.getByTestId('root'), { key: 'Delete' });
    }).not.toThrow();
    expect(armed()).toEqual(['Cursor do host']);
  });

  it('carries the drawings across a remount, which is what a full-screen switch is', () => {
    const log = recorder();
    const first = render(<Harness binding={bindingOf(log)} />);
    first.unmount();
    render(<Harness binding={bindingOf(log)} />);
    expect(log.restored).toEqual(['two-drawings']);
  });

  it('takes the snapshot from the layer that is still alive when both mounts overlap', () => {
    // THE CLOSING CASE. A dialog leaves by a transition, so the embedded instance mounts while the
    // full-screen one is still alive and its teardown snapshot does not exist yet.
    const log = recorder();
    const open = render(<Harness binding={bindingOf(log, 'drawn-in-fullscreen')} />);
    render(<Harness binding={bindingOf(log, 'stale-seed')} />);
    expect(log.restored).toEqual(['drawn-in-fullscreen']);
    open.unmount();
  });

  it('keeps the drawings of one market out of the memory of another', () => {
    const log = recorder();
    const btc = render(<Harness binding={bindingOf(log, 'btc-drawings')} market="BTCUSDT" />);
    btc.unmount();
    render(<Harness binding={bindingOf(log, 'eth-drawings')} market="ETHUSDT" />);
    expect(log.restored).toEqual([]);
  });

  it('refuses to answer outside the provider instead of pretending to work', () => {
    function Orphan(): ReactElement {
      useDrawingRail();
      return <div />;
    }
    const noise = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Orphan />)).toThrow(/DrawingRailProvider/);
    noise.mockRestore();
  });
});

/**
 * THE MAGNET IS A MODE, AND THE MODE HAS ONE HOME.
 *
 * The provider is asserted to hold it and to render nothing about it. A provider that grew its own
 * toggle would put the library's words on a host's screen, and a second copy of the mode anywhere
 * would disagree with this one the first time a keyboard shortcut wrote to it.
 */
function MagnetProbe(): ReactElement {
  const { magnet, setMagnet } = useDrawingRail();
  return (
    <button type="button" data-testid="magnet-probe" onClick={() => setMagnet('on')}>
      {magnet}
    </button>
  );
}

function MagnetHarness(): ReactElement {
  return (
    <WorkspaceChromeProvider>
      <DrawingRailProvider vocabulary={VOCABULARY} market="BTCUSDT">
        <MagnetProbe />
      </DrawingRailProvider>
    </WorkspaceChromeProvider>
  );
}

describe('the rail provider holds the magnet mode', () => {
  it('reads OFF on the first render, because the library never defaults to the complaint', () => {
    render(<MagnetHarness />);
    expect(screen.getByTestId('magnet-probe')).toHaveTextContent('off');
  });

  it('flips to ON when a consumer writes it, and the consumer sees the new value', () => {
    render(<MagnetHarness />);
    fireEvent.click(screen.getByTestId('magnet-probe'));
    expect(screen.getByTestId('magnet-probe')).toHaveTextContent('on');
  });

  it('renders no control and no glyph of its own: the whole DOM belongs to the consumer', () => {
    const view = render(<MagnetHarness />);
    expect(view.container.innerHTML).toBe(
      '<button type="button" data-testid="magnet-probe">off</button>',
    );
  });
});
