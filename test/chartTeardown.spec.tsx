/**
 * @jest-environment jsdom
 *
 * LMC-23 — the chart's teardown, and the ORDER that used to be a comment.
 *
 * The guarantee is React's: effect cleanups are destroyed in the order the effects were DECLARED.
 * The effect that creates the chart is necessarily the first, so removing the chart inside it made
 * the overlay primitives and the drawing layer detach from a chart that no longer existed — and
 * detaching a primitive makes the base library schedule an invalidation that runs afterwards,
 * against discarded canvases, out of reach of any `try/catch` in the unmount.
 *
 * While everything lived in a single file, "the teardown is the last one" was true by position in
 * the text and the only proof was the prose. Here they become two assertions: the position, read
 * from the code, and the sequence, read from the port.
 */
import { StrictMode } from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import { render } from '@testing-library/react';

import { directionConvention, paneId, seriesId, utcSeconds } from '../src/domain/types';
import type { Bar, PaneSpec } from '../src/domain/types';
import type { Overlay } from '../src/extension/plugins';
import type { DrawingBinding } from '../src/drawing/drawingLayer';
import type { ChartEngine, SeriesHandle, WorkspaceChartHandle } from '../src/port/chartApi';
import { ChartSurface, type PaneView, type SeriesReader } from '../src/react/surface/ChartSurface';

const SURFACE = join(__dirname, '..', 'src', 'react', 'surface', 'ChartSurface.tsx');

/** The hooks called DIRECTLY in the component body, in code order. */
function topLevelHooks(): string[] {
  const text = readFileSync(SURFACE, 'utf8');
  const parsed = ts.createSourceFile(SURFACE, text, ts.ScriptTarget.ES2021, true, ts.ScriptKind.TSX);
  const component = parsed.statements
    .filter(ts.isFunctionDeclaration)
    .find((fn) => fn.name?.text === 'ChartSurface');
  const found: string[] = [];
  for (const statement of component?.body?.statements ?? []) {
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        /^use[A-Z]/.test(node.expression.text)
      ) {
        found.push(node.expression.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(statement);
  }
  return found;
}

/** One chart per instance, with the port's tape shared — it is the SEQUENCE that matters. */
function tapeEngine(tape: string[], removals: number[]): ChartEngine {
  return () => {
    const id = removals.length;
    removals.push(0);
    let nextPane = 1;
    const makePane = (index: number) => ({
      paneIndex: () => index,
      getStretchFactor: () => 1,
      setStretchFactor: () => undefined,
      setPreserveEmptyPane: () => undefined,
      moveTo: () => undefined,
      getHTMLElement: () => null,
    });
    const pane0 = makePane(0);
    const chart: WorkspaceChartHandle = {
      panes: () => [pane0],
      addPane: () => makePane(nextPane++),
      addSeries: (): SeriesHandle => ({
        setData: () => undefined,
        applyOptions: () => undefined,
        setMarkers: () => undefined,
        priceScale: () => ({ applyOptions: () => undefined }),
        createPriceLine: () => ({ applyOptions: () => undefined }),
        removePriceLine: () => undefined,
        priceToCoordinate: () => null,
        coordinateToPrice: () => null,
        attachPrimitive: () => undefined,
        detachPrimitive: () => {
          tape.push('detachPrimitive');
        },
      }),
      applyOptions: () => undefined,
      subscribeCrosshairMove: () => undefined,
      unsubscribeCrosshairMove: () => undefined,
      remove: () => {
        removals[id] += 1;
        tape.push('chart.remove');
      },
      timeScale: () => ({ fitContent: () => undefined }),
    };
    return chart;
  };
}

const CONVENTION = directionConvention({ upColor: '#26a69a', downColor: '#ef5350' });
const PRICE: PaneSpec = {
  id: paneId('price'),
  title: 'Price',
  format: { kind: 'price', minMove: 0.01 },
  series: [],
  defaultVisible: true,
};
const RATE: PaneSpec = {
  id: paneId('rate'),
  title: 'Rate',
  format: { kind: 'percent', decimals: 4 },
  targetHeightPx: 90,
  defaultVisible: true,
  series: [{ id: seriesId('r'), label: 'R', shape: 'line', color: '#abc' }],
};
const BARS: readonly Bar[] = [
  { time: utcSeconds(1_700_000_000), open: 100, high: 110, low: 95, close: 105 },
];
const read: SeriesReader = () => [1];
const view = (spec: PaneSpec): PaneView => ({ spec, visible: true, heightPx: 90, lastUsedAt: 1 });

const inertOverlay = (): Overlay => ({
  zOrder: 'behind',
  attached: () => undefined,
  detached: () => undefined,
  draw: () => undefined,
});

const loggingBinding = (tape: string[]): DrawingBinding => () => ({
  setActiveTool: () => undefined,
  deleteSelection: () => undefined,
  clearAll: () => undefined,
  detach: () => {
    tape.push('layer.detach');
  },
});

function mountForTeardown(strict: boolean): { tape: string[]; removals: number[]; unmount: () => void } {
  const tape: string[] = [];
  const removals: number[] = [];
  const element = (
    <ChartSurface
      engine={tapeEngine(tape, removals)}
      convention={CONVENTION}
      data={{ bars: BARS, panes: [view(RATE)], read, pricePane: PRICE }}
      layout={{ heightPx: 480 }}
      a11y={{ label: 'workspace', describedBy: 'state' }}
      overlays={[inertOverlay()]}
      drawing={{ binding: loggingBinding(tape) }}
    />
  );
  const view1 = render(strict ? <StrictMode>{element}</StrictMode> : element);
  return { tape, removals, unmount: () => view1.unmount() };
}

describe('LMC-23 — the position became an assertion', () => {
  it('`useChartTeardown` is the LAST hook of the component', () => {
    // THE CLAUSE THAT USED TO BE PROSE. The destruction order of the cleanups is the DECLARATION
    // order, so "nothing touches the chart after this line" is a claim about position — and it is
    // now read from the code instead of promised by a comment.
    const hooks = topLevelHooks();
    expect(hooks).toContain('useChartTeardown');
    expect(hooks[hooks.length - 1]).toBe('useChartTeardown');

    // POSITIVE CONTROL: the mount is the FIRST of the two, which is the reason the teardown cannot
    // live in it — its cleanup runs before all the others.
    expect(hooks.indexOf('useChartMount')).toBeLessThan(hooks.indexOf('useChartTeardown'));
    // And the sweep is not trivial: the component calls many hooks.
    expect(hooks.length).toBeGreaterThanOrEqual(10);
  });

  it('the WHOLE ORDER of the subsystems is pinned, and not just the last line', () => {
    // WHY THE SEQUENCE AND NOT JUST THE END. React destroys cleanups in declaration order, so every
    // lifecycle guarantee of this surface is a claim about POSITION — the mount first, because it is
    // what publishes the handles the others declare; the teardown last, because nothing may touch
    // the chart after it; and the geometry before the mount, because it is what produces the cursor
    // callback the mount subscribes to. Pinning only the last line left the other four decisions as
    // prose.
    const subsystems = topLevelHooks().filter((name) => !/^use(Ref|State|Memo|Effect|Callback)$/.test(name));
    expect(subsystems).toEqual([
      'useSurfaceGeometry',
      'useChartMount',
      'useSeriesData',
      'useReferenceLines',
      'useDrawingSeam',
      'usePriceAlertLayer',
      'useLayoutApply',
      'useChartTeardown',
    ]);
    // THE FILTER MAY NOT EMPTY THE LIST: if somebody renames a subsystem to a prefix the filter
    // discards, the equality above would fail — but an empty list also "does not fail" under a
    // looser assertion, and that is what this line closes.
    expect(subsystems.length).toBe(8);
  });
});

describe('LMC-23 — the removal happens AFTER the primitives are detached', () => {
  it('the overlay primitives detach first, and so does the drawing layer', () => {
    const { tape, unmount } = mountForTeardown(false);
    unmount();

    expect(tape).toContain('detachPrimitive');
    expect(tape).toContain('layer.detach');
    expect(tape).toContain('chart.remove');
    expect(tape.indexOf('detachPrimitive')).toBeLessThan(tape.indexOf('chart.remove'));
    expect(tape.indexOf('layer.detach')).toBeLessThan(tape.indexOf('chart.remove'));
  });

  it('the removal is the LAST thing to happen, and it happens once', () => {
    // POSITIVE CONTROL for the two assertions above: an implementation that simply stopped removing
    // would satisfy them vacuously — `indexOf` would return -1 on both sides. Here the removal is
    // required, counted, and required at the END: the leak and the wrong order fall together.
    const { tape, removals, unmount } = mountForTeardown(false);
    unmount();
    expect(tape.filter((step) => step === 'chart.remove')).toHaveLength(1);
    expect(tape.at(-1)).toBe('chart.remove');
    expect(removals).toEqual([1]);
  });
});

describe('LMC-23 — zeroing the handles closes the destroyed chart’s window', () => {
  it('each chart is removed at most ONCE, even in the double cycle', () => {
    // THE DEFECT ZEROING PREVENTS. Without zeroing, the synchronous view keeps pointing at the
    // already-removed chart until the next publication — and any read in that window talks to a
    // destroyed chart. The observable form of that is a repeated removal on the SAME instance.
    const { removals, unmount } = mountForTeardown(true);
    expect(removals.length).toBeGreaterThan(1); // the strict-mode rehearsal happened
    expect(removals.every((count) => count <= 1)).toBe(true);

    unmount();
    // Unmounted, every chart created was removed exactly once. Not twice, and not never.
    expect(removals).toEqual(removals.map(() => 1));
  });

  it('the hook zeroes BEFORE removing — the order inside the cleanup is a decision too', () => {
    const source = readFileSync(
      join(__dirname, '..', 'src', 'react', 'surface', 'useChartTeardown.ts'),
      'utf8',
    );
    const zeroed = source.indexOf('publish(null)');
    const removed = source.indexOf('current?.chart.remove()');
    expect(zeroed).toBeGreaterThan(-1);
    expect(removed).toBeGreaterThan(-1);
    expect(zeroed).toBeLessThan(removed);
  });
});
