import { spawnSync } from 'child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

/**
 * LMC-27, LMC-35, LMC-68 — the probe is exercised through its CLI, not through an import.
 *
 * `scripts/size-gate.mjs` is what `quality-gate.sh` will run, so what has to be pinned is the CLI
 * contract: the exit code and the printed report. A test that imported the function would leave the
 * only part CI depends on untested.
 */

const LIB_ROOT = join(__dirname, '..', '..');
const PROBE = join(LIB_ROOT, 'scripts', 'size-gate.mjs');

interface Report {
  readonly failures: readonly string[];
  readonly measurements: readonly {
    readonly symbol: string;
    readonly band: string;
    readonly bytes: number;
    readonly limit: number;
  }[];
  readonly externals: readonly string[];
}

interface Run {
  readonly status: number;
  readonly report: Report;
}

function runProbe(dist: string): Run {
  const result = spawnSync('node', [PROBE, '--dist', dist, '--json'], {
    cwd: LIB_ROOT,
    encoding: 'utf8',
  });
  return { status: result.status ?? -1, report: JSON.parse(result.stdout) as Report };
}

/**
 * The highest the entry limit was ever allowed to reach, written down so the descent is checkable.
 *
 * It is the last of the per-phase re-pins, the one the boundary declared provisional. Keeping it
 * here rather than in the budget is deliberate: the budget holds what is true now, and a ceiling the
 * ratchet has already left would read as a live allowance sitting next to the live one.
 */
const PROVISIONAL_ENTRY_LIMIT = 104994;

/**
 * THE TABLE AT THE CUTOVER — dated, because an equality between two sides that move together is no
 * ratchet at all.
 *
 * `measurements.length === BUDGET.symbols.length + 3` compared the probe's output against the very
 * table that feeds it: deleting the `openScope` row removed the symbol's ceiling AND the
 * expectation, and the probe printed "OK — 15 measurements" with the suite green at 1077/1077. The
 * symbol was left with no ceiling and nothing lit up. Leaving the table now costs moving a number
 * written here, which is declaring the exit.
 */
const SYMBOLS_AT_CUTOVER = 13;

/**
 * THE `measured` OF THE LAST PIN, frozen — and the ratchet is UPWARD ONLY.
 *
 * The previous version of this provenance asserted `measured === fresh measurement` in both
 * directions, and charged two prices nobody had decided to pay. First, every change to `src/` failed
 * the library's suite until somebody edited `size-budget.json` by hand — INCLUDING the ones that
 * SHRINK the bundle, that is, exactly the good ones: seven bytes fewer and the suite went red asking
 * for the re-pin AD-012 reserves to the owner. Second, and worse, it inflated the discrimination
 * sensor: every behaviour mutation in `src/` moves some byte, so it died together with the behaviour
 * test that actually caught the defect, and whoever counted deaths was counting the instrument. A
 * clause that fails on any change discriminates nothing.
 *
 * WHAT THE PROVENANCE HAS TO PREVENT is one thing only, and it does not depend on the bundle:
 * `measured` GOING UP. Raising `measured` and `limit` together — 100493 to 104900 — passed 17/17,
 * because the two zero-slack clauses stay true by construction when both sides move together, and so
 * does the `limit < PROVISIONAL` ratchet. That was 4407 B of slack granted with everything green.
 * Against a dated list, that same move fails without a single line of `src/` being read.
 *
 * WHAT IT DOES NOT CATCH, said out loud: LOWERING a `measured` on a row with slack (`computeLayout`
 * from 1078 to 900) passes now. That is not a lost tooth: `limit` does not move with it, the row
 * keeps the same ceiling, and on the two ZERO-slack rows — the entry and `ChartWorkspace` — lowering
 * `measured` lowers `limit` with it, by the equality asserted just below, and the probe fails on the
 * spot if the bundle does not fit. Down is the safe direction, and it is the direction a legitimate
 * shrinkage writes.
 * RE-PINNED 2026-08-14, and the two raises are the only ones this file has taken: the compact grid
 * getting its width back and the price-alert label leaving the raw bookkeeping id off the user's
 * screen. Both are defects the LAN deploy found in a browser, which no static gate could see — the
 * grid rendered 0 px wide with heightPx arriving correct, and the axis read `alert alert-1`.
 */
const MEASURED_AT_PIN: Readonly<Record<string, number>> = {
  '*': 104752,
  utcSeconds: 36,
  DEFAULT_WORKSPACE_THEME: 383,
  formatterFor: 449,
  reduceTabs: 959,
  computeLayout: 1078,
  WorkspaceLegend: 1128,
  DensityFieldOverlay: 1776,
  applyFrame: 2574,
  PaneStack: 2714,
  openScope: 3974,
  CONFORMANCE_CASES: 12505,
  ChartSurface: 23755,
  ChartWorkspace: 95481,
};

/** The same probe, invoked from somewhere that is NOT the library root. */
function runProbeFrom(cwd: string): Run {
  const result = spawnSync('node', [PROBE, '--json'], { cwd, encoding: 'utf8' });
  return { status: result.status ?? -1, report: JSON.parse(result.stdout) as Report };
}

/**
 * `lightweight-charts` under this very probe, so the cap is a measurement and not a taste call.
 *
 * Same bundler, same flags, same `export *` shape as the entry row it bounds — a cap taken with a
 * different method would compare two numbers that were never comparable.
 */
function measurePeer(): number {
  const script =
    "const{build}=require('esbuild'),fs=require('fs'),os=require('os'),p=require('path');" +
    "(async()=>{const d=fs.mkdtempSync(p.join(os.tmpdir(),'peer-'));const f=p.join(d,'probe.mjs');" +
    "fs.writeFileSync(f,'export * from '+JSON.stringify(process.argv[1])+';');" +
    "const r=await build({entryPoints:[f],bundle:true,minify:true,format:'esm',write:false," +
    "treeShaking:true,logLevel:'silent'});console.log(r.outputFiles[0].contents.length);" +
    'fs.rmSync(d,{recursive:true,force:true});})()';
  // WALKED UP, not counted: `node_modules` sits two levels above inside the monorepo and one level
  // above in this package's own repository. Counting encodes one checkout and returns NaN in the
  // other, which reads as "the ceiling is wrong" when the truth is "the peer was not found".
  let peerRoot = LIB_ROOT;
  while (!existsSync(join(peerRoot, 'node_modules', 'lightweight-charts'))) {
    const up = dirname(peerRoot);
    if (up === peerRoot) throw new Error('lightweight-charts is not installed anywhere above the library');
    peerRoot = up;
  }
  peerRoot = join(peerRoot, 'node_modules', 'lightweight-charts');
  const out = spawnSync('node', ['-e', script, peerRoot], { cwd: LIB_ROOT, encoding: 'utf8' });
  return Number.parseInt(out.stdout.trim(), 10);
}

function assertUnderCap(bytes: number, cap: number): void {
  if (bytes > cap) throw new Error(`entry ${bytes} B exceeds the wrapped engine at ${cap} B`);
}

const BUDGET = JSON.parse(readFileSync(join(LIB_ROOT, 'size-budget.json'), 'utf8')) as {
  symbols: readonly {
    symbol: string;
    band: string;
    module?: string;
    measured: number;
    limit: number;
  }[];
  entry: {
    symbol: string;
    measured: number;
    limit: number;
    ratchet: string;
    hardCap: number;
    note: string;
  };
  entryConformance: { measured: number; limit: number; target: number; marker: string };
};
const PACKAGE = JSON.parse(readFileSync(join(LIB_ROOT, 'package.json'), 'utf8')) as {
  main?: string;
  types?: string;
  files?: readonly string[];
  exports?: Record<string, Record<string, string> | string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const scratchDirs: string[] = [];
function scratch(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

function backdate(dir: string): void {
  const old = new Date('2000-01-01T00:00:00Z');
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const abs = join(current, entry.name);
      if (entry.isDirectory()) walk(abs);
      else utimesSync(abs, old, old);
    }
  };
  walk(dir);
}

let fresh: Run;
let cjsWithoutMarker: Run;
let cjsWithMarker: Run;
let staleRun: Run;

beforeAll(() => {
  // The ESM build is a prerequisite of the measurement, and running it here makes the suite
  // independent of the order in which somebody invoked the scripts.
  const built = spawnSync('npm', ['run', 'build:esm'], { cwd: LIB_ROOT, encoding: 'utf8' });
  expect(built.status).toBe(0);

  fresh = runProbe('dist/esm');

  // OLD FORMAT: the CommonJS `dist/` that `npm run build` produces, with no marker at all.
  cjsWithoutMarker = runProbe('dist');

  // OLD FORMAT WITH A VALID MARKER: the harder proof, because the marker stops being the
  // explanation for the failure and what is left is the measurement itself.
  const cjs = scratch('size-cjs-');
  cpSync(join(LIB_ROOT, 'dist'), cjs, {
    recursive: true,
    filter: (source) => !source.includes(`${join(LIB_ROOT, 'dist', 'esm')}`),
  });
  cpSync(join(LIB_ROOT, 'esm-package.json'), join(cjs, 'package.json'));
  cjsWithMarker = runProbe(cjs);

  // DISTRIBUTION OLDER THAN THE SOURCE: the same good output, dates pushed back.
  const stale = scratch('size-stale-');
  cpSync(join(LIB_ROOT, 'dist', 'esm'), stale, { recursive: true });
  backdate(stale);
  staleRun = runProbe(stale);
}, 180_000);

afterAll(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

describe('LMC-68 — the probe that measures the size budget', () => {
  it('passes against the fresh output, and measures every symbol in the table', () => {
    expect(fresh.report.failures).toEqual([]);
    expect(fresh.status).toBe(0);
    const measured = fresh.report.measurements.map((m) => m.symbol);
    for (const row of BUDGET.symbols) expect(measured).toContain(row.symbol);
    expect(measured).toContain(BUDGET.entry.symbol);
    expect(fresh.report.measurements.length).toBe(BUDGET.symbols.length + 3);
  });

  it('returns the same verdict wherever it was invoked from', () => {
    // It did not. Metafile keys are relative to esbuild's working directory, and the reachability
    // sensor resolved them against the library root: run from the repository root — which is how
    // the plan and quality-gate.sh spell it — the sensor read zero modules, fired a false FAIL and
    // declared every measurement it had just taken void. A gate whose verdict depends on the caller's
    // directory is not a gate.
    const fromRepoRoot = runProbeFrom(join(LIB_ROOT, '..', '..'));
    const fromTmp = runProbeFrom(tmpdir());
    for (const run of [fromRepoRoot, fromTmp]) {
      expect(run.report.failures).toEqual([]);
      expect(run.status).toBe(0);
      expect(run.report.measurements.length).toBe(fresh.report.measurements.length);
    }
    const bytesOf = (run: Run): Record<string, number> =>
      Object.fromEntries(run.report.measurements.map((m) => [m.symbol, m.bytes]));
    expect(bytesOf(fromRepoRoot)).toEqual(bytesOf(fresh));
    expect(bytesOf(fromTmp)).toEqual(bytesOf(fresh));
  });

  it('derives the externals from the declared peers, never from a hand-written list', () => {
    const peers = Object.keys(PACKAGE.peerDependencies ?? {});
    expect(peers.length).toBeGreaterThan(0);
    expect([...fresh.report.externals].sort()).toEqual(
      peers.flatMap((peer) => [peer, `${peer}/*`]).sort(),
    );
    // The subpath peer exists because `react/jsx-runtime` is the same peer, and not a new one.
    expect(fresh.report.externals).toContain('react/*');
  });

  it('pins the bundler to an exact version, with no range', () => {
    // Minifier output changes between minor versions; with a range, a gate failure would stop
    // meaning a regression and start meaning a dependency update.
    expect(PACKAGE.devDependencies?.esbuild).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('measures the spec’s symbol against its limit, with real slack', () => {
    const computeLayout = fresh.report.measurements.find((m) => m.symbol === 'computeLayout');
    expect(computeLayout?.limit).toBe(2000);
    expect(computeLayout?.bytes).toBeLessThan(2000);
  });

  it('measures conformance in the output file, and checks it with a second mechanism', () => {
    // LMC-27. Bytes IN THE OUTPUT FILE, not modules analysed: the graph reaches everything, so
    // counting analysed modules never discriminates.
    const bytes = fresh.report.measurements.find((m) => m.symbol === 'conformance/ inside the entry');
    // A ceiling, never an equality: the target of this number is ZERO, and the bundler's byte
    // attribution shifts on every change of the graph. Pinning it by equality made a DROP fail
    // the gate, which is the opposite of what it wants.
    expect(bytes?.bytes).toBeLessThanOrEqual(BUDGET.entryConformance.measured);
    expect(bytes?.limit).toBe(BUDGET.entryConformance.limit);
    // The second assertion, independent of the first: the suite's text marker appears in the output
    // exactly when its bytes appear. If the two disagree, the probe fails.
    const marker = fresh.report.measurements.find(
      (m) => m.symbol === 'conformance text marker',
    );
    // ZERO, and not 1: the conformance suite left the entry, so neither its bytes nor its text
    // appear in the output. While it was in there this line asserted 1.
    expect(marker?.bytes).toBe(0);
    expect(BUDGET.entryConformance.marker.length).toBeGreaterThan(20);
  });

  it('fails against output in the old format — with no module marker', () => {
    // PROOF OF DISCRIMINATION, half 1.
    expect(cjsWithoutMarker.status).not.toBe(0);
    expect(cjsWithoutMarker.report.failures.join('\n')).toMatch(/module marker missing/);
  });

  it('fails against the old output even WITH a marker — the measurement is discarded, not celebrated', () => {
    // PROOF OF DISCRIMINATION, half 2, and the more important one. With the marker in place, the
    // bundler reads the CommonJS output, resolves no symbol at all and returns dozens of bytes of
    // nothing. A small number looks like a victory: without this clause the probe passed with slack
    // over an artefact where it had measured absolutely nothing.
    expect(cjsWithMarker.status).not.toBe(0);
    const joined = cjsWithMarker.report.failures.join('\n');
    expect(joined).toMatch(/measurement discarded, the bundler emitted \d+ warning/);
    expect(joined).toMatch(/computeLayout measured=\d+ limit=2000/);
    expect(joined).toMatch(/only reached \d+ module\(s\) of its own distribution/);
  });

  it('refuses to measure a distribution older than the source, instead of reporting an old number', () => {
    expect(staleRun.status).not.toBe(0);
    expect(staleRun.report.failures.join('\n')).toMatch(/older than the source/);
    expect(staleRun.report.measurements).toEqual([]);
  });
});

describe('LMC-27, LMC-34 — conformance leaves the entry and gets a subpath of its own', () => {
  const ENTRY_SOURCE = readFileSync(join(LIB_ROOT, 'src', 'index.ts'), 'utf8');
  const CONFORMANCE_SUBPATH = './conformance';

  it('the main entry no longer re-exports anything from conformance/', () => {
    // The assertion reads the CODE, not the prose: the header that replaced the two export lines
    // mentions `./conformance` on purpose, and matching the raw text would go green with the export
    // still alive.
    const code = ENTRY_SOURCE.split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    expect(code).not.toMatch(/from\s+'\.\/conformance\//);
    expect(code).not.toMatch(/\bCONFORMANCE_CASES\b/);
    expect(code).not.toMatch(/\brunConformanceSuite\b/);
    expect(code).not.toMatch(/\bConformanceError\b/);
  });

  it('the sensor measures ZERO bytes of conformance inside the entry’s bundle', () => {
    // The target the budget always declared, now reached — and the limit followed it, otherwise
    // "zero target" would be a note and not a gate.
    expect(BUDGET.entryConformance.target).toBe(0);
    expect(BUDGET.entryConformance.limit).toBe(0);
    const bytes = fresh.report.measurements.find((m) => m.symbol === 'conformance/ inside the entry');
    expect(bytes?.bytes).toBe(0);
  });

  it('the manifest declares the subpath, and it points at files that exist', () => {
    const map = PACKAGE.exports ?? {};
    expect(Object.keys(map)).toContain(CONFORMANCE_SUBPATH);
    const declared = map[CONFORMANCE_SUBPATH] as Record<string, string>;
    // Types AND runtime: a subpath that resolves only the JavaScript leaves the TypeScript consumer
    // with no declaration, and it goes back to importing through the entry — which is exactly what
    // left here.
    expect(declared.types).toBe('./dist/conformance/suite.d.ts');
    expect(declared.default).toBe('./dist/conformance/suite.js');
    for (const target of [declared.types, declared.default]) {
      expect(existsSync(join(LIB_ROOT, target))).toBe(true);
    }
    // And the main entry stays declared, otherwise the map would shut the front door on publishing.
    const root = map['.'] as Record<string, string>;
    expect(root.default).toBe(`./${PACKAGE.main}`);
    expect(root.types).toBe(`./${PACKAGE.types}`);
  });

  it('the physical node10 resolution path points at the SAME target as exports', () => {
    // WHY IT EXISTS. `apps/web` compiles with moduleResolution=node and runs its tests with
    // jest-resolve 27; neither of the two reads `exports`, and without a physical directory the
    // subpath import fails before it reaches the map. Two declarations of the same target diverge
    // the first time one of them changes, so the assertion is the EQUALITY between them.
    const stubPath = join(LIB_ROOT, 'conformance', 'package.json');
    expect(existsSync(stubPath)).toBe(true);
    const stub = JSON.parse(readFileSync(stubPath, 'utf8')) as { main: string; types: string };
    const declared = PACKAGE.exports?.[CONFORMANCE_SUBPATH] as Record<string, string>;
    expect(join(LIB_ROOT, 'conformance', stub.main)).toBe(join(LIB_ROOT, declared.default));
    expect(join(LIB_ROOT, 'conformance', stub.types)).toBe(join(LIB_ROOT, declared.types));
    // And it ships in the tarball: outside `files`, the subpath resolves in the monorepo and breaks
    // on npm.
    expect(PACKAGE.files).toContain('conformance');
  });

  it('CONFORMANCE_CASES still has a ceiling, measured through the subpath', () => {
    // Deleting the row from the table would raise the ceiling to infinity. It stays, and what
    // changes is WHERE the symbol is fetched from.
    const row = BUDGET.symbols.find((s) => s.symbol === 'CONFORMANCE_CASES');
    expect(row?.module).toBe('conformance/suite.js');
    const measured = fresh.report.measurements.find((m) => m.symbol === 'CONFORMANCE_CASES');
    expect(measured?.bytes).toBeGreaterThan(0);
    expect(measured?.bytes).toBeLessThanOrEqual(row?.limit ?? 0);
  });

  it('pins the entry AT its measurement, with the down-only ratchet back and no slack left', () => {
    // Per-phase re-pinning existed only while the composition was being mounted inside the library:
    // the entry grew by design and a pre-feature pin would have rejected its own goal. The host's
    // composition is dissolved, so the growth is over and the ratchet returns in its strict form —
    // the limit IS the measurement, and the next byte of growth fails on the spot.
    expect(BUDGET.entry.ratchet).toBe('down-only');
    expect(BUDGET.entry.limit).toBe(BUDGET.entry.measured);
    // The descent, asserted rather than narrated: whatever the pin becomes, it may never climb back
    // to the provisional ceiling the phase boundaries were allowed to raise it to.
    expect(BUDGET.entry.limit).toBeLessThan(PROVISIONAL_ENTRY_LIMIT);
    const entry = fresh.report.measurements.find((m) => m.symbol === BUDGET.entry.symbol);
    expect(entry?.limit).toBe(BUDGET.entry.limit);
    expect(entry?.bytes).toBeLessThanOrEqual(BUDGET.entry.limit);
  });

  it('pins every `measured` to the dated pin — the provenance only goes down', () => {
    // `measured` means "this was measured". While it is only a number written next to the limit, it
    // is the one part of the budget that answers to nothing — and it is the part the zero-slack
    // limit depends on entirely. The reason the comparison is against the dated list above, and not
    // against the fresh measurement, is written there.
    const risen = [...BUDGET.symbols, BUDGET.entry]
      .filter((row) => row.measured > (MEASURED_AT_PIN[row.symbol] ?? -1))
      .map((row) => `${row.symbol}: written ${row.measured} :: pin ${MEASURED_AT_PIN[row.symbol]}`);
    expect(risen).toEqual([]);
  });

  it('does not let a row LEAVE the table — the ratchet is a written number, not an equality', () => {
    // THE DEFECT, measured: removing the `openScope` row (3974 / 4968) from the budget made the
    // probe print "OK — 15 measurements" and the suite pass 1077/1077, because the count
    // expectation was `BUDGET.symbols.length + 3` — both sides shrink together. The symbol was left
    // with no ceiling and nothing lit up. It is the same shape as the ledger's ratchet, which closed
    // for the same reason: against shrinkage, only a dated number holds.
    expect(BUDGET.symbols.length).toBeGreaterThanOrEqual(SYMBOLS_AT_CUTOVER);
    // And by name, which is stronger than the count: swapping one row for another keeps the total.
    const rows = new Set([...BUDGET.symbols.map((row) => row.symbol), BUDGET.entry.symbol]);
    expect(Object.keys(MEASURED_AT_PIN).filter((symbol) => !rows.has(symbol))).toEqual([]);
    // Control: a budget row the probe does not measure would escape every comparison in silence.
    const bytesOf = (symbol: string): number | undefined =>
      fresh.report.measurements.find((m) => m.symbol === symbol)?.bytes;
    expect(BUDGET.symbols.filter((row) => bytesOf(row.symbol) === undefined)).toEqual([]);
    expect(fresh.report.measurements.length).toBeGreaterThanOrEqual(SYMBOLS_AT_CUTOVER + 3);
  });

  it('registers the composed root as a symbol of its own, and it is most of the entry', () => {
    // A composite worth 91% of the whole public surface had no row while it was being written, so
    // nothing could have reported it growing. Registering it is what makes the next growth visible
    // against the root rather than against the anonymous total.
    const row = BUDGET.symbols.find((s) => s.symbol === 'ChartWorkspace');
    expect(row?.band).toBe('C');
    expect(row?.limit).toBe(row?.measured);
    const measured = fresh.report.measurements.find((m) => m.symbol === 'ChartWorkspace');
    expect(measured?.bytes).toBeLessThanOrEqual(row?.limit ?? 0);
    expect((measured?.bytes ?? 0) / (BUDGET.entry.measured || 1)).toBeGreaterThan(0.85);
  });

  it('caps the entry at the engine it wraps, measured rather than asserted', () => {
    // A wrapper larger than the library it wraps is a defect no phase boundary may authorise. The
    // number is not a taste call: it is `lightweight-charts` itself under this same probe.
    const peer = measurePeer();
    expect(BUDGET.entry.hardCap).toBe(peer);
    expect(BUDGET.entry.limit).toBeLessThan(BUDGET.entry.hardCap);

    // Positive control: the cap has to reject, or it is decoration.
    expect(() => assertUnderCap(peer + 1, peer)).toThrow(/exceeds the wrapped engine/);
    expect(() => assertUnderCap(peer - 1, peer)).not.toThrow();
  });
});
