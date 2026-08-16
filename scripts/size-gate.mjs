#!/usr/bin/env node
/**
 * LMC-27, LMC-28, LMC-35, LMC-68 — the probe that measures `size-budget.json` against reality.
 *
 * It bundles ONE SYMBOL AT A TIME out of the built entry and weighs the output file. That is the
 * only measurement that answers the question a consumer asks: "if I import this one name, what does
 * it cost me?" Weighing the whole package answers a question nobody asked, and counting the modules
 * the graph reaches answers a worse one — the graph reaches everything, so it never discriminates.
 *
 * Usage:
 *   node scripts/size-gate.mjs [--dist dist/esm] [--json]
 * Exit code 0 means every symbol is under its declared limit. Anything else is a failure.
 */
import { build } from 'esbuild';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const LIB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const dist = argv.includes('--dist') ? argv[argv.indexOf('--dist') + 1] : 'dist/esm';
  return { dist, json: argv.includes('--json') };
}

/**
 * EXTERNALS ARE DERIVED FROM THE DECLARED PEERS, never typed out here.
 *
 * A hand-written list is a second declaration of the dependency set, and the two drift. Deriving it
 * means the only way to widen the measurement — to stop counting some package against us — is to
 * declare that package as a peer, which is the visible, reviewable act. The `/*` twin covers a
 * subpath like `react/jsx-runtime`, which is the same peer and not a new one.
 */
function externalsOf(pkg) {
  return Object.keys(pkg.peerDependencies ?? {}).flatMap((peer) => [peer, `${peer}/*`]);
}

function newestMtime(dir) {
  let newest = 0;
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      newest = Math.max(newest, statSync(abs).mtimeMs);
    }
  };
  walk(dir);
  return newest;
}

/**
 * The module marker, and why its absence is reported instead of measured around.
 *
 * `dist/esm/package.json` has to declare BOTH fields. `type: module` is what makes the emitted
 * files ES modules; `sideEffects: false` is what lets the bundler drop what nobody imported.
 * Without the second field the nested manifest SHADOWS the root one, and a floor of roughly
 * 2.267 B falls on every single symbol — at which point the gate is still red, but it accuses the
 * wrong symbol and the reader goes hunting for a regression that is not there.
 */
function checkMarker(distAbs) {
  const marker = join(distAbs, 'package.json');
  if (!existsSync(marker)) {
    return [
      `FAIL ${marker} :: module marker missing — without it the output is not ESM to the bundler,` +
        ' and every symbol is measured against the wrong floor',
    ];
  }
  const declared = JSON.parse(readFileSync(marker, 'utf8'));
  const problems = [];
  if (declared.type !== 'module') {
    problems.push(`FAIL ${marker} :: type measured=${JSON.stringify(declared.type)} expected="module"`);
  }
  if (declared.sideEffects !== false) {
    problems.push(
      `FAIL ${marker} :: sideEffects measured=${JSON.stringify(declared.sideEffects)} expected=false —` +
        ' the nested manifest shadows the root one and a floor of ~2.267 B falls on EVERY symbol',
    );
  }
  return problems;
}

/**
 * WHERE THE SYMBOL IS LOOKED FOR — the entry, or the subpath the manifest declares.
 *
 * The table measures "what does importing this name cost". After conformance left the main entry
 * (LMC-27, LMC-34), that name stopped existing THERE and started existing in `./conformance` — and
 * its row cannot simply vanish from the table, because a ceiling that disappears is a ceiling
 * raised to infinity. `module` says which file of the distribution the symbol comes out of;
 * absent, it is the entry, as it always was.
 */
function moduleFileOf(row, distAbs, entryFile) {
  return row.module === undefined ? entryFile : join(distAbs, row.module);
}

async function measure(entryFile, exportLine, externals, wantMetafile) {
  const scratch = mkdtempSync(join(tmpdir(), 'size-gate-'));
  try {
    const entry = join(scratch, 'probe.mjs');
    writeFileSync(entry, `${exportLine(JSON.stringify(entryFile))}\n`);
    const result = await build({
      entryPoints: [entry],
      // Metafile keys come out relative to esbuild's working directory. Pinning it to the library
      // root is what makes them resolvable against LIB_ROOT no matter where the probe was invoked
      // from — without this the dist-reachability sensor below reads zero from any other directory
      // and voids every measurement it just took.
      absWorkingDir: LIB_ROOT,
      bundle: true,
      minify: true,
      format: 'esm',
      write: false,
      treeShaking: true,
      logLevel: 'silent',
      metafile: wantMetafile === true,
      external: externals,
    });
    return {
      bytes: result.outputFiles[0].contents.length,
      text: Buffer.from(result.outputFiles[0].contents).toString('utf8'),
      metafile: result.metafile,
      warnings: result.warnings.map((warning) => warning.text),
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export async function runSizeGate({ dist }) {
  const budget = JSON.parse(readFileSync(join(LIB_ROOT, 'size-budget.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(join(LIB_ROOT, 'package.json'), 'utf8'));
  const externals = externalsOf(pkg);
  const distAbs = resolve(LIB_ROOT, dist);
  const entryFile = join(distAbs, 'index.js');
  const failures = [];
  const measurements = [];

  if (!existsSync(entryFile)) {
    return {
      failures: [`FAIL ${entryFile} :: does not exist — run the build before the gate`],
      measurements,
      externals,
    };
  }

  failures.push(...checkMarker(distAbs));
  if (failures.length > 0) return { failures, measurements, externals };

  // A distribution older than the source reports an old number, which is worse than reporting no
  // number at all: the gate goes green over an artefact nobody is going to publish.
  const srcMtime = newestMtime(join(LIB_ROOT, 'src'));
  const distMtime = newestMtime(distAbs);
  if (srcMtime > distMtime) {
    return {
      failures: [
        `FAIL ${dist} :: distribution older than the source` +
          ` (source=${new Date(srcMtime).toISOString()} dist=${new Date(distMtime).toISOString()})` +
          ' — refusing to measure, run the build',
      ],
      measurements,
      externals,
    };
  }

  for (const row of budget.symbols) {
    const from = moduleFileOf(row, distAbs, entryFile);
    let measured;
    try {
      measured = await measure(from, (path) => `export { ${row.symbol} } from ${path};`, externals);
    } catch (error) {
      // A BUNDLER ERROR IS A GATE FAILURE, NOT A STACK TRACE. A symbol gone from the module where
      // the table looks for it — exactly what happens when somebody removes an export without
      // touching the budget — aborted the process with an `esbuild/lib/main.js` trace and with no
      // line saying WHICH symbol and WHERE. The verdict has to survive the error to name it.
      failures.push(
        `FAIL ${from} :: ${row.symbol} could not be measured — the bundler failed: ` +
          String(error?.message ?? error).split('\n')[0],
      );
      continue;
    }
    const { bytes, warnings } = measured;
    measurements.push({ symbol: row.symbol, band: row.band, bytes, limit: row.limit });
    // A MEASUREMENT WITH A WARNING IS NOT A MEASUREMENT. That is how the first version of this
    // probe passed with slack over the CommonJS output: the bundler resolved no symbol, emitted
    // `var export_computeLayout = void 0`, warned, and returned 79 B of nothing. A small number
    // looks like a victory and is the opposite of that.
    if (warnings.length > 0) {
      failures.push(
        `FAIL ${from} :: ${row.symbol} measured=${bytes} limit=${row.limit} — measurement discarded,` +
          ` the bundler emitted ${warnings.length} warning(s): ${warnings[0]}`,
      );
    }
    if (bytes > row.limit) {
      failures.push(`FAIL ${from} :: ${row.symbol} measured=${bytes} limit=${row.limit}`);
    }
    // Band C only goes down, and what goes down is the LIMIT. The design specifies +10% slack for
    // this band; making the measured value the ceiling itself made that slack unreachable and
    // forbade the extraction phases 7 to 9 exist to do — the symbol measures the transitive bundle,
    // so naming a function the component still imports can only raise the number. What measures the
    // dissolution is the per-file line ceiling and the props one, and both tighten in these phases.
    //
    // The ratchet lives in lowering the limit at the end of each slice: a registered limit may
    // never go up, and the assertion below fails if somebody tries.
    if (row.band === 'C' && row.limit > Math.ceil(row.measured * 1.1)) {
      failures.push(
        `FAIL ${from} :: ${row.symbol} limit=${row.limit} exceeds the 10% slack over ${row.measured} (band C only goes down)`,
      );
    }
  }

  const whole = await measure(entryFile, (from) => `export * from ${from};`, externals, true);
  // THE DISTRIBUTION HAS TO APPEAR INSIDE THE BUNDLE ITSELF. If the bundler could not read the
  // output, the input set is just the probe file and every number above measures the void.
  const distInputs = Object.keys(Object.values(whole.metafile.outputs)[0].inputs).filter((module) =>
    resolve(LIB_ROOT, module).startsWith(distAbs),
  );
  if (distInputs.length < 10) {
    failures.push(
      `FAIL ${entryFile} :: the entry bundle only reached ${distInputs.length} module(s) of its own` +
        ' distribution — the output is not readable as ESM and no measurement above is worth anything',
    );
  }
  measurements.push({
    symbol: budget.entry.symbol,
    band: budget.entry.band,
    bytes: whole.bytes,
    limit: budget.entry.limit,
  });
  if (whole.bytes > budget.entry.limit) {
    failures.push(`FAIL ${entryFile} :: whole entry measured=${whole.bytes} limit=${budget.entry.limit}`);
  }

  // THE CONFORMANCE SENSOR (LMC-27), measured in the output file.
  const sensor = budget.entryConformance;
  const inOutput = Object.entries(Object.values(whole.metafile.outputs)[0].inputs)
    .filter(([module]) => module.includes('/conformance/'))
    .reduce((total, [, info]) => total + info.bytesInOutput, 0);
  measurements.push({
    symbol: 'conformance/ inside the entry',
    band: 'sensor',
    bytes: inOutput,
    limit: sensor.limit,
  });
  if (inOutput > sensor.limit) {
    failures.push(
      `FAIL ${entryFile} :: conformance/ in the output file measured=${inOutput} limit=${sensor.limit}`,
    );
  }
  // THE SECOND ASSERTION, INDEPENDENT. The first reads the bundler's metafile; this one reads the
  // output text. If either mechanism changes shape, the sensor does not die silently along with it.
  const markerPresent = whole.text.includes(sensor.marker);
  measurements.push({
    symbol: 'conformance text marker',
    band: 'sensor',
    bytes: markerPresent ? 1 : 0,
    limit: sensor.target === 0 && sensor.limit === 0 ? 0 : 1,
  });
  if (markerPresent !== inOutput > 0) {
    failures.push(
      `FAIL ${entryFile} :: the two conformance sensors disagree` +
        ` (bytes=${inOutput} textMarker=${markerPresent}) — one of the two mechanisms changed`,
    );
  }

  return { failures, measurements, externals };
}

const { dist, json } = parseArgs(process.argv.slice(2));
const report = await runSizeGate({ dist });
if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const row of report.measurements) {
    console.log(`  ${String(row.bytes).padStart(7)} / ${String(row.limit).padEnd(7)} [${row.band}] ${row.symbol}`);
  }
  for (const failure of report.failures) console.error(failure);
  console.log(
    report.failures.length === 0
      ? `size-gate: OK — ${report.measurements.length} measurements under the budget`
      : `size-gate: ${report.failures.length} failure(s)`,
  );
}
process.exit(report.failures.length === 0 ? 0 : 1);
