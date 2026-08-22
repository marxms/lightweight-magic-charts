import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { collectMarkdown } from './sourceScan';

/**
 * AD-016 — the symbol reference is DERIVED, and this is what keeps the files on disk equal to it.
 *
 * THE TWO-WAY CRITERION IS STRUCTURAL HERE, not policed. DOC-10 asks that an exported symbol missing
 * from the reference fail, and DOC-11 that a referenced symbol the entry does not export fail too. A
 * gate that read both lists and compared them would be a third thing to keep correct. Generating the
 * documents from the entry and then asserting the files ARE the generator's output collapses both
 * into one equality: the list comes from the entry, so it cannot name an absent symbol or omit a
 * present one, and the only remaining failure mode — somebody edited by hand what they should have
 * regenerated — is exactly what byte-for-byte equality catches.
 *
 * It is the pattern the README and `example/` already run on (`readmeExample.spec.ts`): one artefact,
 * two places, equality asserted rather than promised.
 *
 * THE REFERENCE IS 51 PAGES, NOT ONE, and the equality is over every one of them. The index was a
 * 450-line catalogue of all 290 symbols, measured against the 300-line ceiling the shape gate holds;
 * it became a map and the symbols moved to a page per module. So the generator is asked for the
 * whole set in ONE spawn (`--json`) — the program is what costs the seconds, and 51 spawns would be
 * a gate people start skipping — and each page is compared, plus the directory itself, so a page
 * left behind by a module that no longer exists fails rather than lingering.
 *
 * THE GENERATOR IS RUN AS A SUBPROCESS, and that is a measurement, not a convenience. Importing it
 * would run it inside this process, inheriting this process's working directory and environment —
 * the two things a "pure function of the entry" must not depend on. Spawning lets the clauses below
 * CHANGE both and require the same bytes, which is the only way to tell a pure generator from one
 * that merely happens to agree today.
 */

const LIB_ROOT = join(__dirname, '..', '..');
const GENERATOR = join(LIB_ROOT, 'scripts', 'gen-reference.mjs');
const REFERENCE = join(LIB_ROOT, 'docs', 'reference');
const INDEX = join(REFERENCE, '_index.md');
const TREE = join(REFERENCE, 'component-tree.md');

/** The ten modules that declare a props interface, and therefore owe a derived prop table. */
const WITH_PROPS = [
  'react/CompactCell.md',
  'react/DensityControls.md',
  'react/DensityLegend.md',
  'react/DrawingToolbar.md',
  'react/SeriesMenu.md',
  'react/surface/ChartSurface.md',
  'react/TimeframeChips.md',
  'react/WorkspaceLegend.md',
  'react/workspace/ChartWorkspace.md',
  'react/WorkspaceTabsBar.md',
];

interface Generated {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** One run of the generator, printing rather than writing, under a caller-chosen cwd and env. */
function generate(
  options: {
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly of?: '--stdout' | '--tree' | '--json';
  } = {},
): Generated {
  const run = spawnSync(process.execPath, [GENERATOR, options.of ?? '--stdout'], {
    cwd: options.cwd ?? LIB_ROOT,
    env: options.env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return { status: run.status, stdout: run.stdout ?? '', stderr: run.stderr ?? '' };
}

const generated = generate();
const onDisk = existsSync(INDEX) ? readFileSync(INDEX, 'utf8') : '';
const generatedTree = generate({ of: '--tree' });
const treeOnDisk = existsSync(TREE) ? readFileSync(TREE, 'utf8') : '';

const manifestRun = generate({ of: '--json' });
const manifest: Readonly<Record<string, string>> =
  manifestRun.status === 0 ? JSON.parse(manifestRun.stdout) : {};
const pagesOnDisk = new Map(collectMarkdown(REFERENCE).map((page) => [page.file, page.text]));

/** Every symbol entry the reference carries, across every page — the catalogue, wherever it lives. */
const allSymbolPages = Object.entries(manifest).filter(
  ([page]) => page !== '_index.md' && page !== 'component-tree.md',
);

/** The first line of every symbol entry, which is what a hand edit would land in. */
const entriesOf = (text: string): readonly string[] =>
  text.split('\n').filter((line) => line.startsWith('- **`'));

const nameOf = (entry: string): string => (entry.match(/^- \*\*`([^`]+)`/) as RegExpMatchArray)[1];

/** The written lines between the page's title and its example — the hand-written half, isolated. */
function summaryOf(text: string): readonly string[] {
  const lines = text.split('\n');
  const title = lines.findIndex((line) => line.startsWith('# `'));
  const example = lines.findIndex((line) => line === '## Example');
  if (title === -1 || example === -1 || example < title) return [];
  return lines.slice(title + 1, example).filter((line) => line.trim().length > 0);
}

const generatedEntries = allSymbolPages.flatMap(([, text]) => entriesOf(text));
const diskEntries = [...pagesOnDisk]
  .filter(([page]) => page !== '_index.md' && page !== 'component-tree.md')
  .flatMap(([, text]) => entriesOf(text));

describe('AD-016 — the symbol reference is what the generator produces, byte for byte', () => {
  it('generates a real reference out of the real entry, so the equality below is over something', () => {
    // POSITIVE CONTROL. Two empty strings are equal, and a generator that silently produced nothing
    // would make every clause here green over an empty directory.
    expect(manifestRun.status).toBe(0);
    expect(allSymbolPages.length).toBeGreaterThanOrEqual(40);
    expect(generatedEntries.length).toBeGreaterThanOrEqual(250);
    // And it reaches BOTH halves of the surface: a values-only or types-only sweep would be a sweep
    // over half the entry while looking exactly as green.
    expect(generatedEntries.filter((entry) => entry.includes('· value ·')).length).toBeGreaterThanOrEqual(90);
    expect(generatedEntries.filter((entry) => entry.includes('· type ·')).length).toBeGreaterThanOrEqual(150);
  });

  it('the index is the MAP, and it links every module it counts', () => {
    // The index stopped being the catalogue when it measured 450 lines against a 300-line ceiling.
    // What it owes now is reachability: a module with no link on this page is a page nobody finds.
    expect(generated.status).toBe(0);
    expect(onDisk).toBe(generated.stdout);
    const linked = [...generated.stdout.matchAll(/\]\(([^)]+\.md)\)/g)].map((hit) => hit[1]);
    for (const [page] of allSymbolPages) expect(linked).toContain(page);
    expect(generated.stdout.split('\n').length).toBeLessThan(300);
  });

  it('every page on disk IS the generator’s output — an edit by hand is a failure, not a change', () => {
    for (const [page, text] of Object.entries(manifest)) {
      expect(`${page}: ${pagesOnDisk.get(page)}`).toBe(`${page}: ${text}`);
    }
  });

  it('carries no page the generator does not produce, so a departed module leaves nothing behind', () => {
    // The other direction of the same equality. Without it, deleting a module from the entry leaves
    // its page documenting a symbol nobody can import, and every clause above stays green.
    expect([...pagesOnDisk.keys()].filter((page) => manifest[page] === undefined)).toEqual([]);
  });

  it('gives every module a written summary and an example, which is the half that is not derived', () => {
    // The derived half cannot go missing; the written half can, and a page that is only a symbol
    // list is the reference this feature exists to replace.
    const bare = allSymbolPages
      .filter(([, text]) => summaryOf(text).length === 0 || !/\n## Example\n\n```tsx?\n/.test(text))
      .map(([page]) => page);
    expect(bare).toEqual([]);
  });

  it('keeps every summary to five lines, so a reference page does not become an explanation', () => {
    // The ceiling is what stops the argument migrating back in. A page that needs more than five
    // lines to say what a module is for is a page whose reasoning belongs under `explanation/`.
    const overlong = allSymbolPages
      .map(([page, text]) => [page, summaryOf(text).length] as const)
      .filter(([, lines]) => lines > 5);
    expect(overlong).toEqual([]);
  });

  it('tables the props of every component that declares them, with type, requiredness and default', () => {
    const missing = WITH_PROPS.filter(
      (page) => !/\n\| Prop \| Type \| Required \| Default \|\n/.test(manifest[page] ?? ''),
    );
    expect(missing).toEqual([]);
    // DERIVED, not typed: the default column has to carry what the code actually writes. A table
    // built from the interface alone would be green above and empty here.
    expect(manifest['react/TimeframeChips.md']).toContain(
      '| `theme` | `WorkspaceTheme \\| undefined` | no | `DEFAULT_WORKSPACE_THEME` |',
    );
    expect(manifest['react/TimeframeChips.md']).toContain('| `options` | `readonly string[]` | yes | — |');
  });

  it('names the symbol when the entry gains one the document has not got', () => {
    // DISCRIMINATION PROOF for DOC-10, served from memory. A symbol arriving in the entry changes
    // the generated text; the file that has not been regenerated no longer equals it, and the
    // difference NAMES the newcomer rather than saying only that two blobs differ.
    const arrived = [...generatedEntries, '- **`brandNewExport`** · value · `() => void`'];
    const undocumented = arrived.map(nameOf).filter((name) => !diskEntries.map(nameOf).includes(name));
    expect(undocumented).toEqual(['brandNewExport']);
  });

  it('names the symbol when the document claims one the entry does not export', () => {
    // DISCRIMINATION PROOF for DOC-11 — the OTHER direction, which a check that only asked "is every
    // export documented" would pass while the page invented names.
    const invented = [...diskEntries, '- **`neverExported`** · value · `() => void`'];
    const phantom = invented.map(nameOf).filter((name) => !generatedEntries.map(nameOf).includes(name));
    expect(phantom).toEqual(['neverExported']);
  });

  it('catches a signature edited by hand, which is the quiet way this file rots', () => {
    // A renamed symbol is loud. A signature quietly widened by a reader-friendly hand is not, and it
    // is the edit that makes a reference lie while still looking complete.
    const [page, text] = allSymbolPages[0];
    const first = entriesOf(text)[0];
    const edited = text.replace(first, first.replace('· value ·', '· type ·'));
    expect(edited).not.toBe(manifest[page]);
  });

  it('draws the composition it actually has, from the drop-in down', () => {
    // POSITIVE CONTROL for the tree. A tree with one node is a tree that resolved nothing, and the
    // clauses below would be green over it.
    expect(generatedTree.status).toBe(0);
    const drawn = generatedTree.stdout
      .split('\n')
      .filter((line) => line.includes('|-- ') || line.includes('`-- '));
    expect(drawn.length).toBeGreaterThanOrEqual(15);
    // It is a TREE, not a list: something is nested at least four levels in, which is the fact a
    // flat listing of imported files could never carry.
    expect(drawn.some((line) => line.startsWith('                '))).toBe(true);
    // Strictly ASCII — no box drawing, so it survives a terminal, a diff and a screen reader.
    expect(generatedTree.stdout).not.toMatch(/[─-╿]/);
    // And each region carries WHERE it is declared, which is what makes it derived rather than drawn.
    expect(drawn.filter((line) => line.includes(' -- react/')).length).toBeGreaterThanOrEqual(12);
  });

  it('the tree on disk IS that output, and a region leaving the composition changes it', () => {
    expect(existsSync(TREE)).toBe(true);
    expect(treeOnDisk).toBe(generatedTree.stdout);
    // DISCRIMINATION PROOF, served from memory: drop a region from the drawing and the equality
    // breaks. The victim is DERIVED from the tree rather than named here — a name typed into this
    // file would pin the composition, and then a region legitimately leaving would fail the gate
    // even after the tree was regenerated, which is the opposite of what it is for.
    const drawn = treeOnDisk.split('\n').filter((line) => line.includes(' -- react/'));
    expect(drawn.length).toBeGreaterThan(0);
    const victim = (drawn[drawn.length - 1].match(/[|`]-- (\w+)/) as RegExpMatchArray)[1];
    const without = treeOnDisk
      .split('\n')
      .filter((line) => !line.includes(victim))
      .join('\n');
    expect(without).not.toBe(generatedTree.stdout);
  });

  it('is a pure function of the entry: no clock, no environment, no working directory', () => {
    // THE PURITY IS MEASURED, not asserted in a comment. The generator runs again from a DIFFERENT
    // working directory and with the environment stripped to nothing, and has to produce the same
    // bytes. A generator that read `process.cwd()`, an env var or the clock fails one of these.
    const elsewhere = generate({ cwd: tmpdir() });
    expect(elsewhere.status).toBe(0);
    expect(elsewhere.stdout).toBe(generated.stdout);

    const bare = generate({ env: { PATH: process.env.PATH ?? '' } });
    expect(bare.status).toBe(0);
    expect(bare.stdout).toBe(generated.stdout);

    // The tree is held to the same rule; it reads a second file, so it has a second way to drift.
    expect(generate({ cwd: tmpdir(), of: '--tree' }).stdout).toBe(generatedTree.stdout);
    // And the whole set, which is what actually ships.
    expect(generate({ cwd: tmpdir(), of: '--json' }).stdout).toBe(manifestRun.stdout);

    // And nothing in any output names THIS machine. An absolute path or a `node_modules` segment
    // would be green here and red on the next checkout, which is a gate nobody can keep.
    for (const output of [generated.stdout, generatedTree.stdout, manifestRun.stdout]) {
      expect(output).not.toMatch(/node_modules/);
      expect(output).not.toMatch(/(?:^|[\s('"])\/[\w.-]+\/[\w.-]+\//m);
    }
  });
});
