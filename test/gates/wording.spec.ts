import { join, resolve } from 'path';
import * as ts from 'typescript';

import {
  DEFAULT_WORKSPACE_CHROME_LABELS,
  resolveWorkspaceLabels,
  workspaceChromeLabels,
  type WorkspaceChromeLabels,
} from '../../src/react/chrome/labels';
import { collectSources } from './sourceScan';

/**
 * LMC-84 — no component under `src/react` holds a sentence of its own.
 *
 * WHY A GATE AND NOT A REVIEW. Text is the cheapest thing in a component to write in place: one
 * `aria-label="Panes"` compiles, renders, passes every other guard here and is invisible in a diff
 * of four hundred lines. Its symptom arrives months later, in somebody else's product, as one
 * control in the wrong language on an otherwise translated screen — and by then there are thirty of
 * them. The channel only stays whole if a literal in a content position fails the build on the day
 * it is written.
 *
 * WHAT COUNTS AS A CONTENT POSITION. Three, and the third is the one reviews miss: what a reader
 * SEES (JSX text and string children), what a screen reader HEARS (`aria-label` and its family,
 * `alt`), and what a pointer REVEALS (`title`, `placeholder`). An accessible name is text; it just
 * never appears on screen, which is exactly why nobody notices it was never translated.
 *
 * THE ONE EXEMPTION IS DECLARED AND JUSTIFIED BELOW. An exemption without a written reason is a
 * suppression wearing another name, so the reason is asserted to exist and the ledger only shrinks.
 */

const REACT_DIR = resolve(join(__dirname, '..', '..', 'src', 'react'));

/** The contract's own home. It is the one file whose job is to hold every sentence. */
const CONTRACT = 'chrome/labels.ts';

/**
 * Attributes whose value is read to a human. `label` is here because every chrome role in this
 * package names its accessible-name prop that way, so a literal there is an untranslatable button.
 */
const TEXT_ATTRIBUTES =
  /^(aria-label|aria-description|aria-roledescription|aria-valuetext|aria-placeholder|aria-keyshortcuts|title|label|placeholder|alt)$/;

const LETTER = /\p{L}/u;

/**
 * THE ONE ALLOWLIST, and it is about PICTOGRAPHS rather than about text.
 *
 * Each of these is the visible face of a control whose accessible name comes from the contract —
 * `⠿` is `aria-hidden` decoration beside a title that does, `▲` sits inside an `IconButton` that
 * takes its name from `labels.panes.up`. They are exempt because they are the same mark in every
 * language: translating `✕` produces `✕`. A word would not be exempt, and the assertion below is a
 * character-set membership rather than a per-site excuse, so a sentence can never enter by this
 * door — the first letter in a JSX text node fails, whatever file it is in.
 */
const GLYPHS = new Set('✕×+⠿▲▼⤢');

const GLYPH_REASON =
  'pictographs: identical in every language, and each already paired with an accessible name that comes from the contract';

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly what: string;
  readonly literal: string;
}

/** The root name an expression hangs off: `labels.panes.up(x)` -> `labels`, `GROUP` -> `GROUP`. */
function rootIdentifier(expression: ts.Expression): string | null {
  let current: ts.Node = expression;
  for (;;) {
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      current = current.expression;
      continue;
    }
    if (ts.isCallExpression(current)) {
      current = current.expression;
      continue;
    }
    if (
      ts.isNonNullExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current)
    ) {
      current = current.expression;
      continue;
    }
    if (ts.isBinaryExpression(current)) {
      current = current.left;
      continue;
    }
    if (ts.isConditionalExpression(current)) {
      current = current.whenTrue;
      continue;
    }
    return ts.isIdentifier(current) ? current.text : null;
  }
}

/** The letters a template writes ITSELF, with every interpolated hole removed. */
function templateProse(node: ts.TemplateExpression): string {
  return node.head.text + node.templateSpans.map((span) => span.literal.text).join('');
}

/** Module-scope constants that carry a sentence, by name — the private label bag, found. */
function textConstants(source: ts.SourceFile): ReadonlySet<string> {
  const named = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.initializer === undefined) continue;
      let carries = false;
      const dig = (node: ts.Node): void => {
        if (
          (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
          LETTER.test(node.text)
        ) {
          carries = true;
        }
        if (ts.isTemplateExpression(node) && LETTER.test(templateProse(node))) carries = true;
        ts.forEachChild(node, dig);
      };
      dig(declaration.initializer);
      if (carries) named.add(declaration.name.text);
    }
  }
  return named;
}

/**
 * Every sentence this file says on its own behalf.
 *
 * A LOCAL CONSTANT COUNTS AS A LITERAL. Hoisting `const LABELS = { group: 'Visible panes' }` to the
 * top of a region and writing `aria-label={LABELS.group}` is the same hard-coded text with an extra
 * hop, and it is the form every region in this package actually used before the channel existed —
 * a gate that only saw inline strings would have passed all of them.
 */
function findingsIn(file: string, text: string): readonly Finding[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2021, true, ts.ScriptKind.TSX);
  const local = textConstants(source);
  const found: Finding[] = [];
  const lineOf = (node: ts.Node): number =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const report = (node: ts.Node, what: string, literal: string): void => {
    found.push({ file, line: lineOf(node), what, literal });
  };

  const fromExpression = (node: ts.Node, what: string, expression: ts.Expression): void => {
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      if (LETTER.test(expression.text)) report(node, what, expression.text);
      return;
    }
    if (ts.isTemplateExpression(expression)) {
      const prose = templateProse(expression);
      if (LETTER.test(prose)) report(node, what, expression.getText(source));
      return;
    }
    const root = rootIdentifier(expression);
    if (root !== null && local.has(root)) report(node, what, root);
  };

  const walk = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const shown = node.text.trim();
      const foreign = [...shown].filter((mark) => !GLYPHS.has(mark));
      if (foreign.length > 0) report(node, 'jsx text', shown);
    }
    if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.test(node.name.getText(source))) {
      const what = `attribute ${node.name.getText(source)}`;
      const given = node.initializer;
      if (given !== undefined) {
        if (ts.isStringLiteral(given)) {
          if (LETTER.test(given.text)) report(node, what, given.text);
        } else if (ts.isJsxExpression(given) && given.expression !== undefined) {
          fromExpression(node, what, given.expression);
        }
      }
    }
    if (
      ts.isJsxExpression(node) &&
      node.expression !== undefined &&
      node.parent !== undefined &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      // THE SAME PREDICATE AS AN ATTRIBUTE, and it has to be: `{LABELS.density}` is the exact form
      // every region here used before the channel existed. A first draft of this file only looked
      // for inline strings in child position and passed a planted label bag — the mutant survived,
      // and this line is what killed it.
      fromExpression(node, 'jsx child', node.expression);
    }
    ts.forEachChild(node, walk);
  };
  walk(source);
  return found;
}

const SOURCES = collectSources(REACT_DIR).filter((source) => source.file !== CONTRACT);

const say = (finding: Finding): string =>
  `${finding.file}:${finding.line} :: ${finding.what} :: ${JSON.stringify(finding.literal)}`;

describe('LMC-84 — the library says nothing the host cannot replace', () => {
  it('reads the whole of `src/react`, so a green gate is not a gate over nothing', () => {
    // The scan has to reach the regions AND the leaves: the wording lived in both, and a gate that
    // walked one directory would have declared the other clean without opening it.
    expect(SOURCES.length).toBeGreaterThan(30);
    expect(SOURCES.map((source) => source.file)).toEqual(
      expect.arrayContaining([
        'workspace/PaneListSection.tsx',
        'workspace/OverlayTogglesSection.tsx',
        'workspace/PatternChipsSection.tsx',
        'SeriesMenu.tsx',
        'chrome/Notice.tsx',
      ]),
    );
  });

  it('finds no sentence written into a region, a leaf or a chrome role', () => {
    const breaches = SOURCES.flatMap((source) => findingsIn(source.file, source.text)).map(say);
    expect(breaches).toEqual([]);
  });

  it('states the reason for the one exemption, because an unexplained one is a suppression', () => {
    expect(GLYPH_REASON.length).toBeGreaterThan(40);
    // Marks only. A letter in this set would be a word smuggled past the JSX-text clause above.
    expect([...GLYPHS].filter((mark) => LETTER.test(mark))).toEqual([]);
  });

  /**
   * THE DISCRIMINATION SENSOR, served from memory and never written to disk.
   *
   * Three regions, identical but for where their words come from — which is the entire claim. A
   * synthetic violator on disk would be caught by the build and by every other guard here, so it
   * would prove that the file is bad rather than that this predicate can tell.
   */
  const PLANTED = `
import { DEFAULT_WORKSPACE_CHROME_LABELS } from '../chrome/labels';
const PRIVATE_BAG = { group: 'Visible panes' };
export function Inline() {
  return <fieldset aria-label="Visible panes" title="drag to reorder">Panes<span>⠿</span></fieldset>;
}
export function ViaLocalConst() {
  return <fieldset aria-label={PRIVATE_BAG.group} />;
}
export function FromContract() {
  return (
    <fieldset aria-label={DEFAULT_WORKSPACE_CHROME_LABELS.panes.group}>
      <span aria-hidden="true">⠿</span>
    </fieldset>
  );
}
`;

  it('fails a sentence planted straight into a region, naming the file and the literal', () => {
    const breaches = findingsIn('workspace/__control__/planted.tsx', PLANTED);
    const said = breaches.map(say);
    expect(said).toEqual(
      expect.arrayContaining([
        'workspace/__control__/planted.tsx:5 :: attribute aria-label :: "Visible panes"',
        'workspace/__control__/planted.tsx:5 :: attribute title :: "drag to reorder"',
        'workspace/__control__/planted.tsx:5 :: jsx text :: "Panes"',
        'workspace/__control__/planted.tsx:8 :: attribute aria-label :: "PRIVATE_BAG"',
      ]),
    );
  });

  it('passes the same words once they come from the contract, and the glyph beside them', () => {
    // The other half of the sensor: a predicate that failed everything would have passed the clause
    // above and proved nothing. `FromContract` says the identical sentence and draws the identical
    // mark, and the only difference is the channel it arrived on.
    const breaches = findingsIn('workspace/__control__/planted.tsx', PLANTED).filter(
      (finding) => finding.line > 9,
    );
    expect(breaches.map(say)).toEqual([]);
  });
});

/**
 * DOC-24 to DOC-29 — the contract is CORRECT in the language it comes out in, not only replaceable.
 *
 * THE DEFECT IS FORMATTING, NOT VOCABULARY, and that is why translating the channel never fixed it.
 * Measured on the published default: `${panes} panes` rendered **"1 panes"** with one pane — wrong in
 * the package's own English; `panes.join(', ')` rendered "a, b, c" where Portuguese wants "a, b e c";
 * and `toFixed(2)}%` rendered "1.23%" where Portuguese wants "1,23%". A host that replaced every
 * sentence would inherit all three, because all three are decisions the FORMATTER makes.
 *
 * THE FORMATTING COMES FROM THE PLATFORM. `Intl.PluralRules`, `Intl.ListFormat` and
 * `Intl.NumberFormat` are ES2021, which is this package's target, so ICU costs no dependency — the
 * peers stay `react` and `lightweight-charts`, asserted where the manifest is read, in
 * `test/gates/packaging.spec.ts`.
 *
 * EACH CLAUSE BELOW IS BUILT SO THAT ONE LOCALE COULD NOT PASS IT. A plural asserted only at two
 * passes under concatenation; a list asserted only in English passes under `join(', ')`; a number
 * asserted only in English passes under `toFixed`. So the plural is asserted at ONE and at TWO, and
 * the list and the number are asserted ACROSS two locales.
 */

/** Every member of the contract whose noun varies with a count, and how to make it speak. */
const COUNTED: readonly (readonly [string, (labels: WorkspaceChromeLabels, count: number) => string])[] = [
  ['state', (labels, count) => labels.state('BTC-USD', '1h', count)],
  ['compactCell.status', (labels, count) => labels.compactCell.status(count, 0)],
  ['studies.warmUp', (labels, count) => labels.studies.warmUp(0, count)],
];

/**
 * A count phrase written by concatenation says the SAME WORDS at one as at two.
 *
 * Digits out, the two readings are compared: a phrase that selects its form differs ("# pane" against
 * "# panes") and a phrase that glued a number to a fixed noun does not. It is a behavioural detector
 * rather than a search for `${`, so a member that concatenates through a helper is caught too.
 */
function concatenating(labels: WorkspaceChromeLabels): readonly string[] {
  const shape = (text: string): string => text.replace(/\d+/g, '#');
  return COUNTED.filter(([, say]) => shape(say(labels, 1)) === shape(say(labels, 2))).map(
    ([member]) => member,
  );
}

describe('DOC-24 to DOC-29 — the contract formats by `Intl`, and stops concatenating counts', () => {
  const en = workspaceChromeLabels('en');
  const ptBR = workspaceChromeLabels('pt-BR');

  it('chooses the form by count — at ONE and at TWO, because only the pair discriminates', () => {
    // "1 panes" was the shipped default. Asserting the plural alone would have passed it.
    expect(en.state('BTC-USD', '1h', 1)).toBe('BTC-USD · 1h · 1 pane');
    expect(en.state('BTC-USD', '1h', 2)).toBe('BTC-USD · 1h · 2 panes');
    expect(en.compactCell.status(1, 0)).toBe('1 bar · +0.00%');
    expect(en.compactCell.status(2, 0)).toBe('2 bars · +0.00%');
    expect(en.studies.warmUp(3, 1)).toBe('warms up after 3 of 1 bar');
    expect(en.studies.warmUp(3, 2)).toBe('warms up after 3 of 2 bars');
    expect(concatenating(en)).toEqual([]);
  });

  it('enumerates by `Intl.ListFormat` — asserted ACROSS two locales, which `join` cannot pass', () => {
    // The conjunction and the separator both move with the language. English adds a serial comma,
    // which is the measured output of the platform and not the shape the plan predicted.
    expect(en.status.evicted(['price', 'volume', 'rsi'])).toBe(
      ' · panes collapsed for want of height: price, volume, and rsi',
    );
    expect(ptBR.status.evicted(['price', 'volume', 'rsi'])).toBe(
      ' · panes collapsed for want of height: price, volume e rsi',
    );
    expect(en.status.alerts(['a', 'b'])).toBe(' · alert fired: a and b');
    expect(ptBR.status.alerts(['a', 'b'])).toBe(' · alert fired: a e b');
  });

  it('formats number and percentage by `Intl.NumberFormat` — the decimal separator moves', () => {
    expect(en.density.readout(1.5)).toBe('γ 1.5');
    expect(ptBR.density.readout(1.5)).toBe('γ 1,5');
    expect(en.compactCell.status(2, -1.234)).toBe('2 bars · -1.23%');
    expect(ptBR.compactCell.status(2, -1.234)).toBe('2 bars · -1,23%');
    expect(en.status.shrunk(87)).toBe(' · panes reduced to 87%');
  });

  it('takes a locale, and falls back to the runtime’s when the host brings none', () => {
    // "The runtime's own" is asserted against the runtime rather than against a hard-coded string,
    // which is what keeps this green on a machine whose default locale is not this one.
    const runtime = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(1.5);
    expect(resolveWorkspaceLabels().density.readout(1.5)).toBe(`γ ${runtime}`);
    expect(DEFAULT_WORKSPACE_CHROME_LABELS.density.readout(1.5)).toBe(`γ ${runtime}`);
    // And the locale reaches the contract THROUGH the resolver, with an override still applied over it.
    expect(resolveWorkspaceLabels(undefined, 'pt-BR').density.readout(1.5)).toBe('γ 1,5');
    expect(resolveWorkspaceLabels({ dismiss: 'Fechar' }, 'pt-BR').dismiss).toBe('Fechar');
    expect(resolveWorkspaceLabels({ dismiss: 'Fechar' }, 'pt-BR').density.readout(1.5)).toBe('γ 1,5');
  });

  it('names the member when one is returned to concatenation, and goes quiet when it is formatted', () => {
    // DISCRIMINATION PROOF, served from memory. The mutant is the code that shipped: a fixed noun
    // with a number glued to the front of it.
    const regressed: WorkspaceChromeLabels = {
      ...en,
      state: (symbol, timeframe, panes) => `${symbol} · ${timeframe} · ${panes} panes`,
    };
    expect(concatenating(regressed)).toEqual(['state']);
    expect(concatenating({ ...regressed, state: en.state })).toEqual([]);
  });
});
