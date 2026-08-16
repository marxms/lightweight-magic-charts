/**
 * @jest-environment jsdom
 *
 * LMC-23 — every component of `react/workspace/` and every chrome widget is `React.memo`.
 *
 * WHY THE RULE EARNS A GATE. The setup context hands out exemption by selector: a consumer
 * re-renders only when `Object.is` says its own selection changed. That holds for the store's
 * notification and NOT for the parent cascade — when the root re-renders, an unmemoised child
 * re-renders with it, changed field or not, and the fan-out ceiling ends up protecting a saving
 * that does not exist. The design wrote the rule and not one of the fourteen regions was born with
 * it; the rule and the compliance land together, because a gate lit over violators is a gate
 * somebody suppresses, and a suppressed gate never measures anything again.
 *
 * WHY PRESENCE IS NOT ENOUGH, AND WHAT THE SECOND HALF ADDS. A gate that looked for the word `memo`
 * would pass on a `memo` that saves no render at all. So the structural clause is paired with an
 * EFFECT clause: a region is watched while the root re-renders without its own setup field moving,
 * and it must not re-render. The two together are the claim; either alone is decoration.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import * as ts from 'typescript';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { WorkspaceChromeProvider } from '../../src/react/chrome/ChromeContext';
import type { PillProps } from '../../src/react/chrome/slots';
import { OverlayTogglesSection } from '../../src/react/workspace/OverlayTogglesSection';
import { WorkspaceSetupProvider } from '../../src/react/workspace/setupContext';
import type { WorkspaceSetup } from '../../src/tabs/setup';

const SRC = resolve(join(__dirname, '..', '..', 'src'));
/**
 * The two layers the design names, and only those. The published composites of `src/react/` —
 * `SeriesMenu`, `DrawingToolbar`, `CompactCell`, `DensityControls`, `WorkspaceTabsBar`,
 * `TimeframeChips`, `WorkspaceLegend` — stay OUT, declared rather than forgotten: the memoisation
 * boundary is drawn around the regions a root cascade reaches and around the widgets those regions
 * repaint per tick. A composite is mounted by a host that decides its own render discipline, and
 * imposing ours on it would be this package having an opinion about somebody else's tree.
 */
const LAYERS: readonly string[] = ['react/workspace', 'react/chrome'];

interface Component {
  readonly file: string;
  readonly name: string;
  readonly memoised: boolean;
}

const OPTIONS: ts.CompilerOptions = {
  jsx: ts.JsxEmit.ReactJSX,
  target: ts.ScriptTarget.ES2021,
  strict: true,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  skipLibCheck: true,
};

const CONTROL_FILE = join(SRC, 'react', 'workspace', '__controle__', 'controleMemo.tsx');
/**
 * The positive and negative controls, served from memory and never written to disk: a synthetic
 * violator inside `src/` would be caught by the build and by every other guard in this package.
 */
const CONTROL_TEXT = `
import { memo } from 'react';
import type { ReactElement } from 'react';
export function ControleNu(): ReactElement { return null as unknown as ReactElement; }
export const ControleEnvolvido = memo(function ControleEnvolvido(): ReactElement {
  return null as unknown as ReactElement;
});
export const ControleNuEntreParenteses = (function ControleNuEntreParenteses(): ReactElement {
  return null as unknown as ReactElement;
});
export const ControleEnvolvidoEntreParenteses = memo((function ControleEnvolvidoEntreParenteses(): ReactElement {
  return null as unknown as ReactElement;
}));
export const naoEComponente = (): string => 'tiny, therefore not a component';
export function ControleQueNaoRenderiza(a: number): number { return a; }
`;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry): string[] => {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) return walk(abs);
    return entry.name.endsWith('.tsx') ? [resolve(abs)] : [];
  });
}

function buildProgram(): ts.Program {
  const roots = [...LAYERS.flatMap((layer) => walk(join(SRC, layer))), CONTROL_FILE];
  const host = ts.createCompilerHost(OPTIONS, true);
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  const getSourceFile = host.getSourceFile.bind(host);
  host.readFile = (name) => (name === CONTROL_FILE ? CONTROL_TEXT : readFile(name));
  host.fileExists = (name) => name === CONTROL_FILE || fileExists(name);
  host.getSourceFile = (name, languageVersion, onError, shouldCreate) =>
    name === CONTROL_FILE
      ? ts.createSourceFile(name, CONTROL_TEXT, languageVersion, true, ts.ScriptKind.TSX)
      : getSourceFile(name, languageVersion, onError, shouldCreate);
  return ts.createProgram(roots, OPTIONS, host);
}

/** A component is what RETURNS an element — measured on the return annotation, not on the name. */
function rendersElement(node: ts.SignatureDeclarationBase): boolean {
  return node.type !== undefined && /\bReactElement\b/.test(node.type.getText());
}

/** The function a declaration holds, seen through the wrappers a component may arrive in. */
function unwrap(node: ts.Expression): { fn: ts.FunctionExpression | ts.ArrowFunction; memoised: boolean } | undefined {
  if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) return { fn: node, memoised: false };
  // A pair of parentheses changes nothing that runs, and without this line it changed everything the
  // scan sees: the component vanished from the sweep — not as a violator, as nothing at all.
  if (ts.isParenthesizedExpression(node)) return unwrap(node.expression);
  if (!ts.isCallExpression(node) || node.arguments.length === 0) return undefined;
  const inner = unwrap(node.arguments[0]);
  if (inner === undefined) return undefined;
  const callee = node.expression;
  const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : callee.getText();
  return { fn: inner.fn, memoised: inner.memoised || name === 'memo' };
}

function componentsIn(sourceFile: ts.SourceFile): Component[] {
  const file = sourceFile.fileName === CONTROL_FILE
    ? 'react/workspace/__controle__/controleMemo.tsx'
    : sourceFile.fileName.slice(SRC.length + 1);
  const found: Component[] = [];
  const exported = (node: ts.Node): boolean =>
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

  ts.forEachChild(sourceFile, (node) => {
    // `export function X(): ReactElement` — a declaration can never be memoised in place, so
    // finding one at all IS the violation.
    if (ts.isFunctionDeclaration(node) && node.name && exported(node) && rendersElement(node)) {
      found.push({ file, name: node.name.text, memoised: false });
      return;
    }
    if (ts.isVariableStatement(node) && exported(node)) {
      for (const declaration of node.declarationList.declarations) {
        const init = declaration.initializer;
        if (!init || !ts.isIdentifier(declaration.name)) continue;
        const held = unwrap(init);
        if (held === undefined || !rendersElement(held.fn)) continue;
        found.push({ file, name: declaration.name.text, memoised: held.memoised });
      }
      return;
    }
    // `export default memo(function X)` counts the same as the named form.
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      const held = unwrap(node.expression);
      if (held === undefined || !rendersElement(held.fn)) return;
      const name = held.fn.name?.text ?? 'default';
      found.push({ file, name, memoised: held.memoised });
    }
  });
  return found;
}

const program = buildProgram();
const components = program
  .getSourceFiles()
  .filter(
    (sf) =>
      sf.fileName === CONTROL_FILE ||
      LAYERS.some((layer) => sf.fileName.startsWith(`${join(SRC, layer)}/`)),
  )
  .flatMap(componentsIn);

const synthetic = components.filter((c) => c.file.includes('__controle__'));
const real = components.filter((c) => !c.file.includes('__controle__'));

/** LMC-28: path, measured metric, violated limit. */
function report(c: Component): string {
  return `FAIL ${c.file}::${c.name} :: memoisation measured=absent required=React.memo`;
}

describe('LMC-23 — the memoisation boundary in react/workspace and react/chrome', () => {
  it('finds the real components, so that a green gate is not a gate over nothing', () => {
    // A ceiling measured over an empty set passes for the same reason an empty set has no maximum.
    expect(real.length).toBeGreaterThanOrEqual(25);
    expect(real.map((c) => c.name)).toEqual(
      expect.arrayContaining(['ChartWorkspace', 'Pill', 'PaneListSection', 'TabsRegion']),
    );
    expect(new Set(real.map((c) => c.file.split('/').slice(0, 2).join('/')))).toEqual(
      new Set(LAYERS),
    );
  });

  it('discrimination proof: the bare one fails naming file and symbol, the wrapped one passes', () => {
    // POSITIVE AND NEGATIVE CONTROL in the same pair, by the predicate that just judged the real
    // tree. THE PARENTHESISED PAIR is the same test under the form the scan could not see: a pair of
    // parentheses made the component vanish from the count, and vanishing passes — the ceiling
    // clause stayed green because 28 were left. The four lines below are two forms of one judgement.
    expect(synthetic.map((c) => `${c.name}=${c.memoised}`).sort()).toEqual([
      'ControleEnvolvido=true',
      'ControleEnvolvidoEntreParenteses=true',
      'ControleNu=false',
      'ControleNuEntreParenteses=false',
    ]);
    expect(report(synthetic.filter((c) => !c.memoised)[0])).toBe(
      'FAIL react/workspace/__controle__/controleMemo.tsx::ControleNu :: ' +
        'memoisation measured=absent required=React.memo',
    );
  });

  it('does not demand memo of what is not a component', () => {
    // The negative control on the OTHER axis: a tiny helper and a function that returns a number are
    // not components, and a gate that charged them would be switched off in the first week.
    expect(synthetic.map((c) => c.name)).not.toContain('naoEComponente');
    expect(synthetic.map((c) => c.name)).not.toContain('ControleQueNaoRenderiza');
  });

  it('every component of the two layers is React.memo', () => {
    expect(real.filter((c) => !c.memoised).map(report)).toEqual([]);
  });

  it('the published composites of src/react stay out, and the exclusion is declared', () => {
    // The exclusion is verified, not promised: the composites exist, they are not under the two
    // layers, and the reason is written beside the list.
    const composites = readdirSync(join(SRC, 'react'), { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith('.tsx'))
      .map((e) => e.name);
    expect(composites).toEqual(expect.arrayContaining(['SeriesMenu.tsx', 'DrawingToolbar.tsx']));
    expect(real.some((c) => composites.includes(c.file.split('/').pop() as string))).toBe(false);
    expect(readFileSync(__filename, 'utf8')).toContain('decides its own render discipline');
  });
});

// ── The half that measures EFFECT, and not presence ─────────────────────────────────────────────

const BASE: WorkspaceSetup = {
  timeframe: '1h',
  layoutMode: 'foco',
  gridCells: ['1h'],
  panes: [{ id: 'price', visible: true, heightPx: 200 }],
  density: { floor: 0.1, gamma: 1 },
  showDensity: false,
  showProfile: false,
  autoFit: true,
  indicators: [],
  seriesStyles: {},
};

let pillRenders = 0;
/**
 * The counting slot. It is deliberately NOT memoised: it must repaint whenever the region's body
 * runs, so that a count which does not move proves the body did not run.
 */
function CountingPill({ children, onSelect }: PillProps): ReactElement {
  pillRenders += 1;
  return (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  );
}

const SLOTS = { Pill: CountingPill };

function EffectHarness(): ReactElement {
  const [setup, setSetup] = useState(BASE);
  const [unrelated, setUnrelated] = useState(0);
  return (
    <WorkspaceChromeProvider components={SLOTS}>
      <WorkspaceSetupProvider
        setup={setup}
        onChange={(patch) => setSetup((held) => ({ ...held, ...patch }))}
      >
        <OverlayTogglesSection />
        <button type="button" data-testid="bump" onClick={() => setUnrelated(unrelated + 1)}>
          {unrelated}
        </button>
      </WorkspaceSetupProvider>
    </WorkspaceChromeProvider>
  );
}

describe('LMC-23 — memoisation is measured by effect, not only by presence', () => {
  beforeEach(() => {
    pillRenders = 0;
  });

  it('the root re-renders and the region does NOT re-render while its own field does not move', () => {
    render(<EffectHarness />);
    const painted = pillRenders;
    expect(painted).toBeGreaterThan(0);

    // Three re-renders of the top that touch no field the region reads.
    for (let n = 0; n < 3; n += 1) act(() => void fireEvent.click(screen.getByTestId('bump')));

    expect(screen.getByTestId('bump')).toHaveTextContent('3');
    expect(pillRenders).toBe(painted);
  });

  it('and renders again when its field moves — otherwise the zero above would be of a dead screen', () => {
    // THE COUNTERPART. Without it, a region that never renders again because it is broken would pass
    // the previous clause with top marks.
    render(<EffectHarness />);
    const painted = pillRenders;
    act(() => void fireEvent.click(screen.getByText('Liquidation heatmap')));
    expect(pillRenders).toBeGreaterThan(painted);
  });
});
