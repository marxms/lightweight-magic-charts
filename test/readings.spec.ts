import { readFileSync } from 'fs';
import { join } from 'path';

import { carryReadings, plottedPoints, type PlottedPoint } from '../src/domain/readings';
import { seriesId, utcSeconds, type Bar, type SeriesSpec } from '../src/domain/types';
import { collectSources } from './gates/sourceScan';

/**
 * LMC-20, LMC-22 — the conversion of a raw reading into a drawable point, repatriated and PROVED
 * equal.
 *
 * ── HOW THE PARITY RECORD WAS MADE ──
 *
 * Before a single line left `react/ChartSurface.tsx`, the PREVIOUS implementation — the
 * `carryReadings` function and the body of the data effect, at commit 60e74b5 — was copied verbatim
 * into a script outside the tree and run over the corpus declared below. The output of that run is
 * in `fixtures/readingsParity.json`, recorded from code this commit deletes.
 *
 * The corpus below is the INPUT half of that run, re-declared here; the record is the OUTPUT half.
 * Compared by deep equality, case by case and with the case name in the message, so a flag that
 * starts being read backwards, a reordered clause or one point too many fail NAMING which rule
 * changed.
 */

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'readingsParity.json'), 'utf8'),
) as {
  readonly palette: { readonly up: string; readonly down: string };
  readonly carry: ReadonlyArray<readonly [string, ReadonlyArray<number | null>]>;
  readonly plot: ReadonlyArray<
    readonly [string, ReadonlyArray<{ time: number; value: number | string; color: string | null }>]
  >;
};

const PALETTE = FIXTURE.palette;

/**
 * The translation between what the function returns and what JSON is able to hold. Two losses, both
 * plugged here instead of inside the comparison:
 *
 *   `undefined` disappears from a serialised object, so "no colour" and "missing key" would be
 *   indistinguishable — the record keeps the absence as `null`.
 *
 *   `-0` is recorded as `0`, and it is what `-Math.abs(0)` produces. Without this line, the one case
 *   in which mirroring does not change the digit would pass parity even with the flag ignored.
 *   Recorded as text, negative zero becomes an asserted fact.
 */
const asRecorded = (points: readonly PlottedPoint[]): Array<Record<string, unknown>> =>
  points.map((point) => ({
    time: point.time,
    value: Object.is(point.value, -0) ? '-0' : point.value,
    color: point.color === undefined ? null : point.color,
  }));

const bar = (time: number, open: number, close: number): Bar => ({
  time: utcSeconds(time),
  open,
  high: Math.max(open, close) + 1,
  low: Math.min(open, close) - 1,
  close,
});

const RISING = bar(1_700_000_000, 100, 105);
const FALLING = bar(1_700_000_060, 105, 100);
const FLAT = bar(1_700_000_120, 90, 90);
const BARS: readonly Bar[] = [RISING, FALLING, FLAT];

const spec = (over: Partial<Omit<SeriesSpec, 'id'>> = {}): SeriesSpec => ({
  id: seriesId('x'),
  label: 'X',
  shape: 'line',
  color: '#fff',
  ...over,
});

const CARRY: ReadonlyArray<readonly [string, ReadonlyArray<number | null>, SeriesSpec]> = [
  ['no carry, no gap', [1, 2, 3], spec()],
  ['no carry, gap in the middle', [1, null, 3], spec()],
  ['no carry, all null', [null, null], spec()],
  ['carry, gap in the middle', [1, null, 3], spec({ stepCarry: true })],
  ['carry, gap at the start', [null, 2, null], spec({ stepCarry: true })],
  ['carry, gap at the end', [1, null, null], spec({ stepCarry: true })],
  ['carry, all null', [null, null], spec({ stepCarry: true })],
  ['carry, empty', [], spec({ stepCarry: true })],
  ['carry declared false is the same as absent', [1, null, 3], spec({ stepCarry: false })],
  ['carry preserves the zero, which is not a gap', [0, null, 3], spec({ stepCarry: true })],
];

const PLOT: ReadonlyArray<readonly [string, ReadonlyArray<number | null>, SeriesSpec]> = [
  ['no flag at all', [1, -2, 3], spec()],
  ['mirrored negates the magnitude, even of an already negative value', [1, -2, 0], spec({ mirrored: true })],
  ['coloured by sign', [1, -2, 0], spec({ signColoring: true })],
  ['coloured by the bar direction', [1, 2, 3], spec({ barDirectionColoring: true })],
  [
    'bar direction beats the sign when both are declared',
    [-1, -2, -3],
    spec({ barDirectionColoring: true, signColoring: true }),
  ],
  ['mirrored and coloured by sign: the colour reads the PLOTTED value', [5, 5, 5], spec({ mirrored: true, signColoring: true })],
  ['a gap does not become a point', [1, null, 3], spec({ signColoring: true })],
  ['a reading longer than the bars is truncated', [1, 2, 3, 4, 5], spec()],
  ['a reading shorter than the bars invents no point', [1], spec()],
  ['no reading at all', [], spec()],
  ['zero is a point, and on the upper side', [0, 0, 0], spec({ signColoring: true })],
];

describe('LMC-22 — parity: the same inputs, the same output as before the repatriation', () => {
  it('the corpus and the record are the same size and names — a mute case does not pass', () => {
    // Without this clause, deleting a line of the corpus would make the loops below check less and
    // still stay green. The coverage is ASSERTED, not a side effect of the loop.
    expect(CARRY.length).toBe(FIXTURE.carry.length);
    expect(PLOT.length).toBe(FIXTURE.plot.length);
    expect(CARRY.map(([name]) => name)).toEqual(FIXTURE.carry.map(([name]) => name));
    expect(PLOT.map(([name]) => name)).toEqual(FIXTURE.plot.map(([name]) => name));
    expect(CARRY.length).toBeGreaterThanOrEqual(10);
    expect(PLOT.length).toBeGreaterThanOrEqual(10);
  });

  it.each(CARRY.map(([name], at) => [name, at] as const))(
    'carries the same as before: %s',
    (_name, at) => {
      const [, raw, declared] = CARRY[at];
      expect(carryReadings(raw, declared)).toEqual(FIXTURE.carry[at][1]);
    },
  );

  it.each(PLOT.map(([name], at) => [name, at] as const))(
    'plots the same as before: %s',
    (_name, at) => {
      const [, raw, declared] = PLOT[at];
      // THE REAL CHAIN: the effect plotted what `carryReadings` produced, never the raw reading.
      const points = plottedPoints(carryReadings(raw, declared), BARS, declared, PALETTE);
      expect(asRecorded(points)).toEqual(FIXTURE.plot[at][1]);
    },
  );

  it('the record DISCRIMINATES — each altered flag breaks the parity of a named case', () => {
    // PROOF OF DISCRIMINATION. A comparison loop passes equally well over a record that asserts
    // nothing. These four re-implementations get ONE rule wrong each, and each one is seen failing
    // against the SAME record that the real implementation satisfies.
    const at = (name: string): number => PLOT.findIndex(([label]) => label === name);

    // 1. forgot the mirroring
    const noMirror = at('mirrored negates the magnitude, even of an already negative value');
    const [, cruas, espelhada] = PLOT[noMirror];
    expect(
      asRecorded(plottedPoints(carryReadings(cruas, espelhada), BARS, { ...espelhada, mirrored: false }, PALETTE)),
    ).not.toEqual(FIXTURE.plot[noMirror][1]);

    // 2. swapped the precedence: sign beating bar direction
    const precedence = at('bar direction beats the sign when both are declared');
    const [, cruasP, ambas] = PLOT[precedence];
    expect(
      asRecorded(
        plottedPoints(carryReadings(cruasP, ambas), BARS, { ...ambas, barDirectionColoring: false }, PALETTE),
      ),
    ).not.toEqual(FIXTURE.plot[precedence][1]);

    // 3. inverted the palette
    const bySign = at('coloured by sign');
    const [, cruasS, sinal] = PLOT[bySign];
    expect(
      asRecorded(
        plottedPoints(carryReadings(cruasS, sinal), BARS, sinal, { up: PALETTE.down, down: PALETTE.up }),
      ),
    ).not.toEqual(FIXTURE.plot[bySign][1]);

    // 4. treated a gap as zero
    const withGap = at('a gap does not become a point');
    const [, cruasL, comSinal] = PLOT[withGap];
    const zerada = cruasL.map((value) => value ?? 0);
    expect(asRecorded(plottedPoints(zerada, BARS, comSinal, PALETTE))).not.toEqual(
      FIXTURE.plot[withGap][1],
    );
  });
});

describe('LMC-20 — carrying across the gap', () => {
  it('carries the last reading in force, and only when the series declares that it holds', () => {
    const carried = spec({ stepCarry: true });
    expect(carryReadings([1, null, null, 4], carried)).toEqual([1, 1, 1, 4]);
    // POSITIVE CONTROL: the SAME gap, in the series that does not declare the flag, stays a gap —
    // it is what separates "nobody measured" from "the previous measurement still stands".
    expect(carryReadings([1, null, null, 4], spec())).toEqual([1, null, null, 4]);
  });

  it('invents no reading before the first: what has not been measured yet is not in force', () => {
    expect(carryReadings([null, null, 3], spec({ stepCarry: true }))).toEqual([null, null, 3]);
  });

  it('carries the ZERO, which is a reading and not an absence', () => {
    // The defect this line closes is `value ?? carried` becoming `value || carried`: with the
    // second, a rate that hit zero would show the previous rate indefinitely.
    expect(carryReadings([0, null], spec({ stepCarry: true }))).toEqual([0, 0]);
  });
});

describe('LMC-20 — mirroring below the reference line', () => {
  it('negates the MODULUS, so that the mirrored side is the lower side whatever sign was read', () => {
    const mirrored = spec({ mirrored: true });
    expect(plottedPoints([5, -5], BARS, mirrored, PALETTE).map((p) => p.value)).toEqual([-5, -5]);
    // POSITIVE CONTROL: without the flag, the same pair passes through intact — the negation is
    // declared, not a property of the drawing.
    expect(plottedPoints([5, -5], BARS, spec(), PALETTE).map((p) => p.value)).toEqual([5, -5]);
  });

  it('mirrors the ZERO to the lower side, and negative zero is the only sign of it', () => {
    // The case in which the flag does not change the digit. `Object.is` is what separates `-0` from
    // `0`; ordinary equality does not separate them, and that is how the one input capable of
    // hiding an ignored mirroring would get through the parity.
    const [point] = plottedPoints([0], BARS, spec({ mirrored: true }), PALETTE);
    expect(Object.is(point.value, -0)).toBe(true);
    // POSITIVE CONTROL: without the flag the same zero is positive, so the assertion above reads
    // the mirroring and not a property of zero.
    expect(Object.is(plottedPoints([0], BARS, spec(), PALETTE)[0].value, -0)).toBe(false);
  });

  it('the MEASURED value survives the negation: it belongs to the point, the reading is intact', () => {
    // The distinction the legend depends on existing. `carryReadings` is the legend's source; the
    // plotted point is another object. Had the negation stayed in the readings, both would say -5.
    const mirrored = spec({ mirrored: true, stepCarry: true });
    const readings = carryReadings([5, null], mirrored);
    expect(readings).toEqual([5, 5]);
    expect(plottedPoints(readings, BARS, mirrored, PALETTE).map((p) => p.value)).toEqual([-5, -5]);
  });
});

describe('LMC-20 — colouring', () => {
  it('by SIGN, reading the plotted value and not the measured one', () => {
    const signed = spec({ signColoring: true });
    expect(plottedPoints([1, -1], BARS, signed, PALETTE).map((p) => p.color)).toEqual([
      PALETTE.up,
      PALETTE.down,
    ]);
    // The decisive case: mirrored, the series is entirely negative AFTER the negation, and that is
    // what the colour reads. An implementation colouring by the measured value would paint both up.
    const both = spec({ signColoring: true, mirrored: true });
    expect(plottedPoints([1, 1], BARS, both, PALETTE).map((p) => p.color)).toEqual([
      PALETTE.down,
      PALETTE.down,
    ]);
  });

  it('by BAR DIRECTION, which speaks of the market and not of the series', () => {
    const byBar = spec({ barDirectionColoring: true });
    // RISING closes above the open, FALLING below, FLAT ties — and a tie counts as up, which is the
    // same `close >= open` rule that paints the candle.
    expect(plottedPoints([1, 1, 1], BARS, byBar, PALETTE).map((p) => p.color)).toEqual([
      PALETTE.up,
      PALETTE.down,
      PALETTE.up,
    ]);
    // POSITIVE CONTROL: the SAME series without the flag receives no colour at all, so the result
    // above is the flag speaking and not the palette landing on every point.
    expect(plottedPoints([1, 1, 1], BARS, spec(), PALETTE).map((p) => p.color)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('the palette is an ARGUMENT: the same readings under an inverted convention swap sides', () => {
    const signed = spec({ signColoring: true });
    const inverted = { up: PALETTE.down, down: PALETTE.up };
    expect(plottedPoints([1], BARS, signed, inverted)[0].color).toBe(PALETTE.down);
  });

  it('with no flag the `color` key exists and is absent — the series paints the declared colour', () => {
    // The presence of the key is what the port receives. A point WITHOUT the key and a point with
    // it absent are the same thing to the base, but not to a test comparing objects, so it is said.
    const [point] = plottedPoints([1], BARS, spec(), PALETTE);
    expect('color' in point).toBe(true);
    expect(point.color).toBeUndefined();
  });
});

describe('LMC-22 — the conversion left the component', () => {
  it('the module does not import React, and the surface does not redeclare the arithmetic', () => {
    const sources = collectSources(join(__dirname, '..', 'src'));
    const readings = sources.find((source) => source.file === 'domain/readings.ts');
    expect(readings).toBeDefined();
    expect(readings?.text).not.toMatch(/from 'react'/);

    // THE RATCHET of the repatriation: `react/` must not declare the conversion again. Without this
    // line, a reintroduced copy would go unnoticed while the tests above stayed green against the
    // module nobody calls any more.
    //
    // THE CLAUSE FOLLOWS THE CONSUMER, and not the file it used to be in. It required the import
    // INSIDE `react/ChartSurface.tsx`; the data feed left for `react/surface/`, and a clause tied
    // to the old file would have had to be deleted or loosened. Tied to the LAYER, it got stronger:
    // someone in `react/` has to import the module — otherwise the repatriation became dead code —
    // and NOBODY in `react/` may redeclare the arithmetic.
    const reactSources = sources.filter((source) => source.file.startsWith('react/'));
    expect(reactSources.length).toBeGreaterThan(10);
    expect(reactSources.filter((s) => /from '\.\.?\/(?:\.\.\/)?domain\/readings'/.test(s.text))).not
      .toEqual([]);
    const redeclarers = reactSources
      .filter((s) => /function carryReadings|Math\.abs/.test(s.text))
      .map((s) => s.file);
    expect(redeclarers).toEqual([]);
  });
});
