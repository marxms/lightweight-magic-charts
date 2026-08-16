import { readdirSync } from 'fs';
import { join, resolve } from 'path';
import * as ts from 'typescript';

/**
 * LMC-24 — no component under `src/react` declares more than 12 TOP-LEVEL props.
 *
 * WHY THE COMPILER AND NOT A REGEX. A props interface is not a list of lines: it extends other
 * interfaces, it nests object literals, it hides members behind optionality and aliases. Revision 1
 * of the spec counted `SeriesMenu` at 15 by walking the text and adding the fields of the inline
 * object inside `sections` — a number that describes nothing anybody passes at a call site. The
 * checker answers the question actually being asked: how many names may appear directly in the JSX
 * attribute list. That is the number a caller pays for.
 *
 * The baseline is the same ratchet the file-size gate uses, for the same reason: a gate that could
 * not be green until the last known violator fell would be switched off long before it.
 */

const REACT_DIR = resolve(join(__dirname, '..', '..', 'src', 'react'));

const LIMIT = 12;

/**
 * EMPTY, and that is the ratchet reaching its target rather than the ledger being switched off.
 *
 * REMEASURED on 2026-08-14, on the tree where the host's own workspace composition was dissolved:
 * still empty, and the composed root the app now mounts declares ten top-level props against the
 * ceiling of twelve. An empty ledger is only worth reading with the date it was last confirmed on.
 *
 * Three components were recorded here when the list was written: the composed surface, which was
 * grouped by subsystem from twenty-eight loose names down to nine, and the two leaves below it,
 * which handed their theme to the provider that now sits above them. The clause "the list only
 * shrinks" is what forced each removal — a violator that stopped violating and stayed registered is
 * a licence to come back. What still discriminates without the ledger is the synthetic control
 * below, judged by the very predicate that just judged `src/react`.
 */
const BASELINE: Readonly<Record<string, number>> = {};

/**
 * The positive control, served from memory.
 *
 * It is never written to disk: a synthetic violator inside `src/` would be picked up by every other
 * guard in this package and by the build. A virtual source file goes through the identical program,
 * the identical checker and the identical predicate, which is the whole point of a control.
 *
 * Three components, because the clause has three halves to prove: over the ceiling fails, exactly
 * at the ceiling passes, and NOT EXPORTED still fails.
 */
const CONTROL_FILE = join(REACT_DIR, '__controle__', 'controleSintetico.tsx');
// non-english-fixture: TypeScript identifiers fed to a real ts.Program and pinned by name
const CONTROL_TEXT = `
interface TrezeProps {
  readonly a1: string; readonly a2: string; readonly a3: string; readonly a4: string;
  readonly a5: string; readonly a6: string; readonly a7: string; readonly a8: string;
  readonly a9: string; readonly a10: string; readonly a11: string; readonly a12: string;
  readonly a13: string;
}
interface DozeProps {
  readonly a1: string; readonly a2: string; readonly a3: string; readonly a4: string;
  readonly a5: string; readonly a6: string; readonly a7: string; readonly a8: string;
  readonly a9: string; readonly a10: string; readonly a11: string; readonly a12: string;
}
interface AninhadoProps {
  readonly a1: string; readonly a2: string;
  readonly linhas: readonly { readonly id: string; readonly rotulo: string; readonly n: number; readonly corpo: string }[];
}
export function ControleTreze(props: TrezeProps): string { return props.a1; }
export function ControleDoze(props: DozeProps): string { return props.a1; }
export function ControleAninhado(props: AninhadoProps): string { return props.a1; }
function ControleNaoExportado(props: TrezeProps): string { return props.a13; }
export const usadoParaNaoOrfanar = ControleNaoExportado;
declare function memo<T>(component: T): T;
export const ControleMemoizado = memo(function ControleMemoizado(props: TrezeProps): string { return props.a1; });
`;

const OPTIONS: ts.CompilerOptions = {
  jsx: ts.JsxEmit.ReactJSX,
  target: ts.ScriptTarget.ES2021,
  strict: true,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  skipLibCheck: true,
};

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry): string[] => {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) return walk(abs);
    return /\.tsx?$/.test(entry.name) ? [resolve(abs)] : [];
  });
}

function buildProgram(): ts.Program {
  const roots = [...walk(REACT_DIR), CONTROL_FILE];
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

interface Component {
  readonly file: string;
  readonly name: string;
  readonly props: number;
  readonly synthetic: boolean;
}

const program = buildProgram();
const checker = program.getTypeChecker();

/**
 * The function a declaration ultimately holds, looked at THROUGH the wrappers a component is
 * allowed to arrive in.
 *
 * `memo(function X(props) {…})` is a call expression, and a scan that only knew arrow functions and
 * function expressions stopped seeing every component the memoisation boundary wrapped — a ceiling
 * measured over an empty set passes for the same reason an empty set has no maximum. Unwrapping is
 * recursive because `memo(forwardRef(…))` is one composition away and would blind it again.
 */
function unwrap(node: ts.Expression): ts.FunctionExpression | ts.ArrowFunction | undefined {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return node;
  if (!ts.isCallExpression(node) || node.arguments.length === 0) return undefined;
  return unwrap(node.arguments[0]);
}

/** Every top-level function whose name is PascalCase and that takes a first parameter. */
function componentsIn(sourceFile: ts.SourceFile, synthetic: boolean): Component[] {
  const found: Component[] = [];
  const record = (name: string, parameters: ts.NodeArray<ts.ParameterDeclaration>): void => {
    if (!/^[A-Z]/.test(name) || parameters.length === 0) return;
    const type = checker.getTypeAtLocation(parameters[0]);
    const file = synthetic
      ? 'react/__controle__/controleSintetico.tsx'
      : `react/${sourceFile.fileName.slice(REACT_DIR.length + 1)}`;
    found.push({ file, name, props: checker.getPropertiesOfType(type).length, synthetic });
  };
  ts.forEachChild(sourceFile, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) record(node.name.text, node.parameters);
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      const init = declaration.initializer;
      if (!init || !ts.isIdentifier(declaration.name)) continue;
      const fn = unwrap(init);
      if (fn !== undefined) record(declaration.name.text, fn.parameters);
    }
  });
  return found;
}

const components: Component[] = program
  .getSourceFiles()
  .filter((sf) => sf.fileName === CONTROL_FILE || sf.fileName.startsWith(`${REACT_DIR}/`))
  .flatMap((sf) => componentsIn(sf, sf.fileName === CONTROL_FILE));

const real = components.filter((c) => !c.synthetic);
const synthetic = components.filter((c) => c.synthetic);

/** LMC-28: path, measured metric, violated limit. */
function report(c: Component): string {
  return `FAIL ${c.file}::${c.name} :: top-level props measured=${c.props} limit=${LIMIT}`;
}

function over(list: readonly Component[]): Component[] {
  return list.filter((c) => c.props > LIMIT);
}

function key(c: Component): string {
  return `${c.file}::${c.name}`;
}

describe('LMC-24 — a ceiling of 12 top-level props per component under src/react', () => {
  it('finds the real components, so a green gate is not a gate over nothing', () => {
    expect(real.length).toBeGreaterThanOrEqual(15);
    expect(real.map((c) => c.name)).toEqual(expect.arrayContaining(['ChartSurface', 'Pill']));
  });

  it('fails the synthetic 13-member interface, passes the 12, and forgives no unexported one', () => {
    // CONTROL POSITIVE, on the four axes the clause has: over the ceiling, exactly at the ceiling,
    // "exported or not", and WRAPPED — a component inside `memo(...)` is a call expression, and the
    // previous scan, which only knew arrow and function expressions, stopped seeing it. A ceiling
    // measured over an empty set passes for the same reason an empty set has no maximum.
    // The predicate is the same one that has just judged `src/react`.
    expect(synthetic.map((c) => `${c.name}=${c.props}`).sort()).toEqual([
      'ControleAninhado=3',
      'ControleDoze=12',
      'ControleMemoizado=13',
      'ControleNaoExportado=13',
      'ControleTreze=13',
    ]);
    expect(over(synthetic).map((c) => c.name).sort()).toEqual([
      'ControleMemoizado',
      'ControleNaoExportado',
      'ControleTreze',
    ]);
    expect(report(over(synthetic)[0])).toBe(
      'FAIL react/__controle__/controleSintetico.tsx::ControleTreze :: top-level props measured=13 limit=12',
    );
  });

  it('counts top-level members and never a nested field', () => {
    // THE CASE THAT FOUNDED THE RULE, now served by a control and not by a passing example.
    // Revision 1 of the spec published 15 for `SeriesMenu` by adding the fields of the inline
    // literal inside `sections` — a number nobody passes at a call site. That prop went on to name
    // a declared interface, and with it the real example stopped having an inline literal; the
    // clause is still exercised, over a control that exists for that and cannot evaporate.
    const control = program.getSourceFile(CONTROL_FILE) as ts.SourceFile;
    const type = checker.getTypeAtLocation(
      control.statements
        .filter(ts.isFunctionDeclaration)
        .find((fn) => fn.name?.text === 'ControleAninhado')?.parameters[0] as ts.ParameterDeclaration,
    );
    const top = checker.getPropertiesOfType(type);
    const inlineNested = top.reduce((total, symbol) => {
      const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
      if (declaration === undefined) return total;
      const member = checker
        .getTypeOfSymbolAtLocation(symbol, declaration)
        .getNonNullableType();
      const element = checker.getIndexTypeOfType(member, ts.IndexKind.Number) ?? member;
      const isInlineLiteral = (element.symbol?.declarations ?? []).some(ts.isTypeLiteralNode);
      return isInlineLiteral ? total + checker.getPropertiesOfType(element).length : total;
    }, top.length);

    // 3 at the top level; 7 if the 4 fields of the nested literal were added. Nesting inflates, and
    // the counter reports the number a caller actually pays.
    expect(top.length).toBe(3);
    expect(inlineNested).toBe(7);
    expect(inlineNested).toBeGreaterThan(top.length);

    // And the real example is still measured at the top level, under the same predicate.
    expect(real.find((c) => c.name === 'SeriesMenu')?.props).toBe(10);
  });

  it('fails any component outside the baseline that is over the ceiling', () => {
    const unrecorded = over(real)
      .filter((c) => !(key(c) in BASELINE))
      .map(report);
    expect(unrecorded).toEqual([]);
  });

  it('fails if the baseline keeps a violator that already fell — the list only shrinks', () => {
    expect(over(real).map(key).sort()).toEqual(Object.keys(BASELINE).sort());
  });

  it('fails if a baseline component gains props above the recorded value', () => {
    const grown = real
      .filter((c) => key(c) in BASELINE && c.props > (BASELINE[key(c)] as number))
      .map((c) => `FAIL ${key(c)} :: top-level props measured=${c.props} baseline=${BASELINE[key(c)]}`);
    expect(grown).toEqual([]);
  });
});
