import { spawnSync } from 'child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * LMC-33, LMC-36, LMC-37, LMC-69 — the package as it will actually be INSTALLED, not as the
 * manifest describes itself.
 *
 * Every claim here is measured against an artefact, because each of the three has a cheap
 * counterfeit that reads the same in review:
 *
 *   "it ships ESM and CJS"     -> the counterfeit reads the `exports` map. This one LOADS both
 *                                 trees in a real `node`, because `tsc` emits `import './x'` with
 *                                 no extension and Node's ESM resolver does no guessing: a tree
 *                                 that bundles fine can be unloadable, and the map would be a lie
 *                                 that only a consumer discovers.
 *   "the tarball is clean"     -> the counterfeit reads the `files` field. `files` is an input to
 *                                 the pack, not its output: npm adds `package.json`, `README` and
 *                                 `LICENSE` on its own and honours `.npmignore` and nested
 *                                 manifests. So this packs a REAL tarball and lists it.
 *   "the types are readable"   -> the counterfeit runs the repository's own compiler, which is
 *                                 TS 5.9. `apps/web` runs TS 4.9.5 NESTED, with `moduleResolution:
 *                                 "node"` — a resolver that ignores the `exports` map completely
 *                                 and sees only `main`/`types`/`typesVersions`. So the check runs
 *                                 THAT binary against THAT config.
 */

const LIB_ROOT = join(__dirname, '..', '..');
const REPO_ROOT = join(LIB_ROOT, '..', '..');
const WEB_ROOT = join(REPO_ROOT, 'apps', 'web');
const TSC_49 = join(WEB_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');

interface ExportTarget {
  readonly types?: string;
  readonly import?: string;
  readonly require?: string;
  readonly default?: string;
}

interface Manifest {
  readonly main: string;
  readonly types: string;
  readonly license: string;
  readonly files: readonly string[];
  readonly exports: Record<string, ExportTarget | string>;
  readonly typesVersions: Record<string, Record<string, readonly string[]>>;
  readonly peerDependencies: Record<string, string>;
  readonly peerDependenciesMeta: Record<string, { readonly optional: boolean }>;
  readonly dependencies?: Record<string, string>;
}

const pkg = JSON.parse(readFileSync(join(LIB_ROOT, 'package.json'), 'utf8')) as Manifest;
const subpath = (key: string): ExportTarget => pkg.exports[key] as ExportTarget;

/**
 * Everything the tarball may carry that is not build output.
 *
 * `conformance/package.json` earns its place: it is the physical path a node10 resolver looks for
 * when the `exports` map it cannot read declares `./conformance`. Dropping it from the tarball
 * would break the one consumer class AD-006 is written for.
 */
const ALLOWED_OUTSIDE_DIST: ReadonlySet<string> = new Set([
  'package.json',
  'LICENSE',
  'NOTICE',
  'README.md',
  'conformance/package.json',
]);

const stowaways = (entries: readonly string[]): string[] =>
  entries.filter((entry) => !entry.startsWith('dist/') && !ALLOWED_OUTSIDE_DIST.has(entry));

function scratch(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

interface Packed {
  /** Every path in the archive, `package/` stripped. */
  readonly entries: readonly string[];
  /** The BYTES of the entries that are not build output, read out of the same archive. */
  readonly text: ReadonlyMap<string, string>;
}

/**
 * A REAL tarball, packed once: the file list AND the contents of what is not `dist/`.
 *
 * The list alone answers "is it in there", which is the question a stowaway fails. It is not the
 * question `LICENSE` and `NOTICE` fail: a three-line stub ships under the right name and reads the
 * same in a directory listing. So the same archive is read, not just listed.
 */
function packOnce(): Packed {
  const out = scratch('lmc-pack-');
  try {
    const packed = spawnSync('npm', ['pack', '--pack-destination', out], {
      cwd: LIB_ROOT,
      encoding: 'utf8',
    });
    if (packed.status !== 0) throw new Error(`npm pack failed: ${packed.stderr}`);
    const archive = readdirSync(out).find((name) => name.endsWith('.tgz'));
    if (archive === undefined) throw new Error(`npm pack wrote no archive into ${out}`);
    const listed = spawnSync('tar', ['-tzf', join(out, archive)], { encoding: 'utf8' });
    if (listed.status !== 0) throw new Error(`tar failed: ${listed.stderr}`);
    const entries = listed.stdout
      .split('\n')
      .filter((line) => line.length > 0 && !line.endsWith('/'))
      .map((line) => line.replace(/^package\//, ''));
    const text = new Map<string, string>();
    for (const entry of entries.filter((name) => !name.startsWith('dist/'))) {
      const got = spawnSync('tar', ['-xzOf', join(out, archive), `package/${entry}`], {
        encoding: 'utf8',
      });
      if (got.status !== 0) throw new Error(`tar could not read ${entry}: ${got.stderr}`);
      text.set(entry, got.stdout);
    }
    return { entries, text };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

/**
 * The structure of the canonical Apache-2.0, in the order the document itself has it.
 *
 * MARKERS AND NOT A HASH, deliberately. A digest over the whole file — or over any line of the
 * appendix — turns the next copyright year into a failing gate, and a gate that fails for a reason
 * it does not care about is a gate someone deletes. These are the parts a truncation removes.
 */
const APACHE_SPINE: readonly string[] = [
  'Apache License',
  'Version 2.0, January 2004',
  'http://www.apache.org/licenses/',
  'TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION',
  '1. Definitions.',
  '2. Grant of Copyright License.',
  '3. Grant of Patent License.',
  '4. Redistribution.',
  '5. Submission of Contributions.',
  '6. Trademarks.',
  '7. Disclaimer of Warranty.',
  '8. Limitation of Liability.',
  '9. Accepting Warranty or Additional Liability.',
  'END OF TERMS AND CONDITIONS',
  'APPENDIX: How to apply the Apache License to your work.',
];

/** What a text is missing from the spine, read IN ORDER: a shuffled licence is not the licence. */
function missingSpine(text: string): string[] {
  let at = 0;
  const absent: string[] = [];
  for (const marker of APACHE_SPINE) {
    const found = text.indexOf(marker, at);
    if (found === -1) absent.push(marker);
    else at = found + marker.length;
  }
  return absent;
}

/**
 * How much text each spine marker actually carries before the next one starts.
 *
 * THE SPINE IS THE PART A GUTTED LICENCE KEEPS. Measured 2026-08-14: a `LICENSE` cut to a 17-line
 * skeleton — every marker above, in order, plus the copyright line, and every WORD between them
 * deleted — passed this whole file green. No grant, no condition, no warranty disclaimer, and
 * `missingSpine` had nothing to say, because what it reads is exactly what the skeleton kept.
 *
 * A LINE COUNT ALONE WOULD NOT HAVE CLOSED IT EITHER: 190 blank lines satisfy a line count. What
 * separates the licence from its table of contents is the body under each heading, so that is what
 * gets measured. The four header markers sit adjacent to one another and legitimately measure 0;
 * the nine NUMBERED clauses are the ones that grant, condition and disclaim.
 */
function spineBodies(text: string): ReadonlyMap<string, number> {
  const bodies = new Map<string, number>();
  let at = 0;
  for (let i = 0; i < APACHE_SPINE.length; i += 1) {
    const found = text.indexOf(APACHE_SPINE[i], at);
    if (found === -1) continue; // `missingSpine` is what reports an absent marker.
    at = found + APACHE_SPINE[i].length;
    const next = i + 1 < APACHE_SPINE.length ? text.indexOf(APACHE_SPINE[i + 1], at) : -1;
    bodies.set(APACHE_SPINE[i], text.slice(at, next === -1 ? text.length : next).trim().length);
  }
  return bodies;
}

/** The nine that carry obligations. `1.` through `9.`, taken off the spine rather than retyped. */
const NUMBERED_CLAUSES = APACHE_SPINE.filter((marker) => /^\d\. /.test(marker));

/**
 * The floor, in characters, under a numbered clause heading.
 *
 * Measured against the canonical Apache-2.0 shipped here: the thinnest body is `6. Trademarks.` at
 * 278 characters, the fattest is `1. Definitions.` at 3251. The floor sits well under the thinnest
 * so a reflow never turns this red, and a heading with nothing under it measures zero.
 */
const CLAUSE_BODY_FLOOR = 200;

/** What the NOTICE has to say, and the reason each clause is load-bearing. */
const NOTICE_CLAUSES: readonly (readonly [string, string])[] = [
  ['lightweight-charts', 'the base this package renders through, named'],
  ['TradingView, Inc.', 'the copyright holder of that base, named'],
  ['Apache License', 'the licence that base carries, named'],
  ['not affiliated with', 'the disclaimer AD-009 accepted the name risk against'],
  ['sponsored by', 'the second half of the same disclaimer'],
  ['endorsed by', 'the third half — Apache-2.0 clause 6 grants no trademark rights'],
];

/**
 * The phrases that assert a relationship with TradingView, and which this file exists to DENY.
 *
 * `includes` CANNOT TELL A DISCLAIMER FROM ITS NEGATION, and that is measured, not feared: a NOTICE
 * rewritten to say the package "is an OFFICIAL TradingView, Inc. product … sponsored by and
 * endorsed by TradingView, Inc." carries all six clauses above and passed green. This file is the
 * only written mitigation of the risk AD-009 took on purpose — the name echoes the base's, and
 * Apache-2.0 clause 6 grants no trademark rights — and it was passing on the exact statement it
 * exists to refuse. Substring presence is the wrong question; POLARITY is the question.
 *
 * `official` is on the list on purpose, and it is the one that could bite a legitimate rewrite. If
 * a future NOTICE needs that word in a sentence that is not a denial, that is a change somebody
 * makes deliberately, with this line in front of them — which is the point.
 */
const RELATIONSHIP_CLAIMS: readonly string[] = [
  'affiliated with',
  'sponsored by',
  'endorsed by',
  'connected to',
  'official',
  'partnership',
];

/** What turns any of the above into a denial. Read per SENTENCE, never file-wide. */
const NEGATION = /\b(not|no|neither|nor|never|without)\b/i;

/**
 * Where one sentence ends and the next begins. A blank line always breaks; a full stop breaks only
 * when what follows opens a new sentence, so `Inc.`, `4(d).` and `Version 2.0.` do not split a
 * clause in half and hand its negation to the neighbour.
 */
const SENTENCE_BREAK = /¶|[.!?][)*"'\]]*\s+(?=[A-Z`"('*[])/g;

/** The text as sentences: wrapping collapsed, paragraph breaks kept as `¶` so they still break. */
function sentences(text: string): readonly string[] {
  const flat = text
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]*\n/g, ' ¶ ')
    .replace(/\s+/g, ' ')
    .trim();
  const edges = [0];
  SENTENCE_BREAK.lastIndex = 0;
  for (let hit = SENTENCE_BREAK.exec(flat); hit !== null; hit = SENTENCE_BREAK.exec(flat)) {
    edges.push(hit.index + hit[0].length);
  }
  edges.push(flat.length);
  const out: string[] = [];
  for (let i = 0; i < edges.length - 1; i += 1) {
    const span = flat.slice(edges[i], edges[i + 1]).replace(/¶/g, '').trim();
    if (span !== '') out.push(span);
  }
  return out;
}

/** Every relationship this text ASSERTS: the claim, and the un-negated sentence asserting it. */
function assertedRelationships(text: string): readonly (readonly [string, string])[] {
  const claimed: [string, string][] = [];
  for (const sentence of sentences(text)) {
    if (NEGATION.test(sentence)) continue;
    const lowered = sentence.toLowerCase();
    for (const claim of RELATIONSHIP_CLAIMS) {
      if (lowered.includes(claim)) claimed.push([claim, sentence]);
    }
  }
  return claimed;
}

/** The disclaimer as ONE negated sentence, which is the only shape that actually disclaims. */
function disclaimsInOneSentence(text: string): boolean {
  return sentences(text).some(
    (sentence) =>
      NEGATION.test(sentence) &&
      ['affiliated with', 'sponsored by', 'endorsed by', 'TradingView, Inc.'].every((part) =>
        sentence.includes(part),
      ),
  );
}

/** What a real `node` sees when it loads a target, each way round. */
function loadedExports(target: string, how: 'import' | 'require'): readonly string[] {
  const path = JSON.stringify(join(LIB_ROOT, target));
  const run =
    how === 'import'
      ? spawnSync(
          process.execPath,
          ['--input-type=module', '-e', `import(${path}).then((m) => console.log(JSON.stringify(Object.keys(m))))`],
          { encoding: 'utf8' },
        )
      : spawnSync(process.execPath, ['-e', `console.log(JSON.stringify(Object.keys(require(${path}))))`], {
          encoding: 'utf8',
        });
  if (run.status !== 0) {
    throw new Error(`node could not ${how} ${target}: ${(run.stderr || run.stdout).split('\n')[0]}`);
  }
  return JSON.parse(run.stdout) as string[];
}

/** The compiler options `apps/web` really runs, read from its own tsconfig so they cannot drift. */
const webOptions = (
  JSON.parse(readFileSync(join(WEB_ROOT, 'tsconfig.json'), 'utf8')) as {
    compilerOptions: Record<string, unknown>;
  }
).compilerOptions;

function compileConsumer(body: string): { status: number; output: string } {
  const dir = scratch('lmc-ts49-');
  try {
    mkdirSync(join(dir, 'node_modules'));
    symlinkSync(LIB_ROOT, join(dir, 'node_modules', 'lightweight-magic-charts'), 'dir');
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { ...webOptions, noEmit: true }, include: ['consumer.ts'] }),
    );
    writeFileSync(join(dir, 'consumer.ts'), body);
    const run = spawnSync(process.execPath, [TSC_49, '-p', join(dir, 'tsconfig.json')], { encoding: 'utf8' });
    return { status: run.status ?? -1, output: `${run.stdout}${run.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const CONSUMER = `
import type { Bar, LayoutOutcome, ValueFormat } from 'lightweight-magic-charts';
import { computeLayout, formatterFor, seriesId, utcSeconds } from 'lightweight-magic-charts';
import { CONFORMANCE_CASES, type ConformanceHarness } from 'lightweight-magic-charts/conformance';

const bar: Bar = { time: utcSeconds(1), open: 1, high: 2, low: 0, close: 1.5 };
const format: ValueFormat = { kind: 'price', minMove: 0.01 };
export const total: number = CONFORMANCE_CASES.length;
export const id = seriesId('x');
export const text: string = formatterFor(format)(bar.close);
export const layout: LayoutOutcome = computeLayout([], 800, { priceFloorPx: 200, defaultPaneHeightPx: 120 });
export type Harness = ConformanceHarness;
`;

describe('T98 — the exports map selects ESM and CJS, and both trees load', () => {
  it('points each condition at its own tree, and the CJS one is what node10 also sees', () => {
    expect(subpath('.').import).toBe('./dist/esm/index.js');
    expect(subpath('.').require).toBe('./dist/index.js');
    expect(`./${pkg.main}`).toBe(subpath('.').require);
    expect(`./${pkg.types}`).toBe(subpath('.').types);
  });

  it('loads BOTH ways in a real node, with the same public surface either way', () => {
    const imported = loadedExports('dist/esm/index.js', 'import');
    const required = loadedExports('dist/index.js', 'require');
    // Not a floor pulled from the air: fewer names than this and the entry is not the entry.
    expect(imported.length).toBeGreaterThan(50);
    expect([...imported].sort()).toEqual([...required].sort());
  });

  it('lets the conformance suite out through its subpath ONLY', () => {
    expect(Object.keys(pkg.exports)).toEqual(['.', './conformance', './package.json']);
    expect(loadedExports('dist/index.js', 'require')).not.toContain('CONFORMANCE_CASES');
    expect(loadedExports('dist/esm/index.js', 'import')).not.toContain('CONFORMANCE_CASES');
    expect(loadedExports('dist/conformance/suite.js', 'require')).toContain('CONFORMANCE_CASES');
    expect(loadedExports('dist/esm/conformance/suite.js', 'import')).toContain('CONFORMANCE_CASES');
  });

  it('keeps the node10 shim and the map naming the SAME files — one truth, two spellings', () => {
    const shim = JSON.parse(readFileSync(join(LIB_ROOT, 'conformance', 'package.json'), 'utf8')) as {
      main: string;
      types: string;
    };
    expect(`./${shim.main.replace('../', '')}`).toBe(subpath('./conformance').require);
    expect(`./${shim.types.replace('../', '')}`).toBe(subpath('./conformance').types);
    expect(pkg.typesVersions['*'].conformance).toEqual(['dist/conformance/suite.d.ts']);
  });

  it('declares the ESM marker WHOLE — type alone leaves a ~2.267 B floor on every symbol', () => {
    const source = JSON.parse(readFileSync(join(LIB_ROOT, 'esm-package.json'), 'utf8')) as Record<string, unknown>;
    const written = JSON.parse(readFileSync(join(LIB_ROOT, 'dist', 'esm', 'package.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(source).toEqual({ type: 'module', sideEffects: false });
    expect(written).toEqual(source);
  });
});

describe('T98 — the tarball, read out of the archive rather than off the manifest', () => {
  const { entries, text: shipped } = packOnce();

  it('carries what a consumer needs, so the allowlist below is not passing over nothing', () => {
    expect(entries).toEqual(expect.arrayContaining(['package.json', 'LICENSE', 'NOTICE']));
    expect(entries).toEqual(expect.arrayContaining(['dist/index.js', 'dist/index.d.ts', 'dist/esm/index.js']));
    expect(entries.filter((entry) => entry.startsWith('dist/')).length).toBeGreaterThan(100);
  });

  it('carries NOTHING else — no source, no tests, no configs, no docs', () => {
    expect(stowaways(entries)).toEqual([]);
  });

  it('would name a stowaway rather than shrug — the rule is exercised on a planted list', () => {
    expect(
      stowaways(['dist/index.js', 'LICENSE', 'src/index.ts', 'tsconfig.json', 'docs/port.md', 'test/boundary.spec.ts']),
    ).toEqual(['src/index.ts', 'tsconfig.json', 'docs/port.md', 'test/boundary.spec.ts']);
  });

  /**
   * LMC-31, LMC-32 — the two files whose whole value is their TEXT.
   *
   * Presence was already asserted above, and presence is what a stub satisfies: the `LICENSE` can
   * be cut to three lines and the `NOTICE` emptied of its disclaimer with every other clause in
   * this file still green. What makes that worth a gate rather than a review is the second file:
   * `NOTICE` is the only written mitigation for the risk AD-009 took ON PURPOSE — the name echoes
   * the base's, and Apache-2.0 grants no trademark rights and no protection against confusion of
   * origin. A one-off measurement of a disclaimer is not a disclaimer that stays.
   */
  it('ships the CANONICAL Apache-2.0, spine and order, with the copyright field filled in', () => {
    const licence = shipped.get('LICENSE') ?? '';
    expect(missingSpine(licence)).toEqual([]);
    // The appendix is a TEMPLATE until somebody fills it. These two clauses are what separate the
    // licence this package grants from the licence text it merely carries.
    expect(licence).toContain('Copyright 2026 Marx Menezes');
    expect(licence).not.toContain('[name of copyright owner]');
    expect(pkg.license).toBe('Apache-2.0');
    // AND EACH NUMBERED CLAUSE CARRIES ITS TEXT, which is the half the spine cannot see. Measured
    // today: 202 lines, thinnest body 278 characters. See `spineBodies` for the mutation.
    const bodies = spineBodies(licence);
    expect(
      NUMBERED_CLAUSES.filter((clause) => (bodies.get(clause) ?? 0) < CLAUSE_BODY_FLOOR).map(
        (clause) => `FAIL LICENSE :: "${clause}" carries ${bodies.get(clause) ?? 0} char(s) of text`,
      ),
    ).toEqual([]);
    expect(licence.split('\n').length).toBeGreaterThan(190);
  });

  it('names a licence that kept its headings and lost its clauses — the rule, on planted text', () => {
    // DISCRIMINATION PROOF, served from memory: THE mutation that survived the round which asked
    // for this clause. Every marker, in order, the copyright line filled in, nothing else.
    const skeleton = `${APACHE_SPINE.join('\n')}\nCopyright 2026 Marx Menezes\n`;
    // The two cheap readings are shown answering "nothing wrong here" first, side by side, because
    // a control that only shows the new clause failing does not prove the new clause was needed.
    expect(missingSpine(skeleton)).toEqual([]);
    expect(skeleton).toContain('Copyright 2026 Marx Menezes');
    expect(skeleton).not.toContain('[name of copyright owner]');
    // And the reading that refuses it: all nine numbered clauses stand over nothing.
    const bodies = spineBodies(skeleton);
    expect(NUMBERED_CLAUSES.filter((clause) => (bodies.get(clause) ?? 0) < CLAUSE_BODY_FLOOR)).toHaveLength(9);
    expect(skeleton.split('\n').length).toBeLessThan(190);
  });

  it('names what a truncated or shuffled licence is missing — the rule, on planted text', () => {
    // DISCRIMINATION PROOF, served from memory. The stub is the mutation that survived the round
    // that asked for this gate: a three-line `LICENSE` under the right name.
    const stub = 'Apache License\nVersion 2.0, January 2004\nSee the internet.\n';
    expect(missingSpine(stub)).toContain('END OF TERMS AND CONDITIONS');
    expect(missingSpine(stub)).toHaveLength(APACHE_SPINE.length - 2);
    // AND ORDER, which containment alone cannot see. Every marker is present in the text below and
    // the document is still not the licence — so the two readings are put side by side, and the
    // cheap one is shown answering "nothing wrong here".
    const shuffled = [...APACHE_SPINE].reverse().join('\n');
    expect(APACHE_SPINE.filter((marker) => !shuffled.includes(marker))).toEqual([]);
    expect(missingSpine(shuffled)).toContain('APPENDIX: How to apply the Apache License to your work.');
  });

  it('ships a NOTICE that names the base, the holder and the absence of endorsement', () => {
    const notice = shipped.get('NOTICE') ?? '';
    const silent = NOTICE_CLAUSES.filter(([clause]) => !notice.includes(clause)).map(
      ([clause, why]) => `FAIL NOTICE :: missing "${clause}" — ${why}`,
    );
    expect(silent).toEqual([]);
    // POSITIVE CONTROL for the clause above: an emptied file fails it, so the green is the text
    // being there and not the predicate having nothing to say.
    expect(NOTICE_CLAUSES.filter(([clause]) => !''.includes(clause))).toHaveLength(
      NOTICE_CLAUSES.length,
    );
  });

  it('DISCLAIMS the relationship rather than merely carrying the words — polarity, not presence', () => {
    const notice = shipped.get('NOTICE') ?? '';
    // Nothing in this file asserts a relationship: every claim phrase sits inside a denial.
    expect(assertedRelationships(notice)).toEqual([]);
    // And the denial is ONE sentence carrying the whole disclaimer, which is the only shape that
    // disclaims anything. Six clauses scattered over six paragraphs deny nothing in particular.
    expect(disclaimsInOneSentence(notice)).toBe(true);
    // Plus the bulk the explanation lives in. Measured today: 41 lines, 33 of them non-blank.
    expect(notice.split('\n').filter((line) => line.trim() !== '')).toHaveLength(33);
  });

  it('refuses the disclaimer INVERTED, and the same six clauses as keyword soup', () => {
    // DISCRIMINATION PROOF, served from memory: the two mutations that survived the round which
    // asked for this clause, and the reason each one is not a hypothetical.
    //
    // The inverted one is the grave one — a legal statement about a third party's mark, asserting
    // the OPPOSITE of what AD-009 depends on this file to assert. The soup is the cheap one — the
    // six clauses with the document deleted around them.
    const inverted =
      '`lightweight-magic-charts` is an OFFICIAL TradingView, Inc. product, built on\n' +
      '`lightweight-charts` under the Apache License and affiliated with, sponsored by\n' +
      'and endorsed by TradingView, Inc. The phrase "not affiliated with" appears here\n' +
      'only so that a reader searching for it finds something.\n';
    const soup =
      'lightweight-charts TradingView, Inc. Apache License not affiliated with sponsored by endorsed by\n';

    // FIRST, the cheap reading answering "nothing wrong here" on BOTH of them. Without this the
    // clauses below look like belt and braces instead of the only thing standing between the
    // package and a published claim of endorsement.
    for (const text of [inverted, soup]) {
      expect(NOTICE_CLAUSES.filter(([clause]) => !text.includes(clause))).toEqual([]);
    }

    // THEN the readings that refuse them. The inverted file asserts four relationships outright.
    expect(assertedRelationships(inverted).map(([claim]) => claim)).toEqual([
      'affiliated with',
      'sponsored by',
      'endorsed by',
      'official',
    ]);
    expect(disclaimsInOneSentence(inverted)).toBe(false);
    // The soup asserts nothing — it is negated — and still disclaims nothing: its `not` governs a
    // fragment that never names who is being disclaimed.
    expect(assertedRelationships(soup)).toEqual([]);
    expect(disclaimsInOneSentence(soup)).toBe(false);
    expect(soup.split('\n').filter((line) => line.trim() !== '')).toHaveLength(1);
  });
});

describe('T98 — the declarations are readable by the compiler the app actually runs', () => {
  it('runs TypeScript 4.9 with node resolution, which is what makes this check mean anything', () => {
    expect(existsSync(TSC_49)).toBe(true);
    const version = spawnSync(process.execPath, [TSC_49, '--version'], { encoding: 'utf8' });
    expect(version.stdout.trim()).toMatch(/^Version 4\.9\./);
    // If the app ever migrates, the assumption this whole check rests on must be re-taken by hand.
    expect(webOptions.moduleResolution).toBe('node');
  });

  it('compiles a consumer of the entry AND of the conformance subpath', () => {
    const result = compileConsumer(CONSUMER);
    expect(result.output).toBe('');
    expect(result.status).toBe(0);
  });

  it('reports an error when the consumer asks for a name the package does not export', () => {
    const result = compileConsumer("import { notAThing } from 'lightweight-magic-charts';\nexport default notAThing;\n");
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('notAThing');
  });
});

/**
 * A package the installer builds, with the peer set to a version we choose.
 *
 * TARBALLS ON BOTH SIDES, AND NOTHING FROM THE NETWORK. Every participant is packed first and
 * installed from the archive: a `file:` directory would be SYMLINKED, and npm 11 walks a linked
 * node differently — measured, it aborts inside arborist with a null dereference before it ever
 * reaches the peer question. Packing is also what a consumer really receives, so the probe and
 * reality are the same shape.
 *
 * AND THE PROBE RUNS ON NPM'S DEFAULTS, NOT ON OURS. This repository's `.npmrc` sets
 * `legacy-peer-deps=true`, and npm exports every setting into the environment as `npm_config_*`,
 * so a nested install INHERITS it — measured, the out-of-range install exited 0 with no complaint
 * whatsoever, and the check passed over the very thing it exists to see. The environment is
 * stripped of `npm_*` so the answer is npm's, not this tree's.
 */
const CONSUMER_ENV: NodeJS.ProcessEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('npm_')),
);

function fakeInstall(peerVersion: string): { status: number; output: string } {
  const dir = scratch('lmc-install-');
  const pack = (from: string): void => {
    const run = spawnSync('npm', ['pack', '--pack-destination', dir], { cwd: from, encoding: 'utf8' });
    if (run.status !== 0) throw new Error(`npm pack failed in ${from}: ${run.stderr}`);
  };
  const stub = (name: string, version: string): void => {
    const at = join(dir, `src-${name}`);
    mkdirSync(at, { recursive: true });
    writeFileSync(join(at, 'package.json'), JSON.stringify({ name, version, main: 'index.js' }));
    writeFileSync(join(at, 'index.js'), 'module.exports = {};\n');
    pack(at);
  };
  try {
    pack(LIB_ROOT);
    stub('lightweight-charts', peerVersion);
    stub('react', '18.3.1');
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'peer-probe',
        version: '1.0.0',
        private: true,
        dependencies: {
          'lightweight-magic-charts': 'file:./lightweight-magic-charts-0.1.0.tgz',
          'lightweight-charts': `file:./lightweight-charts-${peerVersion}.tgz`,
          react: 'file:./react-18.3.1.tgz',
        },
      }),
    );
    const run = spawnSync(
      'npm',
      ['install', '--no-audit', '--no-fund', '--offline', '--ignore-scripts'],
      { cwd: dir, encoding: 'utf8', env: CONSUMER_ENV },
    );
    return { status: run.status ?? -1, output: `${run.stdout}${run.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('T100 — two peers, and a consumer outside the range hears about it while installing', () => {
  it('declares EXACTLY two peers, both required, and no runtime dependency at all', () => {
    // By the LIST, not by presence: `toHaveProperty` would pass over a third peer arriving unnoticed,
    // and a third thing on the public signature is the whole point of counting.
    expect(Object.keys(pkg.peerDependencies).sort()).toEqual(['lightweight-charts', 'react']);
    expect(pkg.peerDependenciesMeta['lightweight-charts'].optional).toBe(false);
    expect(pkg.peerDependenciesMeta.react.optional).toBe(false);
    expect(pkg.dependencies).toBeUndefined();
  });

  it('refuses the install and NAMES the range when the peer is below it', () => {
    const result = fakeInstall('4.0.0');
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('ERESOLVE');
    expect(result.output).toContain('Found: lightweight-charts@4.0.0');
    expect(result.output).toContain(`peer lightweight-charts@"${pkg.peerDependencies['lightweight-charts']}"`);
  });

  it('installs clean when the peer is inside it — so the refusal above is about the range', () => {
    const result = fakeInstall('5.2.0');
    expect(result.output).not.toContain('ERESOLVE');
    expect(result.status).toBe(0);
  });
});
