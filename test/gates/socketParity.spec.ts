import { readdirSync } from 'fs';
import { join, resolve } from 'path';
import * as ts from 'typescript';

/**
 * LMC-81 — a region that DECLARES a field the composition never passes fails the build.
 *
 * WHY A GATE AND NOT A READING. The sockets in the baseline below were found one at a time, by eye.
 * The next one somebody adds without wiring it will not be found that way, and its symptom in
 * production is a feature that quietly does nothing: no error, no log, no red test. The mount test
 * cannot see it either — a region fed `undefined` renders exactly like a region fed right, which is
 * the distinction this file exists to draw.
 *
 * The scan reads DECLARED fields through the compiler, one level into a group built inline at the
 * call site, because that is where the sockets are: `fields.density` is not a prop name anybody
 * would grep for.
 *
 * ── WHAT THIS GATE GUARANTEES, AND WHAT IT DOES NOT ────────────────────────────────────────────
 *
 * IT WAS WRITTEN DOWN BECAUSE THE GATE FAILED OPEN FOUR ROUNDS RUNNING, each time through a
 * writing of TypeScript nobody had thought of: an element-level spread, a group hoisted one line
 * up, a type wider than its value, a field handed `undefined`, and then six more spellings of that
 * last one. A gate that promises everything and delivers part of it is the disease this feature
 * exists to cure, so the promise is bounded here instead of being inferred from the file name.
 *
 * GUARANTEED — STRUCTURAL OMISSION. A field the region DECLARES that the composition never
 * mentions at the call site fails the build: absent from the attribute list, absent from a group
 * literal, or mentioned and handed A VALUE WHOSE TYPE IS `undefined`, which occupies the name and
 * feeds nothing. THAT LAST ONE IS ASKED OF THE TYPE CHECKER AND NOT OF THE SPELLING — the word
 * itself, `void 0`, a cast, a constant that holds it, the shorthand form and any writing not yet
 * invented are one answer, because they are one type. A site whose shape cannot be read is a
 * FINDING (`undecidable`), never a pass — the gate refuses to clear what it could not read, and
 * every such site costs a written reason.
 *
 * NOT GUARANTEED — THAT THE MENTIONED VALUE IS THE RIGHT ONE. `density={tuning}` with the two
 * swapped, a handler wired to the wrong region, a number off by one: every one of those mentions
 * the field and passes here, correctly.
 *
 * AND THAT INCLUDES A VALUE THAT MAY BE `undefined`, which is the sharpest edge of the line above
 * and is drawn here on purpose. A type of `string | undefined` — a ternary with an empty branch, an
 * optional read, a call that may answer nothing — says the field is fed on some renders and not on
 * others, and nothing readable at the call site says which. This composition writes exactly that,
 * correctly, at `reading.paneScale` and `reading.evicted`, so a scan that called it unfed would
 * fail the code it guards, and one that called it blind would blind the group around it. Only a
 * value that can be NOTHING ELSE is a socket left unconnected; a value that is sometimes nothing is
 * a behaviour, and behaviour is the next paragraph's.
 *
 * Those belong to the behaviour suites (`test/react/chartWorkspace.spec.tsx`), to the parity
 * harness (`apps/web/src/components/__tests__/workspaceParity.test.tsx`), and to the browser
 * validation. This file answers ONE question — is the socket connected — and it answers it about
 * the DECLARED shape at the call site, not about anything that runs.
 */

const REACT_DIR = resolve(join(__dirname, '..', '..', 'src', 'react'));
const WORKSPACE_DIR = join(REACT_DIR, 'workspace');
const ROOT_FILE = join(WORKSPACE_DIR, 'ChartWorkspace.tsx');

/**
 * THE DATED BASELINE — EMPTY as of 2026-08-14, and it can never grow again.
 *
 * It opened with six entries, each a field a region declared and the composition never passed.
 * `TabsRegion.onExport` left with the tab options the host now injects; the last five left together
 * with the field slices, the marks, the crossing channel and the two footer readings. From here the
 * clause below is an equality against nothing: the first unfed socket anybody adds fails on the
 * spot, and nothing may be written back into this list to make it pass.
 */
const BASELINE: readonly string[] = [];

/**
 * Optional fields this composition genuinely does not use, each with its reason written out.
 *
 * An exemption without a reason is a suppression under another name, so the reason is asserted to
 * exist and a stale exemption — one whose field is fed after all — fails just like a stale baseline
 * entry.
 */
/**
 * SITES WHOSE SHAPE NOBODY CAN READ — empty as of 2026-08-14, and an entry costs a written reason.
 *
 * A spread is answerable most of the time: `{...{ a, b }}` and `{...someTypedValue}` both name the
 * fields they carry, and the scan asks the type checker for them. What stays unreadable is a spread
 * of `any`, of `unknown`, or of a union that would give two answers — and THAT is what a line here
 * declares. It is not an exemption from being fed; it is an admission that the gate went blind at
 * this site, which is a finding and not a pass.
 */
const UNDECIDABLE: Readonly<Record<string, string>> = {
  'WorkspaceSetupProvider.setup.*':
    'the setup is ONE value held whole — `tabs.tabs[active].setup`, produced by `coerceWorkspaceSetup` and never written field by field at this call site — and from the per-study settings map onward it carries an OPTIONAL member, which is exactly what makes a non-literal group unreadable here. The blindness is the honest reading: there is no socket at this seam, because the only writer is the coercion, and every field of it is asserted in `test/workspaceSetup.spec.ts` and `test/studySettings.spec.ts`',
  'DrawingRailProvider.vocabulary.*':
    'the vocabulary is the HOST own value, taken whole or defaulted whole (`drawing.vocabulary ?? NO_TOOLS`); this composition never writes it field by field, so there is no call site here to read',
  'WorkspaceBody.of.*':
    'the root forwards its ENTIRE prop bag to the body, so the fields here are the host and not this composition; the sockets that are this composition are the region call sites inside the body, and those are scanned one by one',
};

const EXEMPT: Readonly<Record<string, string>> = {
  // The eight `labels` sockets that stood here are GONE, not exempted: LMC-84 moved every region's
  // wording onto the chrome channel, so there is no longer a per-region text field to leave unfed.
  'StylePickerRegion.shapes': 'the shape vocabulary is the package own; a host offering other shapes would also have to draw them',
  'StatusFooter.loading': 'this composition has no separate loading flag: an empty window is reported through the notice channel the root owns',
  'CanvasSurface.layout.budget': 'the row above already computed the application; a second budget here would be a second answer to one question',
  'CanvasSurface.layout.onLayout': 'the row above is the reporter, and it is the one the host budget is wired to',
  'CanvasSurface.appearance.gridLinesVisible': 'grid lines default to visible and nothing in this composition turns them off',
  // `CanvasSurface.alerts.style` LEFT THIS LIST: the composition now feeds it, because the tag on
  // the price axis is a sentence and belongs on the chrome channel like every other.
  'CompactGrid.source.format': 'a thumbnail cell carries no value axis worth formatting',
  'CompactGrid.source.barCount': 'the host depth sizes the MAIN history request; asking every cell for the same window would multiply the seed cost by the number of cells',
};

/**
 * The positive control, served from memory and never written to disk.
 *
 * ONE props interface, TWO call sites. The regions are declared identically, so the only thing that
 * can separate them is whether the composition passes the field — which is the whole claim. A
 * synthetic violator on disk would be picked up by every other guard in this package and by the
 * build.
 */
const CONTROL_FILE = join(WORKSPACE_DIR, '__control__', 'socketControl.tsx');
const CONTROL_TEXT = `
interface ControlGroup {
  readonly fed: string;
  readonly starved?: string;
}
interface ControlProps {
  readonly a: string;
  readonly b?: string;
  readonly group: ControlGroup;
}
declare const opaque: any;
/**
 * THE TYPE THAT IS WIDER THAN ANY VALUE. \`starved\` is optional, so this annotation names it while
 * nothing has to write it — which is the one situation in which asking the checker gives the wrong
 * answer, and the one situation the control had no case for.
 */
declare const wide: ControlGroup;
declare function makeWide(): ControlGroup;
declare const carrier: { readonly group: ControlGroup };
/**
 * THE VALUE THAT MAY OR MAY NOT ARRIVE, which is the boundary and not a hole. \`ControlMaybe\` writes
 * a value the checker types \`string | undefined\`: on some renders the field is fed and on others it
 * is not, and no reading of the call site can say which. This composition writes exactly that at
 * \`reading.paneScale\` and \`reading.evicted\`, so a scan that called it unfed would fail the code it
 * guards. It is asserted CLEARED below, which is what stops the next round from "fixing" it.
 */
declare const maybe: string | undefined;
/** A constant that holds it. The NAME here is \`held\`, so only its type can answer. */
const held = undefined;
/** The shorthand form: the field name and the value are one identifier, and it is worth nothing. */
const starved = undefined;
export function ControlFed(props: ControlProps): string { return props.a; }
export function ControlStarved(props: ControlProps): string { return props.a; }
export function ControlSpread(props: ControlProps): string { return props.a; }
export function ControlOpaque(props: ControlProps): string { return props.a; }
export const ControlWrapped = (function ControlWrapped(props: ControlProps): string { return props.a; });
export function ControlWideSpread(props: ControlProps): string { return props.a; }
export function ControlWideValue(props: ControlProps): string { return props.a; }
export function ControlWideCall(props: ControlProps): string { return props.a; }
export function ControlWideElement(props: ControlProps): string { return props.a; }
/**
 * THE FIELD THAT OCCUPIES A NAME AND FEEDS NOTHING, in the three writings that reach it: written
 * into the group, spread into the group from a literal, and handed to the top-level attribute.
 * All three compile, all three leave the field \`undefined\`, and the first two used to clear it.
 */
export function ControlUndefined(props: ControlProps): string { return props.a; }
export function ControlUndefinedSpread(props: ControlProps): string { return props.a; }
export function ControlUndefinedTop(props: ControlProps): string { return props.a; }
/**
 * AND THE FOUR WRITINGS THAT NEVER SAY THE WORD. Each hands the field a value that can only be
 * \`undefined\` while spelling it some other way — an operator, a cast, a constant, the shorthand —
 * and each one cleared this gate while the overlay it stands for arrived unswitchable. They are
 * here as four regions and not as one because each travels a different path through the scan: the
 * expression, the erased wrapper, the identifier that is not the word, and the property whose name
 * IS its value.
 */
export function ControlVoid(props: ControlProps): string { return props.a; }
export function ControlAsserted(props: ControlProps): string { return props.a; }
export function ControlHeld(props: ControlProps): string { return props.a; }
export function ControlShorthand(props: ControlProps): string { return props.a; }
export function ControlMaybe(props: ControlProps): string { return props.a; }
export function ControlRoot(): unknown {
  return [
    <ControlFed a="x" b="y" group={{ fed: 'f', starved: 's' }} />,
    <ControlStarved a="x" group={{ fed: 'f' }} />,
    <ControlSpread {...{ a: 'x', b: 'y' }} group={{ ...{ fed: 'f' } }} />,
    <ControlOpaque {...opaque} group={{ fed: 'f', starved: 's' }} />,
    <ControlWrapped a="x" group={{ fed: 'f', starved: 's' }} />,
    <ControlWideSpread a="x" b="y" group={{ ...wide }} />,
    <ControlWideValue a="x" b="y" group={wide} />,
    <ControlWideCall a="x" b="y" group={{ ...makeWide() }} />,
    <ControlWideElement a="x" b="y" {...carrier} />,
    <ControlUndefined a="x" b="y" group={{ fed: 'f', starved: undefined }} />,
    <ControlUndefinedSpread a="x" b="y" group={{ ...{ fed: 'f', starved: undefined } }} />,
    <ControlUndefinedTop a="x" b={undefined} group={{ fed: 'f', starved: 's' }} />,
    <ControlVoid a="x" b="y" group={{ fed: 'f', starved: void 0 }} />,
    <ControlAsserted a="x" b="y" group={{ fed: 'f', starved: undefined as string | undefined }} />,
    <ControlHeld a="x" b="y" group={{ fed: 'f', starved: held }} />,
    <ControlShorthand a="x" b="y" group={{ fed: 'f', starved }} />,
    <ControlMaybe a="x" b="y" group={{ fed: 'f', starved: maybe }} />,
  ];
}
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
  return ts.createProgram([...walk(REACT_DIR), CONTROL_FILE], OPTIONS, host);
}

const program = buildProgram();
const checker = program.getTypeChecker();

interface Socket {
  readonly region: string;
  /** `onExport`, or `fields.density` when the field lives inside a group built at the call site. */
  readonly field: string;
  readonly line: number;
  /**
   * `unfed` — the field is declared and the composition never passes it.
   * `undecidable` — a spread here carries names the type checker cannot enumerate, so this scan
   * cannot say whether the field arrives. Reported, never skipped: a gate that answers "I cannot
   * tell" with silence bans only the shape that already happened and clears the one beside it.
   */
  readonly kind: 'unfed' | 'undecidable';
}

/** The function a component declaration holds, seen through the wrappers it may arrive in. */
function unwrap(node: ts.Expression): ts.FunctionExpression | ts.ArrowFunction | undefined {
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return node;
  // Parentheses are not a wrapper, and skipping them cost the whole region: a component declared
  // inside a pair of them resolved to nothing, so every socket at its call site went unread.
  if (ts.isParenthesizedExpression(node)) return unwrap(node.expression);
  if (!ts.isCallExpression(node) || node.arguments.length === 0) return undefined;
  return unwrap(node.arguments[0]);
}

interface Region {
  readonly file: string;
  readonly props: ts.Type;
}

/** The component a JSX tag names, resolved through the import that brought it here. */
function regionOf(tag: ts.JsxTagNameExpression): Region | undefined {
  if (!ts.isIdentifier(tag)) return undefined;
  const symbol = checker.getSymbolAtLocation(tag);
  if (symbol === undefined) return undefined;
  const resolved =
    (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
  const declaration = resolved.valueDeclaration ?? resolved.declarations?.[0];
  if (declaration === undefined) return undefined;

  const parameters = ts.isFunctionDeclaration(declaration)
    ? declaration.parameters
    : ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined
      ? unwrap(declaration.initializer)?.parameters
      : undefined;
  if (parameters === undefined || parameters.length === 0) return undefined;
  return {
    file: declaration.getSourceFile().fileName,
    props: checker.getTypeAtLocation(parameters[0]),
  };
}

/**
 * The value under the wrappers the emitter ERASES: parentheses and the type-level claims (`as T`,
 * `satisfies T`, `<T>x`, `x!`). None of them is a value — each is a sentence ABOUT the value
 * underneath, and the value underneath is the only thing the region receives at runtime. Asking the
 * checker about the claim instead of about the value is how `undefined as boolean | undefined`
 * cleared this gate while the field arrived empty.
 */
function bare(expression: ts.Expression): ts.Expression {
  if (ts.isParenthesizedExpression(expression)) return bare(expression.expression);
  if (
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression)
  ) {
    return bare(expression.expression);
  }
  return expression;
}

/**
 * A value that can only ever be `undefined` — the one thing that occupies a name and feeds nothing.
 *
 * THE QUESTION IS ASKED OF THE TYPE, NOT OF THE SPELLING, and that is the whole of it. Four rounds
 * running this predicate matched the identifier `undefined` through parentheses, and four rounds
 * running a writing nobody had listed walked past it: `void 0`, a cast, a constant holding it, the
 * shorthand form. Enumerating writings loses to a language this expressive by construction — there
 * is always one more spelling — so the enumeration is gone. `undefined` is the type of every value
 * that feeds nothing and of no value that feeds anything, so ONE question about the type answers for
 * every writing of it, including the ones nobody has thought of yet.
 *
 * THE SAME PREDICATE HAS TO ANSWER AT BOTH LEVELS: the top-level attribute and the field inside a
 * group built at the call site. Stating the rule in one place and applying it in one of them is how
 * this gate passed `showProfile: undefined` for three rounds.
 *
 * A UNION IS NOT AN ANSWER HERE, DELIBERATELY. `boolean | undefined` says the field arrives on some
 * renders and not on others, which is a statement about the VALUE and not about the socket — and
 * this composition writes exactly that, correctly, at `reading.paneScale` and `reading.evicted`.
 * Calling it unfed would fail the composition this gate exists to guard; the boundary is stated in
 * the header and pinned by `ControlMaybe` below.
 */
function writesUndefined(value: ts.Expression | undefined): boolean {
  if (value === undefined) return false;
  return (checker.getTypeAtLocation(bare(value)).flags & ts.TypeFlags.Undefined) !== 0;
}

/** A field handed a value that can only be `undefined` is not fed; naming it renders nothing. */
function isFed(initializer: ts.Node | undefined): boolean {
  if (initializer === undefined) return true;
  if (!ts.isJsxExpression(initializer)) return true;
  const value = initializer.expression;
  return value !== undefined && !writesUndefined(value);
}

const isOptional = (symbol: ts.Symbol): boolean =>
  (symbol.flags & ts.SymbolFlags.Optional) !== 0;

/**
 * The names a spread carries, read off the type of what is being spread. `null` when the type
 * cannot answer — `any` and `unknown` name nothing while carrying anything, a union names two
 * different sets, an index signature names an open one, and A TYPE WITH OPTIONAL MEMBERS NAMES
 * MORE THAN THE VALUE WROTE.
 *
 * THE LAST ONE IS THE ONE THAT COST FOUR MUTANTS. `getPropertiesOfType` answers about the
 * DECLARATION, and the question here is about the VALUE: every field of the overlay group is
 * optional, so `const g: Omit<OverlayFields,'bars'> = { tuning, density, showDensity }` *declares*
 * `showProfile` while writing nothing into it. Asking the checker got back "yes, it carries
 * showProfile", the field arrived `undefined`, and the profile overlay quietly stopped being
 * switchable — with the gate, the 1071 assertions of the package and the app suite all green. A
 * required member cannot arrive missing without `tsc` saying so; an optional one is exactly what
 * this file exists to catch, so a type that has any is an admission of blindness, not an answer.
 */
function spreadNames(expression: ts.Expression): readonly string[] | null {
  // A LITERAL IS READ, NEVER ASKED ABOUT. Its type answers for the DECLARATION — `{ starved:
  // undefined }` has a required `starved` and the checker says it carries one — while the question
  // here is what the VALUE feeds. Reading it field by field is the same work `writtenBy` does at the
  // call site, so it is the same function, and `...{ starved: undefined }` stops clearing the field.
  const inner = bare(expression);
  if (ts.isObjectLiteralExpression(inner)) return writtenBy(inner);
  const type = checker.getTypeAtLocation(expression);
  if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) return null;
  if (type.isUnion()) return null;
  if (checker.getIndexInfosOfType(type).length > 0) return null;
  const properties = checker.getPropertiesOfType(type);
  if (properties.some(isOptional)) return null;
  return properties.map((symbol) => symbol.name);
}

/**
 * Whether a value of this type could arrive missing a field the region declares, without this scan
 * being able to see it. `any`/`unknown` carry anything while naming nothing; a shape with optional
 * members names what no value has to write.
 *
 * This is the question asked of a group the composition passes WITHOUT writing it at the call site —
 * an identifier, a call, a group riding in on an element spread. The scan can read a literal field
 * by field; it cannot read any of those, and saying so out loud is the finding.
 */
function unreadableGroup(type: ts.Type): boolean {
  const shape = type.getNonNullableType();
  if ((shape.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) return true;
  return checker.getPropertiesOfType(shape).some(isOptional);
}

/** Names a literal actually writes, spreads included. `null` when a spread cannot be read. */
function writtenBy(literal: ts.ObjectLiteralExpression): readonly string[] | null {
  const names: string[] = [];
  for (const property of literal.properties) {
    if (ts.isSpreadAssignment(property)) {
      const carried = spreadNames(property.expression);
      if (carried === null) return null;
      names.push(...carried);
      continue;
    }
    // WRITING `undefined` INTO A FIELD IS NOT WRITING THE FIELD. This half used to push the name
    // without ever looking at the value, one level below where `isFed` states the same rule — and
    // one level below is where the sockets are. `{ …, showProfile: undefined }` cleared the socket
    // while the profile overlay arrived unswitchable: the button lit, the footer counted it, and
    // nothing was drawn.
    if (ts.isPropertyAssignment(property) && writesUndefined(property.initializer)) continue;
    // THE SHORTHAND IS A WRITER TOO, and it is the writing that has no initializer to look at: in
    // `{ …, showProfile }` the name and the value are the same identifier, so the branch above never
    // ran and the name went straight into the list. `const showProfile = undefined` one scope up is
    // then a field that occupies its own name and feeds nothing — the same damage as the line above,
    // reached by writing less.
    if (ts.isShorthandPropertyAssignment(property) && writesUndefined(property.name)) continue;
    const name = property.name;
    if (name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name))) {
      names.push(name.text);
    }
  }
  return names;
}

/** The group's DECLARED shape, which is the contextual type of the literal written at the site. */
function declaredInside(literal: ts.ObjectLiteralExpression): readonly string[] {
  const contextual = checker.getContextualType(literal);
  if (contextual === undefined) return [];
  return checker.getPropertiesOfType(contextual.getNonNullableType()).map((symbol) => symbol.name);
}

/** Every declared field the composition leaves unfed, at every JSX site under `node`. */
function socketsIn(node: ts.Node, belongs: (file: string) => boolean): Socket[] {
  const source = node.getSourceFile();
  const found: Socket[] = [];

  const visit = (current: ts.Node): void => {
    if (ts.isJsxSelfClosingElement(current)) collect(current, false);
    if (ts.isJsxElement(current)) {
      // `children` arrives BETWEEN the tags, never as an attribute — a scan that only read the
      // attribute list would report every wrapper in the composition as starved.
      const filled = current.children.some(
        (child) => !ts.isJsxText(child) || child.text.trim().length > 0,
      );
      collect(current.openingElement, filled);
    }
    current.forEachChild(visit);
  };

  const collect = (element: ts.JsxOpeningLikeElement, filled: boolean): void => {
    const region = regionOf(element.tagName);
    if (region === undefined || !belongs(region.file)) return;

    const line = source.getLineAndCharacterOfPosition(element.getStart(source)).line + 1;
    const name = element.tagName.getText(source);
    const passed = new Map<string, ts.JsxAttribute>();
    // A spread at the element level is read like any other writer: it feeds the names its TYPE
    // carries. Only a type that cannot name them takes the whole element out of reach.
    const spread = new Set<string>();
    for (const attribute of element.attributes.properties) {
      if (ts.isJsxSpreadAttribute(attribute)) {
        const carried = spreadNames(attribute.expression);
        if (carried === null) {
          found.push({ region: name, field: '*', line, kind: 'undecidable' });
          return;
        }
        for (const field of carried) spread.add(field);
        continue;
      }
      if (ts.isJsxAttribute(attribute) && ts.isIdentifier(attribute.name)) {
        if (isFed(attribute.initializer)) passed.set(attribute.name.text, attribute);
      }
    }

    for (const symbol of checker.getPropertiesOfType(region.props)) {
      if (symbol.name === 'children' && filled) continue;
      const declared = checker.getTypeOfSymbolAtLocation(symbol, element);
      if (spread.has(symbol.name)) {
        // THE SECOND EARLY EXIT THAT CLEARED A SITE INSTEAD OF READING IT. An element-level spread
        // that carries the NAME of a group marked it fed and returned before the nested check ever
        // ran, so `{...rest}` with `rest: { fields: Omit<OverlayFields,'bars'> }` handed the region
        // a group missing a field and left nothing behind. The name does arrive; which of its
        // fields arrive is what nothing here can say.
        if (unreadableGroup(declared)) {
          found.push({ region: name, field: `${symbol.name}.*`, line, kind: 'undecidable' });
        }
        continue;
      }
      const attribute = passed.get(symbol.name);
      if (attribute === undefined) {
        found.push({ region: name, field: symbol.name, line, kind: 'unfed' });
        continue;
      }
      const initializer = attribute.initializer;
      if (initializer === undefined || !ts.isJsxExpression(initializer)) continue;
      const value = initializer.expression;
      if (value === undefined) continue;
      if (!ts.isObjectLiteralExpression(value)) {
        // THE FIRST EARLY EXIT. A group hoisted one line up — `const g: Omit<…> = { … }` and then
        // `fields={g}` — is not a literal, so the nested half of this scan skipped it entirely and
        // the region was cleared on the strength of the top-level name alone. Reading a literal is
        // what this scan can do; anything else it has to declare it cannot read.
        if (unreadableGroup(declared)) {
          found.push({ region: name, field: `${symbol.name}.*`, line, kind: 'undecidable' });
        }
        continue;
      }
      const written = writtenBy(value);
      if (written === null) {
        found.push({ region: name, field: `${symbol.name}.*`, line, kind: 'undecidable' });
        continue;
      }
      for (const field of declaredInside(value)) {
        if (!written.includes(field)) {
          found.push({ region: name, field: `${symbol.name}.${field}`, line, kind: 'unfed' });
        }
      }
    }
  };

  visit(node);
  return found;
}

const key = (socket: Socket): string => `${socket.region}.${socket.field}`;

/** LMC-81: region, field, and the line of the call site that forgot it. */
const report = (socket: Socket): string =>
  socket.kind === 'undecidable'
    ? `BLIND ${key(socket)} :: ChartWorkspace.tsx:${socket.line} — the value here names more fields than it has to write, so no socket at this site can be read`
    : `FAIL ${key(socket)} :: ChartWorkspace.tsx:${socket.line} — declared by the region, never passed by the composition`;

const rootFile = program.getSourceFile(ROOT_FILE) as ts.SourceFile;
const measured = socketsIn(rootFile, (file) => file.startsWith(`${WORKSPACE_DIR}/`));
const starved = measured.filter((socket) => socket.kind === 'unfed');
const unexempt = starved.filter((socket) => !(key(socket) in EXEMPT));
const blind = measured.filter((socket) => socket.kind === 'undecidable');

const controlFile = program.getSourceFile(CONTROL_FILE) as ts.SourceFile;
const control = socketsIn(controlFile, (file) => file === CONTROL_FILE);

describe('LMC-81 — a socket declared by a region and never fed by the composition', () => {
  it('reads the real composition, so a green gate is not a gate over nothing', () => {
    expect(rootFile).toBeDefined();
    expect(measured.length).toBeGreaterThan(0);
    expect(measured.map((socket) => socket.region)).toEqual(
      expect.arrayContaining(['StylePickerRegion', 'CanvasSurface', 'StatusFooter']),
    );
  });

  it('catches a starved region and clears the identically declared one that is fed', () => {
    // POSITIVE CONTROL. All four control regions take the SAME props interface; the only difference
    // is the call site. So a socket leaving the list can only mean it was wired, and the nested half
    // is proven alongside the top-level one.
    expect(control.filter((socket) => socket.kind === 'unfed').map(key).sort()).toEqual([
      // THE FOUR WRITINGS THAT NEVER SPELL THE WORD, and the reason the predicate stopped reading
      // spellings: an operator, an erased cast, a constant under another name, and the shorthand
      // whose name is its value. Every one of them compiles, leaves the field `undefined`, and
      // cleared this gate on the composition — four of the six the fourth round of verification
      // planted at the overlay socket, now standing in the file that reads them.
      'ControlAsserted.group.starved',
      'ControlHeld.group.starved',
      'ControlShorthand.group.starved',
      // The spread form, NAMED down to the field: `{...{ fed }}` writes one of the two the group
      // declares, and the one it drops is the one reported — not the group, and not nothing.
      'ControlSpread.group.starved',
      'ControlStarved.b',
      'ControlStarved.group.starved',
      // THE THREE WRITINGS OF `undefined`. The name is present at every one of them and nothing
      // arrives; the top-level one was already caught, the two inside the group were not, and the
      // group is where the sockets live. Reported as UNFED and not as blind: the scan read the site
      // fine — it read a field being handed nothing, which is a finding and not an inability.
      'ControlUndefined.group.starved',
      'ControlUndefinedSpread.group.starved',
      'ControlUndefinedTop.b',
      'ControlVoid.group.starved',
      // Declared inside a pair of parentheses. Without reading through them the component resolved
      // to nothing, so its call site was never scanned and `b` went unreported — a region can leave
      // this gate by being wrapped, which is the quietest way to leave a gate there is.
      'ControlWrapped.b',
    ]);
    expect(control.map(key)).not.toContain('ControlFed.b');
    expect(control.map(key)).not.toContain('ControlFed.group.starved');
    // THE BOUNDARY, PINNED FROM THE OTHER SIDE. `ControlMaybe` hands the field a `string |
    // undefined`: it feeds on some renders and not on others, and nothing readable at the call site
    // says which. The header declares that case OUT, and this line is what holds the declaration to
    // the code — a later round that widened the predicate to "any type that admits `undefined`"
    // would fail here, as it would fail on `reading.paneScale` and `reading.evicted`, which are this
    // composition's own correct writes of exactly this shape.
    expect(control.map(key)).not.toContain('ControlMaybe.group.starved');
    // A spread that FEEDS a top-level name clears it, or the clause above would fire on every site
    // that writes through one and the gate would be unusable rather than strict.
    expect(control.map(key)).not.toContain('ControlSpread.b');
  });

  it('calls a site it cannot read a finding, not a pass', () => {
    // THE HOLE THIS CLAUSE CLOSES. `{...opaque}` is `any`: it may carry every declared name or none,
    // and a scan that skipped it would clear the region while a field quietly arrived `undefined` —
    // which renders exactly like a field fed right. `ControlOpaque` declares the same props as
    // `ControlFed`, so the only thing separating them is that one of them cannot be read.
    //
    // AND THE FOUR THAT THE FIRST VERSION OF THIS CLAUSE COULD NOT SEE. All four hand the region a
    // group ANNOTATED with the group's own type and missing `starved`, by the four writings a
    // person actually reaches for: spread of a variable, the variable itself, a call, and a group
    // riding in on an element spread. Each compiles, each leaves the field `undefined`, and each
    // used to leave this file silent — because the type names a member no value has to write. They
    // declare the SAME props as `ControlFed`, so the only thing separating them is readability.
    expect(control.filter((socket) => socket.kind === 'undecidable').map(key).sort()).toEqual([
      'ControlOpaque.*',
      'ControlWideCall.group.*',
      'ControlWideElement.group.*',
      'ControlWideSpread.group.*',
      'ControlWideValue.group.*',
    ]);
    expect(report(control.find((socket) => socket.kind === 'undecidable') as Socket)).toContain(
      'BLIND ControlOpaque.* ::',
    );
    // A GROUP WIDER THAN ITS VALUE IS NEVER REPORTED AS FED. Without this line the clause above
    // would pass on a scan that reported the site blind AND cleared its fields, which is the same
    // silence with an extra line of output.
    expect(control.map(key)).not.toContain('ControlWideValue.b');
    expect(control.filter((socket) => socket.kind === 'unfed').map(key)).not.toContain(
      'ControlWideElement.a',
    );
  });

  it('names region, field and the line of the call site that forgot it', () => {
    // AN EXEMPT SOCKET, because the baseline is empty and the wording still has to be provable. An
    // exemption and a violation are the same MEASUREMENT — the exemption only decides what is done
    // with it — so the sentence a real breach would print is exercised on one that is allowed.
    const socket = measured.find((found) => key(found) === 'CanvasSurface.layout.budget') as Socket;
    // The line is read back out of the file rather than written down, so the clause stays true
    // while the composition moves and cannot be satisfied by a constant.
    const at = rootFile.text.split('\n').findIndex((text) => text.includes('<CanvasSurface')) + 1;
    expect(socket.line).toBe(at);
    expect(report(socket)).toBe(
      `FAIL CanvasSurface.layout.budget :: ChartWorkspace.tsx:${at} — declared by the region, never passed by the composition`,
    );
  });

  it('holds every exemption to a written reason', () => {
    // A REASON HAS TO BE A SENTENCE. `length === 0` let a single character stand for one, which is
    // an escape hatch with a decoration on it; the roles clause next door already asks for twenty.
    const silent = Object.entries(EXEMPT).filter(([, reason]) => reason.trim().length < 20);
    expect(silent).toEqual([]);
  });

  it('fails an exemption that no longer describes anything — a stale excuse is an excuse', () => {
    const measuredKeys = new Set(measured.map(key));
    const stale = Object.keys(EXEMPT).filter((entry) => !measuredKeys.has(entry));
    expect(stale).toEqual([]);
  });

  it('fails any socket outside the dated baseline', () => {
    const unrecorded = unexempt.filter((socket) => !BASELINE.includes(key(socket))).map(report);
    expect(unrecorded).toEqual([]);
  });

  it('fails while the baseline still holds a socket — the list only shrinks', () => {
    expect(unexempt.map(key).sort()).toEqual([...BASELINE].sort());
  });

  it('fails a site the scan cannot read, unless the blindness is declared with a reason', () => {
    // "Cannot decide" used to mean "carry on", and that is how a field could leave a group through a
    // spread without a single test going red. It now costs a line here, and a line here says out
    // loud that this site is no longer covered by the clause above.
    expect(blind.filter((socket) => !(key(socket) in UNDECIDABLE)).map(report)).toEqual([]);
  });

  it('holds every declared blindness to a written reason, and drops the stale ones', () => {
    const silent = Object.entries(UNDECIDABLE).filter(([, reason]) => reason.trim().length < 20);
    expect(silent).toEqual([]);
    const measuredKeys = new Set(blind.map(key));
    expect(Object.keys(UNDECIDABLE).filter((entry) => !measuredKeys.has(entry))).toEqual([]);
  });
});
