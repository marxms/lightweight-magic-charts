#!/usr/bin/env node
/**
 * The layout probe: the few facts about this package that ONLY a real browser can answer.
 *
 * WHY IT EXISTS. jsdom has no layout. A region can mount, receive every prop it declares and still
 * be invisible, because what decides that is flex distribution over a measured box — and jsdom
 * computes neither. The compact grid was exactly that: mounted, fed a correct `heightPx`, and 0 px
 * wide on screen. No jsdom assertion could have caught it, and one that asserted the prop had been
 * passed would have been GREEN over the defect.
 *
 * WHAT IT DRIVES. `example/`, which already runs with one command and no backend, mounted against
 * the REAL `lightweight-charts` engine — so the canvas inside the surface is a real canvas with a
 * real minimum content width, which is half of what this probe measures.
 *
 * WHY IT IS NOT IN `npm test`. It needs a downloaded browser, which jest does not and must not. It
 * is declared as its own command so it can be run on demand and in review, and the browser is
 * resolved at RUNTIME so a checkout without one gets a sentence instead of a stack trace.
 *
 * Usage:  npm run layout-probe
 * Exit code 0 means every check passed. Anything else is a failure.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

const chromium = await import('playwright-core').then(
  (module) => module.chromium,
  () => {
    console.error(
      'layout probe: needs a browser driver — `playwright-core` did not resolve, and this probe' +
        ' measures what only a real browser can answer. Install the workspace devDependencies' +
        ' (`npm install`) and a chromium build (`npx playwright install chromium`) first.',
    );
    process.exit(2);
  },
);

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, '..', 'example');
const HOST = '127.0.0.1';

const checks = [];
const check = (id, ok, detail) => {
  checks.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} — ${detail}`);
};

const context = await esbuild.context({
  entryPoints: [join(EXAMPLE, 'main.tsx')],
  outfile: join(EXAMPLE, 'bundle.js'),
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2021',
  jsx: 'automatic',
  logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"' },
});
// Port 0 asks the OS for a free one: a probe that collides with the example server is a false red.
const served = await context.serve({ servedir: EXAMPLE, host: HOST, port: 0 });
const base = `http://${HOST}:${served.port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

try {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="workspace-root"]').waitFor({ timeout: 30_000 });
  // The residual is measured by a ResizeObserver, and the grid is only mounted after the click, so
  // both the first real measurement and the click have to have landed before anything is read.
  await page.waitForTimeout(1500);

  await page.getByRole('button', { name: 'Grid', exact: true }).click();
  await page.waitForTimeout(1500);

  const geometry = await page.evaluate(() => {
    const box = (element) => {
      if (element === null) return null;
      const rect = element.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    };
    const grid = document.querySelector('[data-testid="workspace-grid"]');
    return {
      row: box(document.querySelector('[data-testid="workspace-canvas-row"]')),
      surface: box(document.querySelector('[data-testid="workspace-surface"]')),
      grid: box(grid),
      cells: Array.from(grid?.children ?? []).map((cell) => ({
        ...box(cell),
        // A cell that is laid out but never drew is still the defect: the canvas is the effect.
        canvasWidth: Math.max(0, ...Array.from(cell.querySelectorAll('canvas'), (c) => c.width)),
      })),
    };
  });

  const { row, surface, grid, cells } = geometry;
  /**
   * EVERY THRESHOLD BELOW IS A FRACTION, NEVER `> 0`. The defect this probe was written for had a
   * grid 0 px wide whose cell still measured 1 px (its own left border) and still held a 56 px
   * canvas (the price scale). `> 0` is GREEN over all three, which is the false green the probe
   * exists to refuse: the question is not whether a box exists, it is whether it got the room.
   */
  check(
    'grid-mode-mounts-a-cell',
    cells.length > 0,
    `${cells.length} cell(s) under [data-testid="workspace-grid"]`,
  );
  check(
    'row-is-shared-not-taken',
    grid !== null && surface !== null && grid.width > row.width * 0.2 && surface.width > row.width * 0.2,
    `surface=${surface?.width}, grid=${grid?.width} of row=${row?.width}`,
  );
  // Both clauses below are anchored to the ROW as well as to their own parent: `cell >= column`
  // and `canvas >= cell` are BOTH satisfied by zero, so a column-relative threshold alone is
  // vacuously green on the exact geometry that is broken.
  check(
    'every-cell-fills-its-column',
    grid !== null &&
      cells.length > 0 &&
      cells.every((cell) => cell.width >= grid.width * 0.9 && cell.width > row.width * 0.2),
    `column=${grid?.width}, cells=[${cells.map((cell) => cell.width).join(', ')}], row=${row?.width}`,
  );
  check(
    'every-cell-drew-across-its-width',
    cells.length > 0 &&
      cells.every((cell) => cell.canvasWidth >= cell.width * 0.5 && cell.canvasWidth > row.width * 0.1),
    `cells=[${cells.map((cell) => `${cell.canvasWidth}/${cell.width}`).join(', ')}], row=${row?.width}`,
  );
} finally {
  await browser.close();
  await context.dispose();
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\nlayout probe: ${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
