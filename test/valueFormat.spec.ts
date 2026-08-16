import { minMoveOf } from '../src/domain/format';

/**
 * The axis step must be the same number on every engine that runs this package.
 *
 * WHY THIS FILE EXISTS AT ALL: `minMoveOf` had no direct test. It was exercised only through the
 * `seriesFactory` parity fixture, and a golden compared on one machine proves agreement with that
 * machine. The seam surfaced the moment CI ran Node 20 against a record written under a newer
 * engine: `10 ** -4` is `0.00009999999999999999` there and `0.0001` here, so three parity cases
 * failed on a value nothing had ever asserted on its own.
 *
 * THE ORACLE IS NOT THE IMPLEMENTATION. Expecting `1 / 10 ** n` would restate the code and pass for
 * any engine that computes both the same wrong way. `Number('1e-' + n)` is a different mechanism —
 * the spec's string-to-number conversion, which is required to be correctly rounded — so the two
 * sides can genuinely disagree.
 *
 * DECLARED BLIND SPOT, and it is the important one: on an engine whose `**` is already correctly
 * rounded, the old expression PASSES this test. Measured 2026-08-16, Node 25.9.0 is such an engine
 * and Node 20.20.2 is not. This file is therefore a full sensor only where CI runs it, and the
 * reason the defect survived to begin with is that nothing pinned the value on the supported
 * runtime. Read a green run here as "this engine agrees", never as "the expression is safe".
 */

const DECIMALS = Array.from({ length: 16 }, (_, n) => n);

/** The spec-exact value, reached without exponentiation. */
const exact = (n: number): number => Number(`1e-${n}`);

describe('minMoveOf — the axis step is engine-independent', () => {
  it.each(DECIMALS)('gives the exactly rounded step for %i decimals', (n) => {
    expect(minMoveOf({ kind: 'ratio', decimals: n })).toBe(exact(n));
  });

  it('gives the same step for every kind that carries decimals', () => {
    for (const n of DECIMALS) {
      expect(minMoveOf({ kind: 'percent', decimals: n })).toBe(exact(n));
      expect(minMoveOf({ kind: 'compact', decimals: n })).toBe(exact(n));
    }
  });

  it('hands back the declared step untouched when the format carries one', () => {
    const format = (v: number): string => `${v}`;
    expect(minMoveOf({ kind: 'price', minMove: 0.005 })).toBe(0.005);
    expect(minMoveOf({ kind: 'custom', format, minMove: 0.25 })).toBe(0.25);
  });

  it('DISCRIMINATES — the assertion fails on a step that is merely close', () => {
    const nearly = 0.0001 * (1 + Number.EPSILON);
    expect(nearly).not.toBe(exact(4));
    expect(() => expect(nearly).toBe(exact(4))).toThrow();
  });

  it('reads a non-trivial range, so a green run is not a run over nothing', () => {
    expect(DECIMALS.length).toBeGreaterThanOrEqual(16);
    expect(new Set(DECIMALS.map(exact)).size).toBe(DECIMALS.length);
  });
});
