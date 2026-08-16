import { existsSync, readFileSync } from 'fs';
import { join, relative, resolve } from 'path';

import { collectMarkdown, type Source } from './sourceScan';

/**
 * DOC-14, DOC-15 — the two ways a documentation set rots into something nobody reads.
 *
 * ONE: A PAGE THAT OUTRUNS THE READER. A tutorial, a how-to or a reference page is read with a
 * question already in mind, and a page that takes three hundred lines to answer it has lost to the
 * search box before it gets there. The ceiling is not about prose quality — it is about where the
 * answer is allowed to be. Explanation is deliberately outside it: that quadrant is READ WHOLE, by
 * someone who came for the argument, and `react-surface.md` is 739 lines because the argument is
 * that long.
 *
 * NO EXEMPTION LIST, and that is the decision this gate was almost not able to make. The generated
 * `reference/_index.md` listed all 290 symbols and measured 450 lines. Exempting it would have
 * opened an exception for exactly the case the ceiling exists to catch — a 450-line catalogue IS
 * "the reader loses the thread before the answer" — so the index became a map instead and the
 * symbols moved to a page per module. The ceiling has no exemption at all, which is why there is no
 * allowlist below to keep honest.
 *
 * TWO: A DOCUMENT NOBODY CAN REACH. An explanation page that no other page links to is not
 * preserved reasoning, it is a file. It survives every other gate here — it compiles, its pointers
 * resolve, it is under no ceiling — and it is read by nobody. The baseline is EMPTY, measured on
 * 2026-08-15, and it only shrinks: there is no list of accepted orphans because there are none.
 *
 * IT NEEDS NO BROWSER, so it is unconditional in the quality gate.
 */

const LIB_ROOT = resolve(join(__dirname, '..', '..'));
const DOCS = join(LIB_ROOT, 'docs');

/** The three quadrants read with a question in mind. `explanation/` is read whole, and is exempt. */
const CAPPED = ['tutorial/', 'how-to/', 'reference/'];

const CEILING = 300;

/**
 * The documents that may link INTO `docs/`, which is what makes a page reachable.
 *
 * The root three are in because `README.md` is the npm front page: a quadrant it stopped naming
 * would be unreachable for every reader who arrives from the registry, and a check that read only
 * `docs/` would call that fine.
 */
const ROOT_DOCS = ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md'];

/**
 * ORPHANS, MEASURED 2026-08-15: none.
 *
 * The list only shrinks. An entry here would be a document that is knowingly unreachable, and each
 * one would owe a written reason — the same rule every other allowlist in this package follows.
 */
const ORPHAN_BASELINE: readonly string[] = [];

const pagesOf = (): readonly Source[] => [
  ...collectMarkdown(DOCS).map((doc) => ({ ...doc, file: `docs/${doc.file}` })),
  ...ROOT_DOCS.filter((file) => existsSync(join(LIB_ROOT, file))).map((file) => ({
    file,
    text: readFileSync(join(LIB_ROOT, file), 'utf8'),
  })),
];

const lineCount = (text: string): number => text.split('\n').length;

/** `FAIL <path> :: <n> lines, ceiling <CEILING>` — the file and the number, which is the fix. */
function overCeiling(pages: readonly Source[]): readonly string[] {
  return pages
    .filter((page) => CAPPED.some((quadrant) => page.file.startsWith(`docs/${quadrant}`)))
    .filter((page) => lineCount(page.text) > CEILING)
    .map((page) => `FAIL ${page.file} :: ${lineCount(page.text)} lines, ceiling ${CEILING}`)
    .sort();
}

/** Every document any page points at, resolved to a path relative to the package root. */
function reached(pages: readonly Source[]): ReadonlySet<string> {
  const found = new Set<string>();
  for (const page of pages) {
    const from = join(LIB_ROOT, page.file, '..');
    for (const match of page.text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const href = match[1];
      if (/^[a-z]+:/.test(href) || href.startsWith('#')) continue;
      found.add(relative(LIB_ROOT, resolve(from, href.split('#')[0])));
    }
  }
  return found;
}

/** `FAIL <path> :: orphan — no page links to it` for every explanation document nothing reaches. */
function orphans(pages: readonly Source[]): readonly string[] {
  const linked = reached(pages);
  return pages
    .filter((page) => page.file.startsWith('docs/explanation/'))
    .filter((page) => !linked.has(page.file))
    .map((page) => `FAIL ${page.file} :: orphan — no page links to it`)
    .sort();
}

const pages = pagesOf();

describe('DOC-14, DOC-15 — the shape of the documentation set', () => {
  it('reads the real documents, so a green gate is not a gate over nothing', () => {
    // POSITIVE CONTROL. An empty sweep breaks no ceiling and orphans nothing, and every clause
    // below would be green over a directory this file had stopped finding.
    expect(pages.length).toBeGreaterThanOrEqual(70);
    for (const quadrant of CAPPED) {
      expect(pages.filter((page) => page.file.startsWith(`docs/${quadrant}`)).length).toBeGreaterThan(0);
    }
    expect(pages.filter((page) => page.file.startsWith('docs/explanation/')).length).toBeGreaterThanOrEqual(18);
  });

  it('holds tutorial, how-to and reference under 300 lines — with no exemption for the generated index', () => {
    expect(overCeiling(pages)).toEqual([]);
    // The index is IN, and named here so that exempting it later is a visible act rather than a
    // quiet one. It is the page the ceiling was almost bent for.
    const index = pages.find((page) => page.file === 'docs/reference/_index.md');
    expect(index).toBeDefined();
    expect(lineCount(index?.text ?? '')).toBeLessThanOrEqual(CEILING);
  });

  it('leaves explanation uncapped, because that quadrant is read whole', () => {
    // The complement of the clause above, and the reason it is not a blanket rule: the longest
    // argument in the package would fail a ceiling written for pages read with a question in mind.
    const longest = Math.max(
      ...pages.filter((page) => page.file.startsWith('docs/explanation/')).map((page) => lineCount(page.text)),
    );
    expect(longest).toBeGreaterThan(CEILING);
    expect(overCeiling(pages)).toEqual([]);
  });

  it('names file and count when a page outruns the ceiling, and goes quiet when it is trimmed', () => {
    // DISCRIMINATION PROOF, served from memory. A violator on disk would prove the tree is bad
    // rather than that this predicate can tell a long page from a short one.
    const inflated: Source = {
      file: 'docs/how-to/synthetic-inflated.md',
      text: Array.from({ length: 400 }, (_ignored, at) => `line ${at}`).join('\n'),
    };
    expect(overCeiling([inflated])).toEqual([
      'FAIL docs/how-to/synthetic-inflated.md :: 400 lines, ceiling 300',
    ]);
    const trimmed: Source = { ...inflated, text: inflated.text.split('\n').slice(0, 200).join('\n') };
    expect(overCeiling([trimmed])).toEqual([]);
    // And the same page under `explanation/` is not a violation, which is the half a blanket rule
    // would get wrong.
    expect(overCeiling([{ ...inflated, file: 'docs/explanation/synthetic-inflated.md' }])).toEqual([]);
  });

  it('reports every unreachable explanation document, and the dated list only shrinks', () => {
    expect(orphans(pages)).toEqual([...ORPHAN_BASELINE]);
    // EXACT equality in both directions: a baseline that outlived its orphan is a baseline that
    // silently permits the next one to take its place.
    expect(ORPHAN_BASELINE).toEqual([]);
  });

  it('names a planted orphan, and stops naming it the moment a page links to it', () => {
    // DISCRIMINATION PROOF for the second rule. Both halves: unreachable is reported, reachable is
    // not, and the only difference between the two runs is one link.
    const stranded: Source = { file: 'docs/explanation/synthetic-orphan.md', text: '# Nobody links here\n' };
    const map: Source = { file: 'docs/README.md', text: 'A [pointer](explanation/synthetic-orphan.md).\n' };
    expect(orphans([stranded])).toEqual([
      'FAIL docs/explanation/synthetic-orphan.md :: orphan — no page links to it',
    ]);
    expect(orphans([stranded, map])).toEqual([]);
  });
});
