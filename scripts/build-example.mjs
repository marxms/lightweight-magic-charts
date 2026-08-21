/**
 * The same example `npm run example` serves, written to disk as a static site instead.
 *
 * ONE SOURCE, TWO OUTPUTS. `example/serve.mjs` bundles in memory for a developer; this writes the
 * identical entry to `example/site/` for a host that only serves files. Both import the package BY
 * NAME rather than by relative path into `src/`, so both exercise the `exports` map and the ESM tree
 * a consumer actually resolves — a demo built against the sources would prove nothing about the
 * package that ships.
 *
 * PRODUCTION, NOT DEVELOPMENT, and the difference is not cosmetic: React ships a whole second
 * codebase of warnings and dev-only checks behind `process.env.NODE_ENV`, and a browser has no
 * `process` at all. The serve path defines it as development on purpose — those warnings are what a
 * developer wants. A published page wants neither the warnings nor the bytes.
 *
 * DECLARED BLIND SPOT: this proves the example BUILDS, never that it renders anything. The only
 * check in this repository that has ever seen a pixel is `scripts/layout-probe.mjs`, and it does not
 * run in a clean clone — see CONTRIBUTING. A green build here and a blank page are compatible.
 */

import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

import { BOOT_CHUNK_CEILING, bootChunkVerdict } from './boot-chunk.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SOURCE = join(ROOT, 'example');
const OUT = join(SOURCE, 'site');

// A stale file from a previous build would be served as though it belonged to this one.
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const result = await esbuild.build({
  entryPoints: [join(SOURCE, 'main.tsx')],
  // `outdir` + `splitting`, NEVER `outfile`: with `outfile` esbuild inlines a dynamically imported
  // module into the entry, so the bytes an `await import()` was written to defer are already on the
  // wire. `entryNames` keeps the entry at `bundle.js`, which is what `index.html` points at.
  outdir: OUT,
  entryNames: 'bundle',
  chunkNames: 'chunk-[hash]',
  splitting: true,
  bundle: true,
  write: true,
  minify: true,
  format: 'esm',
  target: 'es2021',
  jsx: 'automatic',
  metafile: true,
  logLevel: 'info',
  define: { 'process.env.NODE_ENV': '"production"' },
});

// `index.html` already points at `./bundle.js`, a RELATIVE specifier. That is what lets the same
// file work at a project subpath such as /lightweight-magic-charts/ without being rewritten.
cpSync(join(SOURCE, 'index.html'), join(OUT, 'index.html'));

const failed = bootChunkVerdict(result.metafile, 'bundle.js', BOOT_CHUNK_CEILING.production);
if (failed !== null) {
  console.error(`build-example: FAIL — ${failed}`);
  process.exit(1);
}

const bytes = Object.values(result.metafile.outputs).reduce((sum, o) => sum + o.bytes, 0);
console.log(`build-example: OK — ${OUT} (${bytes} B across ${Object.keys(result.metafile.outputs).length} file(s))`);
