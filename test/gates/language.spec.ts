import { join } from 'path';
import * as ts from 'typescript';
import { collectSources, commentsOf, type Source } from './sourceScan';

/**
 * LMC-75 — the library is monolingual in English, and the gate keeps it that way.
 *
 * A community package whose reasoning is only legible to Portuguese speakers excludes the very
 * contributor it means to attract, and its diagnostics are read by someone staring at a red build.
 * So comment, docstring, test name and diagnostic are English — measured, not promised.
 *
 * WHAT THIS GATE COVERS, AND WHY EACH PART IS CUT WHERE IT IS:
 *
 *   comments, in `src/` and `test/`  — a comment IS prose; no threshold applies to it
 *   prose strings in `test/`         — a test title, a report line, an allowlist reason
 *   diagnostics in `src/`            — `console.*` arguments and thrown `Error` messages
 *
 * WHAT IT DELIBERATELY DOES NOT COVER: product text — the words the library PAINTS. Screen language
 * belongs to whoever adopts the package, which is why the chrome ships an English default plus a
 * `chrome.labels` channel a host overrides wholesale. One consequence is named rather than hidden:
 * `src/indicator/coverage.ts` still builds its footer report in Portuguese (`velas`, `SEM DADO: …`)
 * because the app asserts that exact text and no label channel reaches it yet.
 *
 * THE WORD FLOOR IS THE LINE BETWEEN PROSE AND LABEL. One or two words is a token, a key or a
 * caption — the lexicon below is made of them. Prose is a sentence. Without the floor this file
 * would report its own dictionary, and the only way out would be exempting the gate from itself,
 * which is a hole shaped exactly like the thing being guarded.
 *
 * AND WHERE NON-ENGLISH IS ON PURPOSE, IT IS DECLARED AT THE SITE. A fixture proving a host can
 * write its own words is worthless written in the default language, and a test asserting product
 * text has to quote that text as it ships. Those lines carry `non-english-fixture: <reason>`, in the
 * shape this repository already uses for `biome-ignore` — the exemption sits next to the string it
 * excuses, where a reviewer reads it, instead of in a path list nobody opens.
 */

const LIB_ROOT = join(__dirname, '..', '..');
const SRC = join(LIB_ROOT, 'src');
const TEST_DIR = join(LIB_ROOT, 'test');

/** Below this, a string is a label or a key. At or above it, it is a sentence. */
const PROSE_WORD_FLOOR = 3;

/** A declared exemption needs a written reason; twenty characters is a sentence, not a shrug. */
const FIXTURE_MARKER = /non-english-fixture:\s*(\S.{19,})/;

/**
 * Portuguese function words that are NOT also English words.
 *
 * A LEXICON, NOT A SPELLING LIST. Diacritics alone miss `que`, `nao`, `pelo`, `isso` — a whole
 * Portuguese sentence can be written without a single accent, and a rule that only looked for
 * accents would call it English. Homographs are excluded on purpose: `no`, `do`, `as`, `a`, `era`,
 * `com` and `para` all read as ordinary English, and including any of them turns a URL or a plain
 * sentence into a false failure. One word per entry keeps every one of them under the word floor,
 * so this dictionary does not report itself.
 */
const LEXICON: ReadonlySet<string> = new Set([
  'que', 'não', 'nao', 'uma', 'umas', 'uns', 'pelo', 'pela', 'pelos', 'pelas', 'dos', 'das',
  'da', 'na', 'nas', 'nos', 'ao', 'aos',
  'isso', 'isto', 'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas',
  'aquele', 'aquela', 'aquilo', 'quando', 'porque', 'também', 'até', 'entre', 'sem',
  'seu', 'sua', 'seus', 'suas', 'ele', 'ela', 'eles', 'elas', 'foi', 'são', 'eram',
  'tem', 'têm', 'ter', 'ser', 'está', 'estão', 'sendo', 'faz', 'fazer', 'cada',
  'mesmo', 'mesma', 'mesmos', 'mesmas', 'outro', 'outra', 'outros', 'outras',
  'todo', 'toda', 'todos', 'todas', 'muito', 'muita', 'muitos', 'muitas', 'pouco', 'pouca',
  'nunca', 'sempre', 'agora', 'depois', 'antes', 'onde', 'quem', 'qual', 'quais', 'quanto',
  'quantos', 'então', 'assim', 'ainda', 'aqui', 'ali', 'mais', 'menos', 'bem',
  'coisa', 'vez', 'vezes', 'lugar', 'arquivo', 'linha', 'linhas', 'nome', 'nomes',
  'número', 'números', 'caso', 'casos', 'mas', 'como', 'sobre', 'contra', 'desde', 'durante',
  'enquanto', 'embora', 'porém', 'portanto', 'além', 'através', 'dentro', 'fora', 'acima', 'abaixo',
  'nada', 'nenhum', 'nenhuma', 'algum', 'alguma', 'alguns', 'algumas', 'qualquer',
  'próprio', 'própria', 'já', 'só', 'primeiro', 'primeira', 'segunda', 'terceiro', 'última',
  'último', 'código', 'teste', 'testes', 'árvore', 'camada', 'regra', 'medida', 'medido',
  'biblioteca', 'fosse', 'seja', 'sejam', 'tinha', 'havia', 'houve', 'fica', 'ficam', 'ficar',
  'passa', 'passam', 'passar', 'volta', 'voltar', 'nós', 'nosso', 'nossa', 'você', 'vocês',
  'precisa', 'precisam', 'deve', 'devem', 'pode', 'podem', 'quer', 'querem', 'sabe', 'sabem',
  'numa', 'num', 'nele', 'nela', 'neles', 'nelas', 'disso', 'desse', 'dessa', 'daquele',
  'vão', 'vem', 'vêm', 'dão', 'fez', 'fazem', 'diz', 'dizem', 'leem', 'veem',
]);

/**
 * The three stimuli, gathered.
 *
 * They live here because they are the only Portuguese this file is allowed to contain, and keeping
 * them together makes that reviewable at a glance instead of scattered through the suite. Each is a
 * single template literal so that the marker above it covers the whole declaration: a marker excuses
 * the line it sits on and the one below, which is deliberately too narrow to excuse a block by
 * accident.
 */
// non-english-fixture: a comment and two titles, the three shapes the sweep has to catch
const PLANTED_PT = `/** O teto existe porque o arquivo anterior tinha 1720 linhas. */
describe('o gate reprova o arquivo que cresce', () => {
  it('reprova quando a soma passa do teto', () => {});
});`;

// non-english-fixture: two diagnostics and a product string, to prove the call position decides
const DIAGNOSTIC_PT = `console.warn('faltou nome');
throw new RangeError(\`o valor \${x} saiu da faixa\`);
const footer = \`\${n} velas na janela\`;`;

// non-english-fixture: a marked corpus and one loose entry after it, to measure the marker's reach
const CORPUS_PT = `// non-english-fixture: a recorded corpus, whose names are pinned to a fixture
const CASES = [
  'reprova o primeiro caso',
  'reprova o segundo caso',
];
const LOOSE = 'reprova o caso solto';`;

// non-english-fixture: a title behind `.only` and one behind `.each`, which a naive read misses
const DECORATED_PT = `describe.only('a raiz não monta sem catálogo', () => {});
it.each([1])('reprova o caso %i', () => {});`;

// non-english-fixture: two table labels under the word floor, which only the reachability read sees
const TABLE_PT = `const CASES = [
  ['nada salvo', 1],
  ['versão ausente', 2],
];
it.each(CASES.map(([name], at) => [name, at] as const))('reads it: %s', () => {});`;

/** Marks Portuguese writes and English prose does not. */
const DIACRITIC = /[ãõçáéíóúâêôàÃÕÇÁÉÍÓÚÂÊÔÀ]/;

/**
 * Backticked spans are removed before the test, because what sits between backticks is QUOTED, not
 * written. An English sentence explaining that a host may pass `Mover {pane} para cima` is English.
 */
function isPortuguese(text: string): boolean {
  const prose = text.replace(/`[^`]*`/g, ' ');
  if (DIACRITIC.test(prose)) return true;
  return (prose.toLowerCase().match(/[a-zà-ú]+/g) ?? []).some((word) => LEXICON.has(word));
}

const wordCount = (text: string): number => (text.trim().match(/\S+/g) ?? []).length;

interface Hit {
  readonly file: string;
  readonly line: number;
  readonly kind: 'comment' | 'prose' | 'diagnostic';
  readonly text: string;
}

const report = (hit: Hit): string =>
  `FAIL ${hit.file}:${hit.line} :: ${hit.kind} is not in English — "${hit.text}"`;

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

type TextNode =
  | ts.StringLiteral
  | ts.NoSubstitutionTemplateLiteral
  | ts.TemplateHead
  | ts.TemplateMiddle
  | ts.TemplateTail
  | ts.JsxText;

function isTextNode(node: ts.Node): node is TextNode {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node) ||
    ts.isJsxText(node)
  );
}

/**
 * A diagnostic is text the library HANDS TO A DEVELOPER when something is wrong.
 *
 * Asked as a question about the call, not about the spelling: is this string an argument to a
 * console channel, or the message of an error being constructed? Both answers survive the writer
 * choosing a template literal or concatenation instead of a plain string.
 *
 * `TemplateSpan` is in the walk because it is the step a naive read misses. A tail's parent is NOT
 * the template — it is the span that pairs it with an interpolation — so a guard that only stepped
 * through `TemplateExpression` saw the HEAD of an interpolated error message and went blind to
 * everything after the first `${`, which is exactly where the sentence usually is. Measured on
 * `DIAGNOSTIC_PT` below: with the span missing, line 2 survived and the clause read green.
 */
function isDiagnosticArgument(node: ts.Node): boolean {
  let current: ts.Node = node;
  while (current.parent !== undefined && !ts.isSourceFile(current.parent)) {
    const parent: ts.Node = current.parent;
    if (ts.isNewExpression(parent) || ts.isCallExpression(parent)) {
      const callee = parent.expression;
      if (ts.isIdentifier(callee) && /Error$/.test(callee.text)) return true;
      return (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'console'
      );
    }
    if (ts.isTemplateSpan(parent) || ts.isTemplateExpression(parent) || ts.isBinaryExpression(parent)) {
      current = parent;
      continue;
    }
    return false;
  }
  return false;
}

const TITLE_CALLERS = new Set(['describe', 'it', 'test']);

/** A test title: the first argument of `describe`, `it` or `test`, `.each` and `.only` included. */
function isTestTitle(node: ts.Node): boolean {
  const call = node.parent;
  if (call === undefined || !ts.isCallExpression(call) || call.arguments[0] !== node) return false;
  let callee: ts.Node = call.expression;
  while (ts.isPropertyAccessExpression(callee) || ts.isCallExpression(callee)) {
    callee = callee.expression;
  }
  return ts.isIdentifier(callee) && TITLE_CALLERS.has(callee.text);
}

/**
 * THE QUESTION IS "DOES THIS LITERAL BECOME A TEST NAME", NOT "WHICH SHAPE IS IT WRITTEN IN".
 *
 * Reading CALL POSITION alone — the first argument of `it` — is what let 64 lines of Portuguese sit
 * in this package unseen. A table-driven case carries its name as an ARRAY ENTRY, and `.each` then
 * spreads that entry into the title: `it.each(CASES.map(…))('reads it: %s')` prints the entry, so
 * the entry IS the test name, and it is the first thing a contributor reads when something fails.
 *
 * The fix is not a sixth shape bolted onto a list of five. A list loses to TypeScript — the table can
 * be an inline array, a named constant, a projection of one, a tagged template, or a constant built
 * from another constant, and every list written against those runs out of date on the next one. So
 * the gate asks the question directly and answers it by REACHABILITY: seed with the expressions that
 * feed a title (the title argument itself, and every `.each` table on the callee chain), then follow
 * identifiers to their declarations until nothing new is reached. Whatever string sits in that
 * closure can land in a test name.
 *
 * IT OVER-APPROXIMATES ON PURPOSE, AND ONLY IN THE SAFE DIRECTION. A payload deep inside a case row
 * may never be printed, yet it is reported anyway. The cost of that is one more English string; the
 * cost of the opposite error is a Portuguese test name shipping unseen, which is the defect being
 * fixed. Where a row genuinely has to stay in another language, the exemption marker says so at the
 * site with a written reason — the same escape hatch every other clause in this file uses.
 */
function testNameLiterals(parsed: ts.SourceFile): ReadonlySet<ts.Node> {
  const declared = new Map<string, ts.Expression>();
  const index = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      declared.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, index);
  };
  index(parsed);

  const seeds: ts.Node[] = [];
  const seed = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      let callee: ts.Node = node.expression;
      const tables: ts.Node[] = [];
      while (
        ts.isPropertyAccessExpression(callee) ||
        ts.isCallExpression(callee) ||
        ts.isTaggedTemplateExpression(callee)
      ) {
        if (ts.isTaggedTemplateExpression(callee)) {
          tables.push(callee.template);
          callee = callee.tag;
          continue;
        }
        if (
          ts.isCallExpression(callee) &&
          ts.isPropertyAccessExpression(callee.expression) &&
          callee.expression.name.text === 'each'
        ) {
          tables.push(...callee.arguments);
        }
        callee = callee.expression;
      }
      if (ts.isIdentifier(callee) && TITLE_CALLERS.has(callee.text)) {
        if (node.arguments[0] !== undefined) seeds.push(node.arguments[0]);
        seeds.push(...tables);
      }
    }
    ts.forEachChild(node, seed);
  };
  seed(parsed);

  const literals = new Set<ts.Node>();
  const reached = new Set<ts.Node>();
  const followed = new Set<string>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const root = queue.pop() as ts.Node;
    if (reached.has(root)) continue;
    reached.add(root);
    const absorb = (node: ts.Node): void => {
      if (isTextNode(node)) literals.add(node);
      if (ts.isIdentifier(node) && !followed.has(node.text)) {
        followed.add(node.text);
        const initialiser = declared.get(node.text);
        if (initialiser !== undefined) queue.push(initialiser);
      }
      ts.forEachChild(node, absorb);
    };
    absorb(root);
  }
  return literals;
}

/**
 * The marker excuses THE DECLARATION IT PRECEDES, and nothing beyond it.
 *
 * Scoped by the compiler, not by counting lines. A recorded corpus is twenty entries of one array,
 * and a per-line marker would mean twenty copies of one reason — so the exemption is attached to the
 * statement that starts on the line below the marker, and ends where that statement ends. A marker
 * with no statement under it falls back to its own line and the next, which is what makes it usable
 * above a single assertion without turning into a licence for the rest of the file.
 */
function excusedRanges(parsed: ts.SourceFile, lines: readonly string[]): readonly [number, number][] {
  const lineOf = (position: number): number =>
    parsed.getLineAndCharacterOfPosition(position).line + 1;
  const statements: ts.Node[] = [];
  const collect = (node: ts.Node): void => {
    if (ts.isStatement(node) || ts.isPropertyAssignment(node)) statements.push(node);
    ts.forEachChild(node, collect);
  };
  collect(parsed);
  return lines.flatMap((text, index): [number, number][] => {
    if (!FIXTURE_MARKER.test(text)) return [];
    const marker = index + 1;
    const owned = statements
      .filter((node) => lineOf(node.getStart(parsed)) === marker + 1)
      .sort((a, b) => b.end - b.getStart(parsed) - (a.end - a.getStart(parsed)));
    const widest = owned[0];
    return [
      widest === undefined
        ? [marker, marker + 1]
        : [marker, lineOf(widest.getEnd())],
    ];
  });
}

const within = (ranges: readonly [number, number][], line: number): boolean =>
  ranges.some(([from, to]) => line >= from && line <= to);

function hitsIn(source: Source, root: 'src' | 'test'): Hit[] {
  const lines = source.text.split('\n');
  const parsedForRanges = parse(source.file, source.text);
  const ranges = excusedRanges(parsedForRanges, lines);
  const found: Hit[] = [];
  for (const comment of commentsOf(source.text)) {
    if (isPortuguese(comment.text) && !within(ranges, comment.line)) {
      found.push({
        file: source.file,
        line: comment.line,
        kind: 'comment',
        text: comment.text.trim().slice(0, 110),
      });
    }
  }
  const parsed = parse(source.file, source.text);
  const named = testNameLiterals(parsed);
  const visit = (node: ts.Node): void => {
    if (isTextNode(node)) {
      const value = node.text;
      const diagnostic = root === 'src' && isDiagnosticArgument(node);
      // The word floor does not apply to a NAME. A two-word label is a caption when it sits in a
      // constant and a sentence when the runner prints it as the title of a failing case.
      const prose =
        root === 'test' &&
        (isTestTitle(node) || named.has(node) || wordCount(value) >= PROSE_WORD_FLOOR);
      const line = parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1;
      if ((diagnostic || prose) && isPortuguese(value) && !within(ranges, line)) {
        found.push({
          file: source.file,
          line,
          kind: diagnostic ? 'diagnostic' : 'prose',
          text: value.trim().slice(0, 110),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return found;
}

const sources: readonly (readonly [Source, 'src' | 'test'])[] = [
  ...collectSources(SRC).map((s) => [s, 'src'] as const),
  ...collectSources(TEST_DIR).map((s) => [{ ...s, file: `test/${s.file}` }, 'test'] as const),
];
const hits: readonly Hit[] = sources.flatMap(([source, root]) => hitsIn(source, root));

/** Every declared exemption in the tree, with the line that carries it. */
const markers: readonly { file: string; line: number; reason: string }[] = sources.flatMap(
  ([source]) =>
    source.text
      .split('\n')
      .map((text, index) => ({ file: source.file, line: index + 1, hit: FIXTURE_MARKER.exec(text) }))
      .filter((row) => row.hit !== null)
      .map((row) => ({ file: row.file, line: row.line, reason: (row.hit as RegExpExecArray)[1] })),
);

describe('LMC-75 — the library speaks one language, and it is English', () => {
  it('reads the real tree, so that a green gate is not a gate over nothing', () => {
    // Positive control: the sweep sees both halves of the package, and sees comments in them.
    expect(sources.filter(([, root]) => root === 'src').length).toBeGreaterThanOrEqual(80);
    expect(sources.filter(([, root]) => root === 'test').length).toBeGreaterThanOrEqual(80);
    expect(sources.filter(([s]) => commentsOf(s.text).length > 0).length).toBeGreaterThanOrEqual(80);
  });

  it('no comment, test name, docstring or diagnostic is in another language', () => {
    expect(hits.map(report)).toEqual([]);
  });

  it('a planted Portuguese line fails, and the same line translated passes', () => {
    // DISCRIMINATION PROOF, served from memory — never written to disk. A violator on disk would be
    // caught by the sweep above, which would prove the tree is dirty rather than that this predicate
    // can tell one language from the other.
    // non-english-fixture: the sensor's own stimulus — a violator has to be a real violation
    const planted = { file: 'synthetic/Planted.ts', text: PLANTED_PT };
    // The expected lines are DERIVED from the stimulus, not retyped beside it. Retyping would make
    // this file carry the same Portuguese twice, and the second copy is the one that rots.
    const [header] = PLANTED_PT.split('\n');
    const titles = (PLANTED_PT.match(/'([^']+)'/g) ?? []).map((quoted) => quoted.slice(1, -1));
    expect(titles).toHaveLength(2);
    expect(hitsIn(planted, 'test').map(report)).toEqual([
      `FAIL synthetic/Planted.ts:1 :: comment is not in English — "${header}"`,
      `FAIL synthetic/Planted.ts:2 :: prose is not in English — "${titles[0]}"`,
      `FAIL synthetic/Planted.ts:3 :: prose is not in English — "${titles[1]}"`,
    ]);
    const translated: Source = {
      file: 'synthetic/Translated.ts',
      text: [
        '/** The ceiling exists because the previous file ran to 1720 lines. */',
        "describe('the gate fails a file that grows', () => {",
        "  it('fails when the sum passes the ceiling', () => {});",
        '});',
      ].join('\n'),
    };
    expect(hitsIn(translated, 'test')).toEqual([]);
  });

  it('catches Portuguese with no accent in it at all', () => {
    // The accent-free sentence is the case a spelling rule cannot see, and the reason the lexicon
    // exists. Every word in the stimulus below is plain ASCII.
    // non-english-fixture: accent-free Portuguese, which is what the lexicon exists to catch
    const flat: Source = { file: 'synthetic/Flat.ts', text: '// O leitor deve ler o arquivo todo.' };
    expect(hitsIn(flat, 'src').length).toBe(1);
  });

  it('does not flag English that quotes a Portuguese label, or an English homograph', () => {
    // NEGATIVE CONTROL. Backticked text is quoted, not written; and `no`, `do`, `as`, `era`, `com`
    // and `para` are ordinary English, so a URL and a plain sentence must stay silent.
    const english: Source = {
      file: 'synthetic/English.ts',
      text: [
        '// A host may hand in `Mover {pane} para cima`, and the default stays out of the way.',
        '// See https://github.com/example/repo, do not edit, as the era of that fix has passed.',
        "describe('the parameters it takes', () => {});",
      ].join('\n'),
    };
    expect(hitsIn(english, 'test')).toEqual([]);
  });

  it('the word floor separates a label from a sentence, in both directions', () => {
    // THE THRESHOLD, MEASURED AGAINST ITS OWN SENTENCE. A two-word host label is a caption and stays
    // out; three words is a sentence and comes in. Raising the floor would let a short Portuguese
    // title through; dropping it would make this file report its own dictionary.
    // non-english-fixture: the two stimuli that sit either side of the floor being measured
    const [labelText, sentenceText] = ['Panes visíveis', 'reprova o arquivo'];
    expect(hitsIn({ file: 'synthetic/Label.ts', text: `const x = '${labelText}';` }, 'test')).toEqual(
      [],
    );
    expect(
      hitsIn({ file: 'synthetic/Sentence.ts', text: `const x = '${sentenceText}';` }, 'test').length,
    ).toBe(1);
    expect(wordCount(labelText)).toBe(PROSE_WORD_FLOOR - 1);
    expect(wordCount(sentenceText)).toBe(PROSE_WORD_FLOOR);
  });

  it('a diagnostic in `src` is caught however short it is, and product text is not', () => {
    // The floor does not apply to a diagnostic: a two-word `console.warn` is still the sentence a
    // developer reads with a red build. What the floor does not reach is product text, which is the
    // host's language to choose — the footer report is the live example.
    // non-english-fixture: two diagnostics and one product string, told apart by call position
    const diagnostic: Source = { file: 'synthetic/Diagnostic.ts', text: DIAGNOSTIC_PT };
    expect(hitsIn(diagnostic, 'src').map((h) => `${h.line}:${h.kind}`)).toEqual([
      '1:diagnostic',
      '2:diagnostic',
    ]);
    // THE SAME THREE LINES READ AS `test/`, and the answer INVERTS on two of them. There the short
    // console message drops below the floor and goes quiet, while the footer — which `src/` let
    // through as product text — becomes prose and is caught. The two roots ask different questions
    // of identical text, and this is the clause that proves they do.
    expect(
      hitsIn({ ...diagnostic, file: 'test/synthetic/Diagnostic.ts' }, 'test').map(
        (h) => `${h.line}:${h.kind}`,
      ),
    ).toEqual(['2:prose', '3:prose']);
  });

  it('reads a title through `.each` and `.only`, which is how a suite hides one', () => {
    // non-english-fixture: a decorated title is still a title, and has to be caught as one
    const decorated: Source = { file: 'synthetic/Decorated.ts', text: DECORATED_PT };
    expect(hitsIn(decorated, 'test').map((h) => h.line)).toEqual([1, 2]);
  });

  it('a table label becomes a test name, and the word floor does not shelter it', () => {
    // THE CLAUSE THE 64 LINES PAID FOR. Both labels are TWO words, so the prose floor cannot see
    // them, and neither sits in call position — they are array entries. What catches them is the
    // reachability read: the array is projected into `.each`, so its entries reach the title.
    const table: Source = { file: 'synthetic/Table.ts', text: TABLE_PT };
    // Derived from the stimulus, never retyped beside it — a second copy is the one that rots.
    const labels = TABLE_PT.split('\n')
      .slice(1, 3)
      .map((row) => (row.match(/'([^']+)'/) as RegExpMatchArray)[1]);
    expect(labels.map(wordCount)).toEqual([PROSE_WORD_FLOOR - 1, PROSE_WORD_FLOOR - 1]);
    expect(hitsIn(table, 'test').map(report)).toEqual([
      `FAIL synthetic/Table.ts:2 :: prose is not in English — "${labels[0]}"`,
      `FAIL synthetic/Table.ts:3 :: prose is not in English — "${labels[1]}"`,
    ]);

    // AND THE SAME TWO LABELS, TRANSLATED, GO QUIET — a rename is the whole remedy.
    expect(
      hitsIn(
        { file: 'synthetic/Translated.ts', text: TABLE_PT.replace(labels[0], 'nothing saved').replace(labels[1], 'version missing') },
        'test',
      ),
    ).toEqual([]);

    // NEGATIVE CONTROL, and it is what proves REACHABILITY carries the weight rather than "any short
    // string in any array". Delete the `.each` line and the very same table stops being reported:
    // nothing reaches a title any more, so the floor rules again and two-word labels are captions.
    const unused: Source = {
      file: 'synthetic/Unused.ts',
      text: TABLE_PT.split('\n').slice(0, -1).join('\n'),
    };
    expect(hitsIn(unused, 'test')).toEqual([]);
  });

  it('every declared exemption carries a written reason, and the marker is what silences it', () => {
    // An exemption with no reason is a suppression under another name, and one that nobody exercises
    // is one nobody tested. Both halves are asserted — and then the marker is REMOVED from a real
    // stimulus, which has to bring the failure back. Otherwise something else was doing the work.
    expect(markers.length).toBeGreaterThan(0);
    for (const marker of markers) expect(marker.reason.trim().length).toBeGreaterThan(19);
    const excusedSource: Source = {
      file: 'synthetic/Excused.ts',
      text: ['// non-english-fixture: the reason has to be long enough to read', PLANTED_PT].join(
        '\n',
      ),
    };
    // The marker sits above a COMMENT, which owns no statement, so it falls back to its own line
    // and the next: line 2 goes quiet and the two titles after it still fail. That fallback is the
    // narrow case, and it is what stops a stray marker from covering the rest of a file.
    expect(hitsIn(excusedSource, 'test').map((h) => h.line)).toEqual([3, 4]);
    // AND THE WIDE CASE, measured against its own sentence: above a declaration the marker reaches
    // the END of that declaration and stops there. The entry after the array is still reported.
    const corpus: Source = { file: 'synthetic/Corpus.ts', text: CORPUS_PT };
    expect(hitsIn(corpus, 'test').map((h) => h.line)).toEqual([6]);
  });
});
