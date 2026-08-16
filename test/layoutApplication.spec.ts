/**
 * The layout result lives in the layer that computes it.
 *
 * Two of the three criteria here are STRUCTURAL — which layer declares a type, and which way the
 * import between two layers points — and a type is erased before any value exists, so there is
 * nothing at runtime to assert against. The compiler is therefore the instrument, exactly as it is
 * in the boundary guard: the same parser reads the same two files and answers the same question.
 * The third criterion is about the published contract, and that one IS checkable at runtime.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import { paneId, type PaneId } from '../src/domain/types';
import type { StackApplication, StackPane } from '../src/index';
import { PRICE_PANE_ID, computeLayout, type LayoutBudget } from '../src/layout/computeLayout';
import type { PaneChartHandle, PaneHandle } from '../src/port/chartApi';
import { PaneStack } from '../src/render/paneStack';

const SRC = join(__dirname, '..', 'src');

function parse(relative: string): ts.SourceFile {
  const file = join(SRC, relative);
  return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2021, true);
}

/** Names DECLARED at the top level of a module — an `export … from` forwards, it does not declare. */
function declaredTypeNames(source: ts.SourceFile): string[] {
  return source.statements
    .filter((s): s is ts.InterfaceDeclaration | ts.TypeAliasDeclaration =>
      ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s),
    )
    .map((s) => s.name.text);
}

interface Edge {
  readonly specifier: string;
  readonly names: readonly string[];
}

/** Every `import … from '…'` in a module, with the named bindings it pulls. */
function importEdges(source: ts.SourceFile): Edge[] {
  return source.statements.filter(ts.isImportDeclaration).map((node) => {
    const bindings = node.importClause?.namedBindings;
    return {
      specifier: (node.moduleSpecifier as ts.StringLiteral).text,
      names:
        bindings !== undefined && ts.isNamedImports(bindings)
          ? bindings.elements.map((element) => element.name.text)
          : [],
    };
  });
}

const application = parse('layout/application.ts');
const paneStack = parse('render/paneStack.ts');

class FakePane implements PaneHandle {
  private stretch = 1;
  constructor(private readonly chart: FakeChart) {}
  paneIndex(): number {
    return this.chart.order.indexOf(this);
  }
  getStretchFactor(): number {
    return this.stretch;
  }
  setStretchFactor(value: number): void {
    this.stretch = value;
  }
  setPreserveEmptyPane(): void {
    /* the fake keeps every pane it is handed */
  }
  moveTo(): void {
    /* order is asserted by test/paneStack.spec.ts, not here */
  }
  getHTMLElement(): HTMLElement | null {
    return {} as HTMLElement;
  }
}

class FakeChart implements PaneChartHandle {
  readonly order: FakePane[] = [new FakePane(this)];
  panes(): readonly PaneHandle[] {
    return this.order;
  }
  addPane(): PaneHandle {
    const pane = new FakePane(this);
    this.order.push(pane);
    return pane;
  }
}

const BUDGET: LayoutBudget = { priceFloorPx: 260, defaultPaneHeightPx: 90 };
const A = paneId('a');
const B = paneId('b');

describe('LMC-23, LMC-29 — the layout result goes down to the layer that produces it', () => {
  it('the layout layer DECLARES both types', () => {
    expect(declaredTypeNames(application).sort()).toEqual(['StackApplication', 'StackPane']);
  });

  it('the render layer stops declaring both types, and starts IMPORTING them from layout', () => {
    // Today's direction, inverted: what was declared here now arrives from down below.
    expect(declaredTypeNames(paneStack)).not.toContain('StackApplication');
    expect(declaredTypeNames(paneStack)).not.toContain('StackPane');

    const edge = importEdges(paneStack).find((e) => e.specifier === '../layout/application');
    expect(edge).toBeDefined();
    expect([...(edge as Edge).names].sort()).toEqual(['StackApplication', 'StackPane']);
  });

  it('the layout layer does not import the render one — the inversion is one-sided', () => {
    // Without this half, "inverted" would be satisfied by a cycle: each side importing the other.
    const back = importEdges(application).filter((e) => e.specifier.startsWith('../render'));
    expect(back).toEqual([]);
  });

  it('the entry publishes the same result the stack returns, arithmetic already inside it', () => {
    // The defect the change fixes: the consumer had to re-run `computeLayout` to know what the
    // application decided. The type the entry publishes is what the stack returns, and the
    // `outcome` it carries is EQUAL to the arithmetic's — nothing is left to recompute.
    const stack = new PaneStack(new FakeChart(), BUDGET);
    const panes: StackPane[] = [
      { id: A, targetHeightPx: 90, lastUsedAt: 2, visible: true },
      { id: B, targetHeightPx: 90, lastUsedAt: 1, visible: true },
    ];
    const applied: StackApplication = stack.apply(panes, 600);

    expect(applied.kind).toBe('applied');
    if (applied.kind !== 'applied') throw new Error('unreachable');
    expect(applied.outcome).toEqual(
      computeLayout(
        panes.map((p) => ({ id: p.id, targetHeightPx: p.targetHeightPx, lastUsedAt: p.lastUsedAt })),
        600,
        BUDGET,
      ),
    );
    expect(applied.outcome.priceHeightPx).toBe(420);
    expect(applied.outcome.factors.get(PRICE_PANE_ID)).toBe(420);
    expect(applied.collapsed).toEqual([]);
    expect(applied.order).toEqual<readonly PaneId[]>([A, B]);
    expect(applied.ordered).toBe(true);
  });

  it('the degenerate path also arrives through the published type', () => {
    const degenerate: StackApplication = new PaneStack(new FakeChart(), BUDGET).apply([], 0);
    expect(degenerate).toEqual({ kind: 'degenerate', totalPx: 0 });
  });
});
