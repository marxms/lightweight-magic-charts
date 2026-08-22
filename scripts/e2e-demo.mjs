#!/usr/bin/env node
/**
 * The E2E suite: the only check in this repository that mounts the demo in a real browser and
 * interacts with it the way a visitor would.
 *
 * WHY IT EXISTS. On 2026-08-16 the owner found seven defects in `example/` by hand, one at a time:
 * an empty volume pane, an empty studies panel, a heatmap that painted nothing, a drawing tool that
 * armed and never drew, a price alert that could be added but never removed, four of six chosen
 * studies silently not plotting, and drawing-tool glyphs rendered as an empty box (`□`). Every
 * one of them mounted with ZERO console errors and ZERO exceptions — `npm test`'s 1198 cases all ran
 * green, because none of them render a pixel. `scripts/layout-probe.mjs` is the only other check in
 * this repository that ever has, and its own docblock names its blind spot: it measures GEOMETRY,
 * never content. A pane can be exactly the right size and still draw nothing inside it.
 *
 * WHAT THIS PROVES AND WHAT IT REFUSES TO PROVE. Every check below reads a NUMBER (a legend value,
 * a `data-testid` counter) or a CONTROL comparison (the same canvas region before/after an action,
 * or before/after a toggle). None of it asserts a raw pixel count or a screenshot-equals-golden-file:
 * both are exactly the kind of brittle assertion that breaks on an unrelated font or theme change
 * and teaches a maintainer to ignore red. The one place canvas content genuinely has to be read (the
 * density field, the drawing preview, the price-alert line — none of which exist as DOM nodes) this
 * reads actual pixel bytes via `getImageData` and diffs them against a captured control state, never
 * against a hard-coded colour count.
 *
 * WHY IT IS ITS OWN SCRIPT, NOT A JEST SUITE. `jest.config.js`'s own docblock is explicit about why
 * `testEnvironment` stays `node` by default: most of this package is browser-free arithmetic, and
 * jsdom has no canvas, no real layout and no real pointer/mouse semantics — exactly the three things
 * every check below depends on. `@playwright/test` was considered and rejected: it would add a
 * second test runner, its own config and, in CI, a browser download on every one of the three Node
 * versions the gate matrices over — geometry and canvas content that does not vary by Node version.
 * `playwright-core` is ALREADY a devDependency (it drives `scripts/layout-probe.mjs`), so driving it
 * directly from a plain script costs nothing new. This file follows that probe's own shape: a
 * `check()` helper, one browser, PASS/FAIL lines, and a process exit code — the established house
 * style for "a real measurement", not a reinvention of it.
 *
 * WHY IT RUNS IN CI DESPITE THE GEOMETRY JOB BEING REMOVED. `CONTRIBUTING.md` documents a browser
 * job that no longer exists in `.github/workflows/ci.yml` — the owner removed it. This suite is a
 * deliberate reinstatement, scoped tighter than that job was: ONE job, ONE Node version, not the
 * three-way matrix `npm test` runs under, because none of what is measured here (a legend number, a
 * canvas pixel, a drawing count) varies by Node runtime — only by browser and by markup, both of
 * which are constant across the matrix.
 *
 * Usage:  npm run e2e
 * Exit code 0 means every check passed. Anything else is a failure — including a failure to even
 * launch a browser, which prints a sentence naming what is missing rather than a stack trace.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

import { BOOT_CHUNK_CEILING, bootChunkVerdict, splittingControl } from './boot-chunk.mjs';

const chromium = await import('playwright-core').then(
  (module) => module.chromium,
  () => {
    console.error(
      'e2e-demo: needs a browser driver — `playwright-core` did not resolve. Install the workspace ' +
        'devDependencies (`npm install`) and a chromium build (`npx playwright-core install chromium`) first.',
    );
    process.exit(2);
  },
);

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = join(HERE, '..', 'example');
/** The committed catalogue, so "what the form offers" is compared against the artefact, not a copy. */
const CATALOGUE = JSON.parse(readFileSync(join(HERE, '..', 'example', 'indicators', 'manifest.json'), 'utf8'));
const HOST = '127.0.0.1';
const VIEWPORT = { width: 1400, height: 900 };
/** How long the demo's own settle timers (ResizeObserver, chart auto-fit) need before a read is honest. */
const SETTLE_MS = 900;
const ACTION_SETTLE_MS = 300;

const checks = [];
const check = (id, ok, detail) => {
  checks.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id} — ${detail}`);
};

// ---------------------------------------------------------------------------------------------
// Shared page helpers. Every scene starts from a FRESH page: no scene leaks state into the next,
// per the same isolation rule every other suite in this repository follows.
// ---------------------------------------------------------------------------------------------

/** Console errors and uncaught exceptions, collected from the moment the page is created. */
function watchConsole(page) {
  const errors = [];
  const warnings = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
    if (message.type() === 'warning') warnings.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  return { errors, warnings };
}

/** `viewport` is optional: every scene but the rail one runs at the shared `VIEWPORT`. */
async function freshPage(browser, base, viewport = VIEWPORT) {
  const page = await browser.newPage({ viewport });
  const console_ = watchConsole(page);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="workspace-root"]').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(SETTLE_MS);
  return { page, console_ };
}

async function openStudies(page) {
  await page.getByRole('button', { name: 'Studies', exact: true }).click();
  await page.waitForTimeout(ACTION_SETTLE_MS);
}

async function pickStudy(page, category, entryId) {
  await page.locator(`[data-testid="workspace-catalogue-category-${category}"]`).click();
  await page.waitForTimeout(150);
  await page.locator(`[data-testid="workspace-catalogue-entry-${entryId}"]`).click();
  await page.waitForTimeout(200);
}

/**
 * READINGS THAT ARE ACTUALLY DRAWN on a legend line, counted one span at a time.
 *
 * The instrument used to be the opposite — count the em dashes and watch the number fall — and that
 * only worked while every unoccupied over-price slot carried a placeholder label. The host now mints
 * one slot per line the catalogue declares, 336 of them, labelled `''` exactly as `laneDraft` labels
 * a lane's; an unoccupied one is filtered out of the legend entirely, so there is no dash left to
 * lose. Counting what arrived is the stronger question anyway: a line that draws is a span with a
 * number in it, and a study that resolved five lines and drew one is the defect this feature is for.
 *
 * A LABELLED entry is not counted: `O 147.48` and `+0.01%` belong to the price series and to the
 * change, and neither moves when a study is picked.
 */
async function drawnReadingCount(page, testId) {
  return page.evaluate((id) => {
    const line = document.querySelector(`[data-testid="${id}"]`);
    if (line === null) return 0;
    return Array.from(line.querySelectorAll('span')).filter((span) =>
      /^[+-]?[\d,]+(\.\d+)?$/.test((span.textContent ?? '').trim()),
    ).length;
  }, testId);
}

/**
 * How many pixels of the surface carry a given hue — read from the bitmap, never from a call.
 *
 * A translucent fill lands on a pane layer whose own background is transparent, so the byte that
 * says "this was painted" is the alpha, and the three that say WHICH fill are the channels. Both are
 * compared with a tolerance because the base library composites onto the layer before we read it.
 */
async function hueCount(page, hostSelector, rgb, tolerance = 6) {
  return page.evaluate(
    ({ selector, want, slack }) => {
      const host = document.querySelector(selector);
      if (host === null) return 0;
      let found = 0;
      for (const canvas of host.querySelectorAll('canvas')) {
        const ctx = canvas.getContext('2d');
        if (ctx === null || canvas.width === 0 || canvas.height === 0) continue;
        let data;
        try {
          data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        } catch {
          continue;
        }
        for (let at = 0; at < data.length; at += 4) {
          if (data[at + 3] === 0) continue;
          if (
            Math.abs(data[at] - want[0]) <= slack &&
            Math.abs(data[at + 1] - want[1]) <= slack &&
            Math.abs(data[at + 2] - want[2]) <= slack
          ) {
            found += 1;
          }
        }
      }
      return found;
    },
    { selector: hostSelector, want: rgb, slack: tolerance },
  );
}

/** A cheap, deterministic checksum of every canvas the surface currently draws. Identical inputs and
 * an identical chart state always produce the identical number — the candles come from a fixed seed
 * and nothing here reads the clock, so this is a legitimate equality check, not a fragile one. */
async function canvasChecksum(page, hostSelector) {
  return page.evaluate((selector) => {
    const host = document.querySelector(selector);
    const canvases = Array.from(host.querySelectorAll('canvas'));
    let sum = 0;
    let sampled = 0;
    for (const canvas of canvases) {
      const ctx = canvas.getContext('2d');
      if (ctx === null || canvas.width === 0 || canvas.height === 0) continue;
      let data;
      try {
        data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      } catch {
        continue;
      }
      // Every 97th byte: prime stride so the sample does not alias a repeating pattern, dense
      // enough that a colour swap anywhere on the field changes the sum.
      for (let index = 0; index < data.length; index += 97) {
        sum = (sum + data[index]) % 1_000_000_007;
        sampled += 1;
      }
    }
    return { sum, sampled };
  }, hostSelector);
}

/**
 * The row (in PAGE pixels) where a given colour is most present across a canvas, scanning only the
 * WIDE canvases (the pane's own content) and skipping the narrow price-axis canvas beside them —
 * this is what makes the alert line's y-coordinate and the drawing preview's presence readable
 * without ever decoding a screenshot.
 */
async function widestColourRow(page, hostSelector, rgb, tolerance = 20) {
  return page.evaluate(
    ({ selector, target, tol }) => {
      const host = document.querySelector(selector);
      const canvases = Array.from(host.querySelectorAll('canvas')).filter((c) => c.width > 200);
      let best = null;
      for (const canvas of canvases) {
        const ctx = canvas.getContext('2d');
        if (ctx === null) continue;
        const { width: w, height: h } = canvas;
        let data;
        try {
          data = ctx.getImageData(0, 0, w, h).data;
        } catch {
          continue;
        }
        const rect = canvas.getBoundingClientRect();
        const scaleY = rect.height / h;
        // Six columns spread across the width: a dashed line's "off" segment at any one of them
        // still leaves the others to catch the "on" segment of the same row.
        const sampleXs = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((f) => Math.floor(w * f));
        const rowHits = new Map();
        for (let y = 0; y < h; y += 1) {
          let hit = 0;
          for (const x of sampleXs) {
            const index = (y * w + x) * 4;
            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];
            const a = data[index + 3];
            if (a === 0) continue;
            if (Math.abs(r - target[0]) <= tol && Math.abs(g - target[1]) <= tol && Math.abs(b - target[2]) <= tol) {
              hit += 1;
            }
          }
          if (hit > 0) rowHits.set(y, hit);
        }
        for (const [y, hit] of rowHits) {
          if (best === null || hit > best.hit) {
            best = {
              hit,
              pageY: rect.top + y * scaleY,
              pageX: rect.left + rect.width * 0.5,
              rectTop: rect.top,
            };
          }
        }
      }
      return best;
    },
    { selector: hostSelector, target: rgb, tol: tolerance },
  );
}

/** How many pixels across every wide canvas match a colour — the coarse presence sensor the drawing
 * preview check uses: not WHERE the preview is, only WHETHER something newly blue got painted. */
async function colourPixelCount(page, hostSelector, rgb, tolerance = 15) {
  return page.evaluate(
    ({ selector, target, tol }) => {
      const host = document.querySelector(selector);
      const canvases = Array.from(host.querySelectorAll('canvas')).filter((c) => c.width > 200);
      let matches = 0;
      for (const canvas of canvases) {
        const ctx = canvas.getContext('2d');
        if (ctx === null) continue;
        let data;
        try {
          data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        } catch {
          continue;
        }
        for (let index = 0; index < data.length; index += 4) {
          const r = data[index];
          const g = data[index + 1];
          const b = data[index + 2];
          const a = data[index + 3];
          if (a === 0) continue;
          if (Math.abs(r - target[0]) <= tol && Math.abs(g - target[1]) <= tol && Math.abs(b - target[2]) <= tol) {
            matches += 1;
          }
        }
      }
      return matches;
    },
    { selector: hostSelector, target: rgb, tol: tolerance },
  );
}

/**
 * The host's read-only probe, and the two gestures below have no other observable: an anchor's
 * PRICE lives inside the drawing engine and the visible bar range lives inside the time scale.
 * Declared in `example/drawing.ts`, where the reason is written next to it.
 */
const drawingProbe = (page, member) =>
  page.evaluate((name) => window.__lmcDrawingProbe[name](), member);

/** Arms the one-anchor tool, clicks once, and answers the PRICE the anchor landed on. */
async function placeHorizontalLine(page, x, y) {
  await page.locator('[data-testid="workspace-drawing-tool-horizontal-line"]').click();
  await page.waitForTimeout(120);
  await page.mouse.move(x, y, { steps: 6 });
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(220);
  const anchors = await drawingProbe(page, 'anchors');
  return anchors.length === 0 ? null : anchors[anchors.length - 1].price;
}

/** The four REAL values of the bar under `x`, read off the legend the chart prints for it. */
async function hoveredBar(page, x, y) {
  await page.mouse.move(x, y, { steps: 4 });
  await page.waitForTimeout(ACTION_SETTLE_MS);
  const text = (await page.locator('[data-testid="workspace-legend-price"]').textContent()) ?? '';
  const read = text.match(/O\s*([\d.]+)\s*H\s*([\d.]+)\s*L\s*([\d.]+)\s*C\s*([\d.]+)/);
  if (read === null) return null;
  return { open: +read[1], high: +read[2], low: +read[3], close: +read[4] };
}

const SURFACE_HOST = '[data-testid="workspace-surface"] [role="img"]';
/** `DEFAULT_PRICE_ALERT_STYLE.idleColor` and the drawing preview's stroke — both `#2962FF` in the
 * demo. See `src/alerts/priceAlerts.ts` and `example/drawingPreview.ts`. */
const ALERT_BLUE = [41, 98, 255];

function reportConsole(id, console_) {
  check(
    id,
    console_.errors.length === 0,
    console_.errors.length === 0
      ? 'zero console errors and zero uncaught exceptions'
      : `${console_.errors.length} error(s): ${console_.errors.slice(0, 3).join(' | ')}`,
  );
}

// ---------------------------------------------------------------------------------------------
// Scene 1 — the page mounts clean, and the two panes the owner found empty by hand actually read.
// ---------------------------------------------------------------------------------------------
async function sceneMount(browser, base) {
  const { page, console_ } = await freshPage(browser, base);

  reportConsole('mount.console-clean', console_);
  check('mount.root-visible', await page.locator('[data-testid="workspace-root"]').isVisible(), 'workspace-root rendered');

  const priceLegend = await page.locator('[data-testid="workspace-legend-price"]').textContent();
  check(
    'mount.price-pane-drew',
    /C\xa0\d/.test(priceLegend ?? ''),
    `price legend close reading: ${JSON.stringify(priceLegend)}`,
  );

  // THE DEFECT THIS TARGETS: a volume lane titled "Traded volume" with nothing behind it, because
  // no `data.read` reading ever arrived for the series the pane declared.
  const volumeLegend = await page.locator('[data-testid="workspace-legend-volume"]').textContent();
  check(
    'mount.volume-pane-has-numeric-reading',
    /\d/.test(volumeLegend ?? '') && !/—$/.test((volumeLegend ?? '').trim()),
    `volume legend: ${JSON.stringify(volumeLegend)}`,
  );

  await page.close();
}

// ---------------------------------------------------------------------------------------------
// Scene 2 — the studies catalogue is not empty, and picking one entry of EACH placement produces a
// numeric legend reading where there was a mute one before.
// ---------------------------------------------------------------------------------------------
async function sceneStudiesCatalogue(browser, base) {
  const { page, console_ } = await freshPage(browser, base);

  await openStudies(page);
  check('catalogue.panel-open', await page.locator('[data-testid="workspace-catalogue"]').isVisible(), 'catalogue panel visible');

  const overCategory = page.locator('[data-testid="workspace-catalogue-category-Over-the-price"]');
  const ownCategory = page.locator('[data-testid="workspace-catalogue-category-Own-lane"]');
  check(
    'catalogue.not-empty',
    (await overCategory.count()) === 1 && (await ownCategory.count()) === 1,
    'both "Over the price" and "Own lane" categories are present',
  );

  await overCategory.click();
  await page.waitForTimeout(150);
  const overEntries = await page.locator('[data-testid="workspace-catalogue-results"] [data-testid^="workspace-catalogue-entry-"]').count();
  check('catalogue.over-price-has-entries', overEntries > 0, `${overEntries} entries under "Over the price"`);

  // OWN-LANE FIRST: a lane's index is the pick's LIST POSITION (`resolveSources` / `laneOrder`
  // assign lane = index in the chosen list, whether or not that pick is an overlay), so picking
  // the own-lane study before any overlay pick is what lands it at `ind1` rather than `ind2`.
  await pickStudy(page, 'Own-lane', 'strength');
  const laneLegend = page.locator('[data-testid="workspace-legend-ind1"]');
  const laneVisible = (await laneLegend.count()) === 1;
  const laneText = laneVisible ? await laneLegend.textContent() : null;
  check(
    'catalogue.own-lane-study-reads-numeric',
    laneVisible && /\d/.test(laneText ?? '') && !/—/.test(laneText ?? ''),
    `own-lane legend: ${JSON.stringify(laneText)}`,
  );

  // OVER-PRICE PLACEMENT: baseline captured on THIS page, before the pick — the control the rule
  // asks for, rather than a hard-coded slot count.
  const baselineDrawn = await drawnReadingCount(page, 'workspace-legend-price');
  await pickStudy(page, 'Over-the-price', 'ma-fast');
  const afterOverPrice = await drawnReadingCount(page, 'workspace-legend-price');
  check(
    'catalogue.over-price-study-reads-numeric',
    afterOverPrice === baselineDrawn + 1,
    `price legend drawn readings: ${baselineDrawn} -> ${afterOverPrice} after picking "Average, 20 bars", which declares one line`,
  );

  reportConsole('catalogue.console-clean', console_);
  await page.close();
}

// ---------------------------------------------------------------------------------------------
// Scene 3 — choosing N (>= 4) studies across both placements makes all N actually plot. This is
// the defect the owner named precisely: five chosen, two plotted, because the lane cap and the
// overlay-slot cap had drifted apart. `example/panes.ts` fixed the drift; this scene refuses to
// let it silently return.
// ---------------------------------------------------------------------------------------------
async function sceneManyStudiesAllPlot(browser, base) {
  const { page, console_ } = await freshPage(browser, base);

  await openStudies(page);
  const baselineDrawn = await drawnReadingCount(page, 'workspace-legend-price');

  // Own-lane picks FIRST: a lane's index is the pick's LIST POSITION (see `resolveSources` /
  // `laneOrder`), not a count of own-lane picks alone, so picking lane studies first lands them
  // predictably at `ind1`, `ind2` rather than wherever the overlay picks pushed them.
  const picks = [
    ['Own-lane', 'strength', 'ind1'],
    ['Own-lane', 'convergence-histogram', 'ind2'],
    ['Over-the-price', 'ma-fast', null],
    ['Over-the-price', 'ma-slow', null],
    ['Over-the-price', 'ema-fast', null],
  ];
  for (const [category, entryId] of picks) {
    await pickStudy(page, category, entryId);
  }

  const activeChips = await page.evaluate(
    () => document.querySelectorAll('[data-testid^="workspace-active-"]').length,
  );
  check('many-studies.panel-shows-all-chosen', activeChips === picks.length, `${activeChips}/${picks.length} chosen chips in the panel`);

  // Each over-price pick here declares exactly ONE line, so the drawn count rises by the number of
  // picks. A study with five would raise it by five, which is the whole point of the widened slots.
  const overPricePicks = picks.filter(([, , lane]) => lane === null).length;
  const afterDrawn = await drawnReadingCount(page, 'workspace-legend-price');
  check(
    'many-studies.all-over-price-picks-plot',
    afterDrawn === baselineDrawn + overPricePicks,
    `price legend drawn readings: ${baselineDrawn} -> ${afterDrawn} (expected +${overPricePicks})`,
  );

  const lanePicks = picks.filter(([, , lane]) => lane !== null);
  const laneResults = [];
  for (const [, , laneId] of lanePicks) {
    const locator = page.locator(`[data-testid="workspace-legend-${laneId}"]`);
    const visible = (await locator.count()) === 1;
    const text = visible ? await locator.textContent() : null;
    laneResults.push({ laneId, visible, numeric: visible && /\d/.test(text ?? '') && !/—/.test(text ?? '') });
  }
  check(
    'many-studies.all-own-lane-picks-plot',
    laneResults.every((entry) => entry.numeric),
    laneResults.map((entry) => `${entry.laneId}=${entry.numeric ? 'numeric' : 'MISSING/mute'}`).join(', '),
  );

  reportConsole('many-studies.console-clean', console_);
  await page.close();
}

// ---------------------------------------------------------------------------------------------
// Scene 4 — the density field (the liquidation heatmap) paints something. It exists only as canvas
// pixels — `data.density` never reaches the DOM — so the control is the same region's checksum
// with the field on, off, and on again.
// ---------------------------------------------------------------------------------------------
async function sceneDensityPaints(browser, base) {
  const { page, console_ } = await freshPage(browser, base);

  const before = await canvasChecksum(page, '[data-testid="workspace-surface"]');
  await openStudies(page);
  await page.locator('[data-testid="workspace-catalogue-section-overlays"]').click();
  await page.waitForTimeout(150);

  const heatmap = page.getByRole('button', { name: 'Liquidation heatmap' });
  check('density.control-present', (await heatmap.count()) === 1, 'the "Liquidation heatmap" toggle exists');

  await heatmap.click(); // OFF — the demo mounts with it on
  await page.waitForTimeout(ACTION_SETTLE_MS);
  const off = await canvasChecksum(page, '[data-testid="workspace-surface"]');

  await heatmap.click(); // ON again
  await page.waitForTimeout(ACTION_SETTLE_MS);
  const onAgain = await canvasChecksum(page, '[data-testid="workspace-surface"]');

  check(
    'density.toggle-changes-the-canvas',
    before.sum !== off.sum,
    `checksum with field on=${before.sum}, off=${off.sum} (sampled ${before.sampled} bytes)`,
  );
  check(
    'density.toggle-is-reversible-and-deterministic',
    onAgain.sum === before.sum,
    `checksum restored: on=${before.sum}, on-again=${onAgain.sum}`,
  );

  reportConsole('density.console-clean', console_);
  await page.close();
}

// ---------------------------------------------------------------------------------------------
// Scene 5 — arming a two-anchor tool and placing two anchors creates ONE drawing, and the preview
// is visible BETWEEN the two clicks. The clicks are deliberately spaced and moved between, per the
// documented pitfall: two `mouse.click()` calls back to back read as a double-click and the
// two-anchor tool never creates.
// ---------------------------------------------------------------------------------------------
async function sceneDrawingCreatesWithPreview(browser, base) {
  const { page, console_ } = await freshPage(browser, base);

  const countText = () => page.locator('[data-testid="workspace-drawing-count"]').textContent();
  const initialCount = await countText();
  check('drawing.starts-at-zero', initialCount === '0', `count reads "${initialCount}"`);

  await page.locator('[data-testid="workspace-drawing-tool-trend-line"]').click();
  await page.waitForTimeout(150);

  const box = await page.locator(SURFACE_HOST).boundingBox();
  const anchorA = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.4 };
  const anchorB = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.6 };

  const beforeArmed = await colourPixelCount(page, SURFACE_HOST, ALERT_BLUE);

  // ANCHOR ONE — moved to, then clicked, never chained into the next click.
  await page.mouse.move(anchorA.x, anchorA.y, { steps: 6 });
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(250);
  const countAfterFirstAnchor = await countText();

  // THE MOVE THAT MAKES THE PREVIEW A SEGMENT, not just a cursor dot: crosshair moves with one
  // anchor already placed and the tool still armed.
  await page.mouse.move(anchorB.x, anchorB.y, { steps: 10 });
  await page.waitForTimeout(180);
  const betweenClicks = await colourPixelCount(page, SURFACE_HOST, ALERT_BLUE);

  check(
    'drawing.preview-visible-between-clicks',
    betweenClicks > beforeArmed + 100,
    `blue pixels: before arming=${beforeArmed}, between the two clicks=${betweenClicks}`,
  );
  check(
    'drawing.no-drawing-created-on-first-anchor-alone',
    countAfterFirstAnchor === '0',
    `count after the first anchor reads "${countAfterFirstAnchor}"`,
  );

  // ANCHOR TWO — spaced from the first by well over any double-click threshold already.
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);
  const finalCount = await countText();
  check(
    'drawing.two-spaced-anchors-create-one-drawing',
    finalCount === '1',
    `count after the second anchor reads "${finalCount}"`,
  );

  reportConsole('drawing.console-clean', console_);
  await page.close();
}

// ---------------------------------------------------------------------------------------------
// Scene 6 — no rail tool glyph and no category-bucket glyph is empty or the placeholder box
// (`□`) the owner found the flyout full of.
// ---------------------------------------------------------------------------------------------
async function sceneGlyphsAreNotPlaceholders(browser, base) {
  const { page, console_ } = await freshPage(browser, base);

  const glyphs = await page.evaluate(() => {
    const nodes = document.querySelectorAll(
      '[data-testid^="workspace-drawing-tool-"], [data-testid^="workspace-drawing-group-"]',
    );
    return Array.from(nodes).map((node) => [node.getAttribute('data-testid'), node.textContent ?? '']);
  });

  check('glyphs.rail-and-groups-present', glyphs.length >= 8, `${glyphs.length} glyph-bearing controls found`);

  const placeholder = '□';
  const bad = glyphs.filter(([, text]) => text.trim().length === 0 || text.includes(placeholder));
  check(
    'glyphs.none-empty-or-placeholder-box',
    bad.length === 0,
    bad.length === 0 ? `all ${glyphs.length} glyphs are non-empty and not "${placeholder}"` : JSON.stringify(bad),
  );

  reportConsole('glyphs.console-clean', console_);
  await page.close();
}


// ---------------------------------------------------------------------------------------------
// Scene 6b — the rail CONTAINS its own controls, at more than one window size.
//
// This scene exists because the suite missed a regression it should have owned. The rail scrolled,
// hiding two tools; the fix made it wrap; the wrap let controls paint OUTSIDE the palette, over the
// chart. Thirty-one checks stayed green through all of it, because the one that looked at the rail
// compared each button against THE RAIL'S OWN BOX — and that box grew with the overflow. A frame
// measured against itself always fits. The frame here is the palette's border and the chart beside
// it, both of which are independent of what the rail does.
// ---------------------------------------------------------------------------------------------
async function sceneRailContainsItsControls(browser, base) {
  // TWO SIZES, because the rail is laid out against a measured height and the earlier scenes all
  // ran at one. A control that fits at 1400x1000 and escapes at 900x700 is the shape of this bug.
  for (const [width, height] of [
    [1400, 1000],
    [900, 700],
  ]) {
    const { page, console_ } = await freshPage(browser, base, { width, height });
    const at = `${width}x${height}`;

    const geometry = await page.evaluate(() => {
      const rail = document.querySelector('[data-testid="workspace-drawing-toolbar"]');
      const scroll = document.querySelector('[data-testid="workspace-drawing-rail-scroll"]');
      const surface = document.querySelector('[data-testid="workspace-surface"]');
      if (rail === null || scroll === null || surface === null) return null;
      const railBox = rail.getBoundingClientRect();
      const surfaceBox = surface.getBoundingClientRect();
      const escaped = Array.from(rail.querySelectorAll('button')).filter((node) => {
        const box = node.getBoundingClientRect();
        return (
          box.right > railBox.right + 1 ||
          box.bottom > railBox.bottom + 1 ||
          box.left < railBox.left - 1
        );
      });
      return {
        buttons: rail.querySelectorAll('button').length,
        scrolls: scroll.scrollHeight > scroll.clientHeight,
        escaped: escaped.map((node) => (node.textContent ?? '').trim()),
        overlapsChart: railBox.right > surfaceBox.left + 1,
      };
    });

    check(`rail.present@${at}`, geometry !== null && geometry.buttons > 0, JSON.stringify(geometry));

    // NOTHING BEHIND A SCROLLBAR. A 28px strip is not a surface anyone scrolls, so a tool below the
    // fold is a tool the visitor does not have.
    check(
      `rail.does-not-scroll@${at}`,
      geometry !== null && geometry.scrolls === false,
      geometry === null ? 'no rail' : `${geometry.buttons} controls, scrolls=${geometry.scrolls}`,
    );

    // AND NOTHING OUTSIDE THE PALETTE. Measured against the rail's own border, which is what a
    // reader sees as the edge of the palette.
    check(
      `rail.controls-stay-inside@${at}`,
      geometry !== null && geometry.escaped.length === 0,
      geometry === null ? 'no rail' : JSON.stringify(geometry.escaped),
    );

    // The independent frame: whatever the rail does to itself, it must not paint over the chart.
    check(
      `rail.does-not-overlap-the-chart@${at}`,
      geometry !== null && geometry.overlapsChart === false,
      geometry === null ? 'no rail' : `overlaps=${geometry.overlapsChart}`,
    );

    reportConsole(`rail.console-clean@${at}`, console_);
    await page.close();
  }
}

// ---------------------------------------------------------------------------------------------
// Scene 7 — "Add line" draws a price alert (proven by a canvas colour scan, since the line has no
// DOM node), and dragging it out of the pane and releasing removes it — the 12px grab radius
// (`ALERT_GRAB_PX`, `src/alerts/priceAlerts.ts`) is why the drag starts exactly on the detected row.
// ---------------------------------------------------------------------------------------------
async function sceneAlertAddAndDragRemove(browser, base) {
  const { page, console_ } = await freshPage(browser, base);

  const before = await widestColourRow(page, SURFACE_HOST, ALERT_BLUE);
  check('alerts.no-line-before-adding', before === null, before === null ? 'no matching row' : `unexpected row at y=${before.pageY}`);

  await page.getByRole('button', { name: 'Add line', exact: true }).click();
  await page.waitForTimeout(ACTION_SETTLE_MS);
  const afterAdd = await widestColourRow(page, SURFACE_HOST, ALERT_BLUE);
  check('alerts.add-line-draws-a-row', afterAdd !== null, afterAdd === null ? 'no row found after "Add line"' : `row at y=${afterAdd.pageY}, hits=${afterAdd.hit}`);

  if (afterAdd === null) {
    reportConsole('alerts.console-clean', console_);
    await page.close();
    return;
  }

  // GRAB, MOVE FAR ABOVE THE PANE, RELEASE — well past `ALERT_GRAB_PX` (12) at pickup and well
  // past the pane's own edge (plus its 8px discard margin) at release.
  await page.mouse.move(afterAdd.pageX, afterAdd.pageY);
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.move(afterAdd.pageX, afterAdd.rectTop - 80, { steps: 15 });
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(ACTION_SETTLE_MS);

  const afterDrag = await widestColourRow(page, SURFACE_HOST, ALERT_BLUE);
  check(
    'alerts.drag-out-of-pane-removes-the-line',
    afterDrag === null,
    afterDrag === null ? 'no row found after the drag — removed' : `a row still exists at y=${afterDrag.pageY}, hits=${afterDrag.hit}`,
  );

  reportConsole('alerts.console-clean', console_);
  await page.close();
}

// ---------------------------------------------------------------------------------------------
// Scene 8 — the whole interactive journey in ONE session: studies, density, drawing, alerts, back
// to back. Scene 1's console check only proves the FIRST paint is clean; this proves the demo stays
// clean across the sequence of actions a real visitor performs, not only at mount.
// ---------------------------------------------------------------------------------------------
async function sceneFullJourneyStaysClean(browser, base) {
  const { page, console_ } = await freshPage(browser, base);

  await openStudies(page);
  await pickStudy(page, 'Over-the-price', 'ma-fast');
  await pickStudy(page, 'Own-lane', 'strength');
  await page.locator('[data-testid="workspace-catalogue-section-overlays"]').click();
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: 'Liquidation heatmap' }).click();
  await page.waitForTimeout(ACTION_SETTLE_MS);
  // Escape closes the overlay (bound at the document level) — the trigger itself sits UNDER the
  // open panel's own absolutely-positioned overlay, so clicking it again cannot reach it.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  await page.locator('[data-testid="workspace-drawing-tool-horizontal-line"]').click();
  await page.waitForTimeout(120);
  const box = await page.locator(SURFACE_HOST).boundingBox();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 6 });
  await page.waitForTimeout(120);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(250);

  await page.getByRole('button', { name: 'Add line', exact: true }).click();
  await page.waitForTimeout(ACTION_SETTLE_MS);

  reportConsole('journey.console-clean-across-the-whole-flow', console_);
  await page.close();
}

// ---------------------------------------------------------------------------------------------
// Scene 10 — DRAG-01: pulling an anchor moves the anchor and nothing else.
//
// THE DEFECT THIS EXISTS FOR passed 1234 green unit tests and every gate: the provider's wrapper
// dropped `anchorAt`, the lock never attached, and the chart panned under the pointer while the
// shape stayed where it was. It is a browser gesture, so only a browser can see it.
//
// THE TWO CHECKS ARE A PAIR, deliberately. A gesture that never grabbed the anchor pans the chart
// and fails the first; a gesture that grabbed it and then did nothing fails the second. Neither
// passes by accident, and no single check could say that on its own.
// ---------------------------------------------------------------------------------------------
async function sceneAnchorDragHoldsTheRange(browser, base) {
  const { page, console_ } = await freshPage(browser, base);
  const box = await page.locator(SURFACE_HOST).boundingBox();

  // Two spaced anchors, per the double-click pitfall the drawing scene above documents.
  await page.locator('[data-testid="workspace-drawing-tool-trend-line"]').click();
  await page.waitForTimeout(150);
  const first = { x: box.x + box.width * 0.35, y: box.y + box.height * 0.3 };
  const grabbed = { x: box.x + box.width * 0.55, y: box.y + box.height * 0.45 };
  for (const at of [first, grabbed]) {
    await page.mouse.move(at.x, at.y, { steps: 8 });
    await page.waitForTimeout(180);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(280);
  }

  const rangeBefore = await drawingProbe(page, 'barTimes');
  const anchorsBefore = await drawingProbe(page, 'anchors');

  // 200 px HORIZONTALLY — the pan direction on purpose, so a lock that never engaged shows up as
  // the whole chart sliding out from under the shape being resized.
  await page.mouse.move(grabbed.x, grabbed.y, { steps: 6 });
  await page.waitForTimeout(180);
  await page.mouse.down();
  await page.mouse.move(grabbed.x - 200, grabbed.y, { steps: 24 });
  await page.waitForTimeout(180);
  await page.mouse.up();
  await page.waitForTimeout(ACTION_SETTLE_MS);

  const rangeAfter = await drawingProbe(page, 'barTimes');
  const anchorsAfter = await drawingProbe(page, 'anchors');

  check(
    'drag.range-unchanged',
    JSON.stringify(rangeBefore) === JSON.stringify(rangeAfter),
    `bar times at a fifth, half and four fifths of the width: before=${JSON.stringify(rangeBefore)} after=${JSON.stringify(rangeAfter)}`,
  );
  check(
    'drag.anchor-moved',
    anchorsBefore.length === 2 && JSON.stringify(anchorsBefore) !== JSON.stringify(anchorsAfter),
    `anchors before=${JSON.stringify(anchorsBefore)} after=${JSON.stringify(anchorsAfter)}`,
  );

  reportConsole('drag.console-clean', console_);
  await page.close();
}

// ---------------------------------------------------------------------------------------------
// Scene 11 — MAGNET-02, MAGNET-03, MAGNET-07 and MAGNET-08, read as PRICES and as the chart's own
// RESOLVED crosshair mode, never as a pressed attribute.
//
// The price scale is calibrated from two anchors placed with the magnet off, so every y below is
// derived from prices the drawing itself reported; the bar's four values come from the legend the
// chart prints. Both aiming points sit ABOVE the high, where no other value of the bar can be
// nearer, so "snaps to the high" is the only outcome the rule allows.
// ---------------------------------------------------------------------------------------------
async function sceneMagnetPlacesTheAnchor(browser, base) {
  const { page, console_ } = await freshPage(browser, base);
  const box = await page.locator(SURFACE_HOST).boundingBox();
  const x = box.x + box.width * 0.6;

  const calibrateA = box.y + box.height * 0.15;
  const calibrateB = box.y + box.height * 0.55;
  const priceA = await placeHorizontalLine(page, x, calibrateA);
  const priceB = await placeHorizontalLine(page, x, calibrateB);
  const perPx = (priceB - priceA) / (calibrateB - calibrateA);
  const yOf = (price) => calibrateA + (price - priceA) / perPx;

  const bar = await hoveredBar(page, x, calibrateB);
  const nearHigh = yOf(bar.high) - 3;
  const alsoNearHigh = yOf(bar.high) - 7;
  const betweenCloseAndHigh = (yOf(bar.high) + yOf(bar.close)) / 2;

  const freeNear = await placeHorizontalLine(page, x, nearHigh);
  const freeAlsoNear = await placeHorizontalLine(page, x, alsoNearHigh);
  const freeBetween = await placeHorizontalLine(page, x, betweenCloseAndHigh);
  const values = [bar.open, bar.high, bar.low, bar.close];
  const isBarValue = (price) => values.some((value) => value.toFixed(2) === price.toFixed(2));

  check(
    'magnet.off-is-free',
    freeBetween !== null &&
      freeBetween > bar.close &&
      freeBetween < bar.high &&
      !isBarValue(freeBetween) &&
      !isBarValue(freeNear) &&
      !isBarValue(freeAlsoNear) &&
      freeNear !== freeAlsoNear,
    `bar=${JSON.stringify(bar)} between close and high=${freeBetween} (equal to no bar value); two points 4 px apart read ${freeNear} and ${freeAlsoNear}`,
  );

  // MAGNET-08 — WHAT THE POINTER DOES, which every check above is blind to. `chart.options()` is the
  // RESOLVED option and not what the host passed in, because the defect was the base library's own
  // default (`CrosshairMode.Magnet`, 1) that nothing had ever overridden: at the released 0.2.0 this
  // read 1 with the toggle off, 1 with it on, and 1 with it off again.
  const cursorFree = await drawingProbe(page, 'crosshairMode');

  await page.getByRole('button', { name: 'Magnet', exact: true }).click();
  await page.waitForTimeout(ACTION_SETTLE_MS);
  const cursorStuck = await drawingProbe(page, 'crosshairMode');

  const snapped = await placeHorizontalLine(page, x, nearHigh);
  const snappedAgain = await placeHorizontalLine(page, x, alsoNearHigh);

  check(
    'magnet.on-snaps',
    snapped !== null &&
      snapped === snappedAgain &&
      snapped.toFixed(2) === bar.high.toFixed(2) &&
      freeNear !== freeAlsoNear,
    `the same two points that read ${freeNear} and ${freeAlsoNear} free now both read ${snapped} — the bar's high is ${bar.high}`,
  );

  // MAGNET-07 — WHERE the dashed trace sits, which no colour count can answer. The check at
  // `drawing.preview-visible-between-clicks` is a presence sensor by its own comment above, and it
  // runs with the magnet off; a preview drawn at the raw pointer price would keep it green. So the
  // tool is armed and the pointer HOVERS without clicking: the only thing that moves is the trace.
  await page.locator('[data-testid="workspace-drawing-tool-horizontal-line"]').click();
  await page.waitForTimeout(120);
  await page.mouse.move(x, nearHigh, { steps: 6 });
  await page.waitForTimeout(ACTION_SETTLE_MS);
  const traced = await drawingProbe(page, 'previewCursor');

  check(
    'magnet.preview-traces-the-snap',
    traced !== null && traced.price.toFixed(2) === bar.high.toFixed(2) && traced.price !== freeNear,
    `hovering the point that placed ${freeNear} with the magnet off, the trace now sits at ${traced === null ? 'nothing' : traced.price} — the bar's high is ${bar.high}`,
  );

  await page.getByRole('button', { name: 'Magnet', exact: true }).click();
  await page.waitForTimeout(ACTION_SETTLE_MS);
  const cursorFreeAgain = await drawingProbe(page, 'crosshairMode');

  check(
    'magnet.cursor-follows-the-mode',
    cursorFree === 0 && cursorStuck === 3 && cursorFreeAgain === 0,
    `chart.options().crosshair.mode read ${cursorFree} off, ${cursorStuck} on and ${cursorFreeAgain} ` +
      'off again — 0 Normal and 3 MagnetOHLC, the four values the anchor snaps to, never 1 Magnet, ' +
      'which is the close alone',
  );

  reportConsole('magnet.console-clean', console_);
  await page.close();
}

// ---------------------------------------------------------------------------------------------
// Scene 11 — the host's own section on the studies rail keeps its identity.
//
// THE DEFECT THIS TARGETS is the one that costs a caret per keystroke. `<activeSection.Body />`
// reconciles by the FUNCTION REFERENCE, so a host that builds its `Body` inline hands React a new
// element type on every render and gets a remount instead of a re-render. `ChromeContext`'s churn
// sensor already watches for exactly that and warns; nothing had ever read the warning. This does,
// and it is the cheapest possible guard on the one host mistake the design measured as fatal.
// ---------------------------------------------------------------------------------------------
async function sceneHostSectionIsStable(browser, base) {
  const { page, console_ } = await freshPage(browser, base);

  await openStudies(page);
  const tab = page.locator('[data-testid="workspace-catalogue-section-params"]');
  check('params.host-section-on-the-rail', (await tab.count()) === 1, 'the host declared one section and the rail shows it');

  // A THIRD-PARTY STUDY FIRST, and not for the study: it is what makes the host's own `App`
  // re-render, because the arithmetic arriving is state. Without a host re-render the sensor below
  // has nothing to compare and would pass over an inline `Body` — measured.
  await pickStudy(page, 'Oscillators', 'rsi');
  await page.waitForTimeout(SETTLE_MS);

  await tab.click();
  await page.waitForTimeout(ACTION_SETTLE_MS);
  const body = page.locator('[data-testid="param-form"]');
  const fields = await page.locator('[data-testid^="param-rsi-"]').count();
  check(
    'params.host-section-body-renders',
    (await body.count()) === 1 && fields > 0,
    `the host Body is what the tabpanel draws, with ${fields} node(s) for the chosen study`,
  );

  // The rail is walked and returned to, which is what re-renders the menu repeatedly. A `Body`
  // whose identity moved would be reported by the sensor on the first of these.
  for (const id of ['workspace-catalogue-section-panes', 'workspace-catalogue-section-params']) {
    await page.locator(`[data-testid="${id}"]`).click();
    await page.waitForTimeout(120);
  }
  const churn = console_.warnings.filter(
    (line) => line.includes('WorkspaceChromeProvider') && line.includes('sections'),
  );
  check(
    'params.no-section-churn',
    churn.length === 0,
    churn.length === 0
      ? `${console_.warnings.length} warning(s) on the page and none of them section-identity churn — the params Body kept its identity across the rail being walked`
      : churn.slice(0, 2).join(' | '),
  );

  reportConsole('params.console-clean', console_);
  await page.close();
}

// ---------------------------------------------------------------------------------------------
// Scene 12 — the catalogue lists the third-party names before a byte of the library exists, and
// the library arrives only when a study asks for it.
//
// THE TWO ARTEFACTS ARE TOLD APART ON THE WIRE, not by the page's own report of itself. A page
// that quietly imported the library at boot would still render a perfect catalogue; only the bytes
// say which happened. The entry is excluded by name — this build is DEVELOPMENT, so React's own
// warning codebase makes `bundle.js` larger than the committed catalogue — and the two CHUNKS then
// differ by an order of magnitude: the manifest is ~190 KB and the library ~2.1 MB, so the floor
// sits between them with a decade of room on either side.
// ---------------------------------------------------------------------------------------------
const LIBRARY_BYTES_FLOOR = 1_000_000;

async function sceneCatalogueBeforeTheLibrary(browser, base) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const console_ = watchConsole(page);
  const heavy = [];
  page.on('response', (response) => {
    const file = response.url().split('/').pop() ?? '';
    const declared = Number(response.headers()['content-length'] ?? 0);
    if (/^chunk-.*\.js$/.test(file) && declared >= LIBRARY_BYTES_FLOOR) heavy.push(`${file} ${declared} B`);
  });

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="workspace-root"]').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(SETTLE_MS);

  await openStudies(page);
  await page.locator('[data-testid="workspace-catalogue-category-Oscillators"]').click();
  await page.waitForTimeout(150);
  const listed = await page
    .locator('[data-testid="workspace-catalogue-results"] [data-testid^="workspace-catalogue-entry-"]')
    .count();
  const beforePick = [...heavy];
  check(
    'params.catalogue-lists-before-the-library',
    listed > 0 && beforePick.length === 0,
    beforePick.length === 0
      ? `${listed} third-party studies listed under "Oscillators" and nothing over ${LIBRARY_BYTES_FLOOR} B has crossed the wire`
      : `the library arrived at boot: ${beforePick.join(', ')}`,
  );

  await pickStudy(page, 'Oscillators', 'rsi');
  await page.waitForTimeout(SETTLE_MS);
  check(
    'params.library-fetched-on-demand',
    heavy.length > 0,
    heavy.length > 0
      ? `the chunk arrived with the first study and not before: ${heavy.join(', ')}`
      : 'no chunk over the floor ever arrived, so the study cannot be drawing vendor arithmetic',
  );

  // AND IT DRAWS. A catalogue that lists names and resolves nothing is the silent toggle the spec
  // forbids, so the lane it landed in has to read a number.
  const laneText = (await page.locator('[data-testid="workspace-legend-ind1"]').textContent()) ?? '';
  check(
    'params.third-party-study-reads-numeric',
    /\d/.test(laneText) && !/—/.test(laneText),
    `own-lane legend after picking rsi: ${JSON.stringify(laneText)}`,
  );

  reportConsole('params.on-demand-console-clean', console_);
  await page.close();
}

// ---------------------------------------------------------------------------------------------
// Scene 13 — the catalogue fails to arrive and the page still draws.
//
// The spec's edge case, executed rather than asserted from the source: the manifest chunk is
// refused at the network, which is the one failure a visitor can actually meet.
// ---------------------------------------------------------------------------------------------
async function sceneCatalogueFailureStillMounts(browser, base) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const console_ = watchConsole(page);
  // The manifest chunk is the only file over 100 KB that is fetched without being imported by the
  // entry, so it is identified by what it holds rather than by a hash that changes every build.
  await page.route('**/chunk-*.js', async (route) => {
    const response = await route.fetch().catch(() => null);
    const body = response === null ? '' : await response.text();
    if (body.includes('fallbackShortLabel')) return route.abort();
    return response === null ? route.abort() : route.fulfill({ response, body });
  });

  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-testid="workspace-root"]').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(SETTLE_MS);

  await openStudies(page);
  const vendorTab = await page.locator('[data-testid="workspace-catalogue-category-Oscillators"]').count();
  const ownTab = await page.locator('[data-testid="workspace-catalogue-category-Own-lane"]').count();
  const priceLegend = (await page.locator('[data-testid="workspace-legend-price"]').textContent()) ?? '';
  check(
    'params.a-failed-catalogue-still-mounts',
    vendorTab === 0 && ownTab === 1 && /C\xa0\d/.test(priceLegend),
    vendorTab === 0 && ownTab === 1
      ? `the third-party catalogue is refused at the network and the workspace mounts anyway: no "Oscillators" tab, the demo's own studies still offered, price still reading ${JSON.stringify(priceLegend.slice(0, 24))}`
      : `${vendorTab} third-party tab(s) and ${ownTab} demo tab(s) after refusing the catalogue chunk`,
  );

  // The refused fetch itself is reported by the browser, and that report is the point rather than
  // a defect. What may NOT appear is anything else — an uncaught exception from the import
  // rejecting is exactly the failure this scene exists to refuse.
  const unexpected = console_.errors.filter((line) => !line.includes('Failed to load resource'));
  check(
    'params.a-failed-catalogue-throws-nothing',
    unexpected.length === 0,
    unexpected.length === 0
      ? `${console_.errors.length} console error(s), every one of them the browser reporting the refused chunk, and no uncaught exception behind it`
      : unexpected.slice(0, 3).join(' | '),
  );
  await page.close();
}

// ---------------------------------------------------------------------------------------------
// Scene 14 — an edited input changes what is DRAWN, and changes nothing else.
//
// THE ASSERTION THIS FEATURE STANDS OR FALLS ON. Everything else can be green while the value the
// visitor typed goes into a payload and never reaches the arithmetic: `studySettings` was neither an
// argument of `resolve` nor a dependency of the memo that calls it, and the symptom of that is a
// chart drawing the old numbers with no error anywhere. So the reading is taken off the LEGEND —
// a number the page computed — and the negative control puts the value back and demands the
// original number returns. Without it the check passes on "any edit redraws something", which is
// not the claim.
//
// NO SCREENSHOT, NO GOLDEN FILE: the same rule as every other scene here.
// ---------------------------------------------------------------------------------------------
async function sceneEditedInputRedraws(browser, base) {
  const { page, console_ } = await freshPage(browser, base);

  await openStudies(page);
  // The locator is built from `provider.id` while the persisted list keys on `studyIdentity`. The
  // adapter puts the vendor id in BOTH on purpose; if they ever diverge this scene fails first,
  // because the chip would render under one name while the pick was stored under another.
  await pickStudy(page, 'Oscillators', 'rsi');
  await page.waitForTimeout(SETTLE_MS);

  const readLane = async () => {
    const text = (await page.locator('[data-testid="workspace-legend-ind1"]').textContent()) ?? '';
    return (text.match(/-?\d+(?:\.\d+)?/g) ?? []).join(',');
  };
  const chips = () => page.locator('[data-testid^="workspace-active-"]').count();

  const before = await readLane();
  const beforeChips = await chips();

  await page.locator('[data-testid="workspace-catalogue-section-params"]').click();
  await page.waitForTimeout(ACTION_SETTLE_MS);

  // OFFERED IS WHAT THE MANIFEST OFFERS, and the manifest is read off disk rather than restated: a
  // control that moves nothing was held back at generation time, and a form drawing it anyway would
  // be a control the visitor can turn with nothing happening.
  const promised = (CATALOGUE.indicators.find((row) => row.id === 'rsi')?.inputs ?? [])
    .map((input) => input.id)
    .sort();
  const drawn = (
    await page.locator('[data-testid^="param-rsi-"]').evaluateAll((nodes) =>
      nodes
        .filter(
          (node) =>
            node.tagName === 'INPUT' ||
            node.tagName === 'SELECT' ||
            node.getAttribute('role') === 'switch',
        )
        .map((node) => node.getAttribute('data-testid')?.replace('param-rsi-', '') ?? ''),
    )
  ).sort();
  check(
    'params.the-form-offers-exactly-the-controls-the-manifest-offers',
    promised.length > 0 && drawn.join(',') === promised.join(','),
    drawn.join(',') === promised.join(',')
      ? `${drawn.length} controls drawn and ${promised.length} promised, the same set: ${drawn.join(', ')}`
      : `drawn [${drawn.join(', ')}] against promised [${promised.join(', ')}]`,
  );

  // REACHED BY ITS LABEL. `getByLabel` resolves through the accessibility tree, so a field whose
  // `label`/`htmlFor` pair does not associate is not found at all.
  const field = page.getByLabel('RSI Length');
  check(
    'params.every-control-is-reachable-by-its-label',
    (await field.count()) === 1 &&
      (await field.getAttribute('aria-describedby')) === 'param-rsi-length-bounds',
    `the length field answers to its own label and points at ${await field.getAttribute('aria-describedby')}, which reads ${JSON.stringify(await page.locator('#param-rsi-length-bounds').textContent())}`,
  );

  await field.fill('50');
  await page.waitForTimeout(ACTION_SETTLE_MS);
  const after = await readLane();
  check(
    'params.edit-changes-the-drawing',
    before.length > 0 && after.length > 0 && before !== after,
    `ind1 legend readings: ${before} -> ${after} after setting the length 14 -> 50`,
  );
  check(
    'params.edit-keeps-the-study',
    (await chips()) === beforeChips && beforeChips > 0,
    `${beforeChips} chosen chip(s) before the edit, ${await chips()} after — a redraw, never a remount`,
  );

  // THE NEGATIVE CONTROL. Put it back and the number comes back.
  await field.fill('14');
  await page.waitForTimeout(ACTION_SETTLE_MS);
  const restored = await readLane();
  check(
    'params.edit-is-reversible',
    restored === before,
    `back to ${restored}, which is what it read before the edit`,
  );

  // AND THE REFUSAL IS VISIBLE ON THE PAGE: below the declared minimum nothing is written, so the
  // drawing does not move and the field says why.
  await field.fill('0');
  await page.waitForTimeout(ACTION_SETTLE_MS);
  check(
    'params.an-out-of-range-value-is-refused-not-drawn',
    (await readLane()) === before && (await field.getAttribute('aria-invalid')) === 'true',
    `0 against a declared minimum of 1: aria-invalid=${await field.getAttribute('aria-invalid')} and the lane still reads ${await readLane()}`,
  );

  const editChurn = console_.warnings.filter(
    (line) => line.includes('WorkspaceChromeProvider') && line.includes('sections'),
  );
  check(
    'params.no-churn-across-the-edit',
    editChurn.length === 0,
    editChurn.length === 0
      ? 'four values typed into the same field and no section-identity churn warning — the Body was re-rendered, never remounted'
      : editChurn.slice(0, 2).join(' | '),
  );

  reportConsole('params.edit-console-clean', console_);
  await page.close();
}

// ---------------------------------------------------------------------------------------------

const context = await esbuild.context({
  entryPoints: [join(EXAMPLE, 'main.tsx')],
  // The SAME configuration `scripts/build-example.mjs` uses, and it has to be the same one: a split
  // build in one and an inlined build in the other measures nothing. `entryNames` keeps the entry at
  // `bundle.js`, which is the relative specifier `index.html` already loads.
  outdir: EXAMPLE,
  entryNames: 'bundle',
  chunkNames: 'chunk-[hash]',
  splitting: true,
  bundle: true,
  write: false,
  format: 'esm',
  target: 'es2021',
  jsx: 'automatic',
  metafile: true,
  logLevel: 'error',
  define: { 'process.env.NODE_ENV': '"development"' },
});

// ---------------------------------------------------------------------------------------------
// THE BUNDLE ITSELF, before a browser is launched: what a visitor downloads before anything draws.
// ---------------------------------------------------------------------------------------------

const built = await context.rebuild();
const overCeiling = bootChunkVerdict(
  built.metafile,
  'bundle.js',
  BOOT_CHUNK_CEILING.development,
);
check(
  'bundle.boot-chunk-under-its-ceiling',
  overCeiling === null,
  overCeiling ??
    `the entry chunk is under ${BOOT_CHUNK_CEILING.development} B, so nothing that was written to ` +
      'load on demand is arriving at boot',
);

/**
 * THE PACKAGE STILL DECLARES NOTHING IT DOES NOT SHIP.
 *
 * The example now takes a 1.05 MB indicator library and its required peer, and the whole point of
 * putting them in the HOST is that the published package gains neither. `packaging.spec.ts` says
 * this too, and it is one of the three suites `jest.config.js` skips outside the monorepo — so
 * outside the monorepo this is the only place the claim is measured, next to the bundle it is a
 * claim about.
 */
{
  const manifest = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8'));
  const runtime = Object.keys(manifest.dependencies ?? {});
  const peers = Object.keys(manifest.peerDependencies ?? {}).sort();
  const vendorAsDev = ['lightweight-charts-indicators', 'oakscriptjs'].filter(
    (name) => typeof manifest.devDependencies?.[name] === 'string',
  );
  check(
    'params.the-package-declares-zero-dependencies-and-two-peers',
    runtime.length === 0 &&
      peers.length === 2 &&
      peers.join(', ') === 'lightweight-charts, react' &&
      vendorAsDev.length === 2,
    runtime.length === 0 && peers.length === 2 && vendorAsDev.length === 2
      ? `zero runtime dependencies, exactly two peers (${peers.join(', ')}), and ${vendorAsDev.join(' + ')} declared where the example can reach them and an installer cannot`
      : `${runtime.length} runtime dependenc(ies) [${runtime.join(', ')}], ${peers.length} peer(s) [${peers.join(', ')}], ${vendorAsDev.length}/2 vendor devDependencies`,
  );
}

/**
 * THE CEILING THE PANEL OFFERS AND THE LANE COUNT THE RESOLVER TRUNCATES TO ARE ONE NUMBER.
 *
 * `resolveSources` starts with `laneOrder(active, policy.lanes)`, which cuts the chosen list to
 * that many entries — overlays included. A host whose `capacity` exceeds `policy.lanes` therefore
 * lets a visitor choose studies that are silently never resolved, and this page shipped exactly
 * that: a capacity of six against two lanes, six chosen, two drawn, nothing said. The fix was not a
 * report; it was REMOVING THE CONDITION, by writing the two as one symbol. So the assertion is on
 * the symbol — a literal in either position brings the divergence back, and there is no cut left to
 * report because there is no cut.
 */
{
  // Comments are stripped first: this file's own prose quotes the defect (`capacity: 6`), and a
  // guard that read the description of the bug instead of the code would be reporting on itself.
  const app = readFileSync(join(EXAMPLE, 'App.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const laneCount = /resolutionPolicy\(\{\s*lanes:\s*([\w$]+)/.exec(app)?.[1] ?? null;
  const offered = /\bcapacity:\s*([\w$]+)/.exec(app)?.[1] ?? null;
  check(
    'params.the-ceiling-and-the-lane-count-are-one-number',
    laneCount !== null && laneCount === offered,
    laneCount !== null && laneCount === offered
      ? `the panel's ceiling and the resolver's lane count both read \`${laneCount}\`, so the host's capacity cannot exceed its lane count and there is nothing for it to report`
      : `lanes reads ${JSON.stringify(laneCount)} and capacity reads ${JSON.stringify(offered)} — a divergence here is a study a visitor can choose and never see`,
  );
}

// ---------------------------------------------------------------------------------------------
// Scene 16 — THE FILL. The Kumo is the reading the Ichimoku is named for, and until this feature
// the demo drew none of it: the two cloud boundaries are hidden plots the vendor fills BETWEEN, and
// nothing carried a fill to the canvas at all. It exists only as pixels, so it is read as pixels —
// and in TWO colours, because a reference that collapses them deletes the signal.
// ---------------------------------------------------------------------------------------------
const KUMO_BULLISH = [67, 160, 71]; // #43A047, the vendor's own
const KUMO_BEARISH = [244, 67, 54]; // #F44336

/**
 * THE FIVE LINES, BY THE HUE EACH ONE IS DRAWN IN.
 *
 * The colour is the HOST'S, not the vendor's: `example/panes.ts` cycles `OVERLAY_COLORS` by plot
 * position, so plot 0 of a study drawn over the price is `#4c9aff` and plot 4 is `#66bb6a`. Reading
 * five distinct hues is therefore reading five distinct LINES — and it is the only instrument that
 * can count them. The legend shows four, because the Lagging Span is displaced 26 bars back and has
 * no value at the right edge to print; a legend-only count would report four for ever and could not
 * tell that from a line that failed to draw.
 *
 * Measured before this feature: ONE. The host minted a single over-price slot per lane, so four of
 * the five readings were filed against a series id nothing had declared.
 */
const ICHIMOKU_LINES = [
  { title: 'Conversion Line', rgb: [76, 154, 255] },
  { title: 'Base Line', rgb: [199, 146, 234] },
  { title: 'Lagging Span', rgb: [38, 198, 218] },
  { title: 'Leading Span A', rgb: [245, 166, 35] },
  { title: 'Leading Span B', rgb: [102, 187, 106] },
];

async function sceneCloudIsShaded(browser, base) {
  const { page, console_ } = await freshPage(browser, base);
  const surface = '[data-testid="workspace-surface"]';

  const beforeGreen = await hueCount(page, surface, KUMO_BULLISH);
  const beforeRed = await hueCount(page, surface, KUMO_BEARISH);
  const beforeLines = await Promise.all(ICHIMOKU_LINES.map(({ rgb }) => hueCount(page, surface, rgb, 4)));
  check(
    'cloud.nothing-shaded-before-the-pick',
    beforeGreen === 0 && beforeRed === 0,
    `cloud pixels before picking anything: bullish ${beforeGreen}, bearish ${beforeRed}`,
  );

  await openStudies(page);
  await pickStudy(page, 'Trend', 'ichimoku');
  await page.waitForTimeout(SETTLE_MS);

  const green = await hueCount(page, surface, KUMO_BULLISH);
  const red = await hueCount(page, surface, KUMO_BEARISH);
  check(
    'cloud.kumo-is-shaded',
    green > 0 && red > 0,
    `cloud pixels after picking Ichimoku: bullish ${green}, bearish ${red}`,
  );
  // THE TWO COLOURS ARE THE READING. One of them alone is what the reference implementation
  // produces, and it is the failure this clause exists to name rather than the success.
  check(
    'cloud.keeps-both-colours',
    green > 0 && red > 0 && green !== red,
    `bullish ${green} px and bearish ${red} px are both present and are different regions`,
  );

  const legend = await page.locator('[data-testid="workspace-legend-price"]').textContent();
  check(
    'cloud.five-lines-under-it',
    (await drawnReadingCount(page, 'workspace-legend-price')) >= 4,
    `price legend after Ichimoku: ${JSON.stringify(legend)}`,
  );

  // FIVE LINES, COUNTED ON THE BITMAP. Measured before this feature at one.
  const lines = await Promise.all(ICHIMOKU_LINES.map(({ rgb }) => hueCount(page, surface, rgb, 4)));
  check(
    'cloud.five-lines-are-drawn',
    lines.every((count) => count > 0) && beforeLines.every((count) => count === 0),
    lines.every((count) => count > 0)
      ? `${ICHIMOKU_LINES.map(({ title }, at) => `${title} ${lines[at]}px`).join(', ')} — five distinct hues, five drawn lines, where the page drew ONE before this feature`
      : `drawn: ${ICHIMOKU_LINES.map(({ title }, at) => `${title} ${lines[at]}px`).join(', ')} · before the pick: ${beforeLines.join(', ')}`,
  );

  /* ---- FILL-04: editing a bound moves the lines AND the shading, in the same frame ---------- */
  await page.locator('[data-testid="workspace-catalogue-section-params"]').click();
  await page.waitForTimeout(ACTION_SETTLE_MS);
  const span = page.getByLabel('Leading Span B Length');
  await span.fill('26');
  await page.waitForTimeout(SETTLE_MS);

  const movedLine = await hueCount(page, surface, ICHIMOKU_LINES[4].rgb, 4);
  const movedGreen = await hueCount(page, surface, KUMO_BULLISH);
  const movedRed = await hueCount(page, surface, KUMO_BEARISH);
  check(
    'cloud.editing-a-bound-moves-the-line-and-the-shading-together',
    movedLine !== lines[4] && (movedGreen !== green || movedRed !== red) && movedGreen + movedRed > 0,
    movedLine !== lines[4] && (movedGreen !== green || movedRed !== red)
      ? `Leading Span B 52 -> 26: the line moves ${lines[4]} -> ${movedLine} px and the Kumo bounded by it moves ${green}/${red} -> ${movedGreen}/${movedRed} px. A fill still drawn against the OLD bounds would leave the second pair alone while the first moved, which is the shape of the defect the clause is about`
      : `line ${lines[4]} -> ${movedLine}, bullish ${green} -> ${movedGreen}, bearish ${red} -> ${movedRed}`,
  );

  reportConsole('cloud.console-clean', console_);
  await page.close();
}

// ---------------------------------------------------------------------------------------------
// Scene 17 — THE MARKS. 77 offered indicators emit them, and until this feature none of them drew:
// `ISeriesApi` in the installed base library has no `setMarkers` at all — the member lives on
// `ISeriesMarkersPluginApi` — so the optional call was swallowed and nothing was red. The published
// 0.2.1's candlestick pattern marks are the same no-op. Counted here on the REAL engine and off the
// real bitmap, because a repository fake that implements what the base library lacks is exactly how
// this survived.
// ---------------------------------------------------------------------------------------------
const MARK_UP = [0, 255, 0]; // realtime-volume-bars paints its own #00FF00 and #FF0000
const MARK_DOWN = [255, 0, 0];

async function sceneMarksReachTheBars(browser, base) {
  const { page, console_ } = await freshPage(browser, base);
  const surface = '[data-testid="workspace-surface"]';

  const beforeUp = await hueCount(page, surface, MARK_UP, 2);
  const beforeDown = await hueCount(page, surface, MARK_DOWN, 2);
  check(
    'marks.none-before-the-pick',
    beforeUp === 0 && beforeDown === 0,
    `marker pixels before picking anything: up ${beforeUp}, down ${beforeDown}`,
  );

  await openStudies(page);
  await pickStudy(page, 'Volume', 'realtime-volume-bars');
  await page.waitForTimeout(SETTLE_MS);

  const up = await hueCount(page, surface, MARK_UP, 2);
  const down = await hueCount(page, surface, MARK_DOWN, 2);
  check(
    'marks.reach-the-bars',
    up > 0 && down > 0,
    `marker pixels after picking "Realtime Volume Bars": up ${up}, down ${down} — the manifest says it emits one per bar`,
  );

  reportConsole('marks.console-clean', console_);
  await page.close();
}

// ---------------------------------------------------------------------------------------------
// Scene 18 — THE COLOURED BAR. 52 offered indicators repaint the candles with `barcolor()` and
// 45,209 of those colours had nowhere to land: `Point` carries none and `SeriesSpec.color` is one
// colour for a whole series. Read off the bitmap, because a candle painted the wrong colour renders
// exactly as well as one painted the right one.
// ---------------------------------------------------------------------------------------------
const BAR_PAINT = [156, 39, 176]; // buying-selling-volume paints its own #9C27B0

async function sceneBarsAreRecoloured(browser, base) {
  const { page, console_ } = await freshPage(browser, base);
  const surface = '[data-testid="workspace-surface"]';

  const before = await hueCount(page, surface, BAR_PAINT, 2);
  check('barcolor.none-before-the-pick', before === 0, `bars in the study's colour before the pick: ${before}`);

  await openStudies(page);
  await pickStudy(page, 'Volume', 'buying-selling-volume');
  await page.waitForTimeout(SETTLE_MS);

  const after = await hueCount(page, surface, BAR_PAINT, 2);
  check(
    'barcolor.candles-take-the-colour',
    after > 0,
    `bars in the study's colour after picking "Buying/Selling Volume": ${after} — it is drawn in a LANE and still repaints the price, which is what barcolor() means`,
  );

  reportConsole('barcolor.console-clean', console_);
  await page.close();
}

// ---------------------------------------------------------------------------------------------
// Scene 19 — THE LAST FOUR CHANNELS. Background shading, labels, drawn lines and boxes: 34 offered
// indicators between them, and until this feature not one of the four reached a canvas. They ride
// the anchor and the overlay channel the fill already paid for, so the package gains nothing for
// them — which is exactly why the proof has to be pixels. A host primitive that is never attached
// costs zero bytes and draws zero pixels, and only one of those two is detectable from `src/`.
//
// Each colour below is the VENDOR'S OWN, read off the registry at its own defaults over the proof's
// fixture: an overlay paints onto a transparent pane layer, so the three colour bytes survive the
// composite verbatim and the alpha is what says the pixel was painted at all.
// ---------------------------------------------------------------------------------------------
const CHANNEL_SCENES = [
  {
    id: 'bgColors',
    category: 'Oscillators',
    study: 'kdj',
    // `rgba(0,128,0,0.3)` and `rgba(255,0,0,0.3)`, one per bar, a full-height column each.
    hues: [[0, 128, 0], [255, 0, 0]],
    note: 'KDJ shades its own pane green and red, one column per bar',
  },
  {
    id: 'labels',
    category: 'Trend',
    study: 'pivot-hh-hl-lh-ll',
    // 171 labels, text only: 4 of the 7 emitters carry no bubble colour, so the text IS the label.
    // The row's OTHER label colour is `rgba(0,128,128,0.5)`, and it is deliberately not read here:
    // measured, the chrome already carries 17 pixels within four of that teal before any study is
    // picked, so a control on it could never read zero and would be asserting nothing.
    hues: [[255, 0, 0]],
    note: '171 pivot labels, drawn as text in the colour the vendor names',
  },
  {
    id: 'lines',
    category: 'Oscillators',
    study: 'triangular-momentum-osc',
    hues: [[255, 68, 31], [0, 196, 43]],
    note: '19 drawn lines between two endpoints in time and price',
  },
  {
    id: 'boxes',
    category: 'Trend',
    study: 'hema-trend-levels',
    // `#00ffbb4D` and `#ff11004D` — hex8, the alpha already in the string.
    hues: [[0, 255, 187], [255, 17, 0]],
    note: '34 boxes between two corners, filled and unbordered',
  },
];

/**
 * FOUR, and the number was measured in both directions rather than copied from the fill's six.
 *
 * A translucent fill does not read back byte-exact: the canvas keeps colour PREMULTIPLIED and
 * `getImageData` divides the alpha out again, so the shading the vendor writes as `rgba(0,128,0,0.3)`
 * comes back as 127 and an exact match counts ZERO of its 50,000 pixels. Measured: at a tolerance of
 * zero the green column reads 0 and the red one reads 40,416, which is the rounding and not the
 * drawing. Four admits the round-trip and still refuses a neighbouring hue.
 */
const SLACK = 4;

async function sceneRemainingChannelsDraw(browser, base) {
  const surface = '[data-testid="workspace-surface"]';
  for (const scene of CHANNEL_SCENES) {
    const { page, console_ } = await freshPage(browser, base);
    const before = await Promise.all(scene.hues.map((hue) => hueCount(page, surface, hue, SLACK)));
    check(
      `channels.${scene.id}-absent-before-the-pick`,
      before.every((count) => count === 0),
      `pixels in ${scene.study}'s own colours before picking anything: ${before.join(', ')}`,
    );

    await openStudies(page);
    await pickStudy(page, scene.category, scene.study);
    await page.waitForTimeout(SETTLE_MS);

    const after = await Promise.all(scene.hues.map((hue) => hueCount(page, surface, hue, SLACK)));
    check(
      `channels.${scene.id}-draw`,
      after.every((count) => count > 0),
      `after picking "${scene.study}": ${after.join(' and ')} pixels — ${scene.note}`,
    );
    reportConsole(`channels.${scene.id}-console-clean`, console_);
    await page.close();
  }
}

const control = await splittingControl();
check(
  'bundle.splitting-is-what-keeps-it-small',
  control.inlined !== null &&
    control.split !== null &&
    control.inlined > control.heavyBytes &&
    control.split < control.heavyBytes / 100 &&
    control.chunks > 1,
  `a synthetic entry whose only weight sits behind an await import() builds to ${control.inlined} B ` +
    `at boot with outfile and ${control.split} B across ${control.chunks} files with outdir + ` +
    'splitting — which is the difference the ceiling above is able to see',
);
// Port 0 asks the OS for a free one: a suite that collides with a developer's own `npm run example`
// on 5173 is a false red, exactly as `layout-probe.mjs` already reasons about the same collision.
const served = await context.serve({ servedir: EXAMPLE, host: HOST, port: 0 });
const base = `http://${HOST}:${served.port}`;

const browser = await chromium.launch();
try {
  await sceneMount(browser, base);
  await sceneStudiesCatalogue(browser, base);
  await sceneManyStudiesAllPlot(browser, base);
  await sceneDensityPaints(browser, base);
  await sceneDrawingCreatesWithPreview(browser, base);
  await sceneGlyphsAreNotPlaceholders(browser, base);
  await sceneRailContainsItsControls(browser, base);
  await sceneAlertAddAndDragRemove(browser, base);
  await sceneAnchorDragHoldsTheRange(browser, base);
  await sceneMagnetPlacesTheAnchor(browser, base);
  await sceneHostSectionIsStable(browser, base);
  await sceneCatalogueBeforeTheLibrary(browser, base);
  await sceneCatalogueFailureStillMounts(browser, base);
  await sceneEditedInputRedraws(browser, base);
  await sceneCloudIsShaded(browser, base);
  await sceneMarksReachTheBars(browser, base);
  await sceneBarsAreRecoloured(browser, base);
  await sceneRemainingChannelsDraw(browser, base);
  await sceneFullJourneyStaysClean(browser, base);
} finally {
  await browser.close();
  await context.dispose();
}

const failed = checks.filter((entry) => !entry.ok);
console.log(`\ne2e-demo: ${checks.length - failed.length}/${checks.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
