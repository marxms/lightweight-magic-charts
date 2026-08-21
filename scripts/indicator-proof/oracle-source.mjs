/**
 * THE ORACLE, LOADED FROM `example/studies.ts` ITSELF — not from a copy of it.
 *
 * `counter-impl.mjs` is a port, and a port drifts. The moment somebody corrects a convention in
 * `example/studies.ts` and the port keeps the old one, layer B stops comparing the vendor against
 * this repository's own arithmetic and starts comparing it against a fossil — while still printing
 * AGREE. So the four functions are read out of the real file, stripped of their TypeScript by the
 * bundler this repository already pins, and evaluated. The port is then held to them EXACTLY: any
 * difference at all is drift, and drift is reported as drift rather than absorbed into a tolerance.
 *
 * `utcSeconds` is the only symbol the region imports, and it is a BRAND — `utcSeconds(t)` is `t`
 * with a type on it. Shimmed as the identity, which is what it compiles to.
 *
 * This is also the executable half of "`example/studies.ts` is the oracle and may not be deleted":
 * delete it, rename the functions, or change their shape, and this fails before anything else runs.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

const ORACLE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'example', 'studies.ts');
const NAMES = ['movingAverage', 'relativeStrength', 'exponentialAverage', 'convergence'];

export function readOracle() {
  const text = readFileSync(ORACLE, 'utf8');
  const from = text.indexOf('function movingAverage(');
  const to = text.indexOf('function providerOf(');
  if (from < 0 || to < 0 || to <= from) {
    throw new Error('example/studies.ts no longer declares the four study functions between movingAverage and providerOf');
  }
  const region = text.slice(from, to);
  for (const name of NAMES) {
    if (!region.includes(`function ${name}(`)) throw new Error(`example/studies.ts no longer declares ${name}`);
  }
  const source = `const utcSeconds = (t) => t;\n${region}\nexport { ${NAMES.join(', ')} };\n`;
  const js = esbuild.transformSync(source, { loader: 'ts', format: 'esm', target: 'es2021' }).code;
  return { js, lines: region.split('\n').length };
}

export async function loadOracle() {
  const { js, lines } = readOracle();
  const module = await import(`data:text/javascript;base64,${Buffer.from(js, 'utf8').toString('base64')}`);
  return { module, lines };
}
