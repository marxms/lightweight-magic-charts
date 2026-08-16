import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import * as ts from 'typescript';
import { codeLines } from './sourceScan';

/**
 * LMC-25 — a module named `use*` may export at most 2 non-hook symbols, none over 40 code lines.
 *
 * The rule exists because `use` in a filename is where logic goes to become invisible. Nobody
 * reviews `useChartWorkspaceTabs.ts` expecting a codec; the name says "React glue", so 10 pure
 * functions live there unread. Two ceilings, not one: COUNT catches the drawer full of small
 * functions, SIZE catches the single 104-line function that a count of 1 would wave through — which
 * is exactly `useActiveIndicators`.
 *
 * WHAT COUNTS AS A SYMBOL. Declared here AND exported. A pass-through re-export
 * (`export { INDICATOR_LANE_COUNT, PLOTS_PER_LANE }` at `useActiveIndicators.ts:330`, both imported
 * at `:25-26`) forwards a symbol that lives in another module and is measured there. Forwarding is
 * not hiding, and there is no local declaration whose lines could be counted.
 */

const REPO_ROOT = resolve(join(__dirname, '..', '..', '..', '..'));
const LIB_SRC = join(REPO_ROOT, 'libs', 'lightweight-magic-charts', 'src');
const APP_HOOKS = join(REPO_ROOT, 'apps', 'web', 'src', 'hooks');

const SYMBOL_LIMIT = 2;
const LINE_LIMIT = 40;

/**
 * Scope: the lib plus the chart workspace hooks. NEVER the whole app — `apps/web/src` has
 * authentication, screens and services that have nothing to do with this feature, and a gate that
 * swept them would be switched off on the first false positive belonging to somebody else.
 */
const ROOTS = [LIB_SRC, APP_HOOKS];

/** Declared, with a reason, and one item long: the spec exempts this file as outside the boundary. */
const OUT_OF_BOUNDS = ['apps/web/src/hooks/useSignalsList.ts'];

/**
 * Measured on 2026-08-13 by this file's counter. There were FOUR; all four fall in slice 2, the
 * repatriation one, and the list **only shrinks** — the equality clause below is what guarantees it.
 *
 * Recorded casualties:
 *   `useChartWorkspaceLayout.ts` (8 symbols / largest 28) — the arithmetic moved up to
 *   `pane/budget.ts` and the hook, which had no production caller, was deleted. Two symbols were
 *   left: the payload version and the `localStorage` adapter, which are exactly what cannot move up.
 *
 *   `useLiveIndicatorTip.ts` went down from 5 to 3 symbols (largest 15 -> 12): the fold on the last
 *   bar moved up to `indicator/liveTip.ts` and the empty tip became a re-export of the lib's
 *   constant. It stays in the baseline because 3 > 2, and the three that remain are wire vocabulary.
 *
 *   `useChartWorkspaceTabs.ts` (10 symbols / largest 38) — it went down in three steps,
 *   10 -> 9 -> 8 -> 0. The setup shape and the cell reconciliation moved up to `tabs/setup.ts`; the
 *   codec moved up to `tabs/codec.ts`; the policy, the initial tabs and the platform ports went to
 *   `apps/web/src/chart/adapters/tabsHost.ts`. The file still exists and is still swept — it is a
 *   hook now, which is what the name always promised.
 */
const BASELINE: Readonly<Record<string, { readonly symbols: number; readonly largest: number }>> = {
  'apps/web/src/hooks/useLiveIndicatorTip.ts': { symbols: 3, largest: 12 },
};

/**
 * The modules that have ALREADY left the baseline, and what was left in each one.
 *
 * Without this table, "the list only shrinks" would be a phrase: the equality below accepts any
 * shrinkage, including the one that comes from a file having been deleted by mistake or from the
 * sweep having stopped seeing it. Here the casualty is ASSERTED — the file exists, is swept, and
 * passes with the recorded count. A file that vanished or went back to violating fails on this
 * line, not on the one above.
 */
type Clearance = { readonly symbols: number; readonly largest: number } | 'apagado';

const CLEARED: Readonly<Record<string, Clearance>> = {
  // Deleted entirely: the arithmetic moved up to `pane/budget.ts`, the hook had no production
  // caller, and what was left — `localStorage` and the version number — became
  // `apps/web/src/chart/adapters/layoutStore.ts`, which is not a `use*` module and therefore does
  // not enter this sweep. The path is asserted ABSENT, so that "it shrank" can never mean
  // "the sweep stopped looking".
  'apps/web/src/hooks/useChartWorkspaceLayout.ts': 'apagado',
  // Deleted entirely: the arithmetic of the tab set became the composition's — it persists,
  // migrates and exports on its own —, and what was left here was a React wrapper with no caller.
  // The path is asserted ABSENT, so that "it shrank" can never mean "the sweep stopped looking".
  'apps/web/src/hooks/useChartWorkspaceTabs.ts': 'apagado',
  // The 104-line symbol went to `indicator/resolution.ts`; two small ones were left, both about
  // what the lib cannot know — the LOOKUP that translates the authored catalogue, and the
  // composition that returns the app's vocabulary.
  'apps/web/src/hooks/useActiveIndicators.ts': { symbols: 2, largest: 13 },
  // Absorbed by the library: the candle-lane wiring and the overlay-attachment wiring now live in
  // `react/useCandleLane.ts` and `react/useOverlayFields.ts`, and what was app vocabulary —
  // the series point and the liquidation grid — stayed in `chart/adapters/candleFields.ts`, which
  // is not a `use*` module and therefore does not enter this sweep.
  'apps/web/src/hooks/useChartOverlays.ts': 'apagado',
  'apps/web/src/hooks/useChartScope.ts': 'apagado',
};

/**
 * The HISTORICAL measurement that justifies the SIZE PER SYMBOL rule, recorded once.
 *
 * `useActiveIndicators.ts`, measured on 2026-08-13 by this file's counter, before the
 * repatriation: ONE exported symbol, of 104 lines. It is the case the count clause alone would
 * wave through, and that is why there are two ceilings and not one.
 */
const HISTORICAL_ACTIVE_INDICATORS = { symbols: 1, largest: 104 } as const;

interface PureSymbol {
  readonly name: string;
  readonly lines: number;
}

interface Module {
  readonly file: string;
  readonly symbols: readonly PureSymbol[];
}

function isExported(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  return (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

/** Exported, declared here, and not a hook by name. */
function pureSymbolsOf(file: string, text: string): PureSymbol[] {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.ES2021, true, kind);
  const found: PureSymbol[] = [];
  const keep = (name: string, node: ts.Node): void => {
    if (/^use[A-Z]/.test(name)) return;
    found.push({ name, lines: codeLines(node.getText()) });
  };
  for (const statement of parsed.statements) {
    if (!isExported(statement)) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      keep(statement.name.text, statement);
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      keep(statement.name.text, statement);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) keep(declaration.name.text, declaration);
      }
    }
    // Interfaces and type aliases are deliberately NOT counted: they vanish at compile time, so
    // they cannot be logic hiding behind a hook name. The measured counts reproduce the spec's
    // Independent Test exactly under this reading (10 / 8 / 5 / 1).
  }
  return found;
}

function walkHookModules(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry): string[] => {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : walkHookModules(abs);
    return /^use[A-Z].*\.tsx?$/.test(entry.name) ? [abs] : [];
  });
}

const modules: Module[] = ROOTS.flatMap(walkHookModules)
  .map((abs) => abs.slice(REPO_ROOT.length + 1))
  .filter((file) => !OUT_OF_BOUNDS.includes(file))
  .sort()
  .map((file) => ({
    file,
    symbols: pureSymbolsOf(file, readFileSync(join(REPO_ROOT, file), 'utf8')),
  }));

function largest(module: Module): PureSymbol {
  return module.symbols.reduce(
    (worst, symbol) => (symbol.lines > worst.lines ? symbol : worst),
    { name: '—', lines: 0 },
  );
}

function breaches(module: Module): boolean {
  return module.symbols.length > SYMBOL_LIMIT || largest(module).lines > LINE_LIMIT;
}

/** LMC-28: path, count, the largest symbol, and the two limits. */
function report(module: Module): string {
  const worst = largest(module);
  return (
    `FAIL ${module.file} :: non-hook symbols measured=${module.symbols.length} limit=${SYMBOL_LIMIT}` +
    ` · largest=${worst.name} measured=${worst.lines} limit=${LINE_LIMIT}`
  );
}

const violators = modules.filter(breaches);

describe('LMC-25 — a pure symbol hidden behind a hook name', () => {
  it('sweeps the lib and the chart workspace hooks, and not the whole app', () => {
    expect(modules.length).toBeGreaterThanOrEqual(8);
    expect(modules.map((m) => m.file)).toContain(
      'libs/lightweight-magic-charts/src/react/chrome/useFlyoutPosition.ts',
    );
    // The witness on the APP side. It used to be `useChartWorkspaceTabs.ts`, which the change
    // deleted — the path stays asserted ABSENT in `CLEARED`, and another hook from the same
    // directory comes in here, because what this line pins is the REACH of the sweep and not one
    // file in particular.
    expect(modules.map((m) => m.file)).toContain('apps/web/src/hooks/useActiveIndicators.ts');
    // "never the whole app": `useAuth.ts` exists, is a `use*`, and is outside the sweep because it
    // does not live in `apps/web/src/hooks`.
    expect(modules.map((m) => m.file)).not.toContain('apps/web/src/auth/useAuth.ts');
    // Spec edge case: `useSignalsList.ts` is ignored for being outside this feature's boundary.
    expect(modules.map((m) => m.file)).not.toContain('apps/web/src/hooks/useSignalsList.ts');
  });

  it('fails above two symbols, and fails a single symbol above 40 lines', () => {
    // POSITIVE CONTROL of the two clauses separately, on the exact edges the real tree does not
    // have: no actual module sits at 3 symbols or at 41 lines.
    const three: Module = {
      file: 'synthetic/useThree.ts',
      symbols: [
        { name: 'a', lines: 3 },
        { name: 'b', lines: 3 },
        { name: 'c', lines: 3 },
      ],
    };
    const dois: Module = {
      file: 'synthetic/useTwo.ts',
      symbols: [
        { name: 'a', lines: 40 },
        { name: 'b', lines: 3 },
      ],
    };
    const large: Module = { file: 'synthetic/useLarge.ts', symbols: [{ name: 'a', lines: 41 }] };

    expect(breaches(three)).toBe(true);
    expect(breaches(dois)).toBe(false);
    expect(breaches(large)).toBe(true);
    expect(report(large)).toBe(
      'FAIL synthetic/useLarge.ts :: non-hook symbols measured=1 limit=2 · largest=a measured=41 limit=40',
    );
  });

  it('fails the known targets that remain, with the count and the largest symbol measured', () => {
    // POSITIVE CONTROL over REAL targets. They are the reason the rule exists; if the sweep stopped
    // seeing them, the gate would be decorative and nothing here would go red.
    const measured = Object.fromEntries(
      violators.map((m) => [m.file, { symbols: m.symbols.length, largest: largest(m).lines }]),
    );
    expect(measured).toEqual(BASELINE);
    // The only target that remains, named. It went down from 5 to 3 symbols, and the three that
    // stay are exactly the ones that cannot move up: the projection (wire names from this emitter,
    // three of them on the banned list), the wrapper that translates scope, and the composition of
    // the route URL.
    expect(
      violators.find((m) => m.file === 'apps/web/src/hooks/useLiveIndicatorTip.ts')?.symbols.map((s) => s.name),
    ).toEqual(['projectTipValues', 'applyLiveTip', 'chartProjectionUrl']);
  });

  it('the recorded casualties keep being SWEPT, and keep passing', () => {
    // The other half of the ratchet. Shrinking the baseline is free; proving the file shrank
    // because it improved — and not because it vanished from the sweep — requires looking at it
    // afterwards.
    for (const [file, recorded] of Object.entries(CLEARED)) {
      const module = modules.find((m) => m.file === file);
      if (recorded === 'apagado') {
        expect(module).toBeUndefined();
        expect(existsSync(join(REPO_ROOT, file))).toBe(false);
        continue;
      }
      expect(module).toBeDefined();
      expect(breaches(module as Module)).toBe(false);
      expect({
        symbols: (module as Module).symbols.length,
        largest: largest(module as Module).lines,
      }).toEqual(recorded);
    }
    // And a casualty is never also a violator — the two lists are disjoint.
    expect(Object.keys(CLEARED).filter((file) => file in BASELINE)).toEqual([]);
  });

  it('passes the legitimate adapters — the negative control', () => {
    // Real external-system adapters: one small pure symbol each. If the gate failed them, it would
    // be charging for architecture instead of measuring the defect, and the team would switch it
    // off — which is the fate of every noisy gate. `useChartScope` and `useChartOverlays` were here
    // and were absorbed by the library; both paths are asserted ABSENT in `CLEARED`, so that
    // leaving the negative control can never mean leaving the sweep.
    const approved = [
      'apps/web/src/hooks/useChartWorkspaceClient.ts',
      'apps/web/src/hooks/useIndicatorStream.ts',
      'libs/lightweight-magic-charts/src/react/useCandleLane.ts',
      'libs/lightweight-magic-charts/src/react/useOverlayFields.ts',
      'libs/lightweight-magic-charts/src/react/chrome/useFlyoutPosition.ts',
    ];
    for (const file of approved) {
      const module = modules.find((m) => m.file === file);
      expect(module).toBeDefined();
      expect(breaches(module as Module)).toBe(false);
    }
  });

  it('does not count a pass-through re-export, which forwards a symbol from another module', () => {
    const activeIndicators = modules.find(
      (m) => m.file === 'apps/web/src/hooks/useActiveIndicators.ts',
    );
    // `export { INDICATOR_LANE_COUNT, PLOTS_PER_LANE }` at the end of the file forwards two symbols
    // declared in `config/chartPanes.ts`, and neither of them shows up here: forwarding is not
    // hiding, and there is no local declaration whose lines could be counted.
    expect(activeIndicators?.symbols.map((s) => s.name)).toEqual([
      'catalogLookup',
      'resolveActiveIndicators',
    ]);
  });

  it('records why neither file size nor hook density will do', () => {
    // Two cheaper metrics were measured against the same modules, and neither orders the targets
    // the way the rule needs.
    const loc = (file: string): number => codeLines(readFileSync(join(REPO_ROOT, file), 'utf8'));
    const density = (file: string): number => {
      const text = readFileSync(join(REPO_ROOT, file), 'utf8');
      return (text.match(/\buse[A-Z][A-Za-z]*\s*[(<]/g) ?? []).length / loc(file);
    };
    const tip = 'apps/web/src/hooks/useLiveIndicatorTip.ts';
    const client = 'apps/web/src/hooks/useChartWorkspaceClient.ts';

    // HOOK DENSITY fails outright, and this is measured on TODAY's tree, against two files the
    // repatriation has not touched yet: the threshold that has to catch the least dense target
    // (`useLiveIndicatorTip`) catches `useChartWorkspaceClient` along with it, a legitimate adapter.
    expect(density(client)).toBeLessThan(density(tip));
    expect(loc(tip)).toBeGreaterThan(0);

    // FILE SIZE ordered the opposite way from what the rule charges for, and the proof of that is
    // the RECORDED MEASUREMENT, not the tree: `useActiveIndicators` had ONE symbol of 104 lines and
    // `useLiveIndicatorTip` has FIVE of at most 15. Volume does not see count — and it is by not
    // seeing it that the first would pass the count clause alone, with 1 symbol <= 2.
    //
    // The measurement comes from the ledger because the file that sustained it has already been
    // repatriated. Re-reading today's file would measure the result of the fix and call that the
    // rule's justification, which is exactly the error a historical metric cannot make.
    //
    // And what sustains the value are the two lines below, which put it through BOTH of the rule's
    // ceilings: it fits the count and blows the size. Asserting the literal against itself was the
    // third line here, and it could not fail under any code change — an echo, not a test.
    expect(HISTORICAL_ACTIVE_INDICATORS.symbols).toBeLessThanOrEqual(SYMBOL_LIMIT);
    expect(HISTORICAL_ACTIVE_INDICATORS.largest).toBeGreaterThan(LINE_LIMIT);
    expect(BASELINE[tip].symbols).toBeGreaterThan(SYMBOL_LIMIT);
    expect(BASELINE[tip].largest).toBeLessThanOrEqual(LINE_LIMIT);
  });

  it('fails any module outside the baseline — the list only shrinks', () => {
    const unrecorded = violators.filter((m) => !(m.file in BASELINE)).map(report);
    expect(unrecorded).toEqual([]);
    expect(violators.map((m) => m.file)).toEqual(Object.keys(BASELINE).sort());
  });

  it('fails if a baseline module worsens beyond the recorded value', () => {
    const grown = violators
      .filter((m) => {
        const recorded = BASELINE[m.file];
        return (
          recorded !== undefined &&
          (m.symbols.length > recorded.symbols || largest(m).lines > recorded.largest)
        );
      })
      .map(report);
    expect(grown).toEqual([]);
  });
});
