import { join } from 'path';
import * as ts from 'typescript';
import { collectSources, type Source } from './sourceScan';

/**
 * No file reads more than 4 distinct setup fields, and no selector asks for the whole value.
 *
 * INVARIANT: a child reading context declares zero props, so the prop ceiling measures zero on a
 * maximally coupled component. This is the number that stays measurable once the tree grows a
 * provider — without it, moving a prop into context is how the prop gate is defeated.
 */

const SRC = join(__dirname, '..', '..', 'src');

const LIMIT = 4;

const HOOK = 'useWorkspaceSetup';

interface Reading {
  readonly file: string;
  readonly fields: readonly string[];
  /** A selector the counter cannot reduce to named fields: identity, rest, or a bare reference. */
  readonly whole: boolean;
}

/** Local names bound to the hook, so an aliased import cannot walk past the counter. */
function boundNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>([HOOK]);
  sourceFile.forEachChild((node) => {
    if (!ts.isImportDeclaration(node)) return;
    const bindings = node.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) return;
    for (const element of bindings.elements) {
      if ((element.propertyName ?? element.name).text === HOOK) names.add(element.name.text);
    }
  });
  return names;
}

function namesOfBinding(pattern: ts.ObjectBindingPattern): { fields: string[]; whole: boolean } {
  const fields: string[] = [];
  let whole = false;
  for (const element of pattern.elements) {
    if (element.dotDotDotToken !== undefined) {
      whole = true;
      continue;
    }
    const key = element.propertyName ?? element.name;
    if (ts.isIdentifier(key) || ts.isStringLiteral(key)) fields.push(key.text);
    else whole = true;
  }
  return { fields, whole };
}

function namesOfParameter(parameter: ts.Identifier, body: ts.Node): { fields: string[]; whole: boolean } {
  const fields: string[] = [];
  let whole = false;
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node) && node.text === parameter.text) {
      const parent = node.parent;
      const named =
        (ts.isPropertyAccessExpression(parent) && parent.expression === node) ||
        (ts.isElementAccessExpression(parent) &&
          parent.expression === node &&
          ts.isStringLiteral(parent.argumentExpression));
      if (!named) whole = true;
      return;
    }
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      if (node.expression.text === parameter.text) {
        fields.push(node.name.text);
        return;
      }
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === parameter.text &&
      ts.isStringLiteral(node.argumentExpression)
    ) {
      fields.push(node.argumentExpression.text);
      return;
    }
    node.forEachChild(visit);
  };
  visit(body);
  return { fields, whole };
}

function analyseSelector(argument: ts.Expression | undefined): { fields: string[]; whole: boolean } {
  if (argument === undefined) return { fields: [], whole: true };
  if (!ts.isArrowFunction(argument) && !ts.isFunctionExpression(argument)) {
    return { fields: [], whole: true };
  }
  const parameter = argument.parameters[0];
  if (parameter === undefined) return { fields: [], whole: false };
  if (ts.isObjectBindingPattern(parameter.name)) return namesOfBinding(parameter.name);
  if (!ts.isIdentifier(parameter.name)) return { fields: [], whole: true };
  return namesOfParameter(parameter.name, argument.body);
}

function readingOf(source: Source): Reading {
  const sourceFile = ts.createSourceFile(
    source.file,
    source.text,
    ts.ScriptTarget.ES2021,
    true,
    /\.tsx$/.test(source.file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const names = boundNames(sourceFile);
  const fields = new Set<string>();
  let whole = false;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.has(node.expression.text)) {
      const measured = analyseSelector(node.arguments[0]);
      for (const field of measured.fields) fields.add(field);
      whole = whole || measured.whole;
    }
    node.forEachChild(visit);
  };
  sourceFile.forEachChild(visit);
  return { file: source.file, fields: Array.from(fields).sort(), whole };
}

/** Path, measured metric, violated limit — every failing gate prints all three. */
function report(reading: Reading): string[] {
  const lines: string[] = [];
  if (reading.whole) {
    lines.push(
      `FAIL ${reading.file} :: whole-value selector — setup is readable only by naming fields`,
    );
  }
  if (reading.fields.length > LIMIT) {
    lines.push(
      `FAIL ${reading.file} :: distinct setup fields measured=${reading.fields.length} ` +
        `(${reading.fields.join(', ')}) limit=${LIMIT}`,
    );
  }
  return lines;
}

function violations(list: readonly Source[]): string[] {
  return list.flatMap((source) => report(readingOf(source)));
}

/** Built from text alone, so a control goes through the identical counter. */
function synthetic(file: string, ...lines: string[]): Source {
  return { file, text: lines.join('\n') };
}

const FIVE_FIELDS = synthetic(
  'synthetic/FiveFields.tsx',
  "import { useWorkspaceSetup } from '../src/react/workspace/setupContext';",
  'export function Planted(): string {',
  '  const timeframe = useWorkspaceSetup((s) => s.timeframe);',
  '  const mode = useWorkspaceSetup((s) => s.layoutMode);',
  '  const panes = useWorkspaceSetup((s) => s.panes.length);',
  '  const studies = useWorkspaceSetup((s) => s.indicators.length);',
  '  const fit = useWorkspaceSetup((s) => s.autoFit);',
  '  return `${timeframe}${mode}${panes}${studies}${fit}`;',
  '}',
);

const FOUR_FIELDS = synthetic(
  'synthetic/FourFields.tsx',
  "import { useWorkspaceSetup } from '../src/react/workspace/setupContext';",
  'export function Planted(): string {',
  '  const timeframe = useWorkspaceSetup((s) => s.timeframe);',
  '  const mode = useWorkspaceSetup((s) => s.layoutMode);',
  '  const panes = useWorkspaceSetup((s) => s.panes.length);',
  '  const studies = useWorkspaceSetup((s) => s.indicators.length);',
  '  return `${timeframe}${mode}${panes}${studies}`;',
  '}',
);

const sources = collectSources(SRC);

describe('the setup context has a fan-out ceiling of 4 distinct fields per file', () => {
  it('reads a non-trivial tree, so a green gate is not a gate over nothing', () => {
    expect(sources.length).toBeGreaterThanOrEqual(30);
    const declaring = sources.filter((source) =>
      new RegExp(`export function ${HOOK}\\b`).test(source.text),
    );
    expect(declaring.map((source) => source.file)).toEqual(['react/workspace/setupContext.tsx']);
  });

  it('fails a planted component reading 5 fields, naming the 5, and passes when the fifth goes', () => {
    // DISCRIMINATION. The clause is an absence, and an absence measured by a broken scan passes in
    // silence. The same counter that just judged `src/` judges two planted components.
    expect(violations([FIVE_FIELDS])).toEqual([
      'FAIL synthetic/FiveFields.tsx :: distinct setup fields measured=5 ' +
        '(autoFit, indicators, layoutMode, panes, timeframe) limit=4',
    ]);
    expect(violations([FOUR_FIELDS])).toEqual([]);
  });

  it('counts distinct fields, never calls: six calls naming three fields pass', () => {
    const repeated = synthetic(
      'synthetic/Repeated.tsx',
      'export function Planted(): string {',
      '  const a = useWorkspaceSetup((s) => s.timeframe);',
      '  const b = useWorkspaceSetup((s) => s.timeframe);',
      '  const c = useWorkspaceSetup((s) => s.layoutMode);',
      '  const d = useWorkspaceSetup((s) => s.layoutMode);',
      '  const e = useWorkspaceSetup((s) => s.autoFit);',
      '  const f = useWorkspaceSetup((s) => s.autoFit);',
      '  return `${a}${b}${c}${d}${e}${f}`;',
      '}',
    );
    expect(readingOf(repeated).fields).toEqual(['autoFit', 'layoutMode', 'timeframe']);
    expect(violations([repeated])).toEqual([]);
  });

  it('refuses the identity selector, the rest element and the bare reference alike', () => {
    // The three ways a consumer takes the whole object while naming few fields or none.
    expect(violations([synthetic('synthetic/Identity.tsx', 'const all = useWorkspaceSetup((s) => s);')])).toEqual([
      'FAIL synthetic/Identity.tsx :: whole-value selector — setup is readable only by naming fields',
    ]);
    expect(
      violations([
        synthetic('synthetic/Rest.tsx', 'const x = useWorkspaceSetup(({ timeframe, ...rest }) => rest);'),
      ]),
    ).toEqual([
      'FAIL synthetic/Rest.tsx :: whole-value selector — setup is readable only by naming fields',
    ]);
    expect(
      violations([synthetic('synthetic/Named.tsx', 'const x = useWorkspaceSetup(takeEverything);')]),
    ).toEqual([
      'FAIL synthetic/Named.tsx :: whole-value selector — setup is readable only by naming fields',
    ]);
    expect(
      violations([synthetic('synthetic/Spread.tsx', 'const x = useWorkspaceSetup((s) => ({ ...s }));')]),
    ).toEqual([
      'FAIL synthetic/Spread.tsx :: whole-value selector — setup is readable only by naming fields',
    ]);
  });

  it('counts a destructured selector and an aliased import by the same predicate', () => {
    const destructured = synthetic(
      'synthetic/Destructured.tsx',
      "import { useWorkspaceSetup as useSetup } from '../src/react/workspace/setupContext';",
      'const a = useSetup(({ timeframe, layoutMode }) => `${timeframe}${layoutMode}`);',
      'const b = useSetup(({ panes: p, indicators: i, autoFit, showDensity }) => [p, i, autoFit, showDensity]);',
    );
    expect(readingOf(destructured).fields).toEqual([
      'autoFit',
      'indicators',
      'layoutMode',
      'panes',
      'showDensity',
      'timeframe',
    ]);
    expect(violations([destructured])).toEqual([
      'FAIL synthetic/Destructured.tsx :: distinct setup fields measured=6 ' +
        '(autoFit, indicators, layoutMode, panes, showDensity, timeframe) limit=4',
    ]);
  });

  it('fails no file in the real tree', () => {
    expect(violations(sources)).toEqual([]);
  });
});
