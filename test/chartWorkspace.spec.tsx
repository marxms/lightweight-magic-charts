/**
 * @jest-environment jsdom
 *
 * The composed component — the story's own independent test.
 *
 * WHAT MAKES IT INDEPENDENT: the mount below hands over a catalogue, a fake data seam and a height
 * budget, and NOTHING ELSE. No theme, no chrome role, no label, no section body. If the six chrome
 * regions still appear, the extraction delivered a product; if they need a component prop first, it
 * delivered a kit of parts with a wrapper on top.
 *
 * THE ENGINE IS A FAKE, NOT A MOCKED PACKAGE: the composition talks to the base library through
 * `ChartEngine`, so a whole workspace runs without a canvas.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import type { ReactElement } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { ChartWorkspace } from '../src/react/workspace/ChartWorkspace';
import type { ChartWorkspaceProps } from '../src/react/workspace/ChartWorkspace';
import { useWorkspaceChrome } from '../src/react/chrome/ChromeContext';
import { newAlertLevel } from '../src/react/workspace/PrimaryActions';
import { useWorkspaceSetup, useWorkspaceSetupWriter } from '../src/react/workspace/setupContext';
import { clearDrawingMemory } from '../src/drawing/drawingMemory';
import type { DrawingBinding, DrawingLayer, DrawingSnapshot } from '../src/drawing/drawingLayer';
import type { Bar, PaneSpec, Scope } from '../src/domain/types';
import { paneId, seriesId, utcSeconds } from '../src/domain/types';
import { resolutionPolicy } from '../src/catalogue/sources';
import type { SourceLookup } from '../src/catalogue/sources';
import { resolveSources } from '../src/indicator/resolution';
import type { DensitySlice } from '../src/overlays/densityField';
import type { LiveTip } from '../src/port/frames';
import { seriesStyleKey } from '../src/react/surface/ChartSurface';
import type { SeriesReader } from '../src/react/surface/ChartSurface';
import type {
  BitmapTarget,
  ChartEngine,
  SeriesHandle,
  SeriesMarkerPoint,
  WorkspaceChartHandle,
} from '../src/port/chartApi';
import type { FrameSink, HistoryRequest, HistoryResult, MarketDataPort, Unsubscribe } from '../src/port/ports';
import type { OverlayPrimitive } from '../src/render/overlayBridge';
import type { StudySettings, WorkspaceSetupPolicy } from '../src/tabs/setup';
import { MAX_WORKSPACE_TABS } from '../src/tabs/workspaceTabs';
import type { WorkspaceStore } from '../src/tabs/workspaceTabs';
import { RecordingContext } from './renderFakes';

const LIB_ROOT = join(__dirname, '..');

/**
 * The smallest catalogue that still says something — and the TITLES ARE NOT THE IDENTIFIERS.
 *
 * That divergence is the whole point of the pane-title clause: a catalogue whose `price` pane is
 * called "Price" proves nothing, because the identifier already reads as a name. Here the only way
 * to render `Preço` is to have read `title`.
 */
const CATALOGUE: WorkspaceSetupPolicy = {
  catalogue: [
    { id: 'price', defaultVisible: true, heightPx: 200, title: 'Preço' },
    { id: 'volume', defaultVisible: true, heightPx: 90, title: 'Volume negociado' },
  ],
  servedTimeframes: ['1h', '4h'],
  gridFallback: ['1h'],
  maxGridCells: 4,
  density: { floor: 0.1, gamma: 1 },
  showDensity: false,
  showProfile: false,
  autoFit: true,
  coerceIndicators: () => [],
};

const BARS: readonly Bar[] = [
  { time: utcSeconds(1000), open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 },
  { time: utcSeconds(2000), open: 1.5, high: 3, low: 1, close: 2.5, volume: 20 },
];

/** A port that seeds the window it is asked for, and can be told to seed nothing at all. */
function fakePort(bars: readonly Bar[] = BARS): MarketDataPort {
  return {
    describe: () => [],
    subscribe: (_scope: Scope, _sink: FrameSink): Unsubscribe => () => undefined,
    fetchBars: async (): Promise<HistoryResult> => ({ bars, exhausted: true }),
  };
}

/** The same port, plus a note of every scope it was actually opened on, in order. */
function recordingPort(opened: string[]): MarketDataPort {
  return {
    ...fakePort(),
    subscribe: (scope: Scope, _sink: FrameSink): Unsubscribe => {
      opened.push(scope.resolution);
      return () => undefined;
    },
  };
}

function fakePane(index: number) {
  return {
    setStretchFactor: () => undefined,
    getStretchFactor: () => 1,
    getHTMLElement: () => null,
    setPreserveEmptyPane: () => undefined,
    moveTo: () => undefined,
    paneIndex: () => index,
  };
}

/**
 * What the chart was told to draw that no DOM would ever show.
 *
 * The two sockets below reach the base library and stop there: an overlay is attached to a series
 * and a marker list is handed to one. Neither leaves a node behind, so a mount assertion cannot
 * tell a wired one from an omitted one — which is exactly the confusion these tests exist to end.
 */
interface EngineLedger {
  readonly attached: OverlayPrimitive[];
  readonly markers: Array<readonly SeriesMarkerPoint[]>;
  /** The tag each price line was born with, and every tag it was given afterwards. */
  readonly priceLineTitles: string[];
  /** Every payload written to a series, in write order — the candles are the first. */
  readonly drawn: Array<readonly unknown[]>;
}

const noLedger = (): EngineLedger => ({
  attached: [],
  markers: [],
  priceLineTitles: [],
  drawn: [],
});

/**
 * Everything the surface reaches for on the chart, and nothing it does not.
 *
 * `markerDoor` is a CHOICE here rather than a given. Measured on the installed
 * `lightweight-charts@5`, `ISeriesApi` has no `setMarkers` — it lives on
 * `ISeriesMarkersPluginApi` — so a host that returns the raw series has a door that swallows every
 * call. A double that implements what the real object lacks is how the 0.2.1 pattern marks came to
 * ship without drawing, so the closed door is a case here and the real one is proven in the e2e.
 */
function makeEngine(ledger: EngineLedger = noLedger(), markerDoor = true): ChartEngine {
  return () => {
    let paneCount = 1;
    return {
      panes: () => Array.from({ length: paneCount }, (_unused, index) => fakePane(index)),
      addPane: () => {
        paneCount += 1;
        return fakePane(paneCount - 1);
      },
      addSeries: (): SeriesHandle =>
        ({
          setData: (data: readonly unknown[]) => ledger.drawn.push(data),
          applyOptions: () => undefined,
          priceScale: () => ({ applyOptions: () => undefined }),
          createPriceLine: (line: unknown) => {
            ledger.priceLineTitles.push(String((line as { title?: unknown }).title));
            return {
              applyOptions: (next: unknown) => {
                const title = (next as { title?: unknown }).title;
                if (title !== undefined) ledger.priceLineTitles.push(String(title));
              },
            };
          },
          removePriceLine: () => undefined,
          priceToCoordinate: () => null,
          coordinateToPrice: () => null,
          attachPrimitive: (primitive: unknown) => ledger.attached.push(primitive as OverlayPrimitive),
          detachPrimitive: () => undefined,
          ...(markerDoor
            ? { setMarkers: (marks: unknown) => ledger.markers.push(marks as readonly SeriesMarkerPoint[]) }
            : {}),
        }) as unknown as SeriesHandle,
      applyOptions: () => undefined,
      timeScale: () => ({ fitContent: () => undefined }),
      subscribeCrosshairMove: () => undefined,
      unsubscribeCrosshairMove: () => undefined,
      remove: () => undefined,
    } as unknown as WorkspaceChartHandle;
  };
}

const fakeEngine: ChartEngine = makeEngine();

/** The three required groups, and not one thing more. This literal IS the independent test. */
function minimalProps(port: MarketDataPort): ChartWorkspaceProps {
  return {
    catalogue: CATALOGUE,
    data: { port, engine: fakeEngine, symbol: 'AAA-BBB' },
    layout: { heightPx: 480 },
  };
}

/** Reads BOTH contexts. Either provider missing and the hook throws instead of serving a default. */
function Probe(): ReactElement {
  const { testIdPrefix } = useWorkspaceChrome();
  const panes = useWorkspaceSetup((setup) => setup.panes.length);
  return <span data-testid="probe">{`${testIdPrefix}/${panes as number}`}</span>;
}

/** Value exports the entry re-publishes out of the workspace layer. */
function composedExports(indexText: string): string[] {
  const sourceFile = ts.createSourceFile('index.ts', indexText, ts.ScriptTarget.ES2021, true);
  const found: string[] = [];
  sourceFile.forEachChild((node) => {
    if (!ts.isExportDeclaration(node) || node.isTypeOnly) return;
    const from = node.moduleSpecifier;
    if (from === undefined || !ts.isStringLiteral(from)) return;
    if (!from.text.startsWith('./react/workspace/')) return;
    const clause = node.exportClause;
    if (clause === undefined || !ts.isNamedExports(clause)) return;
    for (const element of clause.elements) {
      if (!element.isTypeOnly) found.push(element.name.text);
    }
  });
  return found.sort();
}

function rootSource(): ts.SourceFile {
  return ts.createSourceFile(
    'ChartWorkspace.tsx',
    readFileSync(join(LIB_ROOT, 'src', 'react', 'workspace', 'ChartWorkspace.tsx'), 'utf8'),
    ts.ScriptTarget.ES2021,
    true,
    ts.ScriptKind.TSX,
  );
}

/** Top-level prop names of an interface in the root, by the compiler's own reading. */
function declaredProps(source: ts.SourceFile, name: string): string[] {
  const declared = source.statements
    .filter(ts.isInterfaceDeclaration)
    .find((node) => node.name.text === name);
  return (declared?.members ?? [])
    .map((member) =>
      member.name !== undefined && ts.isIdentifier(member.name) ? member.name.text : '',
    )
    .sort();
}

/**
 * Every call that WRITES the error channel, wherever in the root file it sits.
 *
 * Both spellings count, because the channel has two holders: the state setter the root keeps, and
 * the handle the body is given. A counter that knew only one of them would report a channel with
 * fewer writers than it has, which is the failure this clause exists to make impossible.
 */
function noticeWriters(source: ts.SourceFile): number {
  let found = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const bare = ts.isIdentifier(callee) && callee.text === 'report';
      const held =
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 'report' &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'notice';
      if (bare || held) found += 1;
    }
    node.forEachChild(visit);
  };
  source.forEachChild(visit);
  return found;
}

/** Opens the studies menu, which is where the three section bodies live. */
function openStudies(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Studies' }));
}

class FakeLayer implements DrawingLayer {
  readonly armed: (string | null)[] = [];
  deleted = 0;
  /** What this layer is currently holding. A leak shows up here as another market's drawing. */
  held: DrawingSnapshot = null;
  serialize(): DrawingSnapshot {
    return this.held;
  }
  restore(snapshot: DrawingSnapshot): void {
    this.held = snapshot;
  }
  setActiveTool(toolId: string | null): void {
    this.armed.push(toolId);
  }
  deleteSelection(): void {
    this.deleted += 1;
  }
  clearAll(): void {
    // A double that declares the contract has to HONOUR it: 'clear all' means the layer stops
    // holding drawings. One that quietly keeps them makes a leak look like a fix.
    this.held = null;
  }
  detach(): void {}
}

beforeEach(() => clearDrawingMemory());

describe('the composed component, mounted with nothing but catalogue, port and budget', () => {
  it('renders panes, the per-pane legend, the tab strip, the studies menu, the drawing rail and the density controls', () => {
    render(<ChartWorkspace {...minimalProps(fakePort())} />);

    // The tab strip, the studies trigger and the drawing rail: all three born without a prop.
    expect(screen.getByRole('tablist', { name: /tab/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Studies' })).toBeInTheDocument();
    expect(screen.getByTestId('workspace-tools')).toBeInTheDocument();
    // The per-pane legend is part of the surface, and the surface is part of the composition.
    expect(screen.getByTestId('workspace-legends')).toBeInTheDocument();

    openStudies();
    // The pane list is the first section, so it is the one the menu opens on.
    expect(screen.getByTestId('workspace-panes')).toBeInTheDocument();
    // And the density controls sit one section over, under the overlay switches.
    fireEvent.click(screen.getByTestId('workspace-catalogue-section-overlays'));
    expect(screen.getByRole('button', { name: 'Liquidation heatmap' })).toBeInTheDocument();
  });

  it('paints with its own chrome: the roles resolve to the package defaults, unasked', () => {
    render(<ChartWorkspace {...minimalProps(fakePort())} />);
    // A `Pill` default renders a real button carrying its own pressed state; a missing role would
    // render nothing at all and the query above would already have failed.
    expect(screen.getByRole('button', { name: 'Studies' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('mounts both providers above whatever the host puts inside it', () => {
    render(
      <ChartWorkspace {...minimalProps(fakePort())}>
        <Probe />
      </ChartWorkspace>,
    );
    // `workspace` is the chrome default prefix; `2` is the panes the catalogue reconciled into setup.
    expect(screen.getByTestId('probe')).toHaveTextContent('workspace/2');
  });

  it('serves the host chrome options through to the provider it mounts', () => {
    render(
      <ChartWorkspace {...minimalProps(fakePort())} chrome={{ testIdPrefix: 'host' }}>
        <Probe />
      </ChartWorkspace>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('host/2');
  });
});

describe('the pane list, named by the catalogue', () => {
  it('labels a row by its TITLE, on a catalogue whose title is not its identifier', () => {
    render(<ChartWorkspace {...minimalProps(fakePort())} />);
    openStudies();

    const row = screen.getByTestId('workspace-pane-row-price');
    expect(within(row).getByText('Preço')).toBeInTheDocument();
    // non-english-fixture: a host label in another language — English here would prove nothing
    expect(row).toHaveAttribute('aria-label', 'Preço, position 1 of 2');
    expect(within(row).getByRole('switch', { name: 'Show Preço' })).toBeInTheDocument();
    // non-english-fixture: a host label in another language — English here would prove nothing
    expect(within(row).getByRole('button', { name: 'Move Preço down' })).toBeInTheDocument();
  });

  it('falls back to the identifier for a catalogue entry that names none', () => {
    const untitled: WorkspaceSetupPolicy = {
      ...CATALOGUE,
      catalogue: [{ id: 'price', defaultVisible: true, heightPx: 200 }],
    };
    render(
      <ChartWorkspace {...minimalProps(fakePort())} catalogue={untitled} />,
    );
    openStudies();
    expect(screen.getByTestId('workspace-pane-row-price')).toHaveAttribute(
      'aria-label',
      'price, position 1 of 1',
    );
  });
});

describe('what the root owns because no region may', () => {
  it('owns the error channel, and it is written from six places', () => {
    // SEVEN since a pick that repeats an identity became a refusal with a reason: `laneOrder`
    // deduplicates by exact string, so the second entry never activated and nothing said why.
    expect(noticeWriters(rootSource())).toBe(7);
  });

  it('shows the notice a region cannot show for itself, and clears it on dismiss', () => {
    // The height budget is the one writer a test can drive with a single number: a column this
    // short leaves the canvas a residual that cannot hold a chart.
    render(<ChartWorkspace {...minimalProps(fakePort())} layout={{ heightPx: 40 }} />);

    const notice = screen.getByRole('alert');
    expect(notice).toHaveTextContent(/cannot hold one/);
    fireEvent.click(within(notice).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports the empty window the lane found, which no single region can see', () => {
    render(<ChartWorkspace {...minimalProps(fakePort([]))} />);
    expect(screen.getByRole('alert')).toHaveTextContent('No bars for AAA-BBB.');
  });

  it('does NOT carry one market\'s drawings into another', () => {
    const layers: FakeLayer[] = [];
    const binding: DrawingBinding = () => {
      const made = new FakeLayer();
      layers.push(made);
      return made;
    };
    const props = minimalProps(fakePort());
    const view = render(
      <ChartWorkspace {...props} drawing={{ vocabulary: { tools: [] }, binding }} />,
    );

    // The user draws something on AAA-BBB.
    layers[0].held = [{ id: 'd1', type: 'trend-line', anchors: [{ time: 1000, price: 1 }] }];

    // ...and switches to a different instrument. Anchors priced for one market drawn over another
    // are not a cosmetic problem: a different price range puts them somewhere meaningless.
    view.rerender(
      <ChartWorkspace
        {...props}
        data={{ ...props.data, symbol: 'ZZZ-YYY' }}
        drawing={{ vocabulary: { tools: [] }, binding }}
      />,
    );

    const holding = layers[layers.length - 1].held;
    // ZZZ-YYY must not inherit AAA-BBB's drawings.
    expect(holding).toBeNull();
  });

  it('gives each market its own drawings back when the user returns', () => {
    const layers: FakeLayer[] = [];
    const binding: DrawingBinding = () => {
      const made = new FakeLayer();
      layers.push(made);
      return made;
    };
    const props = minimalProps(fakePort());
    const draw = { vocabulary: { tools: [] }, binding };
    const view = render(<ChartWorkspace {...props} drawing={draw} />);
    const live = () => layers[layers.length - 1];

    const mine: DrawingSnapshot = [{ id: 'd1', type: 'trend-line', anchors: [{ time: 1000, price: 1 }] }];
    live().held = mine;

    const at = (symbol: string) =>
      view.rerender(<ChartWorkspace {...props} data={{ ...props.data, symbol }} drawing={draw} />);

    at('ZZZ-YYY');
    expect(live().held).toBeNull();
    at('AAA-BBB');
    // Coming back is the half that a plain "clear on switch" would get wrong: the drawings were not
    // discarded, they were filed under the market they belong to.
    expect(live().held).toEqual(mine);
  });

  it('KEEPS the drawings across a timeframe change, which is the point of them', () => {
    const layers: FakeLayer[] = [];
    const binding: DrawingBinding = () => {
      const made = new FakeLayer();
      layers.push(made);
      return made;
    };
    const props = minimalProps(fakePort());
    const draw = { vocabulary: { tools: [] }, binding };
    render(<ChartWorkspace {...props} drawing={draw} />);
    const live = layers[layers.length - 1];
    live.held = [{ id: 'd1', type: 'trend-line', anchors: [{ time: 1000, price: 1 }] }];

    fireEvent.click(screen.getByRole('button', { name: /^4h/ }));

    // Anchors are TIMES, and every timeframe of one instrument shares them. Scoping by view instead
    // of by instrument would throw away a line the moment the user checked it on another interval.
    expect(live.held).not.toBeNull();
  });

  it('tells the same ticker on two exchanges apart', () => {
    const layers: FakeLayer[] = [];
    const binding: DrawingBinding = () => {
      const made = new FakeLayer();
      layers.push(made);
      return made;
    };
    const props = minimalProps(fakePort());
    const draw = { vocabulary: { tools: [] }, binding };
    const view = render(
      <ChartWorkspace {...props} data={{ ...props.data, venue: 'binance' }} drawing={draw} />,
    );
    const live = () => layers[layers.length - 1];
    live().held = [{ id: 'd1', type: 'trend-line', anchors: [{ time: 1000, price: 1 }] }];

    // Same symbol, another exchange. Same ticker, different instrument, different prices.
    view.rerender(
      <ChartWorkspace {...props} data={{ ...props.data, venue: 'bybit' }} drawing={draw} />,
    );
    expect(live().held).toBeNull();
  });

  it('owns the keymap, and the keymap drives an operation TWO regions read', () => {
    const layer = new FakeLayer();
    const binding: DrawingBinding = () => layer;
    render(
      <ChartWorkspace
        {...minimalProps(fakePort())}
        drawing={{
          vocabulary: {
            tools: [{ id: 'trend-line', label: 'Trend', glyph: '/' }],
            shortcuts: { KeyT: 'trend-line' },
          },
          binding,
        }}
      />,
    );

    const root = screen.getByTestId('workspace-root');
    fireEvent.keyDown(root, { code: 'KeyT', altKey: true });

    // Region one: the rail's own control now reads as armed.
    expect(screen.getByRole('radio', { name: 'Trend' })).toHaveAttribute('aria-checked', 'true');
    // Region two: the canvas armed the layer with the very same tool.
    expect(layer.armed).toContain('trend-line');

    // And the second caller of the same operation the rail's button has: the keyboard.
    fireEvent.keyDown(root, { key: 'Delete' });
    expect(layer.deleted).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete selected' }));
    expect(layer.deleted).toBe(2);
  });

  it('leaves a key alone while somebody is typing, so the rail never eats an edit', () => {
    const layer = new FakeLayer();
    render(
      <ChartWorkspace
        {...minimalProps(fakePort())}
        drawing={{ vocabulary: { tools: [] }, binding: () => layer }}
      />,
    );
    // The tab strip's rename field is a real input inside the very box that scopes the keys.
    fireEvent.doubleClick(screen.getAllByRole('tab')[0]);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Backspace' });
    expect(layer.deleted).toBe(0);
  });

  it('owns the tabpanel ARIA pair, minted with the tab strip and never typed twice', () => {
    render(<ChartWorkspace {...minimalProps(fakePort())} />);

    const panel = screen.getByRole('tabpanel');
    const tab = screen.getAllByRole('tab')[0];
    expect(panel.getAttribute('aria-labelledby')).toBe(tab.id);
    expect(tab.getAttribute('aria-controls')).toBe(panel.id);
  });
});

describe('the interval control, which now controls the interval', () => {
  it('re-scopes what is drawn, and to the interval the user asked for', async () => {
    const opened: string[] = [];
    render(<ChartWorkspace {...minimalProps(recordingPort(opened))} />);
    // The catalogue serves `1h` first, and a tab that states no preference draws on it.
    await waitFor(() => expect(opened).toEqual(['1h']));

    fireEvent.click(screen.getByRole('button', { name: '4h' }));

    // WHICH value, not "it changed": a re-scope onto the wrong interval is the same defect as none.
    await waitFor(() => expect(opened).toEqual(['1h', '4h']));
  });

  it('tells the host, and the proof takes two different intervals', () => {
    const asked: string[] = [];
    const props = minimalProps(fakePort());
    render(
      <ChartWorkspace
        {...props}
        data={{ ...props.data, onTimeframeRequest: (timeframe) => asked.push(timeframe) }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '4h' }));
    fireEvent.click(screen.getByRole('button', { name: '1h' }));

    // Two DIFFERENT intervals, so a report that always names the same one fails here.
    expect(asked).toEqual(['4h', '1h']);
  });

  it('leaves the interval on the tab that owns it, and a switch brings it back', () => {
    render(<ChartWorkspace {...minimalProps(fakePort())} />);
    const pressed = (timeframe: string): string | null =>
      screen.getByRole('button', { name: timeframe }).getAttribute('aria-pressed');

    // A second tab, cloned from the first, so both start on the interval the first was on.
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate the current tab' }));
    fireEvent.click(screen.getByRole('button', { name: '4h' }));
    expect(pressed('4h')).toBe('true');

    fireEvent.click(screen.getAllByRole('tab')[0]);
    expect(pressed('1h')).toBe('true');
    expect(pressed('4h')).toBe('false');

    fireEvent.click(screen.getAllByRole('tab')[1]);
    expect(pressed('4h')).toBe('true');
  });
});

/**
 * The port the host implements, in memory.
 *
 * The browser is an ADAPTER of `WorkspaceStore`, never a dependency of it — which is why a whole
 * round trip is exercised here without a `localStorage` in sight.
 */
function memoryStore(seeded: string | null = null) {
  const written: string[] = [];
  let payload = seeded;
  const store: WorkspaceStore = {
    read: () => payload,
    write: (next) => {
      payload = next;
      written.push(next);
    },
  };
  return { store, written };
}

/** The wire format, written by hand: what an earlier build of the host would have left behind. */
const storedLayout = (tabs: readonly unknown[], active = 0): string =>
  JSON.stringify({ version: 1, active, tabs });

/** A tab's NAME, which is the text node before the dimmed caption the bar appends. */
const nameOf = (tab: HTMLElement): string => tab.firstChild?.textContent ?? '';

const renameActiveTab = (at: number, to: string): void => {
  fireEvent.doubleClick(screen.getAllByRole('tab')[at]);
  const field = screen.getByRole('textbox');
  fireEvent.change(field, { target: { value: to } });
  fireEvent.keyDown(field, { key: 'Enter' });
};

describe('the tabs, which now remember', () => {
  it('reads the stored payload at mount and hands the new one back on every change', () => {
    const held = memoryStore(
      storedLayout([
        { id: 'a', name: 'Scalp', setup: { timeframe: '1h' } },
        { id: 'b', name: 'Swing', setup: { timeframe: '4h' } },
      ]),
    );
    render(<ChartWorkspace {...minimalProps(fakePort())} tabs={{ store: held.store }} />);

    // Read: neither name could come from anywhere but the payload.
    expect(screen.getAllByRole('tab').map(nameOf)).toEqual(['Scalp', 'Swing']);
    expect(held.written).toEqual([]);

    fireEvent.click(screen.getAllByRole('tab')[1]);

    expect(held.written).toHaveLength(1);
    expect(JSON.parse(held.written[0]).active).toBe(1);
  });

  it('brings the layout back on a remount: name, order, active tab and each setup', () => {
    const held = memoryStore();
    const first = render(
      <ChartWorkspace {...minimalProps(fakePort())} tabs={{ store: held.store }} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate the current tab' }));
    renameActiveTab(1, 'Swing');
    fireEvent.click(screen.getByRole('button', { name: '4h' }));
    first.unmount();

    render(<ChartWorkspace {...minimalProps(fakePort())} tabs={{ store: held.store }} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map(nameOf)).toEqual(['Tab 1', 'Swing']);
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    // The setup of EACH tab, not just the active one: the second kept the interval it was left on,
    // and the first kept its own.
    expect(screen.getByRole('button', { name: '4h' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getAllByRole('tab')[0]);
    expect(screen.getByRole('button', { name: '1h' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('loads a payload written by an earlier build without loss, and stops at the ceiling', () => {
    const saved = Array.from({ length: MAX_WORKSPACE_TABS + 6 }, (_unused, at) => ({
      id: `saved-${at + 1}`,
      name: `Saved ${at + 1}`,
      // The shape an earlier build wrote: a market on the tab, which this format no longer carries.
      setup: { timeframe: '4h', instrument: 'OLD-MARKET' },
    }));
    const held = memoryStore(storedLayout(saved));
    render(<ChartWorkspace {...minimalProps(fakePort())} tabs={{ store: held.store }} />);

    const names = screen.getAllByRole('tab').map(nameOf);
    // WHICH ones survived, not how many: the cut is at the end of the list, never at the front.
    expect(names).toHaveLength(MAX_WORKSPACE_TABS);
    expect(names[0]).toBe('Saved 1');
    expect(names[MAX_WORKSPACE_TABS - 1]).toBe(`Saved ${MAX_WORKSPACE_TABS}`);
    expect(names).not.toContain(`Saved ${MAX_WORKSPACE_TABS + 1}`);
    // Without loss: the interval the earlier build saved is the one this build draws on.
    expect(screen.getByRole('button', { name: '4h' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('falls back and SAYS SO when the stored payload cannot be read, instead of throwing', () => {
    const held = memoryStore('{"version":1,"tabs":[[[ not json');
    // The seed never lands, so the lane cannot clear the channel before the assertion reads it.
    const stalled: MarketDataPort = { ...fakePort(), fetchBars: () => new Promise(() => undefined) };

    expect(() =>
      render(<ChartWorkspace {...minimalProps(stalled)} tabs={{ store: held.store }} />),
    ).not.toThrow();

    expect(screen.getByRole('alert')).toHaveTextContent('The saved layout could not be read');
    // Degraded to the product's own default, never to an empty workspace.
    expect(screen.getAllByRole('tab')).toHaveLength(1);
  });

  it('gives the host the export button it asked for, and none when it did not', () => {
    const exported: number[] = [];
    const { unmount } = render(
      <ChartWorkspace {...minimalProps(fakePort())} tabs={{ onExport: () => exported.push(1) }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'export' }));
    expect(exported).toHaveLength(1);
    unmount();

    render(<ChartWorkspace {...minimalProps(fakePort())} />);
    expect(screen.queryByRole('button', { name: 'export' })).toBeNull();
  });
});

/**
 * THE FIVE SOCKETS, ASSERTED BY THEIR EFFECT AND NEVER BY THE PROP.
 *
 * A composition that hands a region `undefined` renders exactly like one that feeds it, so every
 * case below reads the far end of the wire: the rectangles the map painted, the marks the chart was
 * given, the crossing the host heard, the sentence the footer said. Asserting that the attribute
 * was written would pass against a region that ignored it.
 */
const SLICES: readonly DensitySlice[] = [
  { time: utcSeconds(10), samples: [{ price: 900, weight: 3 }, { price: 902, weight: 9 }] },
  { time: utcSeconds(20), samples: [{ price: 900, weight: 5 }, { price: 902, weight: 5 }] },
  { time: utcSeconds(30), samples: [{ price: 900, weight: 1 }, { price: 902, weight: 7 }] },
];

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

/**
 * What the field overlay actually painted, off any canvas: one filled column per visible slice.
 *
 * The primitive is driven the way the base library drives it — attach a scale, ask the pane view for
 * a renderer, draw — because that is the only path on which the columns it was given become pixels.
 * Prices read back as `1000 - price`, so the scale INVERTS like a real one.
 */
function painted(ledger: EngineLedger): readonly number[] {
  const ctx = new RecordingContext();
  const target: BitmapTarget = {
    useBitmapCoordinateSpace: (fn) =>
      fn({
        context: ctx.asContext(),
        mediaSize: { width: 400, height: 200 },
        horizontalPixelRatio: 1,
        verticalPixelRatio: 1,
      }),
  };
  for (const primitive of ledger.attached) {
    primitive.attached({
      chart: {
        timeScale: () => ({
          timeToCoordinate: (time) => time as number,
          options: () => ({ barSpacing: 10 }),
          width: () => 400,
        }),
      },
      series: { priceToCoordinate: (price) => 1000 - price },
      requestUpdate: () => undefined,
    });
    primitive.paneViews()[0].renderer()?.draw(target);
  }
  return ctx.rects.map((rect) => rect.x);
}

const lastMarks = (ledger: EngineLedger): readonly SeriesMarkerPoint[] =>
  ledger.markers[ledger.markers.length - 1] ?? [];

/** A port whose window depends on the interval asked for — the cheapest way to move the price. */
function movingPort(byTimeframe: Readonly<Record<string, number>>): MarketDataPort {
  return {
    describe: () => [],
    subscribe: (): Unsubscribe => () => undefined,
    fetchBars: async (request: HistoryRequest): Promise<HistoryResult> => {
      const close = byTimeframe[request.scope.resolution] ?? 1;
      return {
        bars: [{ time: utcSeconds(1000), open: close, high: close, low: close, close, volume: 1 }],
        exhausted: true,
      };
    },
  };
}

describe('the five sockets the composition declared and never fed', () => {
  it('paints the field from the slices the host adapted, and paints nothing without them', async () => {
    const fed = noLedger();
    const props = minimalProps(fakePort());
    // The field is switched ON by the catalogue, so exactly one overlay is attached and the drawing
    // below cannot be crediting the profile for the map's work.
    const lit = { ...CATALOGUE, showDensity: true };
    const view = render(
      <ChartWorkspace
        {...props}
        catalogue={lit}
        data={{ ...props.data, engine: makeEngine(fed), density: SLICES }}
      />,
    );
    await settle();

    // One column per slice, left edges half a bar to the left of each slice's time.
    expect(painted(fed)).toEqual([5, 15, 25]);
    view.unmount();

    // THE SAME MOUNT WITHOUT THE SLICES: the overlay is still attached and still asked to draw, and
    // it has nothing to draw. That is the difference an unfed socket makes and a mount test cannot.
    const starved = noLedger();
    render(<ChartWorkspace {...props} catalogue={lit} data={{ ...props.data, engine: makeEngine(starved) }} />);
    await settle();
    expect(starved.attached).toHaveLength(1);
    expect(painted(starved)).toEqual([]);
  });

  it('marks the chart with what the host minted from the patterns switched on', async () => {
    const ledger = noLedger();
    const props = minimalProps(fakePort());
    const asked: Array<{ readonly bars: number; readonly active: readonly string[] }> = [];
    render(
      <ChartWorkspace
        {...props}
        data={{
          ...props.data,
          engine: makeEngine(ledger),
          marks: (bars, active) => {
            asked.push({ bars: bars.length, active });
            return active.map((id) => ({ time: bars[0].time, text: id }) as unknown as SeriesMarkerPoint);
          },
        }}
        patterns={[{ id: 'hammer', label: 'Ham', name: 'Hammer' }]}
      />,
    );
    await settle();

    // Nothing switched on: the host was asked, and it minted nothing.
    expect(lastMarks(ledger)).toEqual([]);
    // The BARS reached the host too — it is handed the window this package seeded, not an empty one.
    expect(asked.some((call) => call.bars === BARS.length)).toBe(true);

    openStudies();
    fireEvent.click(screen.getByTestId('workspace-catalogue-section-patterns'));
    fireEvent.click(screen.getByRole('button', { name: 'Hammer' }));

    expect(lastMarks(ledger).map((mark) => (mark as unknown as { text: string }).text)).toEqual([
      'hammer',
    ]);
  });

  it('MARK-02 — an engine WITHOUT the door draws every line and offers no marks', async () => {
    const ledger = noLedger();
    const props = minimalProps(fakePort());
    render(
      <ChartWorkspace
        {...props}
        data={{
          ...props.data,
          // The host that returns the raw `ISeriesApi`, which is what every host writing this
          // adapter had until now. The optional call is swallowed, and NOTHING may depend on it.
          engine: makeEngine(ledger, false),
          marks: (bars) => [{ time: bars[0]?.time ?? 0 } as unknown as SeriesMarkerPoint],
        }}
      />,
    );
    await settle();

    expect(ledger.markers).toEqual([]);
    // And the drawing survived it: the candles were written and the legend reads a close.
    const writes = ledger.drawn as ReadonlyArray<ReadonlyArray<Record<string, unknown>>>;
    expect(writes.some((write) => write.some((point) => 'close' in point))).toBe(true);
  });

  it('hands the host only real bars while the base library also gets the future room', async () => {
    const ledger = noLedger();
    const props = minimalProps(fakePort());
    const handedToHost: Array<readonly number[]> = [];
    render(
      <ChartWorkspace
        {...props}
        data={{
          ...props.data,
          engine: makeEngine(ledger),
          marks: (bars) => {
            handedToHost.push(bars.map((bar) => bar.time));
            return [];
          },
        }}
      />,
    );
    await settle();

    // ONE render, TWO observations. Absence alone would pass on a build that stopped reserving room
    // at all, so the same assertion has to see the room exist on the other side of the seam.
    // The host is also asked before the window is seeded, and an empty answer there is correct. What
    // must never happen is a call carrying a time the market did not print.
    const seeded = handedToHost.filter((times) => times.length > 0);
    expect(seeded.length).toBeGreaterThan(0);
    for (const times of seeded) expect(times).toEqual([1000, 2000]);

    // Identified by what it CARRIES, not by write order: the first write happens before the window
    // is seeded and is empty, and the volume pane writes to the same recorder.
    const writes = ledger.drawn as ReadonlyArray<ReadonlyArray<Record<string, unknown>>>;
    const candles = [...writes].reverse().find((write) => write.some((point) => 'close' in point));
    expect(candles).toBeDefined();
    if (candles === undefined) return;
    expect(candles.filter((point) => 'close' in point).map((point) => point.time)).toEqual([
      1000, 2000,
    ]);
    // POSITIVE CONTROL for the assertion above: the very same `toEqual([1000, 2000])` applied to the
    // whole payload FAILS, because the payload carries twelve more columns. The predicate can tell
    // the host's view from the base library's — it is not passing by being blind.
    expect(candles.map((point) => point.time)).not.toEqual([1000, 2000]);
    // A tenth of two floors at the short margin: twelve columns.
    expect(candles.filter((point) => !('close' in point))).toHaveLength(12);
  });

  it('tells the host the level was crossed, once, and reads the firing out in the footer', async () => {
    const crossed: number[] = [];
    const props = minimalProps(movingPort({ '1h': 100, '4h': 200 }));
    render(
      <ChartWorkspace
        {...props}
        data={{ ...props.data, onAlertCrossed: (list) => crossed.push(...list.map((a) => a.price)) }}
      />,
    );
    await settle();

    // A level clear of the close, so it is not already crossed the moment it appears.
    fireEvent.click(screen.getByRole('button', { name: 'Add line' }));
    const level = newAlertLevel(100);
    expect(crossed).toEqual([]);

    // A NEW LEVEL HAS NO SIDE, so a crossing takes a reading on each side of it: the first one below
    // the level arms it, the one above walks through. Firing on the first reading would mean every
    // level fires the moment it is placed, which is the defect `armAlert` exists to prevent.
    fireEvent.click(screen.getByRole('button', { name: '4h' }));
    await settle();
    expect(crossed).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: '1h' }));
    await waitFor(() => expect(crossed).toEqual([level]));

    // Once per crossing, never once per bar — the transition already happened.
    await settle();
    expect(crossed).toEqual([level]);
    expect(screen.getByTestId('workspace-state')).toHaveTextContent(`alert fired: ${level}`);
  });

  it('tags the level with the TEXT the host injected, and never with the alert id', async () => {
    // THE EFFECT, NOT THE PROP: what is read here is the tag the chart was actually given for the
    // line, which is the string the price axis paints. The defect it replaces was visible on the
    // deployed dashboard as `alert alert-1` — the bookkeeping key of `PriceAlertLines` on screen.
    const ledger = noLedger();
    const props = minimalProps(movingPort({ '1h': 100, '4h': 200 }));
    render(
      <ChartWorkspace
        {...props}
        data={{ ...props.data, engine: makeEngine(ledger) }}
        chrome={{ labels: { priceAlert: (alert) => (alert.triggered ? 'Nivel batido' : 'Nivel') } }}
      />,
    );
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'Add line' }));
    await settle();
    expect(ledger.priceLineTitles).toEqual(['Nivel']);

    // And it keeps coming from the channel once the level fires — the state changes, the owner does not.
    fireEvent.click(screen.getByRole('button', { name: '4h' }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: '1h' }));
    await waitFor(() => expect(ledger.priceLineTitles).toContain('Nivel batido'));
    expect(ledger.priceLineTitles.some((title) => /alert-\d/.test(title))).toBe(false);
  });

  it('falls back to a tag that is words, never the id, when the host injects no text', async () => {
    // The default is the other half of the same promise: a host that says nothing about alerts
    // still gets a sentence. English is the default of screen, and the id is not text in any tongue.
    const ledger = noLedger();
    const props = minimalProps(movingPort({ '1h': 100, '4h': 200 }));
    render(<ChartWorkspace {...props} data={{ ...props.data, engine: makeEngine(ledger) }} />);
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'Add line' }));
    await settle();
    expect(ledger.priceLineTitles).toEqual(['Alert']);
  });

  it('says out loud what the host reported about the load, and stays silent when it did not', () => {
    const props = minimalProps(fakePort());
    const { unmount } = render(
      <ChartWorkspace {...props} data={{ ...props.data, report: 'coverage 3/4 · funding 88%' }} />,
    );
    expect(screen.getByTestId('workspace-report')).toHaveTextContent('coverage 3/4 · funding 88%');
    // OUT of the live region, which holds no per-tick reading — the footer's own rule, kept here.
    expect(screen.getByTestId('workspace-report')).not.toHaveAttribute('role');
    unmount();

    render(<ChartWorkspace {...props} />);
    expect(screen.getByTestId('workspace-report')).toBeEmptyDOMElement();
  });
});

/**
 * THE TWO CAPACITIES THE ROOT RENDERED WITHOUT: a lane for a study to draw in, and the tip that
 * fills the bar in progress. Both are asserted on the drawing, never on the call that asked for it.
 */
const LANE_COLOURS: readonly string[] = ['#4fc3f7', '#ffb74d'];

/** One study the host knows about, named by the label the composition stores for it. */
const LOOKUP: SourceLookup = (id) =>
  id !== 'Alpha'
    ? undefined
    : {
        id,
        label: 'Alpha',
        placement: 'own-pane',
        series: () => [
          {
            spec: { id: seriesId('alpha'), label: 'Alpha', shape: 'line', color: '#fff' },
            provider: {
              id: seriesId('alpha'),
              compute: (bars: readonly Bar[]) => bars.map((bar) => ({ time: bar.time, value: bar.close })),
            },
          },
        ],
      };

const STUDIES: NonNullable<ChartWorkspaceProps['studies']> = {
  catalogue: [
    { provider: { id: seriesId('alpha'), compute: () => [] }, label: 'Alpha', category: 'Trend' },
  ],
  capacity: 2,
  lanes: { plots: 2, colors: LANE_COLOURS, heightPx: 90 },
  resolve: (ids, bars) =>
    resolveSources(ids, LOOKUP, bars, resolutionPolicy({ lanes: 2 })),
};

/** A pane whose one series is named the way a live tip names its readings. */
const TIPPED_PANE: PaneSpec = {
  id: paneId('momentum'),
  title: 'Momentum',
  format: { kind: 'ratio', decimals: 0 },
  series: [{ id: seriesId('rsi'), label: 'RSI', shape: 'line', color: '#8ab' }],
  defaultVisible: true,
};

const tipOf = (values: Readonly<Record<string, number>>): LiveTip => ({
  gen: 1,
  seq: 1,
  values: new Map(Object.entries(values).map(([key, value]) => [seriesId(key), value])),
});

/** The catalogue that offers the tipped pane, so the tab reconciles it into the setup. */
const WITH_MOMENTUM: WorkspaceSetupPolicy = {
  ...CATALOGUE,
  catalogue: [
    { id: 'price', defaultVisible: true, heightPx: 200, title: 'Preço' },
    { id: 'momentum', defaultVisible: true, heightPx: 90, title: 'Momentum' },
  ],
};

/** History that stops at the last CLOSED bar — the bar in progress is the one with no reading. */
const closedOnly: SeriesReader = () => [50, null];

describe('the lanes a study is drawn in, and the tip that fills the bar in progress', () => {
  it('draws the lane pane of the study the user chose, and none before anyone chose', async () => {
    render(<ChartWorkspace {...minimalProps(fakePort())} studies={STUDIES} />);
    await settle();

    // The lanes exist on the chart from the first frame — destroying one would renumber the stack —
    // and none of them is DRAWN, which is the difference this case is about.
    expect(screen.queryByTestId('workspace-legend-ind1')).toBeNull();

    openStudies();
    // The menu opens on the first host section; the catalogue lives one category tab over.
    fireEvent.click(screen.getByTestId('workspace-catalogue-category-Trend'));
    fireEvent.click(screen.getByTestId('workspace-catalogue-entry-alpha'));

    // The PANE, wearing the name of what occupies it. Not the write that asked for it.
    await waitFor(() =>
      expect(screen.getByTestId('workspace-legend-ind1')).toHaveTextContent('Alpha'),
    );
    // And only the lane the study landed in: the second is still idle.
    expect(screen.queryByTestId('workspace-legend-ind2')).toBeNull();
  });

  it('MARK-01 — a study\u2019s marks reach the study\u2019s own series, named by the resolve', async () => {
    const ledger = noLedger();
    const props = minimalProps(fakePort());
    const MARK = { time: 1000, position: 'aboveBar', shape: 'circle', color: '#00ff00' } as SeriesMarkerPoint;
    render(
      <ChartWorkspace
        {...props}
        data={{ ...props.data, engine: makeEngine(ledger) }}
        studies={{
          ...STUDIES,
          // A function OF THE RESOLUTION: the host names the series the resolve landed on rather
          // than one it guessed at, which is the disagreement `studyIdentity` already cost once.
          markers: (resolution) =>
            new Map(resolution.views.map((view) => [seriesStyleKey(view.paneId, `${view.paneId}p1`), [MARK]])),
        }}
      />,
    );
    await settle();

    // Nothing chosen: the resolution has no view, so the map names nothing and no mark is handed on.
    expect(ledger.markers).toEqual([]);

    openStudies();
    fireEvent.click(screen.getByTestId('workspace-catalogue-category-Trend'));
    fireEvent.click(screen.getByTestId('workspace-catalogue-entry-alpha'));

    // Chosen: the study landed in lane one, and its marks went to `ind1p1` — never to the candles.
    await waitFor(() => expect(ledger.markers).toEqual([[MARK]]));
  });

  it('fills the bar in progress from the live tip, and leaves it unsaid without one', async () => {
    const props = minimalProps(fakePort());
    const withTip = {
      ...props,
      catalogue: WITH_MOMENTUM,
      panes: [TIPPED_PANE],
      data: { ...props.data, read: closedOnly },
    };
    const { unmount } = render(<ChartWorkspace {...withTip} />);
    await settle();

    // CONTROL: with no tip the unread bar says so, and nothing carries the closed value forward —
    // that would be the chart asserting a measurement nobody took.
    expect(screen.getByTestId('workspace-legend-momentum')).toHaveTextContent('RSI —');
    unmount();

    render(<ChartWorkspace {...withTip} data={{ ...withTip.data, tip: tipOf({ rsi: 77 }) }} />);
    await settle();
    expect(screen.getByTestId('workspace-legend-momentum')).toHaveTextContent('RSI 77');
  });

  /**
   * The reader the surface takes, asserted through a MOUNTED composition after it left the file.
   *
   * `studyReader` decides three things in one expression and the composition is the only place all
   * three meet: a resolved reading WINS over whatever the host reads, the host's reader fills a
   * series the resolution never resolved, and a series neither of them answers for says nothing.
   * A unit test of the function would prove the function; this proves the wiring, which is the half
   * that moves when a closure leaves a file.
   */
  it('takes the resolved reading first, the host’s next, and asserts nothing for neither', async () => {
    const props = minimalProps(fakePort());
    // The host reads a DIFFERENT number for the same series the study resolves, so "resolved wins"
    // is a value comparison and not a presence check.
    const hostSaysNine: SeriesReader = () => [9, 9];
    render(
      <ChartWorkspace
        {...props}
        catalogue={WITH_MOMENTUM}
        panes={[TIPPED_PANE]}
        studies={STUDIES}
        data={{ ...props.data, read: hostSaysNine }}
      />,
    );
    await settle();

    openStudies();
    fireEvent.click(screen.getByTestId('workspace-catalogue-category-Trend'));
    fireEvent.click(screen.getByTestId('workspace-catalogue-entry-alpha'));

    // RESOLVED WINS: the lane draws the study's own close, not the host's 9.
    await waitFor(() =>
      expect(screen.getByTestId('workspace-legend-ind1')).toHaveTextContent(`Alpha ${BARS[1].close}`),
    );
    // THE HOST FILLS THE REST: the momentum pane is not a study, so its value is the host's.
    expect(screen.getByTestId('workspace-legend-momentum')).toHaveTextContent('RSI 9');
  });

  it('says nothing for a series no reader answers for, rather than carrying a value across', async () => {
    // The third branch, on its own mount: with no host reader and no resolution, the legend has to
    // read the em dash. A default that fell back to some other series' value would be the chart
    // asserting a measurement nobody took.
    const props = minimalProps(fakePort());
    render(<ChartWorkspace {...props} catalogue={WITH_MOMENTUM} panes={[TIPPED_PANE]} />);
    await settle();
    expect(screen.getByTestId('workspace-legend-momentum')).toHaveTextContent('RSI —');
  });

  it('keeps the tip OUT of every live region, because it changes on every tick', async () => {
    const props = minimalProps(fakePort());
    render(
      <ChartWorkspace
        {...props}
        catalogue={WITH_MOMENTUM}
        panes={[TIPPED_PANE]}
        data={{ ...props.data, read: closedOnly, tip: tipOf({ rsi: 77 }) }}
      />,
    );
    await settle();

    const legends = screen.getByTestId('workspace-legends');
    expect(legends).toHaveTextContent('RSI 77');
    // Neither the legend nor anything above it is announced: a value that changes with every frame
    // inside a live region floods a screen reader's queue instead of informing it.
    expect(legends.closest('[aria-live]')).toBeNull();
    expect(legends.closest('[role="status"]')).toBeNull();
    // The one live region in the composition is the footer's, and it holds no per-tick reading.
    expect(screen.getByTestId('workspace-footer').querySelectorAll('[role="status"]')).toHaveLength(1);
  });
});

/**
 * THREE DIFFERENT STRINGS ON PURPOSE — the stored id, the displayed label, and the provider's own
 * id. Every existing fixture lets two of the three coincide, which is precisely why the defect
 * survived: `chrome.spec.tsx` mounts `SeriesMenu` alone with provider ids for `selected`, so the
 * menu agrees with itself over a value the composition never stores.
 */
const IDENTIFIED_LOOKUP: SourceLookup = (id) =>
  id !== 'study.moving-average'
    ? undefined
    : {
        id,
        label: 'Moving average',
        placement: 'own-pane',
        series: () => [
          {
            spec: { id: seriesId('ma-plot'), label: 'Moving average', shape: 'line', color: '#fff' },
            provider: {
              id: seriesId('ma-plot'),
              compute: (bars: readonly Bar[]) => bars.map((bar) => ({ time: bar.time, value: bar.close })),
            },
          },
        ],
      };

const identifiedStudies = (label: string): NonNullable<ChartWorkspaceProps['studies']> => ({
  catalogue: [
    {
      provider: { id: seriesId('ma-provider'), compute: () => [] },
      id: 'study.moving-average',
      label,
      category: 'Trend',
    },
  ],
  capacity: 2,
  lanes: { plots: 2, colors: LANE_COLOURS, heightPx: 90 },
  resolve: (ids, bars) =>
    resolveSources(ids, IDENTIFIED_LOOKUP, bars, resolutionPolicy({ lanes: 2 })),
});

/** The catalogue chip for the entry above, by the test id it has always had: the PROVIDER's id. */
const catalogueChip = (): HTMLElement => screen.getByTestId('workspace-catalogue-entry-ma-provider');

function openCatalogue(): void {
  openStudies();
  fireEvent.click(screen.getByTestId('workspace-catalogue-category-Trend'));
}

describe('what identifies a study, which is not the text on screen', () => {
  it('lights the chip of the study just picked, with id, label and provider id all different', async () => {
    render(<ChartWorkspace {...minimalProps(fakePort())} studies={identifiedStudies('Moving average')} />);
    await settle();
    openCatalogue();

    // Nothing is chosen yet, so the clause below is not passing over an already-pressed chip.
    expect(catalogueChip()).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(catalogueChip());
    await waitFor(() => expect(catalogueChip()).toHaveAttribute('aria-pressed', 'true'));

    // And what was STORED is the id, not the label: the resolved study is listed under it.
    expect(screen.getByTestId('workspace-active-study.moving-average')).toBeInTheDocument();
  });

  /**
   * IDENT-02 IS A CONJUNCTION, so both halves are asserted here: the study stays selected AND it
   * keeps its parameter values. The second half needs a value to exist before the translation, so
   * this mounts the host's own form and the real `WorkspaceStore` rather than the bare catalogue.
   *
   * What makes the value clause discriminate is that it reads the id and the map's key TOGETHER. A
   * build whose identity went back to being the label still hands the host back the value it wrote —
   * the key is the host's, and the host never changed it — so an assertion on `settings` alone would
   * pass over the defect. What cannot survive is the pair agreeing after the label moved.
   */
  it('keeps the study selected AND its values when the LABEL changes and the id does not', async () => {
    const calls: ResolveCall[] = [];
    const held = memoryStore();
    const props = minimalProps(fakePort());
    const tabs = { store: held.store };
    const { rerender } = render(
      <ChartWorkspace {...props} studies={recordingStudies(calls, 'Moving average')} chrome={HOST_CHROME} tabs={tabs} />,
    );
    await settle();
    openCatalogue();
    fireEvent.click(catalogueChip());
    await waitFor(() => expect(catalogueChip()).toHaveAttribute('aria-pressed', 'true'));
    await settle();

    // A value is typed BEFORE the translation, through the host's form and the published writer —
    // so the clause below is not reading a map that was empty on both sides.
    openHostForm();
    expect(screen.getByTestId('host-period')).toHaveTextContent('unset');
    fireEvent.click(screen.getByRole('button', { name: 'Set the period to 50' }));
    await settle();
    expect(calls[calls.length - 1].settings).toEqual({ [STUDY_ID]: { period: 50 } });

    // The product is translated between two renders. The stored identity did not move.
    rerender(
      <ChartWorkspace {...props} studies={recordingStudies(calls, 'Média móvel')} chrome={HOST_CHROME} tabs={tabs} />,
    );
    await settle();

    // The form is still open and still reading its own value out of the setup, under the new label.
    expect(screen.getByTestId('host-period')).toHaveTextContent('50');

    // IT KEPT ITS VALUES — asserted first, so this is the clause that reports when it stops holding.
    // The list and the map agree on ONE string after the label moved.
    const last = calls[calls.length - 1];
    expect(last.ids).toEqual([STUDY_ID]);
    expect(last.settings).toEqual({ [STUDY_ID]: { period: 50 } });
    // And so does what left the machine: the same identity, the same value, through the real store.
    const written = JSON.parse(held.written[held.written.length - 1]) as {
      tabs: readonly { setup: { indicators: readonly string[]; studySettings?: unknown } }[];
    };
    expect(written.tabs[0].setup.indicators).toEqual([STUDY_ID]);
    expect(written.tabs[0].setup.studySettings).toEqual({ [STUDY_ID]: { period: 50 } });

    // AND IT STAYED SELECTED. The chips are one rail tab away from the form, so the catalogue is
    // opened again to read them.
    fireEvent.click(screen.getByTestId('workspace-catalogue-category-Trend'));
    expect(screen.getByText('Média móvel')).toBeInTheDocument();
    expect(catalogueChip()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('workspace-active-study.moving-average')).toBeInTheDocument();
  });

  it('falls back to the label for a catalogue entry that carries no id', async () => {
    // The other direction, and the compatibility half of the rule: a catalogue built before the id
    // existed still resolves and still lights, because the label stands in for the identity.
    render(<ChartWorkspace {...minimalProps(fakePort())} studies={STUDIES} />);
    await settle();
    openCatalogue();

    const chip = screen.getByTestId('workspace-catalogue-entry-alpha');
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(chip);
    await waitFor(() =>
      expect(screen.getByTestId('workspace-catalogue-entry-alpha')).toHaveAttribute('aria-pressed', 'true'),
    );
    expect(screen.getByTestId('workspace-active-Alpha')).toBeInTheDocument();
  });
});

/** Resolves whatever id it is handed, so a control case can put TWO studies on the chart. */
const ANY_LOOKUP: SourceLookup = (id) => ({
  id,
  label: id,
  placement: 'own-pane',
  series: () => [
    {
      spec: { id: seriesId(id), label: id, shape: 'line', color: '#fff' },
      provider: {
        id: seriesId(id),
        compute: (bars: readonly Bar[]) => bars.map((bar) => ({ time: bar.time, value: bar.close })),
      },
    },
  ],
});

/** Two entries, two labels, two provider ids — and, when `twin` is true, ONE identity between them. */
const pairedStudies = (twin: boolean): NonNullable<ChartWorkspaceProps['studies']> => ({
  catalogue: [
    {
      provider: { id: seriesId('first-provider'), compute: () => [] },
      id: 'study.moving-average',
      label: 'Moving average',
      category: 'Trend',
    },
    {
      provider: { id: seriesId('second-provider'), compute: () => [] },
      id: twin ? 'study.moving-average' : 'study.momentum',
      label: 'Moving average, longer',
      category: 'Trend',
    },
  ],
  capacity: 2,
  lanes: { plots: 2, colors: LANE_COLOURS, heightPx: 90 },
  resolve: (ids, bars) =>
    resolveSources(ids, ANY_LOOKUP, bars, resolutionPolicy({ lanes: 2 })),
});

const activeStudies = (): HTMLElement[] => screen.getAllByTestId(/^workspace-active-/);

describe('two entries that resolve to one identity', () => {
  it('reports the second through the notice channel instead of dropping it in silence', async () => {
    render(<ChartWorkspace {...minimalProps(fakePort())} studies={pairedStudies(true)} />);
    await settle();
    openCatalogue();

    fireEvent.click(screen.getByTestId('workspace-catalogue-entry-first-provider'));
    await waitFor(() => expect(activeStudies()).toHaveLength(1));
    // Nothing has been refused yet, so the clause below is not reading a notice left over.
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.click(screen.getByTestId('workspace-catalogue-entry-second-provider'));

    // `laneOrder` deduplicates by exact string, so the second entry would never have activated —
    // the user picks, nothing happens, and nothing says why.
    expect(screen.getByRole('alert')).toHaveTextContent('study.moving-average');
    expect(activeStudies()).toHaveLength(1);
  });

  it('lets two entries with DIFFERENT identities both land, and says nothing', async () => {
    // The other direction. Without it, a handler that refused every second pick would pass above.
    render(<ChartWorkspace {...minimalProps(fakePort())} studies={pairedStudies(false)} />);
    await settle();
    openCatalogue();

    fireEvent.click(screen.getByTestId('workspace-catalogue-entry-first-provider'));
    await waitFor(() => expect(activeStudies()).toHaveLength(1));
    fireEvent.click(screen.getByTestId('workspace-catalogue-entry-second-provider'));

    await waitFor(() => expect(activeStudies()).toHaveLength(2));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('names the study in a sentence the HOST can replace, and defaults when it does not', async () => {
    // The member is OPTIONAL on its group: a host that typed the whole of `notices` by hand before
    // this existed must still compile, so the package cannot require it. The default is what the
    // clause above reads; this one proves the host's own words reach the same channel.
    render(
      <ChartWorkspace
        {...minimalProps(fakePort())}
        studies={pairedStudies(true)}
        chrome={{ labels: { notices: { duplicateStudy: (name) => `já: ${name}` } } }}
      />,
    );
    await settle();
    openCatalogue();
    fireEvent.click(screen.getByTestId('workspace-catalogue-entry-first-provider'));
    await waitFor(() => expect(activeStudies()).toHaveLength(1));
    fireEvent.click(screen.getByTestId('workspace-catalogue-entry-second-provider'));

    // non-english-fixture: host words in another language — English here would prove nothing
    expect(screen.getByRole('alert')).toHaveTextContent('já: study.moving-average');
  });
});

describe('the published surface of the composition', () => {
  it('publishes one composed component out of the workspace layer, and the two setup doors', () => {
    // The equality still covers EVERY value export of the layer, so a region leaving it fails here
    // exactly as before. What changed is the contents, not the strength: `useWorkspaceSetup` and
    // `useWorkspaceSetupWriter` are hooks, not components, and they are the only way a host's own
    // section body can read and write the setup of the tab that is showing. AD-017 refused
    // `useDrawingRail` because it would freeze ten members of `DrawingRailValue` to hand a host one
    // boolean; these two freeze nothing new, because `WorkspaceSetup` is already published.
    const indexText = readFileSync(join(LIB_ROOT, 'src', 'index.ts'), 'utf8');
    expect(composedExports(indexText)).toEqual([
      'ChartWorkspace',
      'useWorkspaceSetup',
      'useWorkspaceSetupWriter',
    ]);
  });

  it('fails the same count when a second component leaves the layer', () => {
    // POSITIVE CONTROL. The clause is an equality over a list that a future export would grow, and
    // an equality measured by a broken parse passes in silence.
    const withSecond = [
      "export { ChartSurface } from './react/surface/ChartSurface';",
      "export type { ChartWorkspaceProps } from './react/workspace/ChartWorkspace';",
      "export { ChartWorkspace } from './react/workspace/ChartWorkspace';",
      "export { TabsRegion } from './react/workspace/TabsRegion';",
    ].join('\n');
    expect(composedExports(withSecond)).toEqual(['ChartWorkspace', 'TabsRegion']);
    expect(composedExports(withSecond)).not.toEqual(['ChartWorkspace']);
  });

  it('declares ten grouped props, all under the ceiling of twelve', () => {
    const names = declaredProps(rootSource(), 'ChartWorkspaceProps');
    // TEN since the tab store landed. The list is written out rather than counted so that a group
    // arriving unannounced fails here, and the ceiling below is asserted on top of it.
    expect(names).toEqual([
      'catalogue',
      'children',
      'chrome',
      'data',
      'drawing',
      'layout',
      'panes',
      'patterns',
      'studies',
      'tabs',
    ]);
    expect(names.length).toBeLessThanOrEqual(12);
  });
});

/**
 * THE FIVE DEFECTS THAT GOT PAST THE ROUND 2 SENSOR — each one here is the mutant that survived.
 *
 * None of them is a gate gap: they are things the product gets wrong and that would go to production
 * on the deploy. What was missing was not a region test — the regions are measured one by one — but
 * one that measured THE COMPOSITION: each of the five lives in the WIRING between the root and the
 * region, and a region exercised with an injected `onChange` never sees what the root does with what
 * it emits.
 */
const THREE_LOOKUP: SourceLookup = (id) =>
  !['Alpha', 'Beta', 'Gama'].includes(id)
    ? undefined
    : {
        id,
        label: id,
        placement: 'own-pane',
        series: () => [
          {
            spec: { id: seriesId(id.toLowerCase()), label: id, shape: 'line', color: '#fff' },
            provider: {
              id: seriesId(id.toLowerCase()),
              compute: (bars: readonly Bar[]) => bars.map((bar) => ({ time: bar.time, value: bar.close })),
            },
          },
        ],
      };

/** Three offered, TWO of ceiling: the third one is what measures the boundary. */
const THREE_STUDIES: NonNullable<ChartWorkspaceProps['studies']> = {
  catalogue: [
    { provider: { id: seriesId('alpha'), compute: () => [] }, label: 'Alpha', category: 'Trend' },
    { provider: { id: seriesId('beta'), compute: () => [] }, label: 'Beta', category: 'Trend' },
    { provider: { id: seriesId('gama'), compute: () => [] }, label: 'Gama', category: 'Trend' },
  ],
  capacity: 2,
  lanes: { plots: 2, colors: LANE_COLOURS, heightPx: 90 },
  resolve: (ids, bars) =>
    resolveSources(ids, THREE_LOOKUP, bars, resolutionPolicy({ lanes: 2 })),
};

/** Two panes, one series each, DECLARED WITH DIFFERENT SHAPES — or the picker separates nothing. */
const TWO_SERIES: readonly PaneSpec[] = [
  {
    id: paneId('price'),
    title: 'Preço',
    format: { kind: 'price', minMove: 0.01 },
    series: [{ id: seriesId('close'), label: 'Fechamento', shape: 'line', color: '#fff' }],
    defaultVisible: true,
  },
  {
    id: paneId('volume'),
    title: 'Volume',
    format: { kind: 'ratio', decimals: 0 },
    series: [{ id: seriesId('vol'), label: 'Volume', shape: 'line', color: '#8ab' }],
    defaultVisible: true,
  },
];

const chooseStudy = (id: string): void => {
  fireEvent.click(screen.getByTestId('workspace-catalogue-category-Trend'));
  fireEvent.click(screen.getByTestId(`workspace-catalogue-entry-${id}`));
};

const activeOrder = (): string[] =>
  Array.from(document.querySelectorAll('[data-testid^="workspace-active-"]')).map(
    (row) => row.getAttribute('data-testid')?.replace('workspace-active-', '') ?? '',
  );

describe('the wiring between the root and the regions, where the regions alone cannot reach', () => {
  it('keeps the style PER SERIES: the second choice does not erase the first, and the third REPLACES', async () => {
    render(<ChartWorkspace {...minimalProps(fakePort())} panes={TWO_SERIES} />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Series style' }));

    fireEvent.click(screen.getByRole('radio', { name: 'Draw Fechamento as histogram' }));
    expect(screen.getByRole('radio', { name: 'Draw Fechamento as histogram' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // THE SECOND CHOICE. The patch is `{ ...seriesStyles, [key]: shape }`, and without the spread
    // every choice zeroes all the others: the user styles two series and finds only the last stuck.
    fireEvent.click(screen.getByRole('radio', { name: 'Draw Volume as histogram' }));
    expect(screen.getByRole('radio', { name: 'Draw Volume as histogram' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Draw Fechamento as histogram' })).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // THE THIRD CHOICE, ON THE SERIES THAT ALREADY HAS A STYLE. The two above prove that one choice
    // does not ERASE another, and they do not prove that one choice REPLACES the previous one —
    // which is the other half of the same rule. With the spread order swapped
    // (`{ [key]: shape, ...seriesStyles }`) the old value wins: restyling an already styled series
    // turns INERT, the radio does not move, and the user is stuck with the first choice they made.
    // It survived the whole library and the app.
    fireEvent.click(screen.getByRole('radio', { name: 'Draw Fechamento as line' }));
    expect(screen.getByRole('radio', { name: 'Draw Fechamento as line' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Draw Fechamento as histogram' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    // And the swap must not have dragged the other series along: replacing is one key only.
    expect(screen.getByRole('radio', { name: 'Draw Volume as histogram' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('refuses the study that TOUCHES the ceiling, and says why — the boundary is `>=`, not `>`', async () => {
    render(<ChartWorkspace {...minimalProps(fakePort())} studies={THREE_STUDIES} />);
    await settle();
    openStudies();

    chooseStudy('alpha');
    await waitFor(() => expect(activeOrder()).toEqual(['Alpha']));
    chooseStudy('beta');
    await waitFor(() => expect(activeOrder()).toEqual(['Alpha', 'Beta']));
    // CONTROL: up to here the ceiling refused nothing, so the refusal below is ITS and not the
    // notice channel being lit for another reason — the history seam uses the same channel.
    expect(document.body.textContent).not.toContain('Study limit');

    // THE THIRD, with TWO already chosen and a ceiling of TWO. With `>` the comparison only refutes
    // from the fourth on: the ceiling announced as 2/2 accepts a third in silence, and the lane that
    // does not exist leaves the chosen study with no drawing at all.
    chooseStudy('gama');
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Study limit of 2 reached — remove one first.',
      ),
    );
    expect(activeOrder()).toEqual(['Alpha', 'Beta']);
  });

  it('reorders the STUDY by the ▼ of the active list, and not only the pane', async () => {
    render(<ChartWorkspace {...minimalProps(fakePort())} studies={THREE_STUDIES} />);
    await settle();
    openStudies();
    chooseStudy('alpha');
    chooseStudy('beta');
    await waitFor(() => expect(activeOrder()).toEqual(['Alpha', 'Beta']));

    // The ▲▼ of the PANE list is another control, measured elsewhere; this is the ACTIVE list's, and
    // the root is what wires `onMove` to `movedIndicator`. Without that wiring the button exists, is
    // clickable, is not disabled — and does nothing.
    fireEvent.click(screen.getByRole('button', { name: 'Move Alpha down' }));
    await waitFor(() => expect(activeOrder()).toEqual(['Beta', 'Alpha']));

    // And the first ▲ stays inert by being DISABLED, which is the other end of the same list.
    expect(screen.getByRole('button', { name: 'Move Beta up' })).toBeDisabled();
  });

  it('COERCES the imported payload against the served catalogue, instead of applying it raw', async () => {
    // The FILE path is the only one that goes through `naming.coerceSetup`: the storage payload is
    // coerced elsewhere, so swapping this wiring for `(raw) => raw` moved no test. What arrives by
    // file comes from outside the product — it is exactly what does not get applied raw.
    render(<ChartWorkspace {...minimalProps(fakePort())} />);
    await settle();

    const payload = [
      {
        id: 'imported',
        name: 'Imported',
        // `99z` is NOT in `servedTimeframes`. Coerced it becomes `null` and falls back to the first
        // served one; raw, it stays `99z` and the workspace asks for bars on an interval this
        // catalogue does not serve.
        setup: {
          timeframe: '99z',
          layoutMode: 'foco',
          gridCells: [],
          panes: [],
          seriesStyles: {},
          density: { floor: 0.1, gamma: 1 },
          showDensity: false,
          showProfile: false,
          autoFit: true,
          indicators: [],
        },
      },
    ];
    fireEvent.change(screen.getByTestId('workspace-tabs-import-input'), {
      target: { files: [new File([JSON.stringify(payload)], 'tabs.json', { type: 'application/json' })] },
    });

    await waitFor(() => expect(screen.getAllByRole('tab').map(nameOf)).toEqual(['Imported']));
    await settle();
    // The first served one, because the saved one is not served. `99z` is offered nowhere, so with
    // the raw payload NO chip stays pressed and the workspace interval becomes a value the catalogue
    // never offered.
    expect(screen.getByRole('button', { name: '1h' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('applies the host HEIGHT BUDGET to the shell, and not only to the canvas row', async () => {
    // The shell is the `fieldset` that anchors the menu overlay. Without the height it grows with
    // its content: the host reserves 517px, the composition takes whatever it likes, and the panel
    // pushes the whole page.
    const { unmount } = render(
      <ChartWorkspace {...minimalProps(fakePort())} layout={{ heightPx: 517 }} />,
    );
    await settle();
    expect(screen.getByTestId('workspace-root').style.height).toBe('517px');
    unmount();

    // Measured and not constant: the budget is the HOST's, so another number has to arrive whole.
    render(<ChartWorkspace {...minimalProps(fakePort())} layout={{ heightPx: 342 }} />);
    await settle();
    expect(screen.getByTestId('workspace-root').style.height).toBe('342px');
  });
});

/**
 * ADAPT-06 — editing a parameter value redraws the study.
 *
 * WITHOUT THIS THE WHOLE FEATURE DOES NOTHING. `studySettings` was neither an argument of `resolve`
 * nor a dependency of the memo that calls it, so writing a value produced a NEW `setup` object whose
 * `indicators` was the SAME array reference — `useMemo` saw nothing move, kept the previous
 * resolution, and the chart went on drawing the old numbers. No error, no warning, no red test: the
 * exact failure mode this repository has recorded five times.
 *
 * WHY IT IS MOUNTED AND NOT PROBED. A probe of the hook would assert that a function was called with
 * an argument. What has to hold is that a host writing through the PUBLISHED writer, from inside a
 * `WorkspaceSection.Body`, reaches `resolve` — which crosses the setup store, the tab reducer, the
 * persisted store and the memo. Every one of those is a place the value can be dropped, and only a
 * mount crosses all of them.
 *
 * EACH CLAUSE KILLS A DIFFERENT DELETION, and all three were measured by making the deletion:
 *   - drop `setup.studySettings` from the memo DEPENDENCY list -> the first clause to die is
 *     `expect(calls.length).toBeGreaterThan(afterPick)`, because the write produces a new `setup`
 *     whose `indicators` is the same reference and the memo therefore recomputes nothing.
 *   - drop the third ARGUMENT and keep the dependency -> `calls.length` rises, so the clause above
 *     stays green, and the one that dies is `expect(...settings).toEqual({period: 50})`.
 *   - drop the memo ENTIRELY -> both clauses above stay green and the IDLE clause dies, which is
 *     why it is asserted in the same test: without it, resolving on every render would pass.
 */

interface ResolveCall {
  readonly ids: readonly string[];
  readonly barCount: number;
  readonly settings: Readonly<Record<string, StudySettings>> | undefined;
}

const STUDY_ID = 'study.moving-average';

/**
 * A host whose `resolve` still takes TWO parameters, which is every host that exists today.
 *
 * The assertion is the compiler's: `tsconfig.test.json` extends the package's own `strict` config,
 * so if the widening were breaking this file would not compile and the suite would not run. It is
 * mounted below as well, because "compiles" and "still draws" are two claims.
 */
const twoParameterResolve: NonNullable<ChartWorkspaceProps['studies']>['resolve'] = (ids, bars) =>
  resolveSources(ids, IDENTIFIED_LOOKUP, bars, resolutionPolicy({ lanes: 2 }));

const recordingStudies = (
  calls: ResolveCall[],
  label = 'Moving average',
): NonNullable<ChartWorkspaceProps['studies']> => ({
  ...identifiedStudies(label),
  resolve: (ids, bars, settings) => {
    calls.push({ ids, barCount: bars.length, settings });
    return resolveSources(ids, IDENTIFIED_LOOKUP, bars, resolutionPolicy({ lanes: 2 }));
  },
});

/**
 * The host's form, at MODULE scope — the shape `example/studyForm.tsx` will take.
 *
 * It reads through `useWorkspaceSetup` one field at a time and writes through
 * `useWorkspaceSetupWriter`, which is the only door a section body has. Nothing here names an
 * indicator to the package: the key and the value are both the host's.
 */
function HostStudyForm(): ReactElement {
  const write = useWorkspaceSetupWriter();
  const held = useWorkspaceSetup((setup) => setup.studySettings?.[STUDY_ID]) as
    | { readonly period?: number }
    | undefined;
  return (
    <>
      <button type="button" onClick={() => write({ studySettings: { [STUDY_ID]: { period: 50 } } })}>
        Set the period to 50
      </button>
      <span data-testid="host-period">{held?.period ?? 'unset'}</span>
    </>
  );
}

/** Write-once, so the chrome layer's churn warning stays silent. */
const HOST_CHROME: ChartWorkspaceProps['chrome'] = {
  sections: [{ id: 'host-form', label: 'Inputs', count: 1, Body: HostStudyForm }],
};

const openHostForm = (): void => {
  fireEvent.click(screen.getByTestId('workspace-catalogue-section-host-form'));
};

describe('editing a parameter value redraws the study', () => {
  it('reaches resolve with the value, and leaves an idle re-render alone', async () => {
    const calls: ResolveCall[] = [];
    const studies = recordingStudies(calls);
    const held = memoryStore();
    const props = minimalProps(fakePort());
    const tabs = { store: held.store };

    const { rerender } = render(
      <ChartWorkspace {...props} studies={studies} chrome={HOST_CHROME} tabs={tabs}>
        <span data-testid="tick">1</span>
      </ChartWorkspace>,
    );
    await settle();

    openCatalogue();
    fireEvent.click(catalogueChip());
    await waitFor(() => expect(catalogueChip()).toHaveAttribute('aria-pressed', 'true'));
    await settle();

    // The study is on the chart and NO value has been written yet, so the clauses below are not
    // reading a map that was there from the start.
    const afterPick = calls.length;
    expect(afterPick).toBeGreaterThan(0);
    expect(calls[afterPick - 1].ids).toEqual([STUDY_ID]);
    expect(calls[afterPick - 1].settings).toBeUndefined();
    expect(calls[afterPick - 1].barCount).toBe(BARS.length);

    // AN IDLE RE-RENDER: the composition re-renders — `tick` proves it — and nothing the memo
    // depends on moved, so the host is not asked to resolve again.
    rerender(
      <ChartWorkspace {...props} studies={studies} chrome={HOST_CHROME} tabs={tabs}>
        <span data-testid="tick">2</span>
      </ChartWorkspace>,
    );
    await settle();
    expect(screen.getByTestId('tick')).toHaveTextContent('2');
    expect(calls).toHaveLength(afterPick);

    // THE WRITE, through the host's own form and the published writer.
    openHostForm();
    expect(screen.getByTestId('host-period')).toHaveTextContent('unset');
    fireEvent.click(screen.getByRole('button', { name: 'Set the period to 50' }));
    await settle();

    // It rose, and what it carries is the value the host wrote.
    expect(calls.length).toBeGreaterThan(afterPick);
    expect(calls[calls.length - 1].settings).toEqual({ [STUDY_ID]: { period: 50 } });
    expect(calls[calls.length - 1].ids).toEqual([STUDY_ID]);
    expect(screen.getByTestId('host-period')).toHaveTextContent('50');

    // The study did not leave the list and did not change identity: a redraw, never a remount. The
    // chip itself is one rail tab away now, so the ACTIVE list is what is read — it is the same
    // identity, rendered above the section body that just wrote to it.
    expect(screen.getByTestId(`workspace-active-${STUDY_ID}`)).toBeInTheDocument();
    expect(screen.getByTestId('workspace-legend-ind1')).toHaveTextContent('Moving average');

    // And it reached the REAL store, which is what surviving the tab means.
    const written = JSON.parse(held.written[held.written.length - 1]) as {
      tabs: readonly { setup: { studySettings?: unknown } }[];
    };
    expect(written.tabs[0].setup.studySettings).toEqual({ [STUDY_ID]: { period: 50 } });
  });

  it('still draws for a host whose resolve takes the TWO parameters it always took', async () => {
    const studies: NonNullable<ChartWorkspaceProps['studies']> = {
      ...identifiedStudies('Moving average'),
      resolve: twoParameterResolve,
    };
    render(<ChartWorkspace {...minimalProps(fakePort())} studies={studies} />);
    await settle();
    openCatalogue();
    fireEvent.click(catalogueChip());

    await waitFor(() =>
      expect(screen.getByTestId('workspace-legend-ind1')).toHaveTextContent('Moving average'),
    );
    expect(screen.getByTestId(`workspace-active-${STUDY_ID}`)).toBeInTheDocument();
  });
});

/**
 * A PORT WHOSE HISTORY HAS NOT ARRIVED, and a handle that decides when it does.
 *
 * `useCandleLane` seeds history and live as one transaction, so a `fetchBars` that has not settled
 * is the workspace's genuine loading state: `lane` is still `null` and `bars` is the hoisted empty.
 * A test that simply passed zero bars would assert against a window that had ALREADY arrived and was
 * empty — a different thing, and the one the resolution suite already covers.
 */
function pendingPort(bars: readonly Bar[]): { readonly port: MarketDataPort; readonly arrive: () => void } {
  let release: () => void = () => undefined;
  const arrived = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    port: {
      describe: () => [],
      subscribe: (_scope: Scope, _sink: FrameSink): Unsubscribe => () => undefined,
      fetchBars: async (): Promise<HistoryResult> => {
        await arrived;
        return { bars, exhausted: true };
      },
    },
    arrive: () => release(),
  };
}

/**
 * A study with a WARM-UP, which is what makes "gaps rather than an error" observable at all: the
 * first bar of whatever window it is handed carries no `value`, exactly as a mean's does. With a
 * provider that reads every bar, a window that never arrived and a full one look the same.
 */
const WARMING_LOOKUP: SourceLookup = (id) =>
  id !== STUDY_ID
    ? undefined
    : {
        id,
        label: 'Moving average',
        placement: 'own-pane',
        series: () => [
          {
            spec: { id: seriesId('ma-plot'), label: 'Moving average', shape: 'line', color: '#fff' },
            provider: {
              id: seriesId('ma-plot'),
              compute: (bars: readonly Bar[]) =>
                bars.map((bar, at) => (at === 0 ? { time: bar.time } : { time: bar.time, value: bar.close })),
            },
          },
        ],
      };

describe('a value edited while the history is still loading', () => {
  it('recomputes against the bars present, and draws gaps rather than throwing', async () => {
    const calls: ResolveCall[] = [];
    const { port, arrive } = pendingPort(BARS);
    const studies: NonNullable<ChartWorkspaceProps['studies']> = {
      ...identifiedStudies('Moving average'),
      resolve: (ids, bars, settings) => {
        calls.push({ ids, barCount: bars.length, settings });
        return resolveSources(ids, WARMING_LOOKUP, bars, resolutionPolicy({ lanes: 2 }));
      },
    };
    const ledger = noLedger();
    const props = minimalProps(port);

    render(
      <ChartWorkspace
        {...props}
        data={{ ...props.data, engine: makeEngine(ledger) }}
        studies={studies}
        chrome={HOST_CHROME}
      />,
    );
    await settle();

    // THE PRECONDITION, asserted rather than assumed: the window has not arrived.
    openCatalogue();
    fireEvent.click(catalogueChip());
    await waitFor(() => expect(catalogueChip()).toHaveAttribute('aria-pressed', 'true'));
    await settle();
    const whileLoading = calls[calls.length - 1];
    expect(whileLoading.ids).toEqual([STUDY_ID]);
    expect(whileLoading.barCount).toBe(0);

    // What the composition is saying about the empty window BEFORE the edit. The edit may not add
    // to it: "the window has not arrived" is not a diagnosis of the value that was typed.
    const saidWhileEmpty = screen.queryByRole('alert')?.textContent ?? null;
    expect(saidWhileEmpty).toContain('No bars');

    // THE EDIT, made before a single bar exists.
    openHostForm();
    fireEvent.click(screen.getByRole('button', { name: 'Set the period to 50' }));
    await settle();

    // It recomputed against WHATEVER BARS ARE PRESENT — none — carrying the value that was typed,
    // and the study is still on the chart rather than an error in place of one.
    const stillLoading = calls[calls.length - 1];
    expect(stillLoading.barCount).toBe(0);
    expect(stillLoading.settings).toEqual({ [STUDY_ID]: { period: 50 } });
    expect(screen.getByTestId(`workspace-active-${STUDY_ID}`)).toBeInTheDocument();
    // NOT ONE WORD MORE than was already being said. The edit produced no diagnosis of its own —
    // an error raised here would be the failure this edge case exists to forbid.
    expect(screen.queryByRole('alert')?.textContent ?? null).toBe(saidWhileEmpty);

    // And nothing was DRAWN for it against the empty window — no reading, and no zero standing in
    // for one. A study computed over no bars says nothing rather than saying nought.
    const writes = ledger.drawn as ReadonlyArray<ReadonlyArray<Record<string, unknown>>>;
    const carriesReading = (write: ReadonlyArray<Record<string, unknown>>): boolean =>
      write.some((point) => 'value' in point);
    expect(writes.filter(carriesReading)).toEqual([]);
    const beforeArrival = writes.length;

    // THEN THE WINDOW ARRIVES. The value typed against nothing is still the value applied.
    arrive();
    await settle();
    const seeded = calls[calls.length - 1];
    expect(seeded.barCount).toBe(BARS.length);
    expect(seeded.settings).toEqual({ [STUDY_ID]: { period: 50 } });

    // AND THE WARM-UP IS A GAP. Two bars in, ONE reading out: the bar the study cannot answer for
    // draws no point at all, which is how a line carries a hole, and the bar it can answer for
    // carries its own number. A point at 1000 would be this edge case's failure dressed as data.
    const study = writes.slice(beforeArrival).filter(carriesReading).at(-1);
    expect(study).toBeDefined();
    expect(study).toEqual([{ time: 2000, value: BARS[1].close }]);
  });
});

/**
 * The composition's own centred row, serialised as it was before the shared value.
 *
 * Captured from the tree BEFORE the collapse. This is the header strip that carries the symbol,
 * the interval, the grid controls and the primary actions; `flex-wrap` is what keeps it from
 * clipping them, and it has to stay declared after the pair and before the padding.
 */
describe('the centred row inside the composed root', () => {
  it('serialises the header strip exactly as it did before', () => {
    const view = render(<ChartWorkspace {...minimalProps(fakePort())} />);
    const header = view.container.querySelector('[role="tabpanel"] > div');
    expect(header?.getAttribute('style')).toBe(
      'display: flex; align-items: center; flex-wrap: wrap; gap: 4px; padding: 0px 4px 4px;',
    );
  });
});

/**
 * The composition's two column stacks, serialised as they were before the shared value.
 *
 * Captured from the tree BEFORE the collapse. The shell spreads the panel's own declaration and
 * then overrides `flex`, so the two strings have to differ in exactly that property and nowhere
 * else — a shared value spread after the override would put `flex: 1` back on the shell and the
 * whole workspace would start stretching inside its host.
 *
 * DECLARED BLIND SPOT: `border: none` on the shell. It is in the declaration and in neither pin,
 * because jsdom does not serialise it — the same blind spot `seriesMenuRailStyle.spec.tsx` measured
 * and wrote down.
 */
describe('the column stack inside the composed root', () => {
  it('serialises the shell and the tab panel exactly as they did before', () => {
    const view = render(<ChartWorkspace {...minimalProps(fakePort())} />);
    expect(view.container.firstElementChild?.getAttribute('style')).toBe(
      'display: flex; flex-direction: column; flex: 0 0 auto; min-height: 0; position: relative;' +
        ' outline: none; margin: 0px; padding: 0px; min-inline-size: 0; height: 480px;',
    );
    expect(view.container.querySelector('[role="tabpanel"]')?.getAttribute('style')).toBe(
      'display: flex; flex-direction: column; flex: 1; min-height: 0;',
    );
  });
});
