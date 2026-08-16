import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * LMC-54, LMC-55 — the README and `example/` are ONE artefact, and this is what keeps them one.
 *
 * The README says the words "verbatim" about two of its blocks, and until now that was a promise
 * kept by hand. Measured on 2026-08-14 it was true byte for byte; nothing repeated the measurement,
 * so the first edit to either side would have made a liar of the other, silently, and the reader
 * who copies from a README does not have the file open next to it to notice.
 *
 * THE PROMISE IS READ, NOT ASSUMED. The block is located through the sentence that introduces it —
 * the one that names the file and says "verbatim" — rather than by counting fences. So deleting the
 * claim fails here too, which is the honest outcome: a README that no longer claims the blocks are
 * the files is a README this gate has nothing to hold.
 *
 * WHAT IT DOES NOT COVER: whether either side is any GOOD. Equality says the two agree, not that
 * they compile — that is `tsconfig.example.json`, which puts `example/` under the type-checker the
 * gate runs, because esbuild erases types without checking them.
 */

const LIB_ROOT = join(__dirname, '..', '..');
const README = readFileSync(join(LIB_ROOT, 'README.md'), 'utf8');

/** Every file the README presents as itself, with the fence language it is presented in. */
const QUOTED: readonly (readonly [string, string])[] = [
  ['example/App.tsx', 'tsx'],
  ['example/catalogue.ts', 'ts'],
];

/** How far after the file's name the word "verbatim" still counts as introducing it. */
const PROMISE_REACH = 120;

function quotedBlock(readme: string, file: string, language: string): string {
  const named = readme.indexOf(`\`${file}\``);
  if (named === -1) throw new Error(`the README does not name ${file}`);
  if (!readme.slice(named, named + PROMISE_REACH).includes('verbatim')) {
    throw new Error(`the README stopped presenting ${file} as verbatim`);
  }
  const fence = `\n\`\`\`${language}\n`;
  const opens = readme.indexOf(fence, named);
  if (opens === -1) throw new Error(`no ${language} block follows the ${file} promise`);
  const from = opens + fence.length;
  const closes = readme.indexOf('\n```\n', from);
  if (closes === -1) throw new Error(`the ${file} block is never closed`);
  return `${readme.slice(from, closes)}\n`;
}

const fileText = (file: string): string => readFileSync(join(LIB_ROOT, file), 'utf8');

describe('T101 — what the README quotes IS the file the example runs', () => {
  it('reads two real blocks out of a real README, so the equality below is over something', () => {
    // Positive control. Two empty strings are equal, and a locator that silently found nothing
    // would make every clause in this file green over an empty README.
    for (const [file, language] of QUOTED) {
      expect(quotedBlock(README, file, language).split('\n').length).toBeGreaterThan(10);
    }
    expect(quotedBlock(README, 'example/App.tsx', 'tsx')).not.toBe(
      quotedBlock(README, 'example/catalogue.ts', 'ts'),
    );
  });

  it('quotes each one byte for byte — not normalised, not summarised', () => {
    const divergent = QUOTED.filter(
      ([file, language]) => quotedBlock(README, file, language) !== fileText(file),
    ).map(([file]) => `FAIL README :: the block presented as ${file} is not ${file}`);
    expect(divergent).toEqual([]);
  });

  it('says so when a block drifts, and when the claim itself is withdrawn', () => {
    // DISCRIMINATION PROOF, served from memory — the two ways this pair can come apart.
    const drifted = README.replace('layout={{ heightPx: 520 }}', 'layout={{ heightPx: 999 }}');
    expect(quotedBlock(drifted, 'example/App.tsx', 'tsx')).not.toBe(fileText('example/App.tsx'));
    // And the locator refuses rather than shrugging: a README that stops making the claim is not a
    // README that keeps it. Silently returning "" here would turn withdrawal into a pass.
    const withdrawn = README.replace('verbatim', 'roughly');
    expect(() => quotedBlock(withdrawn, 'example/App.tsx', 'tsx')).toThrow(
      'stopped presenting example/App.tsx as verbatim',
    );
    expect(() => quotedBlock('no code here at all', 'example/App.tsx', 'tsx')).toThrow(
      'does not name example/App.tsx',
    );
  });
});
