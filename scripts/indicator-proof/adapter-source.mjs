/**
 * THE ADAPTER, LOADED FROM `example/indicators.ts` ITSELF — not from a copy of it.
 *
 * Same doctrine as `oracle-source.mjs`, for the same reason: a port drifts, and the day somebody
 * corrects the adapter while the port keeps the old rule, this stage stops measuring the adapter
 * the demo ships and starts measuring a fossil — while still printing PASS.
 *
 * TWO SUBSTITUTIONS, BOTH DECLARED:
 *
 *   `lightweight-magic-charts` is shimmed. The adapter imports exactly two values from it,
 *   `seriesId` and `utcSeconds`, and both are BRANDS — `utcSeconds(t)` is `t` with a type on it,
 *   which is what it compiles to. Resolving the real package would mean building `dist/` first, and
 *   `npm run proof` deliberately builds nothing: it reads the committed manifest and the vendor, and
 *   nothing under `src/` is involved.
 *
 *   `lightweight-charts-indicators` is left EXTERNAL. The adapter mentions it in exactly one place —
 *   inside `import()`, the loader nothing here calls — so the specifier survives into the bundle
 *   unevaluated. The vendor entries this stage feeds the adapter are the ones the proof already
 *   imported normally, which is what makes `catalogue.rows` and these checks the same numbers.
 *
 * The bundle is evaluated from a `data:` URL and never written to disk, so a proof run leaves the
 * working tree exactly as it found it.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADAPTER = join(HERE, '..', '..', 'example', 'indicators.ts');

/** `seriesId` and `utcSeconds` are brands; the identity is what the compiler leaves behind. */
const SEAM_SHIM = 'export const seriesId = (s) => s;\nexport const utcSeconds = (t) => t;\n';

const seamStub = {
  name: 'seam-shim',
  setup(build) {
    build.onResolve({ filter: /^lightweight-magic-charts$/ }, () => ({
      path: 'lightweight-magic-charts',
      namespace: 'seam-shim',
    }));
    build.onLoad({ filter: /.*/, namespace: 'seam-shim' }, () => ({
      contents: SEAM_SHIM,
      loader: 'js',
    }));
  },
};

export async function loadAdapter() {
  const built = await esbuild.build({
    entryPoints: [ADAPTER],
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2021',
    platform: 'neutral',
    logLevel: 'silent',
    external: ['lightweight-charts-indicators'],
    plugins: [seamStub],
  });
  const js = built.outputFiles[0].text;
  const module = await import(`data:text/javascript;base64,${Buffer.from(js, 'utf8').toString('base64')}`);
  return { module, bytes: js.length };
}
