import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

/**
 * LMC-76, LMC-77 — the published name, and the misspelling that may not come back.
 *
 * The package used to be called `@sftm/<typo>-magic-charts`. Two defects in one string: an internal
 * scope that means nothing outside this monorepo, and a typo sitting in the `name` field — which is
 * the field that goes to the registry. A typo in a folder is an annoyance; a typo in the published
 * name is permanent, because the first install is what every later consumer copies.
 *
 * WHY THE NEEDLE IS ASSEMBLED FROM TWO HALVES. This file has to name the string it forbids in order
 * to search for it, and a guard that exempts itself has a hole shaped exactly like the thing it
 * guards. Composing the needle keeps the file clean of it, so the scan covers this file too — no
 * exemption, no hole.
 *
 * SCOPE IS WHAT GIT TRACKS. `git ls-files` is the repository; `dist/`, `node_modules/` and editor
 * caches are output a rebuild replaces. Scanning output would report a stale artefact as a source
 * defect and send the reader to a file nobody edits.
 */

const REPO_ROOT = resolve(join(__dirname, '..', '..', '..', '..'));
const LIB_ROOT = join(__dirname, '..', '..');

/** The typo, never written whole. See the header: this file is inside its own scan. */
const MISSPELLING = `light${'wight'}`;
const CORRECT = 'lightweight';
/** The retired scope, which a typo hunt alone would walk straight past. */
const RETIRED_SCOPE = `@sftm/${CORRECT}-magic-charts`;

interface Hit {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/**
 * The exemptions, declared — each with its reason and a case that exercises it.
 *
 * These two trees are the RECORD, not the product. `.specs/STATE.md` carries the decision that
 * removed the typo (AD-009), and that decision cannot be stated without naming what it removed: a
 * log forbidden from naming the defect it closed stops being a log. `openspec/changes/archive/` is
 * frozen by definition — rewriting an archived plan produces a plan that was never written.
 *
 * Every other tracked path is in scope: source, configuration, script, test, lockfile, document.
 */
interface Exemption {
  readonly name: string;
  readonly reason: string;
  readonly covers: (file: string) => boolean;
}

const EXEMPT: readonly Exemption[] = [
  {
    name: 'spec-driven decision record',
    reason: 'AD-009 names the misspelling in order to say what it fixed; banning that bans the record',
    covers: (file) => file.startsWith('.specs/'),
  },
  {
    name: 'archived OpenSpec plan',
    reason: 'an archived plan is frozen — rewriting it produces a plan that was never written',
    covers: (file) => file.startsWith('openspec/changes/archive/'),
  },
];

const exempt = (file: string): boolean => EXEMPT.some((entry) => entry.covers(file));

/**
 * Tracked files PLUS untracked ones that are not ignored — never `--cached` alone.
 *
 * `git ls-files` on its own lists the index, so a brand-new file is invisible until someone stages
 * it: the gate would go green over a file it never opened, and the author would only learn about the
 * misspelling on the commit AFTER the one that introduced it. `--others --exclude-standard` adds
 * exactly what a `git add .` would add, and nothing a rebuild regenerates.
 */
function trackedFiles(): readonly string[] {
  return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: REPO_ROOT,
    maxBuffer: 64 * 1024 * 1024,
  })
    .toString('utf8')
    .split('\0')
    .filter((file) => file.length > 0);
}

/**
 * Text only: a NUL byte says binary, and a byte offset inside a PNG is not a line of prose.
 *
 * FALLS BACK TO THE INDEX, and does not skip. `git ls-files` lists index entries, and an entry
 * marked `skip-worktree` — this repository has one, a secrets file — has no copy on disk. Dropping
 * what fails to open would make "make the file unreadable" the cheapest way past this gate; reading
 * the indexed blob keeps the scan over everything a clone would receive.
 */
function readText(file: string): string | null {
  const buffer = existsSync(join(REPO_ROOT, file))
    ? readFileSync(join(REPO_ROOT, file))
    : execFileSync('git', ['show', `:${file}`], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 });
  if (buffer.includes(0)) return null;
  return buffer.toString('utf8');
}

/**
 * The whole line decides; the truncation is for the REPORT only.
 *
 * Matching against a truncated line would make a lockfile — where one line is thousands of
 * characters — the cheapest place in the repository to hide the name.
 */
function hitsIn(file: string, text: string): Hit[] {
  return text
    .split('\n')
    .map((line, index) => ({ line: index + 1, whole: line }))
    .filter((row) => row.whole.includes(MISSPELLING) || row.whole.includes(RETIRED_SCOPE))
    .map((row) => ({ file, line: row.line, text: row.whole.trim().slice(0, 120) }));
}

const report = (hit: Hit): string => `FAIL ${hit.file}:${hit.line} :: ${hit.text}`;

const scanned = trackedFiles().filter((file) => !exempt(file));
const hits: readonly Hit[] = scanned.flatMap((file) => {
  const text = readText(file);
  return text === null ? [] : hitsIn(file, text);
});

const manifest = JSON.parse(readFileSync(join(LIB_ROOT, 'package.json'), 'utf8')) as {
  name: string;
  version: string;
  repository?: { url?: string; directory?: string };
  homepage?: string;
  keywords?: readonly string[];
};

describe('LMC-76 — the published name', () => {
  it('declares a name with no scope and no misspelling', () => {
    expect(manifest.name).toBe('lightweight-magic-charts');
    expect(manifest.name.includes(MISSPELLING)).toBe(false);
    expect(manifest.name.startsWith('@')).toBe(false);
  });

  it('is findable and attributable: version, repository, homepage and keywords', () => {
    // `0.0.0` is not a version, it is the absence of one — and a package with no repository and no
    // keywords is unfindable in the registry and unattributable to whoever does find it.
    expect(manifest.version).not.toBe('0.0.0');
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.repository?.url).toContain('github.com');
    // A monorepo publishes from a subdirectory: without this, the registry link lands on the root.
    expect(manifest.repository?.directory).toBe(`libs/${manifest.name}`);
    expect(manifest.homepage).toContain(manifest.name);
    expect(manifest.keywords?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it('the folder on disk carries the same name as the manifest', () => {
    expect(LIB_ROOT.endsWith(`libs/${manifest.name}`)).toBe(true);
  });
});

describe('LMC-77 — the misspelling does not come back', () => {
  it('reads the real tree, so that a green gate is not a gate over nothing', () => {
    // Positive control on the sweep: it sees many files, and it sees the ones that matter.
    expect(scanned.length).toBeGreaterThan(300);
    expect(scanned).toContain('scripts/quality-gate.sh');
    expect(scanned).toContain('package-lock.json');
    expect(scanned).toContain(`libs/${manifest.name}/package.json`);
    // And it reads THIS file — the assembled needle is what makes that possible with no hole.
    expect(scanned).toContain(`libs/${manifest.name}/test/gates/packageName.spec.ts`);
  });

  it('no live site carries the misspelling or the retired scope', () => {
    expect(hits.map(report)).toEqual([]);
  });

  it('a planted line fails, and the same line corrected passes', () => {
    // DISCRIMINATION PROOF, served from memory: the text that fails and the text that passes differ
    // by one character, which is exactly the difference this gate exists to see.
    const planted = `import { ChartWorkspace } from '${MISSPELLING}-magic-charts';`;
    const corrected = `import { ChartWorkspace } from '${CORRECT}-magic-charts';`;
    expect(hitsIn('synthetic/Planted.ts', planted).map(report)).toEqual([
      `FAIL synthetic/Planted.ts:1 :: ${planted}`,
    ]);
    expect(hitsIn('synthetic/Corrected.ts', corrected)).toEqual([]);
    // And the retired scope spelled CORRECTLY, which a typo hunt alone would let through.
    expect(hitsIn('synthetic/Scoped.ts', `import x from '${RETIRED_SCOPE}';`).length).toBe(1);
    // A long line is read whole: hiding the name past column 120 is not hiding it.
    const buried = `${'x'.repeat(4000)} ${MISSPELLING}-magic-charts`;
    expect(hitsIn('synthetic/Buried.ts', buried).length).toBe(1);
  });

  it('every exemption has a written reason and is exercised by a real file', () => {
    // An exemption that never matches is one nobody tested; one that matches files which do not
    // carry the string is wider than the defect. Both halves are asserted.
    const tracked = trackedFiles();
    for (const entry of EXEMPT) {
      expect(entry.reason.length).toBeGreaterThan(20);
      const covered = tracked.filter(entry.covers);
      expect(covered.length).toBeGreaterThan(0);
      const carrying = covered.filter((file) => (readText(file) ?? '').includes(MISSPELLING));
      expect(carrying.length).toBeGreaterThan(0);
    }
    expect(EXEMPT.map((e) => e.name)).toEqual([
      'spec-driven decision record',
      'archived OpenSpec plan',
    ]);
  });
});
