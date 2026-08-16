import { readFileSync } from 'fs';
import { join } from 'path';

import {
  MIN_LABELLED_PANE_PX,
  legendModel,
  type LegendLine,
  type LegendModelInput,
  type LegendPaneView,
} from '../src/layout/legendModel';
import type { PaneBox } from '../src/layout/paneBoxes';
import { carryReadings, plottedPoints } from '../src/domain/readings';
import { paneId, seriesId, utcSeconds, type Bar, type PaneSpec, type SeriesSpec, type ValueFormat } from '../src/domain/types';
import { collectSources } from './gates/sourceScan';

/**
 * LMC-20, LMC-22 — which numbers the legend says, repatriated and PROVEN equal.
 *
 * ── HOW THE PARITY RECORD WAS MADE ──
 *
 * Before the first line left `react/ChartSurface.tsx`, the `legendLines` memo — at a5dd88f, lines
 * 964-1040 — was copied verbatim into a script outside the tree, with the closure captures turned
 * into parameters and no clause reordered, and run over the corpus declared below. The output is in
 * `fixtures/legendParity.json`, recorded from code this commit deletes.
 *
 * `formatterFor` was NOT copied into the script: it already lived in `domain/format.ts` and it is
 * not what this commit moves.
 */

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'legendParity.json'), 'utf8'),
) as {
  readonly palette: { readonly up: string; readonly down: string };
  readonly lines: ReadonlyArray<readonly [string, readonly LegendLine[]]>;
};

const UP = FIXTURE.palette.up;
const DOWN = FIXTURE.palette.down;

const PRICE_FORMAT: ValueFormat = { kind: 'price', minMove: 0.01 };
const PERCENT: ValueFormat = { kind: 'percent', decimals: 4 };
const COMPACT: ValueFormat = { kind: 'compact', decimals: 1 };

const series = (id: string, label: string, color: string, format?: ValueFormat): SeriesSpec => ({
  id: seriesId(id),
  label,
  color,
  shape: 'line',
  ...(format === undefined ? {} : { format }),
});

/**
 * THE PANE TITLES AND SERIES LABELS BELOW STAY IN PORTUGUESE, and the reason is the record.
 *
 * The legend ECHOES them: `"Mercado"`, `"Taxa"` and `"Sem formato"` are in `legendParity.json`, in
 * output captured from an implementation that no longer exists. Translating the input here would
 * force the recorded output to be rewritten to match, and a record rewritten to agree with the code
 * it is meant to judge has stopped being evidence. The case NAMES were free to translate because a
 * name indexes the record without appearing inside it; these do appear inside it.
 */
// non-english-fixture: the pane title is echoed verbatim into the recorded parity output
const PRICE: PaneSpec = {
  id: paneId('price'),
  title: 'Mercado',
  format: PRICE_FORMAT,
  series: [],
  defaultVisible: true,
};
// non-english-fixture: the series label is echoed verbatim into the recorded parity output
const PRICE_COMPANION: PaneSpec = {
  ...PRICE,
  series: [series('vol', 'Vol', '#8884', COMPACT), series('sem', 'Sem formato', '#999')],
};
// non-english-fixture: the pane title is echoed verbatim into the recorded parity output
const RATE: PaneSpec = {
  id: paneId('rate'),
  title: 'Taxa',
  format: PERCENT,
  defaultVisible: true,
  series: [series('r', 'R', '#abc')],
};
// non-english-fixture: title and series labels are echoed verbatim into the recorded parity output
const SIDES: PaneSpec = {
  id: paneId('sides'),
  title: 'Lados',
  format: COMPACT,
  defaultVisible: true,
  series: [series('up', 'Sobe', '#26a69a'), series('dn', 'Desce', '#ef5350')],
};

const bar = (open: number, close: number): Bar => ({
  time: utcSeconds(1_700_000_000),
  open,
  high: Math.max(open, close) + 5,
  low: Math.min(open, close) - 5,
  close,
});
const RISING = bar(100, 110);
const FALLING = bar(110, 100);
const ZERO_OPEN = bar(0, 50);

const view = (spec: PaneSpec, visible = true): LegendPaneView => ({ spec, visible });
const box = (top: number, height: number): PaneBox => ({ top, height });
const boxes = (...entries: ReadonlyArray<readonly [string, PaneBox]>): ReadonlyMap<string, PaneBox> =>
  new Map(entries);
const readings = (
  ...entries: ReadonlyArray<readonly [string, ReadonlyArray<ReadonlyArray<number | null>>]>
): ReadonlyMap<string, ReadonlyArray<ReadonlyArray<number | null>>> => new Map(entries);

const ALL_BOXES = boxes(['price', box(0, 400)], ['rate', box(401, 90)], ['sides', box(492, 108)]);

const input = (over: Partial<LegendModelInput>): LegendModelInput => ({
  boxes: ALL_BOXES,
  panes: [],
  bars: [RISING],
  readAt: 0,
  readingsByPane: readings(),
  upColor: UP,
  downColor: DOWN,
  ...over,
});

const CASES: ReadonlyArray<readonly [string, LegendModelInput]> = [
  [
    'price plus two panes, all with room',
    input({
      pricePane: PRICE,
      priceCaption: 'ABC · 1h',
      panes: [view(RATE), view(SIDES)],
      readingsByPane: readings(['rate', [[0.00008402]]], ['sides', [[88_431.5], [-9000]]]),
    }),
  ],
  [
    'pane too short for a label gets no line',
    input({
      boxes: boxes(['price', box(0, 400)], ['rate', box(401, 17)]),
      pricePane: PRICE,
      panes: [view(RATE)],
      readingsByPane: readings(['rate', [[1]]]),
    }),
  ],
  [
    'pane exactly at the label floor gets a line',
    input({
      boxes: boxes(['price', box(0, 400)], ['rate', box(401, 18)]),
      pricePane: PRICE,
      panes: [view(RATE)],
      readingsByPane: readings(['rate', [[1]]]),
    }),
  ],
  [
    'pane missing from the box map gets no line',
    input({
      boxes: boxes(['price', box(0, 400)]),
      pricePane: PRICE,
      panes: [view(RATE)],
      readingsByPane: readings(['rate', [[1]]]),
    }),
  ],
  [
    'invisible pane is skipped before any measurement',
    input({
      pricePane: PRICE,
      panes: [view(RATE, false), view(SIDES)],
      readingsByPane: readings(['sides', [[1], [2]]]),
    }),
  ],
  [
    'with no price pane, only the indicators speak',
    input({ pricePane: undefined, panes: [view(RATE)], readingsByPane: readings(['rate', [[0.5]]]) }),
  ],
  ['with no bars, the price line exists and states no number', input({ pricePane: PRICE, bars: [], readAt: -1 })],
  ['zero open: the change is undefined, never infinite', input({ pricePane: PRICE, bars: [ZERO_OPEN] })],
  ['a falling bar paints the change in the down colour', input({ pricePane: PRICE, bars: [FALLING] })],
  ['an index past the end is clamped to the last bar', input({ pricePane: PRICE, bars: [RISING, FALLING], readAt: 99 })],
  ['a negative index is clamped to the first bar', input({ pricePane: PRICE, bars: [RISING, FALLING], readAt: -5 })],
  [
    'a null reading becomes a dash, never a zero',
    input({ pricePane: PRICE, panes: [view(RATE)], readingsByPane: readings(['rate', [[null]]]) }),
  ],
  ['a pane with no recorded reading also speaks in a dash', input({ pricePane: PRICE, panes: [view(RATE)] })],
  [
    'a price-pane companion reads in its OWN unit',
    input({ pricePane: PRICE_COMPANION, readingsByPane: readings(['price', [[88_431.5], [1234.5]]]) }),
  ],
  ['with no caption declared, the pane title serves', input({ pricePane: PRICE, priceCaption: undefined })],
  [
    'the order is price first, then the declared order of the panes',
    input({
      pricePane: PRICE,
      panes: [view(SIDES), view(RATE)],
      readingsByPane: readings(['rate', [[1]]], ['sides', [[2], [3]]]),
    }),
  ],
];

describe('LMC-22 — parity: the same inputs, the same output as before the repatriation', () => {
  it('the corpus and the record have the same size and names — a mute case does not pass', () => {
    expect(CASES.length).toBe(FIXTURE.lines.length);
    expect(CASES.map(([name]) => name)).toEqual(FIXTURE.lines.map(([name]) => name));
    expect(CASES.length).toBeGreaterThanOrEqual(15);
  });

  it.each(CASES.map(([name], at) => [name, at] as const))(
    'produces the same lines as before: %s',
    (_name, at) => {
      expect(legendModel(CASES[at][1])).toEqual(FIXTURE.lines[at][1]);
    },
  );

  it('the record DISCRIMINATES — each altered rule breaks the parity of a named case', () => {
    const at = (name: string): number => CASES.findIndex(([label]) => label === name);

    // 1. A SHARED FORMAT instead of each pane's own format — the defect that makes the legend
    //    disagree with the axis it names.
    const twoPanes = at('price plus two panes, all with room');
    const sharedFormat = legendModel({
      ...CASES[twoPanes][1],
      panes: [view({ ...RATE, format: COMPACT }), view(SIDES)],
    });
    expect(sharedFormat).not.toEqual(FIXTURE.lines[twoPanes][1]);

    // 2. LABEL FLOOR IGNORED: the 17px pane starts receiving a line, and it falls over the
    //    neighbour.
    const tooShort = at('pane too short for a label gets no line');
    const withLowerFloor = legendModel({
      ...CASES[tooShort][1],
      boxes: boxes(['price', box(0, 400)], ['rate', box(401, MIN_LABELLED_PANE_PX)]),
    });
    expect(withLowerFloor).not.toEqual(FIXTURE.lines[tooShort][1]);
    expect(withLowerFloor.map((line) => line.id)).toEqual(['price', 'rate']);

    // 3. INVISIBLE DRAWN: the switched-off pane comes back to the legend.
    const hidden = at('invisible pane is skipped before any measurement');
    const comInvisivel = legendModel({
      ...CASES[hidden][1],
      panes: [view(RATE, true), view(SIDES)],
    });
    expect(comInvisivel).not.toEqual(FIXTURE.lines[hidden][1]);

    // 4. DIVISION BY ZERO ON THE OPEN: without the guard, the change becomes infinity printed on
    //    the screen.
    const zeroOpen = at('zero open: the change is undefined, never infinite');
    const change = ((ZERO_OPEN.close - ZERO_OPEN.open) / ZERO_OPEN.open) * 100;
    expect(Number.isFinite(change)).toBe(false);
    const chg = FIXTURE.lines[zeroOpen][1][0].entries.find((entry) => entry.id === 'chg');
    expect(chg?.value).toBe('—');
  });
});

describe('LMC-20 — the legend prints the MEASURED, and the chart draws the plotted', () => {
  it('a mirrored series is drawn below the line and named by the positive magnitude', () => {
    // THE DISTINCTION THIS MODULE EXISTS NOT TO LOSE, measured at both ends at once: the plotted
    // point and the legend entry come out of the SAME readings, and disagree in sign.
    const espelhada = { ...series('dn', 'Desce', '#ef5350'), mirrored: true } as SeriesSpec;
    const pane: PaneSpec = { ...SIDES, series: [espelhada] };
    const cruas: ReadonlyArray<number | null> = [9000];
    const carregadas = carryReadings(cruas, espelhada);

    const desenhado = plottedPoints(carregadas, [RISING], espelhada, { up: UP, down: DOWN });
    expect(desenhado[0].value).toBe(-9000);

    const lines = legendModel(
      input({
        panes: [view(pane)],
        boxes: boxes(['sides', box(0, 108)]),
        readingsByPane: readings(['sides', [carregadas]]),
      }),
    );
    // CONTROL POSITIVE of the pair: had the negation leaked into the readings, this line would say
    // `-9.0K` and the test above would carry on passing.
    expect(lines[0].entries[0].value).toBe('9.0K');
  });
});

describe('LMC-20 — each pane in its own unit', () => {
  it('the same reading, under two panes, produces two different strings', () => {
    const leitura = 0.00008402;
    const emTaxa = legendModel(
      input({ panes: [view(RATE)], boxes: boxes(['rate', box(0, 90)]), readingsByPane: readings(['rate', [[leitura]]]) }),
    );
    const emCompacto = legendModel(
      input({
        panes: [view({ ...RATE, id: paneId('rate'), format: COMPACT })],
        boxes: boxes(['rate', box(0, 90)]),
        readingsByPane: readings(['rate', [[leitura]]]),
      }),
    );
    expect(emTaxa[0].entries[0].value).toBe('0.0084%');
    expect(emCompacto[0].entries[0].value).not.toBe(emTaxa[0].entries[0].value);
  });

  it('the companion with its own format does not use the price pane’s format', () => {
    const lines = legendModel(
      input({ pricePane: PRICE_COMPANION, readingsByPane: readings(['price', [[88_431.5], [1234.5]]]) }),
    );
    const entries = lines[0].entries;
    // `vol` declares a compact format; `sem` declares none and falls back to the pane's, which is
    // the price one — and the price format adapts the decimals to the magnitude
    // [`domain/format.ts:19-21`], so above a thousand it gives one decimal. The two strings come
    // out of the SAME reading and differ, which is the clause.
    expect(entries.find((entry) => entry.id === 'vol')?.value).toBe('88.4K');
    expect(entries.find((entry) => entry.id === 'sem')?.value).toBe('1234.5');
    expect(entries.find((entry) => entry.id === 'vol')?.value).not.toBe(
      entries.find((entry) => entry.id === 'sem')?.value,
    );
  });
});

describe('LMC-20 — the change, and the convention that paints it', () => {
  it('a rise wears the up colour and a fall the down one, by the palette RECEIVED', () => {
    const subindo = legendModel(input({ pricePane: PRICE, bars: [RISING] }));
    const caindo = legendModel(input({ pricePane: PRICE, bars: [FALLING] }));
    const chg = (lines: readonly LegendLine[]): { color: string | null; value: string } => {
      const entry = lines[0].entries.find((item) => item.id === 'chg');
      return { color: entry?.color ?? null, value: entry?.value ?? '' };
    };
    expect(chg(subindo)).toEqual({ color: UP, value: '+10.00%' });
    expect(chg(caindo)).toEqual({ color: DOWN, value: '-9.09%' });

    // CONTROL POSITIVE: the palette is an ARGUMENT. Inverted, the same rise wears the other colour
    // — a convention hard-coded in the module would paint both the same.
    const invertido = legendModel(input({ pricePane: PRICE, bars: [RISING], upColor: DOWN, downColor: UP }));
    expect(chg(invertido).color).toBe(DOWN);
  });
});

describe('LMC-22 — the model left the component', () => {
  it('the module does not import React, and the surface does not redeclare the model', () => {
    const sources = collectSources(join(__dirname, '..', 'src'));
    const model = sources.find((source) => source.file === 'layout/legendModel.ts');
    expect(model).toBeDefined();
    expect(model?.text).not.toMatch(/from 'react'/);

    // THE CLAUSE FOLLOWS THE CONSUMER, and not the file it used to sit in: since T58 the one that
    // calls the model is `react/surface/SurfaceLegend.tsx`, which signs the cursor. Tied to the
    // LAYER it became stronger — someone from `react/` has to call the model, otherwise it is dead
    // code, and NOBODY from `react/` may redeclare its arithmetic.
    // THE LEGEND'S NEIGHBOURHOOD: the composition, the surface modules and the drawing. That is
    // where a copy of the model could be born, and that is where the ratchet is worth something.
    // `react/chrome/` is left out because `roomFor` there is floating-panel positioning — another
    // concept with the same name, and flagging it would be the gate flagging the wrong file.
    const neighbourhood = sources.filter(
      (source) =>
        source.file === 'react/surface/ChartSurface.tsx' ||
        source.file === 'react/WorkspaceLegend.tsx' ||
        source.file.startsWith('react/surface/'),
    );
    expect(neighbourhood.length).toBeGreaterThanOrEqual(8);
    expect(
      neighbourhood.filter((s) => /from '\.\.?\/(?:\.\.\/)?layout\/legendModel'/.test(s.text)),
    ).not.toEqual([]);
    const redeclarers = neighbourhood
      .filter((s) => /MIN_LABELLED_PANE_PX|roomFor|topPx:/.test(s.text))
      .map((s) => s.file);
    expect(redeclarers).toEqual([]);

    const surface = sources.find((source) => source.file === 'react/surface/ChartSurface.tsx');
    expect(surface).toBeDefined();
    // `topPx` is the field ONLY the line builder writes, so it is the marker of a reintroduced
    // copy. The first version of this clause looked for `toFixed(2)` and matched the header PROSE,
    // which explains why a shared format lies — a gate that flags the text of the rule instead of
    // the violation of it is a gate somebody switches off.
    expect(surface?.text).not.toMatch(/topPx:/);

    // ONE declaration of the line's shape, not two. The legend component re-exports the model's,
    // and an `interface LegendLine` reintroduced here is the start of producer and consumer
    // disagreeing.
    const legend = sources.find((source) => source.file === 'react/WorkspaceLegend.tsx');
    expect(legend?.text).not.toMatch(/interface LegendLine/);
    expect(legend?.text).toMatch(/from '\.\.\/layout\/legendModel'/);
  });
});
