/**
 * THE BOOT CHUNK — what a visitor downloads before anything is on screen, and its ceiling.
 *
 * WHY THIS EXISTS AT ALL. Both bundlers in this repository were written with `outfile` and without
 * `splitting`, and esbuild in that configuration INLINES a dynamically imported module into the
 * entry. The `await import()` still type-checks, still runs, still resolves — and the bytes it was
 * written to defer are already on the wire. Measured on this repository's own example, with the
 * indicator library behind a dynamic import: 1,122,785 B at boot against 17,943 B with `outdir` and
 * `splitting: true`. Sixty-two times the payload, with nothing red anywhere.
 *
 * A CONFIGURATION FLAG IS NOT A GUARANTEE. `splitting: true` can be deleted, an `outfile` can come
 * back in a refactor, and both edits look harmless in a diff. So the flag is not what is asserted:
 * the RESULT is. The entry chunk's bytes are measured after every build and compared against a
 * ceiling written down here, so an inlined module fails on the number rather than on the spelling.
 *
 * TWO CEILINGS, BECAUSE THERE ARE TWO BUILDS. `scripts/build-example.mjs` minifies and defines
 * production; `scripts/e2e-demo.mjs` does neither, on purpose — React's development build is what a
 * developer wants to see warnings from. One number over both would be a ceiling about neither.
 *
 * ONE DEFINITION, TWO CALLERS, following `test/gates/sourceScan.ts`: the day somebody moves a
 * ceiling, both builds move with it, and a build that split while the other one did not would
 * measure nothing.
 */

import * as esbuild from 'esbuild';

/**
 * Measured 2026-08-21 on the example entry, at `outdir` + `splitting: true`, with the esbuild
 * version `size-budget.json` pins EXACTLY.
 *
 *   production, minified   702,078 B  -> ceiling 772,285 (band C's 10%)
 *   development, plain   1,886,983 B  -> ceiling 2,075,681 (band C's 10%)
 *
 * RE-MEASURED 2026-08-21 once the example split into five files, now over the entry AND the
 * transitive closure of its static imports: production 707,648 B, development 1,898,703 B. Both
 * stay under the ceilings above, so the ceilings do NOT move — a ratchet that rises to meet its
 * measurement is a number, not a gate. The 1,097,033 B of indicator library and the 185,299 B of
 * committed catalogue are reached through `dynamic-import` edges and are correctly outside the
 * closure; turning either into a static import puts it inside and turns this red.
 *
 * The slack is band C's, for the same reason the byte budget gives it: growth here is a design event
 * somebody has to defend, and 10% is wide enough for the host code this example is still gaining and
 * far too narrow to hide a 1.05 MB library arriving at boot.
 */
export const BOOT_CHUNK_CEILING = Object.freeze({
  production: 772285,
  development: 2075681,
});

/**
 * Bytes of everything the page must have before the entry can run: the entry output plus the
 * transitive closure of its STATIC imports.
 *
 * IT USED TO BE THE ENTRY ALONE, and that stopped being the same number the moment the example
 * gained a second chunk. With `splitting: true` esbuild hoists shared code out of the entry into a
 * chunk the entry then imports with a plain `import` statement — so a dependency that quietly
 * became static would leave the entry small and arrive at boot anyway, which is precisely the
 * regression this ceiling exists to see. A `dynamic-import` edge is NOT followed: that is the
 * deferral being measured.
 */
export function bootChunkBytes(metafile, entryFile) {
  const outputs = Object.entries(metafile.outputs);
  const entry = outputs.find(([file]) => file.endsWith(entryFile));
  if (entry === undefined) return null;
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return 0;
    seen.add(file);
    const output = metafile.outputs[file];
    if (output === undefined) return 0;
    return (output.imports ?? [])
      .filter((edge) => edge.kind === 'import-statement')
      .reduce((sum, edge) => sum + walk(edge.path), output.bytes);
  };
  return walk(entry[0]);
}

/** The verdict, as a sentence: `null` when it is under, and the reason when it is not. */
export function bootChunkVerdict(metafile, entryFile, ceiling) {
  const bytes = bootChunkBytes(metafile, entryFile);
  if (bytes === null) {
    return `no output named ${entryFile} — the entry moved, so nothing is being measured`;
  }
  if (bytes > ceiling) {
    return (
      `boot chunk ${bytes} B over the ceiling of ${ceiling} B. A dynamically imported module is ` +
      'being INLINED into the entry: check that the build uses `outdir` with `splitting: true` ' +
      'rather than `outfile`, which is the configuration that silently costs 62x.'
    );
  }
  return null;
}

/**
 * THE POSITIVE CONTROL, built in memory and never written to disk.
 *
 * A ceiling nothing has ever been measured against is a number, not a gate. This builds ONE
 * synthetic entry whose only weight sits behind an `await import()`, twice — once the way both
 * scripts used to be configured, once the way they are configured now — and reports both boot
 * chunks. The claim the ceiling rests on is that those two numbers are far apart, and this is where
 * that claim is measured rather than asserted.
 */
export async function splittingControl(heavyBytes = 400000) {
  const payload = 'x'.repeat(heavyBytes);
  const common = {
    entryPoints: ['entry.js'],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2021',
    metafile: true,
    logLevel: 'silent',
    plugins: [
      {
        name: 'synthetic',
        setup(build) {
          build.onResolve({ filter: /^(entry|heavy)\.js$/ }, (args) => ({
            path: args.path,
            namespace: 'synthetic',
          }));
          build.onLoad({ filter: /.*/, namespace: 'synthetic' }, (args) => ({
            contents:
              args.path === 'entry.js'
                ? "export const boot = async () => (await import('heavy.js')).payload.length;"
                : `export const payload = '${payload}';`,
            loader: 'js',
          }));
        },
      },
    ],
  };

  const inlined = await esbuild.build({ ...common, outfile: 'out/bundle.js' });
  const split = await esbuild.build({
    ...common,
    outdir: 'out',
    entryNames: 'bundle',
    chunkNames: 'chunk-[hash]',
    splitting: true,
  });
  return {
    heavyBytes,
    inlined: bootChunkBytes(inlined.metafile, 'bundle.js'),
    split: bootChunkBytes(split.metafile, 'bundle.js'),
    chunks: Object.keys(split.metafile.outputs).length,
  };
}
