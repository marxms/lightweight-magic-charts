import { join } from 'path';
import { codeLines, collectSources, type Source } from './sourceScan';

/**
 * LMC-23 — no file under `src/` carries more than 350 lines of CODE.
 *
 * WHY A DATED BASELINE AND NOT ZERO VIOLATORS.
 *
 * A gate switched on while known violators are still alive can only be satisfied by suppressing
 * it, and a suppressed gate is a dead gate. The two files below are scheduled for later slices —
 * `ChartSurface` dissolves into `react/surface/`, `conformance/suite.ts` splits into harness
 * plus cases — and neither is reachable from this slice. So the rule ships with a ledger of exactly
 * what was already broken on 2026-08-13, and the ledger is a RATCHET, not an exception list:
 *
 *   - a file that is not in the ledger and breaches the ceiling fails on the spot;
 *   - a file that is in the ledger and grows past its recorded value fails;
 *   - a file that is in the ledger and stops breaching must be REMOVED from the ledger, or the
 *     equality assertion fails.
 *
 * An exception forgives; a ratchet only lets go. The difference is the third clause: the list can
 * shrink and can never grow, so the gate discriminates on day one and converges to zero.
 */

const SRC = join(__dirname, '..', '..', 'src');

const LIMIT = 350;

/**
 * REMEASURED on 2026-08-14, by this very file's counter, on the tree where the host's own workspace
 * composition was dissolved and the library's root became the only one.
 *
 * `react/ChartSurface.tsx` LEFT THE LIST, and that is the ratchet working: it entered here with 764
 * lines of code and phase 9 dissolved it below the ceiling of 350. The clause "the list only
 * shrinks" demands the exit — a violator that stopped violating and stays on the record is a
 * licence to come back. From here on it is measured like any other file, and going past 350 fails
 * on the spot.
 *
 * WHAT IS LEFT IS A SINGLE ONE, and it is declared debt: `conformance/suite.ts` splits into harness
 * plus cases in a slice that has not arrived yet. No file entered this remeasurement — the
 * composite the change now assembles fits under the ceiling like any other.
 */
const BASELINE: Readonly<Record<string, number>> = {
  'conformance/suite.ts': 402,
};

interface Measurement {
  readonly file: string;
  readonly lines: number;
}

function measure(sources: readonly Source[]): Measurement[] {
  return sources
    .map((source) => ({ file: source.file, lines: codeLines(source.text) }))
    .sort((a, b) => a.file.localeCompare(b.file));
}

function breaches(sources: readonly Source[]): Measurement[] {
  return measure(sources).filter((m) => m.lines > LIMIT);
}

/** LMC-28: path, measured metric, violated limit — every failing gate prints all three. */
function report(m: Measurement): string {
  return `FAIL ${m.file} :: measured code lines=${m.lines} limit=${LIMIT}`;
}

const sources = collectSources(SRC);
const measured = measure(sources);
const violators = breaches(sources);

describe('LMC-23 — a ceiling of 350 lines of code per file under src', () => {
  it('reads a non-trivial tree, so that a green gate is not a gate over nothing', () => {
    expect(sources.length).toBeGreaterThanOrEqual(30);
    expect(measured.some((m) => m.lines > 100)).toBe(true);
  });

  it('fails a synthetic file above the ceiling and passes one below, by the same predicate', () => {
    // CONTROL POSITIVE. The real clause is an absence, and an absence measured by a broken scan
    // passes in silence. So the same `breaches` that has just judged `src/` judges two invented
    // files: one just above the ceiling, one just below.
    const overCeiling: Source = {
      file: 'synthetic/OverCeiling.ts',
      text: Array.from({ length: LIMIT + 1 }, (_, i) => `const line${i} = ${i};`).join('\n'),
    };
    const underCeiling: Source = {
      file: 'synthetic/UnderCeiling.ts',
      text: Array.from({ length: LIMIT }, (_, i) => `const line${i} = ${i};`).join('\n'),
    };

    expect(breaches([overCeiling, underCeiling]).map((m) => m.file)).toEqual([
      'synthetic/OverCeiling.ts',
    ]);
    expect(report(breaches([overCeiling])[0])).toBe(
      'FAIL synthetic/OverCeiling.ts :: measured code lines=351 limit=350',
    );
  });

  it('counts neither comment nor blank line', () => {
    // The ceiling punishes code, not documentation. A file that buys slack by deleting the comment
    // that explains the decision traded the metric for what it was supposed to protect.
    const documented: Source = {
      file: 'synthetic/Documented.ts',
      text: ['/**', ' * A whole block of prose.', ' */', '', 'const one = 1; // with a tail', ''].join(
        '\n',
      ),
    };
    expect(codeLines(documented.text)).toBe(1);
  });

  it('fails any file outside the baseline that exceeds the ceiling', () => {
    const unrecorded = violators.filter((m) => !(m.file in BASELINE)).map(report);
    expect(unrecorded).toEqual([]);
  });

  it('fails if the baseline keeps a violator that already dropped — the list only shrinks', () => {
    expect(violators.map((m) => m.file)).toEqual(Object.keys(BASELINE).sort());
  });

  it('fails if a file in the baseline grows above the recorded value', () => {
    const grown = measured
      .filter((m) => m.file in BASELINE && m.lines > (BASELINE[m.file] as number))
      .map((m) => `FAIL ${m.file} :: measured code lines=${m.lines} baseline=${BASELINE[m.file]}`);
    expect(grown).toEqual([]);
  });
});
