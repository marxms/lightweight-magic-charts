import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import type { Dirent } from 'fs';
import { collectSources, stripComments, type Source } from './gates/sourceScan';

/**
 * Tasks 3.2, 3.3, 3.4, 3.5 — the guards that make "this library is decoupled" checkable.
 *
 * Every claim the proposal makes about this package is a claim about what it does NOT contain, and
 * an absence is exactly the kind of property that decays silently. One careless import and "the
 * proprietary indicators live outside the library" becomes false without a single test going red —
 * unless a test is looking for it.
 */

const LIB_ROOT = join(__dirname, '..');
const SRC = join(LIB_ROOT, 'src');
const REPO_ROOT = join(LIB_ROOT, '..', '..');

/**
 * `collectSources` and `stripComments` now live in `gates/sourceScan.ts`.
 *
 * They were defined here first, for this guard alone. The size gate needs the identical comment
 * remover, and two copies of one regex drift the moment somebody improves one of them — so the
 * definitions moved out and both callers import the single copy.
 */

type ImportKind = 'runtime' | 'type';

interface ImportRef {
  readonly specifier: string;
  readonly kind: ImportKind;
}

/**
 * WHAT THE GUARD REPORTS WHEN IT CANNOT READ THE REFERENCE (GATE-05, GATE-06).
 *
 * Every clause below asks a question of a specifier: is it a peer, is it relative, does the layer
 * rule admit it. A reference written as `import(name)` or `require(`${base}/x`)` answers none of
 * them, and the old predicate resolved that by staying silent — which clears the import. This
 * placeholder is the opposite default: it starts with no dot, so it is never relative; it is not a
 * declared peer, so the allowlist refuses it; and it matches no layer's `allow`, so every layer
 * refuses it too. One value, and the guard fails closed everywhere at once.
 */
const UNREADABLE_SPECIFIER = '<unreadable module reference>';

/**
 * THE PARSER, NOT A REGEX (LMC-50).
 *
 * The regex this replaces read `from '…'` out of comment-stripped text. It got the specifier right
 * and the QUESTION wrong: it could not tell an import that survives to runtime from one the
 * compiler erases, and three forms defeat it outright.
 *
 *   `import 'side-effect'`        — no `from` at all, so the regex never saw it, and it is the one
 *                                   form that runs code purely for its effect;
 *   `import { type A, B } from`   — erasure applies per specifier, so a list with ONE value import
 *                                   is a runtime import wearing type clothing;
 *   `import type { A } from`      — erased entirely; it costs a consumer nothing.
 *
 * The compiler already answers all three, so the guard asks it instead of guessing. Comment
 * stripping disappears with the regex: a parser does not see prose as an import.
 */
function importsOf(source: Source): ImportRef[] {
  const kind = source.file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const parsed = ts.createSourceFile(
    source.file,
    source.text,
    ts.ScriptTarget.ES2021,
    true,
    kind,
  );
  const found: ImportRef[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      found.push({ specifier: node.moduleSpecifier.text, kind: kindOfImport(node.importClause) });
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push({
        specifier: node.moduleSpecifier.text,
        kind: node.isTypeOnly ? 'type' : 'runtime',
      });
    } else if (isModuleReferenceCall(node)) {
      found.push({ specifier: moduleReferenceOf(node), kind: 'runtime' });
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

/**
 * THE TWO FORMS THAT NAME A MODULE THROUGH A CALL, ASKED AS ONE QUESTION.
 *
 * `require(x)` was already read; `import(x)` was not, because its callee is an `ImportKeyword` and
 * the branch demanded an identifier. Both survive the compiler, both hand the consumer real bytes,
 * and both are therefore `runtime` — so they answer to one predicate rather than to two that drift.
 */
function isModuleReferenceCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  if (node.expression.kind === ts.SyntaxKind.ImportKeyword) return true;
  return ts.isIdentifier(node.expression) && node.expression.text === 'require';
}

/** The literal the call names, or the placeholder that no allow-list clears. */
function moduleReferenceOf(node: ts.CallExpression): string {
  const first = node.arguments[0];
  return first !== undefined && ts.isStringLiteral(first) ? first.text : UNREADABLE_SPECIFIER;
}

function kindOfImport(clause: ts.ImportClause | undefined): ImportKind {
  // A bare `import 'x'` has no clause at all — nothing to erase, so it always runs.
  if (clause === undefined) return 'runtime';
  if (clause.isTypeOnly) return 'type';
  if (clause.name !== undefined) return 'runtime';
  const bindings = clause.namedBindings;
  if (bindings !== undefined && ts.isNamedImports(bindings)) {
    return bindings.elements.every((element) => element.isTypeOnly) ? 'type' : 'runtime';
  }
  return 'runtime';
}

function importSpecifiers(source: Source): string[] {
  return importsOf(source).map((ref) => ref.specifier);
}

const sources = collectSources(SRC);

/** The package name a specifier resolves to. `react/jsx-runtime` is the `react` peer, not a new one. */
function packageOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

const PACKAGE = JSON.parse(readFileSync(join(LIB_ROOT, 'package.json'), 'utf8')) as {
  sideEffects?: boolean;
  peerDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  types?: string;
  license?: string;
};

/**
 * DERIVED, never typed out.
 *
 * An allowlist written by hand is a second declaration of the dependency set, and two declarations
 * of one fact drift. Reading it from `peerDependencies` means the only way to widen this guard is to
 * declare the peer — which is the visible, reviewable act — and removing a peer narrows the guard
 * automatically.
 */
const ALLOWED_PEERS = new Set(Object.keys(PACKAGE.peerDependencies ?? {}));

/**
 * PURITY IS DECLARED PER FILE, NOT INHERITED FROM A FOLDER (LMC-29).
 *
 * The rule used to be a path prefix: anything under `react/` could import a peer, anything else
 * could import nothing. That exempted by ADDRESS. `react/theme.ts` is a token table that imports
 * nothing at all, and it was passing the guard for free — moved into `react/` it would have been
 * allowed to grow a React import with no test noticing. Same for `react/chrome/rovingFocus.ts` and
 * `react/drawingToolBuckets.ts`, both pure arithmetic sitting inside the exempt folder.
 *
 * Now every file that imports anything non-relative has to appear below, with the STRONGEST kind it
 * uses. Anything absent must import nothing outside its own package. The list is exact in both
 * directions: a file that stops importing must be removed, and a `type` entry that becomes a
 * runtime import fails until someone changes the word — which is the visible, reviewable act.
 */
const DECLARED_IMPURITY: Readonly<Record<string, ImportKind>> = {
  'react/CompactCell.tsx': 'runtime',
  'react/DensityControls.tsx': 'type',
  'react/DensityLegend.tsx': 'type',
  'react/DrawingToolbar.tsx': 'runtime',
  'react/SeriesMenu.tsx': 'runtime',
  'react/TimeframeChips.tsx': 'runtime',
  'react/WorkspaceLegend.tsx': 'type',
  'react/surface/ChartSurface.tsx': 'runtime',
  'react/WorkspaceTabsBar.tsx': 'runtime',
  'react/chrome/ChromeContext.tsx': 'runtime',
  'react/chrome/FlyoutMenu.tsx': 'runtime',
  'react/chrome/IconButton.tsx': 'runtime',
  'react/chrome/Notice.tsx': 'runtime',
  'react/chrome/Pill.tsx': 'runtime',
  'react/chrome/Toggle.tsx': 'runtime',
  'react/chrome/Tooltip.tsx': 'runtime',
  'react/chrome/primitives.tsx': 'runtime',
  'react/chrome/slots.ts': 'type',
  'react/chrome/useFlyoutPosition.ts': 'runtime',
  'react/hoverIntent.ts': 'runtime',
  'react/useCandleLane.ts': 'runtime',
  'react/useOverlayFields.ts': 'runtime',
  // TYPE ONLY: the module declares the shape of the handles and the two view types, and the compiler
  // erases the whole file. A consumer that imports the surface pays not one byte for it.
  'react/surface/chartHandles.ts': 'type',
  'react/surface/useChartMount.ts': 'runtime',
  'react/surface/useChartTeardown.ts': 'runtime',
  'react/surface/SurfaceLegend.tsx': 'runtime',
  'react/surface/useDrawingSeam.ts': 'runtime',
  'react/surface/useLayoutApply.ts': 'runtime',
  'react/surface/usePriceAlertLayer.ts': 'runtime',
  'react/surface/useReferenceLines.ts': 'runtime',
  'react/surface/useSeriesData.ts': 'runtime',
  'react/surface/useSurfaceGeometry.ts': 'runtime',
  'react/workspace/CanvasRow.tsx': 'runtime',
  'react/workspace/CanvasSurface.tsx': 'runtime',
  'react/workspace/ChartWorkspace.tsx': 'runtime',
  'react/workspace/CompactGrid.tsx': 'runtime',
  'react/workspace/DrawingRail.tsx': 'runtime',
  // TYPE ONLY, and these ARE components: the JSX runtime import never appears in the file's text,
  // so a region that calls no hook of its own names nothing from `react` but the type it returns.
  'react/workspace/GridControls.tsx': 'runtime',
  'react/workspace/IntervalRegion.tsx': 'runtime',
  'react/workspace/OverlayTogglesSection.tsx': 'runtime',
  'react/workspace/PaneListSection.tsx': 'runtime',
  'react/workspace/PatternChipsSection.tsx': 'runtime',
  'react/workspace/PrimaryActions.tsx': 'runtime',
  'react/workspace/SeriesMenuRegion.tsx': 'runtime',
  'react/workspace/StatusFooter.tsx': 'runtime',
  'react/workspace/StylePickerRegion.tsx': 'runtime',
  'react/workspace/SymbolTrigger.tsx': 'runtime',
  'react/workspace/TabsRegion.tsx': 'runtime',
  'react/workspace/setupContext.tsx': 'runtime',
  'react/workspace/usePersistedTabs.ts': 'runtime',
  'react/workspace/usePriceAlerts.ts': 'runtime',
  'react/workspace/useResidualSurfaceHeight.ts': 'runtime',
};

/** The strongest kind a file actually uses on a non-relative specifier, or `undefined` if pure. */
function measuredImpurity(source: Source): ImportKind | undefined {
  const external = importsOf(source).filter((ref) => !ref.specifier.startsWith('.'));
  if (external.length === 0) return undefined;
  return external.some((ref) => ref.kind === 'runtime') ? 'runtime' : 'type';
}

/** A source built from text alone, so a control can go through the identical classifier. */
function synthetic(file: string, ...lines: string[]): Source {
  return { file, text: lines.join('\n') };
}

/**
 * WHAT EACH LAYER MAY IMPORT, DECLARED AS DATA.
 *
 * The clauses above ask where an import comes from for the package as a whole. This asks the
 * narrower question that a layer exists to answer: given where a file LIVES, which specifiers is it
 * allowed to name at all. Written as a table because the answer differs per layer and a chain of
 * `if (file.startsWith(...))` is a rule nobody can read as a whole — and because `exercise` forces
 * each row to carry one import it does allow, so a row that allows nothing cannot pass unnoticed.
 *
 * ── DISCRIMINATION PROOF, AGAINST THE REAL TREE (2026-08-13) ──
 *
 * The synthetic controls below judge invented text. These seven judged a real file inside `src/`,
 * one per new clause, and each was SEEN FAILING before being removed:
 *
 *   overlays/   `import { useMemo } from 'react'`
 *               -> FAIL overlays/__probe.ts :: import outside the layer rule -> react
 *   alerts/     `import type { WorkspaceTheme } from '../react/theme'`
 *               -> FAIL alerts/__probe.ts :: import outside the layer rule -> ../react/theme
 *   drawing/    `import { Tool } from 'lightweight-charts-drawing'`
 *               -> FAIL drawing/__probe.ts :: import outside the layer rule -> lightweight-charts-drawing
 *   tabs/       `localStorage.getItem('tabs')`
 *               -> FAIL tabs/__probe.ts :: platform API in the layer -> localStorage
 *   port/       `setTimeout(fn, 10)`
 *               -> FAIL port/__probe.ts :: platform API in the layer -> setTimeout
 *   layout/     `import { PaneStack } from '../render/paneStack'`
 *               -> FAIL layout/__probe.ts :: import outside the layer rule -> ../render/paneStack
 *   indicator/  the layer does not exist yet; a file created in it failed by the rule AND by the
 *               emptiness declaration, which is the proof that the row is armed before the layer.
 *
 * ── AND THREE MORE, FROM THE LAYER SWEEP (2026-08-13) ──
 *
 *   catalogue/  `import { DEFAULT_WORKSPACE_THEME } from '../react/theme'` in a real file
 *               -> FAIL catalogue/__probe.ts :: import outside the layer rule -> ../react/theme
 *               which is the cycle by which the lane palette ended up in the app, now refused.
 *   pane/       a file created in the pre-armed layer knocked down the emptiness declaration
 *               -> the equality of direction 2 flagged `pane/` as left over in EMPTY_FOR_NOW.
 *   semRegra/   a folder created in `src` with no rule and no declared absence
 *               -> the equality of direction 1 flagged `semRegra/` as an undeclared layer.
 */
interface LayerRule {
  readonly prefix: string;
  readonly allow: readonly RegExp[];
  /**
   * Globals a file in this layer may not NAME — a rule about the TEXT, not about an import, because
   * `localStorage` and `document` arrive without one. Absent means the layer carries no such rule.
   * Read after `stripComments`, for the same reason the business-name clause is: prose ABOUT the
   * rule must not violate it.
   */
  readonly forbidGlobals?: readonly RegExp[];
  /** A line the rule ADMITS. Without it a row that denies everything would look like a strict row. */
  readonly exercise: string;
  /** Lines the rule REFUSES — one per clause the row carries, so no clause ships unexercised. */
  readonly refuse: readonly string[];
}

const LAYER_RULES: readonly LayerRule[] = [
  {
    prefix: 'overlays/',
    allow: [/^\.\.\/domain\//, /^\.\.\/extension\//, /^\.\.\/port\/chartApi$/, /^\.\//],
    exercise: "import type { Overlay } from '../extension/plugins';",
    refuse: ["import { useMemo } from 'react';", "import type { X } from '../react/theme';"],
  },
  {
    prefix: 'alerts/',
    allow: [/^\.\.\/domain\//, /^\.\.\/extension\//, /^\.\.\/port\/chartApi$/, /^\.\//],
    exercise: "import type { SeriesHandle } from '../port/chartApi';",
    refuse: ["import { useMemo } from 'react';", "import type { X } from '../react/theme';"],
  },
  {
    prefix: 'drawing/',
    allow: [/^\.\.\/domain\//, /^\.\.\/extension\//, /^\.\.\/port\/chartApi$/, /^\.\//],
    exercise: "import type { WorkspaceChartHandle } from '../port/chartApi';",
    refuse: ["import { useMemo } from 'react';", "import type { X } from '../react/theme';"],
  },
  {
    // THE DISSOLVED DRAWER. `state/` gathered six subjects whose only common trait was "pure and not
    // geometry"; tabs is one of them and now has a layer. The two prohibitions are the ones review
    // used to decide in prose — "it uses localStorage, it does not go up" — and here they become a
    // predicate.
    //
    // The two extra rows are what a tab configuration CONTAINS: panes and the density tuning.
    // Neither of them is a whole layer — `../pane/` is the leaf that imports domain only, and from
    // `overlays/` one NAMED module enters, the one for the tuning bands, not the drawing. Neither
    // `pane/` nor `overlays/` imports `tabs/`, so the direction is one-way.
    prefix: 'tabs/',
    allow: [
      /^\.\.\/domain\//,
      /^\.\.\/extension\//,
      /^\.\.\/pane\//,
      /^\.\.\/overlays\/densityTuning$/,
      /^\.\//,
    ],
    forbidGlobals: [/\blocalStorage\b/, /\bsessionStorage\b/, /\bBlob\b/, /\bURL\.createObjectURL\b/, /\bFileReader\b/, /\bdocument\b/, /\bwindow\b/],
    exercise: "import type { PaneId } from '../domain/types';",
    refuse: [
      "import { useMemo } from 'react';",
      "import type { X } from '../react/theme';",
      // The named module enters; its layer does not. Without this line `../overlays/densityTuning`
      // would have become a licence to import the whole drawing from inside the tabs layer.
      "import { DensityFieldOverlay } from '../overlays/densityField';",
      "const raw = localStorage.getItem('tabs');",
      "const file = new Blob([payload]);",
    ],
  },
  {
    // THE GENERIC CATALOGUE, AND THE CYCLE IT CANNOT CLOSE.
    //
    // This layer was born AFTER the list of layers had been closed, and came to exist with no rule:
    // nothing here stopped an import of the chrome layer. That import is exactly the cycle by which
    // the lane palette ended up living in the app — the assembly needs colour, colour lives in the
    // theme, the theme belongs to `react/`, and the generic catalogue would become a consumer of the
    // layer that renders. The rule is what makes "colour belongs to the consumer" checkable instead
    // of agreed: `laneDraft` takes the palette as an argument because it has nowhere to import it
    // from.
    prefix: 'catalogue/',
    allow: [/^\.\.\/domain\//, /^\.\.\/extension\//, /^\.\//],
    forbidGlobals: [/\blocalStorage\b/, /\bsessionStorage\b/, /\bBlob\b/, /\bdocument\b/, /\bwindow\b/],
    exercise: "import type { SeriesSpec } from '../domain/types';",
    refuse: [
      "import { useMemo } from 'react';",
      "import { DEFAULT_WORKSPACE_THEME } from '../react/theme';",
      "const raw = localStorage.getItem('catalogue');",
    ],
  },
  {
    // ARMED BEFORE THE LAYER EXISTED, by the lesson the row above has just charged for. `pane/`
    // arrives with the repatriated height arithmetic [tasks.md T37, `Where`: `src/pane/budget.ts`],
    // and the absence of a real file is declared in `EMPTY_FOR_NOW`.
    prefix: 'pane/',
    allow: [/^\.\.\/domain\//, /^\.\//],
    forbidGlobals: [/\blocalStorage\b/, /\bsessionStorage\b/, /\bdocument\b/, /\bwindow\b/],
    exercise: "import type { PaneId } from '../domain/types';",
    refuse: [
      "import { useMemo } from 'react';",
      "import type { X } from '../react/theme';",
      "const raw = localStorage.getItem('panes');",
    ],
  },
  {
    // ARMED BEFORE THE LAYER EXISTED, and on purpose. `indicator/` arrives with the repatriation,
    // and the natural order — move first, write the rule afterwards — is the order in which the rule
    // never gets written. The row exists now, the synthetic controls exercise it now, and the first
    // file to land in `indicator/` is born measured. The absence of a real file is declared in
    // `EMPTY_FOR_NOW` below, so it is not mistaken for a sweep that failed. `../catalogue/` enters
    // because the two calibrated thresholds and the plottable-source contract live there, and the
    // alternative was a second copy of every number — which is how two callers start disagreeing
    // about what "over the price" means. `catalogue/` does not import `indicator/`, so the direction
    // is one-way.
    prefix: 'indicator/',
    allow: [
      /^\.\.\/domain\//,
      /^\.\.\/extension\//,
      /^\.\.\/catalogue\//,
      /^\.\.\/port\/frames$/,
      /^\.\//,
    ],
    forbidGlobals: [/\blocalStorage\b/, /\bsessionStorage\b/, /\bBlob\b/, /\bURL\.createObjectURL\b/, /\bFileReader\b/, /\bdocument\b/, /\bwindow\b/],
    exercise: "import type { SeriesId } from '../domain/types';",
    refuse: [
      "import { useMemo } from 'react';",
      "import type { X } from '../react/theme';",
      "const raw = localStorage.getItem('indicators');",
      "const reader = new FileReader();",
      // The named module enters; its layer does not. `port/frames` publishes the live envelope; the
      // chart port is another question, and a study has no business talking to it.
      "import type { WorkspaceChartHandle } from '../port/chartApi';",
    ],
  },
  {
    // THE PORT, AND THE DOM GLOBAL. `port/` describes the data boundary and now the chart one too;
    // neither of them has any right to a clock or to a document. `HTMLElement` is NOT on the list:
    // it is a type the port names in a signature, not a global it reaches for — banning the type
    // would make the chart port inexpressible.
    prefix: 'port/',
    allow: [/^\.\.\/domain\//, /^\.\//],
    forbidGlobals: [/\bwindow\b/, /\bdocument\b/, /\bsetTimeout\b/, /\bsetInterval\b/, /\brequestAnimationFrame\b/],
    exercise: "import type { Bar } from '../domain/types';",
    refuse: [
      "import { useMemo } from 'react';",
      "import type { PaneStack } from '../render/paneStack';",
      "const id = setTimeout(retry, 1000);",
      "const raf = requestAnimationFrame(draw);",
      "const height = document.body.clientHeight;",
    ],
  },
  {
    // The layer that produces the arithmetic does not talk to whoever consumes it: without this row,
    // `application.ts` could grow an import of `render/` and close the cycle the inversion just
    // opened.
    //
    // `../pane/` enters because the legibility floor is a PANE fact, and it had to sit adjacent to
    // the stored-height clamp — the two answers to "how low a pane may go" used to live in different
    // folders. The direction is one-way: `pane/` may not import `layout/`, so there is no cycle.
    prefix: 'layout/',
    allow: [/^\.\.\/domain\//, /^\.\.\/pane\//, /^\.\//],
    forbidGlobals: [/\bwindow\b/, /\bdocument\b/, /\brequestAnimationFrame\b/],
    exercise: "import type { PaneId } from '../domain/types';",
    refuse: [
      "import { useMemo } from 'react';",
      "import type { PaneChartHandle } from '../port/chartApi';",
      "import { PaneStack } from '../render/paneStack';",
      "const w = window.innerHeight;",
    ],
  },
];

/**
 * The rows whose layer has no file yet — declared, so "no violations" cannot mean "no files".
 *
 * Every other row is asserted to match at least one real source. Without that pair, a renamed
 * directory would turn a live rule into a rule over the empty set and the suite would stay green
 * while the layer it guards drifted.
 */
/**
 * Empty: NO layer. The two pre-armed rows — `pane/` and `indicator/` — received a real file in the
 * repatriation, and the "rule armed before the layer" pair did what it existed to do.
 */
const EMPTY_FOR_NOW: readonly string[] = [];

/**
 * THE LAYERS WITH NO IMPORT RULE, EACH WITH ITS REASON WRITTEN DOWN.
 *
 * The table above says what each layer may import; this one says why a layer has NO row there. The
 * two together are what lets the sweep compare the declaration against the tree by equality: without
 * this half, "layer with no rule" and "layer whose rule was forgotten" would be indistinguishable,
 * and the second is exactly how `catalogue/` spent a whole phase with no limit.
 *
 * No row here means "ungoverned". All five are governed by another clause of this file, and the
 * reason names which — which is also what stops this list from becoming an amnesty.
 */
const LAYER_RULE_ABSENCES: Readonly<Record<string, string>> = {
  conformance:
    'the executable suite mounts scenarios over the WHOLE surface of the package, so a layer rule here would be the list of everything — and a list of everything is not a limit. Governed by the package clauses (declared peers, business names, third-party catalogue).',
  domain:
    'the root of the graph: it imports nothing. The clause "an undeclared module imports NOTHING" already fails the first import that shows up here, and it fails naming the file.',
  extension:
    'plugin contract, with no import — same cover as the domain, by the same per-file clause.',
  react:
    'governed by DECLARED_IMPURITY, which is the STRONGER question for the one layer entitled to a peer: not only where the import comes from, but whether it survives the compiler, file by file and by equality in both directions.',
  render:
    'governed by the LMC-49 clause, which grants it the one right it has over the others — the base library type — and refuses the same import at runtime.',
};

/** The layer a file belongs to, or `null` for a file at the root of `src`. */
function layerOf(file: string): string | null {
  const at = file.indexOf('/');
  return at < 0 ? null : `${file.slice(0, at)}/`;
}

/** Layers present in the tree that neither declaration mentions. */
function undeclaredLayers(list: readonly Source[]): string[] {
  const declared = new Set([
    ...LAYER_RULES.map((rule) => rule.prefix),
    ...Object.keys(LAYER_RULE_ABSENCES).map((name) => `${name}/`),
  ]);
  const measured = new Set(
    list.map((source) => layerOf(source.file)).filter((layer): layer is string => layer !== null),
  );
  return Array.from(measured)
    .filter((layer) => !declared.has(layer))
    .sort();
}

function layerViolations(list: readonly Source[]): string[] {
  return list.flatMap((source) => {
    const rule = LAYER_RULES.find((candidate) => source.file.startsWith(candidate.prefix));
    if (rule === undefined) return [];
    const outsideAllow = importsOf(source)
      .filter((ref) => !rule.allow.some((pattern) => pattern.test(ref.specifier)))
      .map((ref) => `FAIL ${source.file} :: import outside the layer rule -> ${ref.specifier}`);
    const code = stripComments(source.text);
    const globals = (rule.forbidGlobals ?? [])
      .filter((pattern) => pattern.test(code))
      .map((pattern) => `FAIL ${source.file} :: platform API in the layer -> ${pattern.source}`);
    return [...outsideAllow, ...globals];
  });
}

describe('task 3.2 — boundary guard: the library cannot reach into the app', () => {
  it('reads a non-trivial source tree, so a passing guard is not a guard over nothing', () => {
    expect(sources.length).toBeGreaterThanOrEqual(6);
  });

  it('imports nothing from apps/, from the strategies library, or from any workspace package', () => {
    const violations: string[] = [];
    for (const source of sources) {
      for (const spec of importSpecifiers(source)) {
        if (/(^|\/)apps\//.test(spec) || spec.startsWith('@sftm/') || /libs\/strategies/.test(spec)) {
          violations.push(`${source.file} -> ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('imports no third-party indicator catalogue at module scope', () => {
    // The prototype used to import one and walk it at module-evaluation time, which retained the
    // whole catalogue whether or not a single indicator was drawn. It was replaced with
    // `SeriesProvider` instances injected by the app; the app-side half of this guard lives in
    // apps/web/src/config/__tests__/catalogBoundary.test.ts. This one keeps the library honest.
    const banned = [/lightweight-charts-indicators/, /lightweight-charts-drawing/, /oakscriptjs/];
    const hits = (list: readonly Source[]): string[] =>
      list.flatMap((source) =>
        importSpecifiers(source)
          .filter((spec) => banned.some((re) => re.test(spec)))
          .map((spec) => `${source.file} -> ${spec}`),
      );
    const violations = hits(sources);

    // POSITIVE CONTROL. The clause is an absence, and the drawing package has just changed layer —
    // if the sweep only covered `render/`, the ban would have left along with the file and nothing
    // would go red. The same predicate judges a synthetic import from the new layer.
    expect(hits([synthetic('drawing/x.ts', "import { Tool } from 'lightweight-charts-drawing';")])).toEqual(
      ["drawing/x.ts -> lightweight-charts-drawing"],
    );
    expect(hits([synthetic('drawing/x.ts', "import type { Tool } from './neighbour';")])).toEqual([]);

    // AND THE DYNAMIC FORM, WHICH THE GUARD USED TO WALK STRAIGHT PAST. `await import('…')` is a
    // `CallExpression` whose callee is an `ImportKeyword`, not an identifier, so the sweep that
    // catches `require` returned nothing for it — and deferring the megabyte off the boot path is
    // exactly the shape a host reaches for. Both directions, judged by the predicate above.
    expect(
      hits([synthetic('drawing/x.ts', "const m = await import('lightweight-charts-indicators');")]),
    ).toEqual(['drawing/x.ts -> lightweight-charts-indicators']);
    expect(hits([synthetic('drawing/x.ts', "const m = await import('./neighbour');")])).toEqual([]);
    expect(violations).toEqual([]);
  });

  it('imports nothing outside the DECLARED PEERS — an explicit allowlist, not a free pass', () => {
    // THE ONE CLAUSE THIS PHASE CHANGED, AND EXACTLY HOW MUCH.
    //
    // Until the composed interface moved in here, this package imported nothing at all and the
    // assertion was over the empty set. Components cannot honour that — a React component imports
    // React — so the clause becomes an allowlist. What it is NOT is a relaxation: the allowlist is
    // `Object.keys(peerDependencies)`, so the set of admissible imports is exactly the set of
    // dependencies the package already declares to its consumers, and anything else still fails.
    //
    // The pressure this resists is the interesting part. `lightweight-charts` is IN the allowlist —
    // it is a declared peer — and `src/` still does not import it, because it cannot: the package is
    // `"type": "module"` with an `exports` map offering only the `import` condition, and this
    // package emits CommonJS. The structural ports in `src/port/chartApi.ts` stay, and their cost
    // is still paid in `test/renderBoundary.spec.ts`, where every port is pinned against the real
    // declarations. An allowlist that admits an import nobody makes is the honest shape of the rule.
    const violations: string[] = [];
    for (const source of sources) {
      for (const spec of importSpecifiers(source)) {
        if (spec.startsWith('.')) continue;
        if (!ALLOWED_PEERS.has(packageOf(spec))) violations.push(`${source.file} -> ${spec}`);
      }
    }
    expect(violations).toEqual([]);

    // CONTROL POSITIVE, in both directions. The clause is an absence, and an absence over a set that
    // silently became "everything" would still pass the assertion above. So: the allowlist is
    // non-empty and is really the declared peers, a peer subpath resolves to its peer, and a package
    // that is NOT a peer is rejected by the same predicate that just accepted one.
    expect(ALLOWED_PEERS.size).toBeGreaterThan(0);
    expect(Array.from(ALLOWED_PEERS).sort()).toEqual(
      Object.keys(PACKAGE.peerDependencies ?? {}).sort(),
    );
    expect(ALLOWED_PEERS.has(packageOf('react/jsx-runtime'))).toBe(true);
    expect(ALLOWED_PEERS.has(packageOf('@mui/material'))).toBe(false);
    expect(ALLOWED_PEERS.has(packageOf('lodash/merge'))).toBe(false);
  });

  it('keeps the ORIGINAL claim, now per file: an undeclared module imports NOTHING', () => {
    // The allowlist above is scoped by what actually needs it. Every module that is not declared
    // impure — the domain types, the scope machine, the layout arithmetic, the render primitives,
    // the conformance suite, and now `react/theme.ts` and the pure modules of `react/chrome/` —
    // imports NOTHING, so a consumer that imports `computeLayout` and never renders a component
    // pulls no React into its bundle.
    const violations = sources
      .filter((source) => !(source.file in DECLARED_IMPURITY))
      .flatMap((source) =>
        importsOf(source)
          .filter((ref) => !ref.specifier.startsWith('.'))
          .map((ref) => `FAIL ${source.file} :: undeclared ${ref.kind} import -> ${ref.specifier}`),
      );
    expect(violations).toEqual([]);

    // The files the OLD prefix rule exempted for free, and this one verifies. If any of them ever
    // grows an import, the assertion above turns red instead of shrugging.
    for (const pure of ['react/theme.ts', 'react/chrome/rovingFocus.ts', 'react/drawingToolBuckets.ts']) {
      const source = sources.find((s) => s.file === pure);
      expect(source).toBeDefined();
      expect(measuredImpurity(source as Source)).toBeUndefined();
    }
  });

  it('the declaration is exact in both directions: nothing extra, nothing stronger', () => {
    // A ratchet, like every other ledger in this suite. A file that stops importing must leave the
    // list, and a file declared `type` that starts importing at runtime fails until the word
    // changes. Without the equality half, the list would silently become an amnesty.
    const measured = Object.fromEntries(
      sources
        .map((source) => [source.file, measuredImpurity(source)] as const)
        .filter(([, kind]) => kind !== undefined),
    );
    expect(measured).toEqual(DECLARED_IMPURITY);

    // CONTROL POSITIVE: the scan is not vacuous — there ARE files importing a peer at runtime.
    expect(Object.values(measured).filter((kind) => kind === 'runtime').length).toBeGreaterThan(0);
    expect(Object.values(measured).filter((kind) => kind === 'type').length).toBeGreaterThan(0);
  });

  it('classifies by the compiler: bare import and mixed list are runtime, type-only is type', () => {
    // POSITIVE CONTROLS of the classification (LMC-50). These three forms are exactly the ones the
    // regular-expression sweep got wrong, and none of them exists in the tree today — without a
    // synthetic control the rule would stay written and never exercised.
    expect(measuredImpurity(synthetic('synthetic/bare.ts', "import 'react';"))).toBe('runtime');
    expect(
      measuredImpurity(synthetic('synthetic/mixed.ts', "import { type ReactNode, useMemo } from 'react';")),
    ).toBe('runtime');
    expect(
      measuredImpurity(synthetic('synthetic/typeOnly.ts', "import type { ReactNode } from 'react';")),
    ).toBe('type');
    // A list marked entirely as type is erased by the compiler, and counts as type.
    expect(
      measuredImpurity(synthetic('synthetic/allType.ts', "import { type ReactNode, type FC } from 'react';")),
    ).toBe('type');
    // A relative import is not impurity, whatever form it takes.
    expect(measuredImpurity(synthetic('synthetic/relative.ts', "import './neighbour';"))).toBeUndefined();
    // `require` is still runtime — the clause was not lost in the change of mechanism.
    expect(measuredImpurity(synthetic('synthetic/required.ts', "const r = require('react');"))).toBe(
      'runtime',
    );
  });

  it('judges a dynamic import by the same allow-lists, and fails CLOSED on one it cannot read', () => {
    // THE HOLE, AND WHY IT MATTERS NOW. `importsOf` read a static import, a re-export and a
    // `require`, and returned NOTHING for `await import('…')` — the `CallExpression` branch demanded
    // `ts.isIdentifier(node.expression)` and the callee of a dynamic import is an `ImportKeyword`.
    // With a third-party catalogue entering the host, this predicate is the only thing standing
    // between a megabyte and `src/`, and deferring that megabyte is precisely what `import()` is for.
    //
    // `grep -rn "import(" src/` returns nothing today, so widening the reader changes the meaning of
    // no existing source: every assertion below is synthetic on purpose.

    // DIRECTION 1 — a dynamic bare specifier is a runtime import, and is judged by the very
    // allow-lists that judge a static one: the per-file purity declaration and the layer rule.
    expect(measuredImpurity(synthetic('synthetic/dynamic.ts', "const m = await import('react');"))).toBe(
      'runtime',
    );
    expect(layerViolations([synthetic('tabs/x.ts', "const m = await import('react');")])).toEqual([
      'FAIL tabs/x.ts :: import outside the layer rule -> react',
    ]);

    // DIRECTION 2 — the relative dynamic import next door is NOT a violation. Without this half the
    // clause above would be satisfied by a predicate that reports everything.
    expect(
      measuredImpurity(synthetic('synthetic/dynamicRelative.ts', "const m = await import('./neighbour');")),
    ).toBeUndefined();
    expect(
      layerViolations([synthetic('tabs/x.ts', "const m = await import('../domain/types');")]),
    ).toEqual([]);

    // FAILING CLOSED. A specifier the guard cannot read as a plain string literal is a specifier the
    // guard cannot CLEAR, so it is reported in its own right rather than skipped — which is what the
    // old `require` branch did with `require(name)`, a hole that predates the dynamic form. The
    // three evasions are the three the ban would otherwise be one keystroke away from.
    for (const evasion of [
      'const m = await import(name);',
      'const m = await import(`${base}/indicators`);',
      "const m = await import('lightweight-charts' + '-indicators');",
      'const m = require(name);',
      'const m = require(`${base}/indicators`);',
      "const m = require('lightweight-charts' + '-indicators');",
    ]) {
      expect(importSpecifiers(synthetic('tabs/x.ts', evasion))).toEqual([UNREADABLE_SPECIFIER]);
      expect(measuredImpurity(synthetic('synthetic/evasion.ts', evasion))).toBe('runtime');
      expect(layerViolations([synthetic('tabs/x.ts', evasion)])).toEqual([
        `FAIL tabs/x.ts :: import outside the layer rule -> ${UNREADABLE_SPECIFIER}`,
      ]);
    }

    // AND THE OTHER DIRECTION AGAIN: a reference written as a plain literal still reads as itself,
    // for both forms. A predicate that answered "unreadable" to everything would pass the loop above
    // and measure nothing.
    expect(importSpecifiers(synthetic('tabs/x.ts', "const m = await import('./neighbour');"))).toEqual([
      './neighbour',
    ]);
    expect(importSpecifiers(synthetic('tabs/x.ts', "const m = require('./neighbour');"))).toEqual([
      './neighbour',
    ]);
  });

  it('no runtime import of the base library, and the type one only in the render layer (LMC-49)', () => {
    const violations = sources.flatMap((source) =>
      importsOf(source)
        .filter((ref) => packageOf(ref.specifier) === 'lightweight-charts')
        .filter((ref) => ref.kind === 'runtime' || !source.file.startsWith('render/'))
        .map((ref) => `FAIL ${source.file} :: ${ref.kind} import of ${ref.specifier}`),
    );
    expect(violations).toEqual([]);

    // POSITIVE CONTROL: the clause has no live case today — `src/` does not import the base library
    // at all — so the predicate is exercised against synthetic sources, one per side of the rule.
    const classify = (source: Source): string[] =>
      importsOf(source)
        .filter((ref) => packageOf(ref.specifier) === 'lightweight-charts')
        .filter((ref) => ref.kind === 'runtime' || !source.file.startsWith('render/'))
        .map((ref) => `${source.file}:${ref.kind}`);
    expect(classify(synthetic('render/x.ts', "import { createChart } from 'lightweight-charts';"))).toEqual(
      ['render/x.ts:runtime'],
    );
    expect(classify(synthetic('render/x.ts', "import type { IChartApi } from 'lightweight-charts';"))).toEqual(
      [],
    );
    expect(
      classify(synthetic('domain/x.ts', "import type { IChartApi } from 'lightweight-charts';")),
    ).toEqual(['domain/x.ts:type']);
  });

  it('the chart port declares NOT ONE runtime import — the clause of the new layer', () => {
    // THE PORT CHANGED LAYER, AND ITS RULE COMES INTO EXISTENCE. While the file lived in `render/`
    // it was covered only by the general clauses above, which ask WHERE an import comes from. The
    // question this layer asks is a different and stronger one: a structural port imports NOTHING at
    // runtime, not even from inside the package itself — a single runtime import here becomes a
    // dependency of every consumer that only wanted the types.
    const port = sources.find((source) => source.file === 'port/chartApi.ts');
    expect(port).toBeDefined();
    expect(importsOf(port as Source).filter((ref) => ref.kind === 'runtime')).toEqual([]);

    // POSITIVE CONTROL: the predicate sees a runtime import when there is one, and does not confuse
    // the type import — which the compiler erases — with it. Without this pair the clause would pass
    // over a broken classifier too.
    const runtimeOf = (source: Source): string[] =>
      importsOf(source)
        .filter((ref) => ref.kind === 'runtime')
        .map((ref) => ref.specifier);
    expect(runtimeOf(synthetic('port/x.ts', "import { paneId } from '../domain/types';"))).toEqual([
      '../domain/types',
    ]);
    expect(
      runtimeOf(synthetic('port/x.ts', "import type { PaneId } from '../domain/types';")),
    ).toEqual([]);
  });

  it('every new layer imports only what its own rule allows', () => {
    // A LAYER IMPORT RULE, AS DATA. A new layer with no rule is a folder: the name suggests a limit
    // and nothing checks it. The table below is the only declaration of that limit, and the
    // predicate that judges `src/` is the same one that judges the synthetic controls right after.
    expect(layerViolations(sources)).toEqual([]);

    // POSITIVE CONTROL PER CLAUSE. Every line a rule REFUSES is seen refusing, and the line it
    // admits is seen passing — by the same predicate that just judged `src/`. A rule whose `refuse`
    // were empty would pass here without ever having been exercised, so the list is also checked by
    // size.
    for (const rule of LAYER_RULES) {
      expect(rule.refuse.length).toBeGreaterThan(0);
      for (const line of rule.refuse) {
        expect(layerViolations([synthetic(`${rule.prefix}x.ts`, line)])).toHaveLength(1);
      }
      expect(layerViolations([synthetic(`${rule.prefix}x.ts`, rule.exercise)])).toEqual([]);
    }
    // Prose ABOUT the rule is not a violation of it — same reason as the business-name clause.
    expect(
      layerViolations([synthetic('tabs/x.ts', '// the localStorage adapter stays in the host')]),
    ).toEqual([]);

    // THE CLASSIFICATION STILL COMES FROM THE COMPILER, and the layer rule inherits that instead of
    // reimplementing it. The two forms a regular-expression sweep misses — the bare import, which
    // has no `from`, and the mixed list, which is runtime dressed as type — fail here.
    expect(layerViolations([synthetic('tabs/x.ts', "import 'react';")])).toHaveLength(1);
    expect(
      layerViolations([synthetic('tabs/x.ts', "import { type ReactNode, useMemo } from 'react';")]),
    ).toHaveLength(1);

    // AND EVERY RULE GOVERNS A REAL FILE, except the ones declared still empty. A row whose folder
    // vanished becomes a rule over the empty set, and the gate stays green measuring nothing.
    for (const rule of LAYER_RULES) {
      const governed = sources.filter((source) => source.file.startsWith(rule.prefix));
      if (EMPTY_FOR_NOW.includes(rule.prefix)) {
        expect(governed).toEqual([]);
        continue;
      }
      expect(governed.length).toBeGreaterThan(0);
    }
    expect(LAYER_RULES.map((rule) => rule.prefix)).toEqual([
      'overlays/',
      'alerts/',
      'drawing/',
      'tabs/',
      'catalogue/',
      'pane/',
      'indicator/',
      'port/',
      'layout/',
    ]);
  });

  it('every layer of src has a rule, or a declared absence with a reason — checked against the TREE', () => {
    // THE HOLE THIS CLAUSE CLOSES. The list of layers was written by hand, and a folder created after
    // it simply did not appear: `catalogue/` was born in one phase and spent the whole next one with
    // no import rule, free to close the cycle with the chrome layer. Writing one more row into the
    // list does not fix that — the next list ages too. What fixes it is comparing the declaration
    // against what exists in `src`, by equality, in both directions.

    // DIRECTION 1: nothing in the tree is left without a declaration.
    expect(undeclaredLayers(sources)).toEqual([]);

    // POSITIVE CONTROL: the same predicate sees a new layer, which is the case this clause exists to
    // catch. Without it, the assertion above would pass over a broken sweep too.
    expect(undeclaredLayers([synthetic('newLayer/x.ts', '')])).toEqual(['newLayer/']);
    expect(undeclaredLayers([synthetic('index.ts', '')])).toEqual([]);

    // DIRECTION 2: nothing declared governs the empty set, except what declares itself pre-armed. A
    // rule over a folder that vanished stays green measuring nothing, and that is how a gate dies in
    // silence.
    const present = new Set(
      sources.map((source) => layerOf(source.file)).filter((layer): layer is string => layer !== null),
    );
    const declared = [
      ...LAYER_RULES.map((rule) => rule.prefix),
      ...Object.keys(LAYER_RULE_ABSENCES).map((name) => `${name}/`),
    ];
    expect(declared.filter((layer) => !present.has(layer)).sort()).toEqual([...EMPTY_FOR_NOW].sort());

    // The two declarations are DISJOINT: a layer with a rule and an absence at the same time would
    // leave the question "is this layer governed?" with two answers.
    const withRule = new Set(LAYER_RULES.map((rule) => rule.prefix));
    expect(Object.keys(LAYER_RULE_ABSENCES).filter((name) => withRule.has(`${name}/`))).toEqual([]);

    // And the absence CARRIES a reason. A key with an empty string would be the amnesty list this
    // table exists not to be.
    for (const [layer, reason] of Object.entries(LAYER_RULE_ABSENCES)) {
      expect(`${layer}: ${reason}`.length).toBeGreaterThan(60);
    }

    // A file at the root of `src` is not a layer, and what exists there is declared — otherwise a
    // second entry point would show up with nobody asking where it imports from.
    expect(sources.filter((source) => layerOf(source.file) === null).map((source) => source.file)).toEqual([
      'index.ts',
    ]);
  });

  it('names no business concept — an indicator, a modality or one of our field names', () => {
    // The real test of the ownership boundary. If a business name appears here, the promise that the
    // proprietary indicators live outside this package has already been broken.
    const banned = [
      'wavetrend',
      'moneyflow',
      'money flow',
      'aggressionratio',
      'schaff',
      'stochk',
      'stochrsi',
      'binance',
      'questdb',
      'screener',
      'scalp',
      'swing',
      'slowswing',
      'modality',
    ];
    const violations: string[] = [];
    for (const source of sources) {
      const lower = stripComments(source.text).toLowerCase();
      for (const word of banned) {
        if (lower.includes(word)) violations.push(`${source.file}: "${word}"`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('names no platform STORAGE anywhere in src — a saved layout arrives through an injected port', () => {
    // WHY THIS ONE IS WHOLE-TREE AND `window` IS NOT. The layer rules already ban `window` where it
    // has no business — `domain/`, `tabs/`, `port/`, `layout/` — while `react/` legitimately reaches
    // for requestAnimationFrame and for mouse listeners, so a whole-tree ban on it would be false.
    // Storage has no such exception: a package that decides WHERE a user's layout lives has taken a
    // decision belonging to the host, and `WorkspaceStore` exists so it never has to.
    const banned = [/\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/, /\bdocument\.cookie\b/];
    const named = (list: readonly Source[]): string[] =>
      list.flatMap((source) =>
        banned
          .filter((pattern) => pattern.test(stripComments(source.text)))
          .map((pattern) => `FAIL ${source.file} :: platform storage named -> ${pattern.source}`),
      );

    expect(named(sources)).toEqual([]);

    // CONTROL POSITIVE, judged by the very predicate that just judged `src`: a scan that matched
    // nothing would pass over an empty set exactly as it passes over a clean one.
    expect(named([{ file: 'tabs/__probe.ts', text: "const raw = localStorage.getItem('tabs');" }])).toEqual([
      'FAIL tabs/__probe.ts :: platform storage named -> \\blocalStorage\\b',
    ]);
  });
});

describe('task 3.3 — packaging is publication-ready from day one', () => {
  const pkg = PACKAGE;

  it('declares sideEffects: false, which is what instance injection buys', () => {
    expect(pkg.sideEffects).toBe(false);
  });

  it('has NO runtime dependencies — anything on the public signature is a peer', () => {
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.peerDependencies).toHaveProperty('lightweight-charts');
    // React is a PEER, never a dependency. A bundled copy would be a second React in the consumer's
    // graph, which is not a duplicate module so much as a second set of hooks: the components would
    // render against a dispatcher the host never installed and fail at the first `useState`.
    expect(pkg.peerDependencies).toHaveProperty('react');
  });

  it('ships generated types and states its licence', () => {
    expect(pkg.types).toMatch(/\.d\.ts$/);
    expect(pkg.license).toBe('Apache-2.0');
  });

  it('exposes no registry-by-name on the public surface (D1)', () => {
    const index = stripComments(readFileSync(join(SRC, 'index.ts'), 'utf8'));
    expect(index).not.toMatch(/\bregister\s*[(<]/);
    expect(index).not.toMatch(/registerIndicator|registerOverlay|registerSeries/);
    // And nowhere else in the package either — a registry hidden one module deep is still a
    // registry, and still needs an import for its side effect to be populated.
    const registries = sources.filter((s) => /\bregister\s*[(<]/.test(stripComments(s.text)));
    expect(registries.map((s) => s.file)).toEqual([]);
  });
});

describe('task 3.4 — a single copy of the canvas layer', () => {
  // lightweight-charts pins fancy-canvas exactly; the drawing package depends on a RANGE. Two
  // resolved copies means two module identities, so `instanceof` checks and structural type guards
  // silently disagree across the boundary — the failure looks like a rendering bug, never like a
  // dependency bug.
  function findCopies(dir: string, depth = 0): string[] {
    if (depth > 6) return [];
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const found: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'fancy-canvas') {
        found.push(join(dir, entry.name));
        continue;
      }
      if (entry.name === 'node_modules' || !entry.name.startsWith('.')) {
        found.push(...findCopies(join(dir, entry.name), depth + 1));
      }
    }
    return found;
  }

  it('resolves exactly one copy of fancy-canvas across the whole workspace', () => {
    const copies = findCopies(join(REPO_ROOT, 'node_modules'));
    expect(copies.length).toBeLessThanOrEqual(1);
  });
});

describe('task 3.5 — the licence attribution the base library requires', () => {
  // lightweight-charts is Apache-2.0 and its licence requires the attribution mark to stay on
  // screen. Two source sites used to disable it, and because one of them is a shared options object
  // spread into every sub-chart, those two sites suppressed it on TEN runtime instances.
  //
  // THE LEDGER IS EMPTY, and it was emptied by task 4b.4 removing the defect, not by editing this
  // list to fit. It stays here as the ratchet it always was: a new `attributionLogo: false` fails
  // immediately, and re-recording one takes a deliberate edit that names the file.
  const KNOWN_VIOLATIONS: string[] = [];

  function scanForDisabledAttribution(dir: string, prefix = ''): string[] {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    return entries.flatMap((entry): string[] => {
      const rel = `${prefix}${entry.name}`;
      if (entry.name === 'node_modules' || entry.name === 'build' || entry.name === 'dist') return [];
      if (entry.isDirectory()) return scanForDisabledAttribution(join(dir, entry.name), `${rel}/`);
      if (!/\.tsx?$/.test(entry.name)) return [];
      const text = readFileSync(join(dir, entry.name), 'utf8');
      return /attributionLogo\s*:\s*false/.test(text) ? [rel] : [];
    });
  }

  const offenders = scanForDisabledAttribution(join(REPO_ROOT, 'apps', 'web', 'src'), 'apps/web/src/');

  it('finds no attribution disabled ANYWHERE except what the ledger records', () => {
    // A ratchet: a new violation fails immediately, and clearing one is free. The ledger is empty.
    const unrecorded = offenders.filter((f) => !KNOWN_VIOLATIONS.includes(f));
    expect(unrecorded).toEqual([]);
  });

  it('finds exactly what the ledger records — a recorded violation cannot vanish unnoticed', () => {
    expect(offenders.sort()).toEqual([...KNOWN_VIOLATIONS].sort());
  });

  it('the library itself never disables attribution', () => {
    const violations = sources.filter((s) => /attributionLogo\s*:\s*false/.test(s.text));
    expect(violations.map((s) => s.file)).toEqual([]);
  });
});
