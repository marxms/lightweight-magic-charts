import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { collectMarkdown, collectSources, commentsOf, type Source } from './sourceScan';

/**
 * LMC-26 — a comment may not point at an archived plan.
 *
 * `design.md §2.4`, `task 4.5`, `I12`, `D1`, `M5`, `B3`: every one of them is a pointer into a
 * document this repository no longer keeps. The reader who follows one finds nothing, and the
 * comment that was supposed to explain a decision instead proves the explanation is gone.
 *
 * BROAD PATTERN MINUS A DECLARED ALLOWLIST, and not a list of known forms. The previous rule
 * enumerated `§N`, `DN`, `MN`, `IN-IN` and `task N.N`, which reads complete and is not: it never saw
 * `B3`, it never saw a bare `4.6`, and `IN-IN` only matched a RANGE while the tree writes `I12`
 * alone. The `perdidas` list below MEASURES that miss against the real tree instead of asserting it.
 *
 * ── SCOPE EXTENDED TO `docs/` (2026-08-14) ──
 *
 * The long reasoning moved out of the comments and into `docs/`, and the pointers moved with it. A
 * rule that read only `src/` and `test/` would have watched its own subject walk out of range — and
 * a dead pointer is WORSE in a document than in a comment, because a document is the artefact a
 * reader is invited to open. Markdown joins under the `docs/` prefix, and the WHOLE FILE is read:
 * there are no comments in prose, so every line is the text.
 *
 * The `I1`..`I14` that survive there are LIVE — they name conformance cases this package publishes
 * from `conformance/suite.ts`, and the clause below checks that against the suite instead of
 * trusting the shape. The forty-one pointers into the ARCHIVED plan that arrived with the move were
 * PAID, not recorded: brand-new documentation is where that debt would have cost the most.
 *
 * ── SCOPE EXTENDED TO `test/` (2026-08-14) ──
 *
 * Until now the sweep read only `src/`, and the slice-2 verification measured the gap: two files in
 * `test/` cited `apps/web/src/hooks/__tests__/useChartWorkspaceTabs.test.ts`, deleted in that very
 * slice, and the gate — looking only at `src/` — saw neither of them. `test/` shares the SAME two
 * diseases `src/` already pays for having: a comment that points at an archived plan, and a comment
 * that points at a path the repository deleted. A directory outside the declared reach is not an
 * exemption, it is a blind spot. The `test/` files enter with a `test/` prefix on the BASELINE
 * keys, so they do not collide with those from `src/` — no file under `src/` starts with that
 * segment, so the key alone already says which tree the count came from.
 */

const LIB_ROOT = join(__dirname, '..', '..');
const SRC = join(LIB_ROOT, 'src');
const TEST_DIR = join(LIB_ROOT, 'test');
const DOCS = join(LIB_ROOT, 'docs');

interface Hit {
  readonly file: string;
  readonly line: number;
  readonly snippet: string;
  readonly text: string;
}

/** Broad by design. Narrowing this is the act that needs review, not widening the allowlist. */
// non-english-fixture: the archived plans this gate hunts were written in Portuguese, so the
// vocabulary that finds them has to be too — `tarefa` and `fase` are what those comments say
const PATTERNS: readonly RegExp[] = [
  /§\s*\d+(?:\.\d+)*/g,
  /\b[A-Z]\d+(?:[.-]\d+)*\b/g,
  /\b(?:task|tarefa|fase|phase)\s+\d+(?:[.\w]*\w)?/gi,
  /(?<![\w.$%-])\d+[a-z]?\.\d+(?:\.\d+)*(?![\w-])/g,
];

/**
 * The allowlist, declared — each exemption with its reason and a case that exercises it.
 *
 * An exemption with no written reason is a suppression under another name, and that is how a gate
 * stops measuring what it says it measures.
 */
interface Exemption {
  readonly name: string;
  readonly reason: string;
  readonly exempt: (snippet: string, line: string) => boolean;
}

const ALLOWLIST: readonly Exemption[] = [
  {
    name: 'accessibility criterion',
    reason: 'WCAG numbers criteria 1.4.11 and 2.4.7; a live public standard, not an archived plan',
    exempt: (_snippet, line) => /\b(?:WCAG|SC)\b/.test(line),
  },
  {
    name: 'version number',
    reason: 'three-part semver and the peer range are a packaging fact, not a section of a plan',
    // non-english-fixture: the word a Portuguese comment uses for a version, which is the line
    // shape this exemption exists to spare from the sweep
    exempt: (snippet, line) =>
      /^\d+\.\d+\.\d+$/.test(snippet) || /\b(?:v|versão|version|TS|npm)\b/i.test(line),
  },
  {
    name: 'magnitude with a leading zero',
    reason: 'a plan has no section 0.62; a number shaped like that is a measurement in prose',
    exempt: (snippet) => /^0\./.test(snippet),
  },
  {
    name: 'code span in prose',
    reason: 'what sits between backticks is quoted code, and code is not a document reference',
    exempt: (snippet, line) =>
      (line.match(/`[^`]*`/g) ?? []).some((span) => span.includes(snippet)),
  },
  {
    name: 'percentage',
    reason: '"5.5% of the peak" is a measurement reading, not a pointer',
    exempt: (snippet, line) => new RegExp(`${snippet.replace('.', '\\.')}\\s*%`).test(line),
  },
];

function allowed(snippet: string, line: string): boolean {
  return ALLOWLIST.some((entry) => entry.exempt(snippet, line));
}

function hitsIn(sources: readonly Source[]): Hit[] {
  const found: Hit[] = [];
  for (const source of sources) {
    for (const comment of commentsOf(source.text)) {
      for (const pattern of PATTERNS) {
        pattern.lastIndex = 0;
        let match = pattern.exec(comment.text);
        while (match !== null) {
          if (!allowed(match[0], comment.text)) {
            found.push({
              file: source.file,
              line: comment.line,
              snippet: match[0],
              text: comment.text.trim(),
            });
          }
          match = pattern.exec(comment.text);
        }
      }
    }
  }
  return found;
}

/** LMC-28: path, line and the matched snippet. */
function report(hit: Hit): string {
  return `FAIL ${hit.file}:${hit.line} :: plan reference matched="${hit.snippet}"`;
}

/**
 * Measured on 2026-08-13. Falls with the repatriation of slice 2, which rewrites these headers.
 *
 * BY EXACT COUNT, and not only by the set of files. The policy written in `quality-gate.sh` is
 * "assert EQUALITY against the ledger: a file that stopped violating MUST leave the list", and the
 * clause below compared only the KEYS — so a file that dropped from six references to four stayed
 * recorded with six, and could grow back up to there without anything turning red. That is what
 * happened to `render/paneStack.ts` when the layout result moved down a layer.
 *
 * THE `test/*` ENTRIES, MEASURED ON 2026-08-14, when the scope extended beyond `src/`, and
 * REMEASURED the same day after the real debt was paid. The first count gave 75 and called them
 * legitimate as a block; the check showed that **twenty of them pointed at the ARCHIVED OpenSpec
 * plan** — `Task 4.5`, `Task 2.5`, `Task 4b.2`, `design.md §2.4`, `§10.1` — which is exactly the
 * disease this gate exists to catch, and which would be left dangling the instant the package left
 * the monorepo. The twenty were paid: the comment lost the dead pointer and kept the substance.
 * `paneStack.spec.ts` and `troughProfile.spec.ts` went to zero and left the list.
 *
 * The 55 that remain point at the LIVE plan — `T58`, `fase 9` — and are pre-existing debt, not
 * approval: the list only shrinks. The defect that motivated the extension (two citations of a
 * deleted path) does NOT appear here: none of the four forms matches a file path with no digit. The
 * defect that motivated the extension (the two citations of
 * `apps/web/src/hooks/__tests__/useChartWorkspaceTabs.test.ts`, a deleted path) does NOT appear
 * here: none of the four forms above matches a file path with no digit in it, so the broad pattern
 * itself is blind to that specific disease. The two citations were rewritten separately — the list
 * below is only the pre-existing debt of `test/`, in the same way the `src/` lines above already
 * were before this extension.
 */
const BASELINE: Readonly<Record<string, number>> = {
  // Ratcheted DOWN on 2026-08-14 by the move of the long reasoning to `docs/`: the prose that
  // carried these pointers left the code, and the pointers went with it. `drawing/drawingLayer.ts`
  // reached zero and LEAVES the list, which is the half of the rule that makes it a ratchet and
  // not an allowlist.
  'conformance/suite.ts': 6,
  'domain/types.ts': 4,
  'extension/plugins.ts': 1,
  'index.ts': 1,
  'layout/computeLayout.ts': 1,
  'overlays/densityField.ts': 2,
  'overlays/troughProfile.ts': 2,
  'port/frames.ts': 5,
  'port/ports.ts': 4,
  'port/scopeMachine.ts': 21,
  'port/seedTransaction.ts': 9,
  'react/CompactCell.tsx': 7,
  'test/boundary.spec.ts': 6,
  'test/chartHandles.spec.tsx': 2,
  // 3 -> 1 on 2026-08-14: the translation to English rewrote two of the three headers and took the
  // plan pointers with them. The ratchet demands the write-down, and it is what stops the number
  // from climbing back.
  'test/chartSurface.spec.tsx': 1,
  'test/compactCell.spec.tsx': 2,
  'test/computeLayout.spec.ts': 5,
  'test/conformance.spec.ts': 3,
  'test/densityControls.spec.tsx': 2,
  'test/densityField.spec.ts': 2,
  'test/direction.spec.ts': 2,
  'test/drawingSeam.spec.tsx': 2,
  'test/gates/danglingRef.spec.ts': 6,
  // 3 -> 1 on 2026-08-14: the baseline remeasurement rewrote the header and took two of the three
  // citations with it. The ratchet demands the write-down, and it is what stops the number rising.
  'test/gates/fileSize.spec.ts': 1,
  'test/layoutApply.spec.tsx': 1,
  'test/legendModel.spec.ts': 1,
  'test/priceCompanion.spec.tsx': 1,
  'test/referenceHarness.ts': 6,
  'test/renderBoundary.spec.ts': 2,
  'render/overlayBridge.ts': 1,
  'render/paneStack.ts': 2,
};

/** Markdown carries no comments, so the whole file is the prose this rule is about. */
function collectDocs(dir: string): Source[] {
  if (!existsSync(dir)) return [];
  return collectMarkdown(dir).map((doc) => ({ ...doc, file: `docs/${doc.file}` }));
}

const sources = [
  ...collectSources(SRC),
  ...collectSources(TEST_DIR).map((source) => ({ ...source, file: `test/${source.file}` })),
];
const hits = hitsIn(sources);
const docs = collectDocs(DOCS);

/** In a document there is no comment to look inside: every line is prose the reader will read. */
function docHits(files: readonly Source[]): Hit[] {
  const found: Hit[] = [];
  for (const doc of files) {
    doc.text.split('\n').forEach((line, index) => {
      for (const pattern of PATTERNS) {
        pattern.lastIndex = 0;
        let match = pattern.exec(line);
        while (match !== null) {
          if (!allowed(match[0], line)) {
            found.push({ file: doc.file, line: index + 1, snippet: match[0], text: line.trim() });
          }
          match = pattern.exec(line);
        }
      }
    });
  }
  return found;
}

const docFindings = docHits(docs);

/*
 * ── DOC-15: A POINTER FROM ONE DOCUMENT TO ANOTHER HAS TO LEAD SOMEWHERE ────────────────────────
 *
 * The clauses above hunt a pointer into a plan that was archived. This one hunts the other way a
 * pointer rots: the target moved, or was never written. It arrived with the four quadrants, because
 * that is when documents started pointing AT EACH OTHER instead of only being pointed at from `src`.
 * A tutorial that offers "see how-to/persist-tabs.md" and lands the reader on a 404 has spent their
 * attention and paid them with nothing — the same sentence the comment budget already writes about
 * `docs/<file>.md#<anchor>` in a source comment, applied to the link a reader actually clicks.
 *
 * THE ANCHOR IS RESOLVED, NOT JUST THE FILE. A check that only opened the document would pass every
 * `#heading-that-was-renamed` in the tree, which is the half that rots quietly: renaming a heading
 * is a normal edit and nothing in it looks like breaking a link.
 *
 * The root documents are scanned too. `README.md` is the npm front page and it points into `docs/`;
 * a gate that read only `docs/` would let exactly that link break.
 */

const ROOT_DOCS = ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md'];

interface Pointer {
  readonly from: string;
  readonly line: number;
  readonly target: string;
  readonly anchor: string | null;
}

/** GitHub's slug, near enough: lowercase, punctuation dropped, spaces to dashes. */
function anchorsOf(text: string): readonly string[] {
  return (text.match(/^#{1,6} .+$/gm) ?? []).map((heading) =>
    heading
      .replace(/^#+ /, '')
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-'),
  );
}

/** Every `[text](target)` a document writes that is not an external address. */
function pointersIn(doc: Source): readonly Pointer[] {
  const found: Pointer[] = [];
  doc.text.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(/\]\(([^)\s]+)\)/g)) {
      const href = match[1];
      // Off-site and same-page pointers are not this gate's business: one is somebody else's
      // uptime, the other resolves against the file it is already in.
      if (/^[a-z]+:/.test(href) || href.startsWith('#')) continue;
      const [target, anchor] = href.split('#');
      found.push({ from: doc.file, line: index + 1, target, anchor: anchor ?? null });
    }
  });
  return found;
}

const LIB = join(SRC, '..');
const linked: readonly Source[] = [
  ...collectDocs(DOCS),
  ...ROOT_DOCS.filter((file) => existsSync(join(LIB, file))).map((file) => ({
    file,
    text: readFileSync(join(LIB, file), 'utf8'),
  })),
];

function danglingLinks(files: readonly Source[]): readonly string[] {
  const said: string[] = [];
  for (const doc of files) {
    for (const pointer of pointersIn(doc)) {
      const resolved = join(LIB, dirname(doc.file), pointer.target);
      if (!existsSync(resolved)) {
        said.push(`FAIL ${pointer.from}:${pointer.line} :: ${pointer.target} does not exist`);
        continue;
      }
      if (pointer.anchor === null || !resolved.endsWith('.md')) continue;
      if (!anchorsOf(readFileSync(resolved, 'utf8')).includes(pointer.anchor)) {
        said.push(
          `FAIL ${pointer.from}:${pointer.line} :: ${pointer.target}#${pointer.anchor} has no such heading`,
        );
      }
    }
  }
  return said.sort();
}

const counted: Readonly<Record<string, number>> = hits.reduce<Record<string, number>>(
  (acc, hit) => {
    acc[hit.file] = (acc[hit.file] ?? 0) + 1;
    return acc;
  },
  {},
);

describe('LMC-26 — dangling plan reference in a comment', () => {
  it('reads real comments, so that a green gate is not a gate over nothing', () => {
    expect(sources.length).toBeGreaterThanOrEqual(30);
    expect(sources.filter((s) => commentsOf(s.text).length > 0).length).toBeGreaterThanOrEqual(30);
  });

  it('matches the three forms inside a comment, and ignores the same form outside it', () => {
    // POSITIVE CONTROL with a synthetic comment, one form at a time, plus the counterpoint: the
    // same string in CODE is not a plan reference — the gate is about prose that points outwards.
    const synthetic: Source = {
      file: 'synthetic/Commented.ts',
      // non-english-fixture: the stimulus quotes an archived plan reference as it was written
      text: [
        '/** See design.md §2.4 and tarefa 4.6. */',
        '// Case I12 still holds, and D1 too.',
        'const B3 = 1;',
        'const versao = "4.6";',
      ].join('\n'),
    };
    expect(hitsIn([synthetic]).map((h) => h.snippet).sort()).toEqual([
      '2.4',
      '4.6',
      'D1',
      'I12',
      'tarefa 4.6',
      '§2.4',
    ]);
    expect(report(hitsIn([synthetic])[0])).toBe(
      'FAIL synthetic/Commented.ts:1 :: plan reference matched="§2.4"',
    );
  });

  it('the allowlist exempts a legitimate reference, and each exemption is exercised', () => {
    // NEGATIVE CONTROL. An allowlist that never exempts anything is an allowlist nobody tested, and
    // the first legitimate reference to arrive will break the build of whoever wrote it.
    const legitimate: Source = {
      file: 'synthetic/Legitimate.ts',
      text: [
        '/** Contrast follows WCAG 2.1 SC 1.4.11, and visible focus follows SC 2.4.7. */',
        '// The peer range is lightweight-charts version 5.2.0.',
        '// The curve averages alpha near 0.62 at the floor.',
        '// The minified output is `alpha = n**1.5` and nothing more.',
        '// A cell at 20% of the peak maps to 5.5% of alpha.',
      ].join('\n'),
    };
    expect(hitsIn([legitimate])).toEqual([]);
    expect(ALLOWLIST.map((e) => e.name)).toEqual([
      'accessibility criterion',
      'version number',
      'magnitude with a leading zero',
      'code span in prose',
      'percentage',
    ]);
    for (const entry of ALLOWLIST) expect(entry.reason.length).toBeGreaterThan(20);
  });

  it('records that the previous pattern, of specific forms, did not match the tree', () => {
    // The old pattern, exactly as the design's gate matrix wrote it.
    const antigo: readonly RegExp[] = [
      /§\d+/g,
      /\bD\d+\b/g,
      /\bM\d+\b/g,
      /\bI\d+-I\d+\b/g,
      /\btask \d+\.\d+\b/g,
    ];
    const matchedByTheOldOne = new Set<string>();
    for (const source of sources) {
      for (const comment of commentsOf(source.text)) {
        for (const pattern of antigo) {
          pattern.lastIndex = 0;
          let match = pattern.exec(comment.text);
          while (match !== null) {
            matchedByTheOldOne.add(`${source.file}:${comment.line}:${match[0]}`);
            match = pattern.exec(comment.text);
          }
        }
      }
    }
    const perdidas = hits.filter(
      (hit) => !matchedByTheOldOne.has(`${hit.file}:${hit.line}:${hit.snippet}`),
    );
    // Most of the tree's occurrences escape the old pattern, and the forms that escape are the most
    // common ones: the lone letter-number (`I12`, `B3` — the old one saw only the RANGE `I1-I14`
    // and the letters `D` and `M`), the bare numeral (`4.6`), and the step word that is not `task`
    // (`Phase 8`).
    //
    // BY FORM, AND NOT BY SPECIMEN. The first version of this line cited three literal strings that
    // existed in the tree on the day it was written — and slice 2 rewrites exactly these comments,
    // so `B3` stopped existing and the clause went red for having succeeded. The claim was never
    // about those three texts: it is about the three FORMS, and that is what it now asserts. Each
    // one has to show up among the missed ones, which keeps it exact while the tree shrinks.
    expect(perdidas.length).toBeGreaterThan(hits.length / 2);
    const formas: Readonly<Record<string, RegExp>> = {
      'lone letter-number': /^[A-Z]\d+$/,
      'bare dotted numeral': /^\d+\.\d+$/,
      'step word that is not task': /^(?:fase|phase)\s+\d/i,
    };
    const withoutExample = Object.entries(formas)
      .filter(([, shape]) => !perdidas.some((h) => shape.test(h.snippet)))
      .map(([name]) => name);
    expect(withoutExample).toEqual([]);
  });

  it('fails any file outside the baseline — the list only shrinks', () => {
    // EXACT equality: count per file, in both directions.
    expect(counted).toEqual(BASELINE);
    const unrecorded = hits.filter((hit) => !(hit.file in BASELINE)).map(report);
    expect(unrecorded).toEqual([]);
    expect(Object.keys(counted).sort()).toEqual(Object.keys(BASELINE).sort());
  });

  it('reads `docs/` too — the reasoning moved there, and the pointers moved with it', () => {
    // Positive control on the extension: the documents exist, and they carry real prose.
    expect(docs.length).toBeGreaterThanOrEqual(10);
    expect(docs.reduce((total, doc) => total + doc.text.split('\n').length, 0)).toBeGreaterThan(1500);
  });

  it('lets no pointer into an ARCHIVED plan survive in a document', () => {
    const archived = docFindings.filter((hit) => !/^I\d+$/.test(hit.snippet));
    expect(archived.map(report)).toEqual([]);
  });

  it('checks the surviving case names against the suite, instead of trusting them', () => {
    // A whitelist by SHAPE would wave `I99` through. The published suite is the authority on which
    // case ids exist, so the ids left in the documents are matched against it.
    const suite = readFileSync(join(SRC, 'conformance', 'suite.ts'), 'utf8');
    const published = new Set(suite.match(/\bI\d+\b/g) ?? []);
    expect(published.size).toBeGreaterThanOrEqual(14);
    const cited = new Set(docFindings.map((hit) => hit.snippet).filter((id) => /^I\d+$/.test(id)));
    expect([...cited].filter((id) => !published.has(id))).toEqual([]);
  });

  it('DOC-15 — resolves every document-to-document pointer against the real file and heading', () => {
    // POSITIVE CONTROL first: a sweep that found no links would report no dangling ones.
    const pointers = linked.flatMap((doc) => pointersIn(doc));
    expect(linked.length).toBeGreaterThanOrEqual(70);
    expect(pointers.length).toBeGreaterThanOrEqual(100);
    expect(pointers.filter((pointer) => pointer.anchor !== null).length).toBeGreaterThanOrEqual(5);
    expect(danglingLinks(linked)).toEqual([]);
  });

  it('names origin and destination for a pointer that leads nowhere, file or heading', () => {
    // DISCRIMINATION PROOF, served from memory. Both halves fail separately: a missing file and a
    // heading that was renamed are two different ways to strand a reader, and a check that only
    // opened the file would pass the second while looking exactly as green.
    const planted: Source = {
      file: 'docs/synthetic/Planted.md',
      text: [
        'A link to [the map](../reference/_index.md) that resolves.',
        'A link to [nothing](../reference/never-written.md) that does not.',
        'A link to [a renamed heading](../reference/_index.md#a-heading-nobody-wrote).',
      ].join('\n'),
    };
    expect(danglingLinks([planted])).toEqual([
      'FAIL docs/synthetic/Planted.md:2 :: ../reference/never-written.md does not exist',
      'FAIL docs/synthetic/Planted.md:3 :: ../reference/_index.md#a-heading-nobody-wrote has no such heading',
    ]);
  });

  it('fails if a baseline file gains a new reference', () => {
    const grown = Object.entries(counted)
      .filter(([file, count]) => count > (BASELINE[file] ?? 0))
      .map(([file, count]) => `FAIL ${file} :: references measured=${count} baseline=${BASELINE[file]}`);
    expect(grown).toEqual([]);
  });
});
