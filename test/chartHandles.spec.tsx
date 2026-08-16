/**
 * @jest-environment jsdom
 *
 * LMC-23, LMC-24 — the seven handles as ONE object published as state.
 *
 * What this file proves is not "the chart mounts" — `workspaceSurface.spec.tsx` already proves it.
 * It is the property the dissolution depends on: whoever needs the handles DECLARES them, instead
 * of counting on the position of its own block in the file. A guarantee made of position does not
 * survive a new file, and the way it fails is silent.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import { render } from '@testing-library/react';

import { directionConvention, paneId, seriesId, utcSeconds } from '../src/domain/types';
import type { Bar, PaneSpec } from '../src/domain/types';
import type { ChartEngine, SeriesHandle, WorkspaceChartHandle } from '../src/port/chartApi';
import { ChartSurface, type PaneView, type SeriesReader } from '../src/react/surface/ChartSurface';
import { stripComments } from './gates/sourceScan';

const SURFACE = join(__dirname, '..', 'src', 'react', 'surface');
const COMPOSITION = join(__dirname, '..', 'src', 'react', 'surface', 'ChartSurface.tsx');
const MOUNT = join(SURFACE, 'useChartMount.ts');
const SOURCE = readFileSync(COMPOSITION, 'utf8');

/**
 * THE COMPOSITION PLUS EVERY MODULE UNDER `react/surface/`, and not only the component's file.
 *
 * This suite's central clause — "every hook that reads the handles declares them" — swept a single
 * file. While everything lived in it that was the whole tree; with each phase 9 extraction it
 * sweeps a little less, and in the end it would sweep a component with no effect at all: an empty
 * search, which passes. The sweep follows the hooks to wherever they went, which is the same fix
 * the mount has already received.
 */
function surfaceFiles(): string[] {
  return [
    COMPOSITION,
    ...readdirSync(SURFACE)
      .filter((name) => /\.tsx?$/.test(name))
      .map((name) => join(SURFACE, name)),
  ];
}

function parse(file: string): ts.SourceFile {
  const text = readFileSync(file, 'utf8');
  return ts.createSourceFile(file, text, ts.ScriptTarget.ES2021, true, ts.ScriptKind.TSX);
}

/** Every `useEffect`/`useCallback`/`useMemo` in the file, with body and dependency array. */
interface HookCall {
  readonly name: string;
  readonly line: number;
  readonly body: string;
  readonly deps: readonly string[] | null;
}

function hookCalls(file: string = COMPOSITION): HookCall[] {
  const parsed = parse(file);
  const found: HookCall[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      /^use(Effect|Callback|Memo)$/.test(node.expression.text) &&
      node.arguments.length >= 1
    ) {
      const array = node.arguments[1];
      found.push({
        name: node.expression.text,
        line: parsed.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        // NO COMMENTS. A body read with the prose inside makes the clause accuse the text that
        // EXPLAINS the rule instead of the code that violates it, and a noisy gate is a gate
        // switched off.
        body: stripComments(node.arguments[0].getText()),
        deps:
          array !== undefined && ts.isArrayLiteralExpression(array)
            ? array.elements.map((element) => element.getText())
            : null,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

describe('LMC-24 — one object, not seven refs', () => {
  it('none of the seven refs survived, and there is exactly ONE handles state', () => {
    // THE RATCHET. The seven names are cited one by one: a generic `catch` on "Ref" would accuse
    // the last-read refs, which are a different thing and remain legitimate.
    for (const dead of [
      'chartRef',
      'stackRef',
      'candleRef',
      'anchorSeriesRef',
      'seriesRef',
      'priceScalesRef',
      'alertsRef',
    ]) {
      expect(SOURCE).not.toMatch(new RegExp(`\\b${dead}\\b`));
    }
    expect(SOURCE.match(/useState<ChartHandles \| null>/g)).toHaveLength(1);

    // POSITIVE CONTROL: the refs that are NOT handles are still alive, so the sweep above is
    // reading the seven names and not "the word ref vanished from the file".
    expect(SOURCE).toMatch(/\bhostRef\b/);
    expect(SOURCE).toMatch(/\bmountRef\b/);
  });

  it('every hook that reads the handles DECLARES them in the dependency array', () => {
    // THIS PHASE'S CENTRAL CLAUSE. An effect that reads `handles` without declaring it reads the
    // first commit's value and never again — exactly the defect the position in the file hid.
    const everyCall = surfaceFiles().flatMap((file) =>
      hookCalls(file).map((call) => ({ ...call, file: file.slice(file.lastIndexOf('/') + 1) })),
    );
    const offenders = everyCall
      .filter((call) => /\bhandles\b/.test(call.body))
      .filter((call) => call.deps === null || !call.deps.includes('handles'))
      .map((call) => `FAIL ${call.file}:${call.line} :: ${call.name} reads handles undeclared`);
    expect(offenders).toEqual([]);

    // And the sweep is not empty: several hooks really do read the handles, in more than one file.
    const readers = everyCall.filter((call) => /\bhandles\b/.test(call.body));
    expect(readers.length).toBeGreaterThanOrEqual(8);
    expect(new Set(readers.map((call) => call.file)).size).toBeGreaterThanOrEqual(2);
  });

  it('the mount effect does NOT declare the handles — it is the one that creates them', () => {
    // NEGATIVE CONTROL of the clause above. If the mount declared them, publishing them would
    // re-run it, and every publication would create another chart: an infinite mount loop.
    // The mount lives in its own hook, and the clause follows it: it is about the effect that
    // CREATES, not about the file it used to sit in. A version pinned to the surface would have
    // become an empty search — and an empty search passes.
    const mount = hookCalls(MOUNT).find((call) => /createChartSurface/.test(call.body));
    expect(mount).toBeDefined();
    expect(mount?.body).not.toMatch(/\bhandles\b/);
    // Nothing reactive in the list: only refs and callbacks of stable identity. A reactive value
    // here would create a second chart on every change of it.
    expect(mount?.deps).toEqual(['hostRef', 'specRef', 'panesRef', 'publish', 'onHoveredTime']);
    // And the surface no longer holds any mount effect at all.
    expect(hookCalls().filter((call) => /createChartSurface/.test(call.body))).toEqual([]);
  });

  it('the synchronous view is read only where work is scheduled or undone, never in render', () => {
    // `live.current` during the render is precisely what the state came to fix. The only legitimate
    // readers are callbacks that run LATER: a scheduled frame, a gesture listener, the teardown.
    //
    // A READ and not a write: the pattern demands an access after `current`, so `live.current = x`
    // — the publisher — is left out. The first version of this clause caught the writer itself and
    // demanded of it a dependency it cannot have.
    //
    // AND THE SWEEP FOLLOWS THE VIEW. It read a single file; phase 9 takes the readers into modules
    // of `react/surface/` one by one, and pinned to the composition it would measure less and less
    // until it measured nothing.
    const reads = (text: string): number => (text.match(/live\.current\s*[?.]/g) ?? []).length;
    const readers = surfaceFiles()
      .flatMap((file) => hookCalls(file))
      .filter((call) => reads(call.body) > 0);
    expect(readers.length).toBeGreaterThanOrEqual(3);

    // EVERY read lives inside a hook. One left over would be in the render body, which is exactly
    // what publishing as state came to fix — and it would go unnoticed, because reading a ref
    // during the render works right up to the day React reorders the work.
    //
    // Summing per hook and comparing against the whole file is what closes the account: `hookCalls`
    // nests, so a hook inside another counts twice, and the file total is the only reference that
    // does not depend on that. The comparison is `>=`, and strict equality would be false by
    // nesting. File by file, so that a read loose in the body of ANY surface module fails.
    for (const file of surfaceFiles()) {
      const inHooks = hookCalls(file)
        .filter((call) => reads(call.body) > 0)
        .reduce((total, call) => total + reads(call.body), 0);
      expect(inHooks).toBeGreaterThanOrEqual(reads(stripComments(readFileSync(file, 'utf8'))));
    }

    // THE WRITER, and the reason it stays out: its identity has to be stable, or every effect that
    // declares it would re-run on every render — the mount included, which would create another
    // chart. An empty dependency array is what guarantees that, and it is asserted here.
    const writer = hookCalls().find((call) => /live\.current\s*=/.test(call.body));
    expect(writer).toBeDefined();
    expect(writer?.name).toBe('useCallback');
    expect(writer?.deps).toEqual([]);
  });
});

// ── THE COST, MEASURED ─────────────────────────────────────────────────────────────────────────

const CONVENTION = directionConvention({ upColor: '#26a69a', downColor: '#ef5350' });

function fakeEngine(): ChartEngine {
  return () => {
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
        detachPrimitive: () => undefined,
      }),
      applyOptions: () => undefined,
      subscribeCrosshairMove: () => undefined,
      unsubscribeCrosshairMove: () => undefined,
      remove: () => undefined,
      timeScale: () => ({ fitContent: () => undefined }),
    };
    return chart;
  };
}

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

const bar = (time: number, close: number): Bar => ({
  time: utcSeconds(time),
  open: close,
  high: close + 1,
  low: close - 1,
  close,
});
const BARS: readonly Bar[] = [bar(1_700_000_000, 100), bar(1_700_000_060, 105)];
const read: SeriesReader = () => [1, 2];
const view = (spec: PaneSpec): PaneView => ({ spec, visible: true, heightPx: 90, lastUsedAt: 1 });

describe('LMC-23 — the cost of publication, measured', () => {
  /** Counts the surface's renders by wrapping it in a component that records every pass. */
  function mounted(): { renders: number[]; rerender: (bars: readonly Bar[]) => void } {
    const renders: number[] = [];
    let pass = 0;
    const Counting = ({ bars }: { bars: readonly Bar[] }): ReturnType<typeof ChartSurface> => {
      pass += 1;
      renders.push(pass);
      return (
        <ChartSurface
          engine={fakeEngine()}
          convention={CONVENTION}
          data={{ bars, panes: [view(RATE)], read, pricePane: PRICE }}
          layout={{ heightPx: 480 }}
          a11y={{ label: 'workspace', describedBy: 'state' }}
        />
      );
    };
    const view1 = render(<Counting bars={BARS} />);
    return {
      renders,
      rerender: (bars) => view1.rerender(<Counting bars={bars} />),
    };
  }

  it('the mount costs ONE extra render, and no later frame costs another', () => {
    // The wrapper counts the PARENT's renders; publication re-renders the surface and not the
    // parent, so the parent is the baseline publication is measured against.
    const { renders, rerender } = mounted();
    const afterMount = renders.length;
    expect(afterMount).toBe(1);

    // A new bar: one parent render, and publication does NOT happen again — the chart is the same.
    rerender([...BARS, bar(1_700_000_120, 108)]);
    expect(renders.length).toBe(afterMount + 1);

    // Two more: still one per frame. If the handles' identity changed per frame, each one would
    // cost an extra render and this number would climb faster than the frame count.
    rerender([...BARS, bar(1_700_000_120, 109)]);
    rerender([...BARS, bar(1_700_000_120, 110)]);
    expect(renders.length).toBe(afterMount + 3);
  });

  it('the surface publishes ONCE and mounts ONE chart, even with a re-render in between', () => {
    // POSITIVE CONTROL of the clause above: the defect it rules out is publication re-entering the
    // mount effect. Every mount creates a chart, so counting charts counts publications.
    let created = 0;
    const counting: ChartEngine = (host, options) => {
      created += 1;
      return fakeEngine()(host, options);
    };
    const props = {
      engine: counting,
      convention: CONVENTION,
      a11y: { label: 'workspace', describedBy: 'state' },
    };
    const surface = (bars: readonly Bar[], heightPx = 480) => (
      <ChartSurface
        {...props}
        data={{ bars, panes: [view(RATE)], read, pricePane: PRICE }}
        layout={{ heightPx }}
      />
    );
    const view1 = render(surface(BARS));
    expect(created).toBe(1);

    view1.rerender(surface([...BARS, bar(1_700_000_120, 108)]));
    view1.rerender(surface(BARS, 600));
    expect(created).toBe(1);
  });
});
