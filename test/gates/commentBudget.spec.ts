import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { codeLines, collectMarkdown, collectSources, commentsOf, type Source } from './sourceScan';

/**
 * LMC-74 — the comment budget, and the pointer that has to lead somewhere.
 *
 * THE REASONING MOVES, IT DOES NOT DIE. These comments are not noise: they record alternatives that
 * measurement knocked down, and deleting one makes the next person repeat the mistake it prevented.
 * So the long half goes to `docs/`, the code keeps one line and a pointer, and the same text serves
 * the teaching documentation the package did not have.
 *
 * TWO CEILINGS, AND THE SECOND IS THE ONE THAT MATTERS. The aggregate is 0.20 comment lines per code
 * line across `src/`. On its own an average hides the defect: measured on 2026-08-14, `src/` sat at
 * 0.479 while `react/surface/chartHandles.ts` sat at 7.40 — five lines of code under thirty-seven of
 * prose. The distribution is the disease, so no single file may pass `1.0`, whatever the mean says.
 *
 * AND THE POINTER IS CHECKED, not trusted. A comment that says "see docs/explanation/port.md#seam" and no such
 * heading exists is worse than no comment: it costs the reader a search and ends in nothing. Every
 * `docs/<file>.md#<anchor>` written in `src/` is resolved here against the file AND the heading.
 */

const LIB_ROOT = join(__dirname, '..', '..');
const SRC = join(LIB_ROOT, 'src');
const DOCS = join(LIB_ROOT, 'docs');

/** AD-011, ratified by the owner: the aggregate, and the per-file cap the aggregate cannot see. */
const AGGREGATE_CEILING = 0.2;
const FILE_CEILING = 1.0;

interface Measured {
  readonly file: string;
  readonly comments: number;
  readonly code: number;
  readonly ratio: number;
}

function measure(source: Source): Measured {
  const comments = commentsOf(source.text).length;
  const code = codeLines(source.text);
  return { file: source.file, comments, code, ratio: code === 0 ? comments : comments / code };
}

const round = (value: number): string => value.toFixed(2);

const report = (row: Measured): string =>
  `FAIL ${row.file} :: comment/code measured=${round(row.ratio)} ceiling=${round(FILE_CEILING)}` +
  ` (${row.comments} comment lines over ${row.code} of code)`;

const totalsOf = (rows: readonly Measured[]): { comments: number; code: number } =>
  rows.reduce((acc, row) => ({ comments: acc.comments + row.comments, code: acc.code + row.code }), {
    comments: 0,
    code: 0,
  });

/**
 * The aggregate verdict, as a SENTENCE, over any set of measured files.
 *
 * Reported as a sentence rather than a bare comparison: a red `expect(0.2431).toBeLessThan(0.2)`
 * says the number is wrong and nothing about how far, and the two counts are what a reader needs in
 * order to decide which file to open next. It takes the rows as an argument so the ceiling can be
 * measured against its OWN sentence, on synthetic files, through this exact code — see below.
 */
function aggregateVerdict(rows: readonly Measured[]): string {
  const totals = totalsOf(rows);
  const ratio = totals.comments / totals.code;
  return ratio <= AGGREGATE_CEILING
    ? 'under'
    : `FAIL src :: aggregate comment/code measured=${ratio.toFixed(4)} ceiling=${AGGREGATE_CEILING}` +
        ` (${totals.comments} comment lines over ${totals.code} of code)`;
}

/** Comment lines over code lines, as a file — the stimulus the ceiling is measured with. */
const synthetic = (comments: number, code: number): Source => ({
  file: `synthetic/Aggregate-${comments}-over-${code}.ts`,
  text: [
    ...Array.from({ length: comments }, (_, index) => `// reason ${index}`),
    ...Array.from({ length: code }, (_, index) => `export const s${index} = ${index};`),
  ].join('\n'),
});

const sources = collectSources(SRC);
const measured = sources.map(measure);

/**
 * The population, walked a SECOND time and by another route.
 *
 * A CEILING IS TWO FACTS, AND ONLY ONE OF THEM WAS PINNED. The number was checked against its own
 * sentence; the SET it is measured over was not, and `sources.length >= 80` is an order of
 * magnitude, not a set. Measured 2026-08-14: a planted file with 4000 comment lines over 4000 of
 * code — ratio exactly one, so under the per-file cap — pushed the aggregate to 0.4342 and failed
 * correctly; adding `.filter((s) => !s.file.startsWith('react/surface/'))` to the line above made
 * the same tree green again. One line of exemption, and the gate answers a question about whatever
 * is left.
 *
 * So this is a deliberate second reading of the same rule — `.ts` and `.tsx`, recursive, no
 * filter — written here rather than imported, because a filter applied to the shared collector is
 * exactly one of the two edits it has to see.
 */
function everySourceFile(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry): string[] => {
    const rel = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return everySourceFile(join(dir, entry.name), `${rel}/`);
    return /\.tsx?$/.test(entry.name) ? [rel] : [];
  });
}
const totals = totalsOf(measured);
const aggregate = totals.comments / totals.code;
const over = measured.filter((row) => row.ratio > FILE_CEILING);

/**
 * Every `docs/…#anchor` a comment in `src/` points at.
 *
 * Read out of COMMENTS ONLY. A path inside a string is data the code uses; a path inside prose is a
 * promise made to a reader, and only the second one can dangle.
 */
const POINTER = /docs\/([\w./-]+)\.md(?:#([\w-]+))?/g;

interface Pointer {
  readonly from: string;
  readonly line: number;
  readonly doc: string;
  readonly anchor: string | null;
}

const pointers: readonly Pointer[] = sources.flatMap((source) =>
  commentsOf(source.text).flatMap((comment) => {
    POINTER.lastIndex = 0;
    const found: Pointer[] = [];
    let match = POINTER.exec(comment.text);
    while (match !== null) {
      found.push({
        from: source.file,
        line: comment.line,
        doc: `${match[1]}.md`,
        anchor: match[2] ?? null,
      });
      match = POINTER.exec(comment.text);
    }
    return found;
  }),
);

/**
 * GitHub's heading slug, which is the rule a reader's browser will apply: lowercase, punctuation
 * dropped, spaces to hyphens. Inventing our own would make the gate green on links that 404.
 */
const slug = (heading: string): string =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');

function anchorsOf(doc: string): readonly string[] {
  const path = join(DOCS, doc);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => /^#{1,6}\s+\S/.test(line))
    .map((line) => slug(line.replace(/^#{1,6}\s+/, '')));
}

const dangling = pointers.filter((pointer) => {
  if (!existsSync(join(DOCS, pointer.doc))) return true;
  return pointer.anchor !== null && !anchorsOf(pointer.doc).includes(pointer.anchor);
});

describe('LMC-74 — the comment budget', () => {
  it('reads the real tree, so that a green gate is not a gate over nothing', () => {
    // Positive control: many files, real code in them, and real comments to weigh.
    expect(sources.length).toBeGreaterThanOrEqual(80);
    expect(totals.code).toBeGreaterThan(5000);
    expect(totals.comments).toBeGreaterThan(500);
  });

  it('weighs EVERY file under src/, so no exemption can be slipped between the walk and the sum', () => {
    // The set, not its size. See `everySourceFile` for the one-line exemption this refuses.
    expect(measured.map((row) => row.file).sort()).toEqual(everySourceFile(SRC).sort());
    // CONTROL POSITIVE on the second reading: it found the tree on its own, and it found the file
    // the measured exemption named — so the equality above is two real lists, not two empty ones.
    expect(everySourceFile(SRC).length).toBeGreaterThanOrEqual(80);
    expect(everySourceFile(SRC).some((file) => file.startsWith('react/surface/'))).toBe(true);
  });

  it(`holds the aggregate at or under ${AGGREGATE_CEILING}`, () => {
    expect(aggregateVerdict(measured)).toBe('under');
  });

  it('measures the AGGREGATE cap against its own sentence: 0.20 passes and 0.21 does not', () => {
    // L-051 — a value in a layered configuration has to be checked against what it is SUPPOSED to
    // be, through the predicate that uses it. The per-file cap has had a case of this shape since
    // the one below it; the aggregate had nothing, so raising it from 0.20 to 0.50 left this file
    // green and the gate answering a question nobody had asked.
    //
    // TWO FILES, NOT ONE, on purpose: the aggregate is a SUM, and a stimulus made of one file would
    // pass just as well against a predicate that only ever read the first row.
    const at = [measure(synthetic(5, 50)), measure(synthetic(15, 50))];
    const past = [measure(synthetic(5, 50)), measure(synthetic(16, 50))];
    expect(totalsOf(at)).toEqual({ comments: 20, code: 100 });
    expect(aggregateVerdict(at)).toBe('under');
    expect(aggregateVerdict(past)).toBe(
      'FAIL src :: aggregate comment/code measured=0.2100 ceiling=0.2 (21 comment lines over 100 of code)',
    );
    // AND THE NUMBER ITSELF, so a reader knows where 0.20 comes from rather than inferring it from
    // the cases above: AD-011, ratified by the owner, in `.specs/STATE.md`.
    expect(AGGREGATE_CEILING).toBe(0.2);
  });

  it('lets no single file past 1.0 — the distribution is the defect, not the mean', () => {
    expect(over.map(report)).toEqual([]);
  });

  it('a planted file over the cap fails naming the file and the ratio; trimmed, it passes', () => {
    // DISCRIMINATION PROOF, served from memory. The two stimuli differ only in how much prose sits
    // over the same four lines of code, which is precisely the quantity the cap is about.
    const code = ['export function f(): number {', '  const x = 1;', '  return x;', '}'];
    const fat: Source = {
      file: 'synthetic/Fat.ts',
      text: [...Array.from({ length: 5 }, (_, i) => `// reason ${i}`), ...code].join('\n'),
    };
    expect(measure(fat).ratio).toBeGreaterThan(FILE_CEILING);
    expect(report(measure(fat))).toBe(
      'FAIL synthetic/Fat.ts :: comment/code measured=1.25 ceiling=1.00 (5 comment lines over 4 of code)',
    );
    const trimmed: Source = {
      file: 'synthetic/Trimmed.ts',
      text: ['// reason. See docs/explanation/port.md#the-seam.', ...code].join('\n'),
    };
    expect(measure(trimmed).ratio).toBeLessThanOrEqual(FILE_CEILING);
  });

  it('measures the cap against its own sentence: 1.00 passes and 1.01 does not', () => {
    // L-048 — a declared limit has to be derived from what the predicate does. Four lines of code
    // under four of comment is EXACTLY the cap and is allowed; the fifth line is what breaks it.
    const code = ['export const a = 1;', 'export const b = 2;', 'export const c = 3;', 'const d = 4;'];
    const at = { file: 'synthetic/At.ts', text: [...Array.from({ length: 4 }, (_, i) => `// ${i}`), ...code].join('\n') };
    const past = { file: 'synthetic/Past.ts', text: [...Array.from({ length: 5 }, (_, i) => `// ${i}`), ...code].join('\n') };
    expect(measure(at).ratio).toBe(FILE_CEILING);
    expect([measure(at), measure(past)].filter((row) => row.ratio > FILE_CEILING).map((r) => r.file)).toEqual([
      'synthetic/Past.ts',
    ]);
  });

  it('counts a block comment line by line, so one giant docblock cannot hide inside one line', () => {
    // The metric is LINES, not comment nodes. Counting nodes would price a forty-line docblock the
    // same as `// x`, and every file could buy headroom by merging its prose into one comment.
    const block: Source = {
      file: 'synthetic/Block.ts',
      text: ['/**', ' * one', ' * two', ' * three', ' */', 'export const a = 1;'].join('\n'),
    };
    expect(measure(block)).toEqual({ file: 'synthetic/Block.ts', comments: 5, code: 1, ratio: 5 });
  });
});

describe('LMC-74 — the relocated reasoning is reachable', () => {
  it('`docs/` exists and carries the reasoning, rather than being an empty promise', () => {
    expect(existsSync(DOCS)).toBe(true);
    const written = collectMarkdown(DOCS).map((doc) => doc.file);
    expect(written.length).toBeGreaterThanOrEqual(10);
    // Substance, measured: a document that is only headings relocated nothing.
    const lines = written.reduce(
      (total, name) => total + readFileSync(join(DOCS, name), 'utf8').split('\n').length,
      0,
    );
    expect(lines).toBeGreaterThan(1500);
  });

  it('every pointer written in `src/` resolves to a document AND to a heading in it', () => {
    expect(pointers.length).toBeGreaterThan(40);
    expect(
      dangling.map((p) => `FAIL ${p.from}:${p.line} :: docs/${p.doc}#${p.anchor ?? ''} does not exist`),
    ).toEqual([]);
  });

  it('a pointer at a missing document, and one at a missing heading, both fail', () => {
    // DISCRIMINATION PROOF for the resolver: file and anchor are two separate ways to dangle, and a
    // check that only opened the file would pass every wrong `#anchor` in the tree.
    const real = pointers[0];
    expect(existsSync(join(DOCS, real.doc))).toBe(true);
    expect(anchorsOf('does-not-exist.md')).toEqual([]);
    expect(anchorsOf(real.doc).includes('a-heading-nobody-wrote')).toBe(false);
    // And the slug is GitHub's, not one of our own: that is the rule the reader's browser applies.
    // Punctuation is dropped, spaces become hyphens, and the case is folded — so a heading with a
    // comma in it still resolves, which a naive `toLowerCase().replace(' ', '-')` would not.
    expect(slug('The seam, and why it is a seam')).toBe('the-seam-and-why-it-is-a-seam');
    expect(slug('Eviction order (measured)')).toBe('eviction-order-measured');
  });
});
