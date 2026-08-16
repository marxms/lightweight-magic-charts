/**
 * The one command: bundle `main.tsx` and serve it, with no backend behind it and nothing to sign in
 * to. esbuild is already a devDependency of this package — the size probe drives it — so the example
 * costs no new tool.
 *
 * NOTHING IS WRITTEN TO DISK, AND `write: false` IS WHAT MAKES THAT TRUE. Serving from `servedir`
 * is not enough on its own — measured: the first run of this file left a 4.7 MB `bundle.js` next to
 * these sources, which is one more thing to gitignore and one more way for the tarball to grow. With
 * the flag, the output lives in memory and exists only for the browser that asks for it.
 *
 * THE PACKAGE IS IMPORTED BY NAME, not by relative path into `src/`. That is what a consumer writes,
 * so it is what this exercises: the `exports` map, the `import` condition and the ESM tree the
 * `example` script builds first.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';
const PORT = 5173;

const context = await esbuild.context({
  entryPoints: [join(HERE, 'main.tsx')],
  outfile: join(HERE, 'bundle.js'),
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2021',
  jsx: 'automatic',
  sourcemap: 'inline',
  logLevel: 'info',
  // React and the chart library both branch on it, and a browser has no `process`.
  define: { 'process.env.NODE_ENV': '"development"' },
});

const served = await context.serve({ servedir: HERE, host: HOST, port: PORT });
const at = served.hosts.includes(HOST) ? HOST : (served.hosts[0] ?? HOST);
console.log(`example: http://${at}:${served.port} — Ctrl-C to stop`);
