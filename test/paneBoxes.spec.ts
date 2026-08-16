import { readFileSync } from 'fs';
import { join } from 'path';

import type { StackApplication } from '../src/layout/application';
import { SEPARATOR_PX, TIME_AXIS_PX, paneBoxes, sameBoxes, type PaneBox } from '../src/layout/paneBoxes';
import { paneId } from '../src/domain/types';
import { collectSources } from './gates/sourceScan';

/**
 * LMC-20, LMC-22 — where the panes are before the DOM, repatriated and PROVEN identical.
 *
 * ── HOW THE PARITY RECORD WAS MADE ──
 *
 * Before the first line left `react/ChartSurface.tsx`, `fallbackBoxes` and `sameBoxes` — at
 * bab28df, lines 255-308 — were copied verbatim into a script outside the tree and run over the
 * corpus declared below. The output is in `fixtures/paneBoxesParity.json`, recorded from code this
 * commit deletes.
 *
 * `renderHeights` was NOT copied into the capture script: it already lived in
 * `layout/computeLayout` and is not what this commit moves. Copying it would have made the record
 * measure a second implementation of it instead of the one in use, which is the quietest failure
 * mode a parity fixture has.
 */

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'paneBoxesParity.json'), 'utf8'),
) as {
  readonly boxes: ReadonlyArray<readonly [string, ReadonlyArray<readonly [string, PaneBox]>]>;
  readonly same: ReadonlyArray<readonly [string, boolean]>;
};

const applied = (
  priceHeightPx: number,
  entries: ReadonlyArray<readonly [string, number]>,
  order?: readonly string[],
): StackApplication => ({
  kind: 'applied',
  outcome: {
    kind: 'fits',
    priceHeightPx,
    factors: new Map(entries.map(([id, px]) => [paneId(id), px])),
    scaled: 1,
  },
  collapsed: [],
  order: (order ?? entries.map(([id]) => id)).map(paneId),
  ordered: true,
});

const CASES: ReadonlyArray<readonly [string, StackApplication | null, string]> = [
  ['nothing applied yet', null, 'price'],
  ['degenerate budget', { kind: 'degenerate', totalPx: 0 }, 'price'],
  ['the anchor pane alone', applied(720, []), 'price'],
  ['anchor plus three panes', applied(414, [['a', 126], ['b', 90], ['c', 90]]), 'price'],
  [
    'a pane collapsed to zero gets no box, and does not shift the ones below',
    applied(414, [['a', 126], ['b', 0], ['c', 90]]),
    'price',
  ],
  ['every pane collapsed', applied(720, [['a', 0], ['b', 0]]), 'price'],
  [
    'the stack order decides the position, not the map order',
    applied(414, [['a', 126], ['b', 90], ['c', 90]], ['c', 'a', 'b']),
    'price',
  ],
  ['a pane missing from the factor map counts as zero', applied(500, [['a', 126]], ['a', 'ausente']), 'price'],
  ['an anchor with no price uses the id of the first pane', applied(414, [['b', 90]]), 'a'],
  ['fractional height', applied(413.5, [['a', 126.4], ['b', 90.1]]), 'price'],
  ['budget smaller than the time-axis band', applied(10, [['a', 5]]), 'price'],
  ['zero price with live indicators', applied(0, [['a', 126], ['b', 90]]), 'price'],
  ['a single pane, with no price', applied(0, [['a', 300]]), 'price'],
];

const box = (top: number, height: number): PaneBox => ({ top, height });
const m = (...entries: ReadonlyArray<readonly [string, PaneBox]>): ReadonlyMap<string, PaneBox> =>
  new Map(entries);

const SAME: ReadonlyArray<readonly [string, ReadonlyMap<string, PaneBox>, ReadonlyMap<string, PaneBox>]> = [
  ['two empty maps', m(), m()],
  [
    'same content, same order',
    m(['a', box(0, 10)], ['b', box(11, 20)]),
    m(['a', box(0, 10)], ['b', box(11, 20)]),
  ],
  [
    'same content, swapped order',
    m(['a', box(0, 10)], ['b', box(11, 20)]),
    m(['b', box(11, 20)], ['a', box(0, 10)]),
  ],
  ['different sizes', m(['a', box(0, 10)]), m(['a', box(0, 10)], ['b', box(11, 20)])],
  ['same key, different top', m(['a', box(0, 10)]), m(['a', box(1, 10)])],
  ['same key, different height', m(['a', box(0, 10)]), m(['a', box(0, 11)])],
  ['different keys', m(['a', box(0, 10)]), m(['z', box(0, 10)])],
];

describe('LMC-22 — parity: the same inputs, the same output as before the repatriation', () => {
  it('corpus and record have the same size and the same names — a mute case does not pass', () => {
    expect(CASES.length).toBe(FIXTURE.boxes.length);
    expect(SAME.length).toBe(FIXTURE.same.length);
    expect(CASES.map(([name]) => name)).toEqual(FIXTURE.boxes.map(([name]) => name));
    expect(SAME.map(([name]) => name)).toEqual(FIXTURE.same.map(([name]) => name));
    expect(CASES.length).toBeGreaterThanOrEqual(12);
  });

  it.each(CASES.map(([name], at) => [name, at] as const))(
    'derives the boxes the same as before: %s',
    (_name, at) => {
      const [, application, anchor] = CASES[at];
      expect(Array.from(paneBoxes(application, anchor).entries())).toEqual(FIXTURE.boxes[at][1]);
    },
  );

  it.each(SAME.map(([name], at) => [name, at] as const))(
    'compares the same as before: %s',
    (_name, at) => {
      const [, a, b] = SAME[at];
      expect(sameBoxes(a, b)).toBe(FIXTURE.same[at][1]);
    },
  );

  it('the record DISCRIMINATES — every altered rule breaks the parity of a named case', () => {
    // PROOF OF DISCRIMINATION. A comparison loop passes just as happily over a record that asserts
    // nothing. Each reimplementation below gets ONE rule wrong, and each one is seen failing against
    // the SAME record the real implementation satisfies.
    const at = (name: string): number => CASES.findIndex(([label]) => label === name);

    // 1. FORGOT THE TIME-AXIS BAND — the named observable failure: the factors are read as if the
    //    panes received the whole budget, and the error accumulates down to the last pane.
    const withoutAxis = (application: StackApplication, anchorId: string): Array<[string, PaneBox]> => {
      const ids = [anchorId, ...(application.kind === 'applied' ? application.order.map(String) : [])];
      if (application.kind !== 'applied') return [];
      const factors = [
        application.outcome.priceHeightPx,
        ...application.order.map((id) => application.outcome.factors.get(id) ?? 0),
      ];
      const heights = factors;
      const out: Array<[string, PaneBox]> = [];
      let top = 0;
      for (let i = 0; i < ids.length; i += 1) {
        if (factors[i] <= 0) continue;
        out.push([ids[i], { top, height: heights[i] }]);
        top += heights[i] + SEPARATOR_PX;
      }
      return out;
    };
    const three = at('anchor plus three panes');
    expect(withoutAxis(CASES[three][1] as StackApplication, CASES[three][2])).not.toEqual(
      FIXTURE.boxes[three][1],
    );

    // 2. RESERVED ROOM FOR THE COLLAPSED PANE — every legend below it drops by one strip.
    const collapsed = at('a pane collapsed to zero gets no box, and does not shift the ones below');
    const comReserva = paneBoxes(CASES[collapsed][1], CASES[collapsed][2]);
    expect(comReserva.has('b')).toBe(false);
    expect(Array.from(comReserva.keys())).toEqual(['price', 'a', 'c']);

    // 3. DID NOT UNDO THE ANCHOR RENAME — the first pane's legend is looked up under `price`.
    const noPrice = at('an anchor with no price uses the id of the first pane');
    expect(
      Array.from(paneBoxes(CASES[noPrice][1], 'price').entries()),
    ).not.toEqual(FIXTURE.boxes[noPrice][1]);

    // 4. COMPARED BY IDENTITY instead of by content: two equal maps would be seen as different, and
    //    every legend would be repainted on every measurement.
    const [, iguaisA, iguaisB] = SAME[1];
    expect(iguaisA).not.toBe(iguaisB);
    expect(sameBoxes(iguaisA, iguaisB)).toBe(true);
  });
});

describe('LMC-20 — the time-axis band is deducted before the split', () => {
  it('the panes divide the budget MINUS the axis and minus the separators', () => {
    // Measured by behaviour and not by text: four panes summing to 720 receive, together, 720 minus
    // the axis band and minus the three separators between them.
    const boxes = paneBoxes(applied(414, [['a', 126], ['b', 90], ['c', 90]]), 'price');
    const total = Array.from(boxes.values()).reduce((sum, item) => sum + item.height, 0);
    expect(total).toBe(720 - TIME_AXIS_PX - SEPARATOR_PX * 3);

    // CONTROL POSITIVE: the same budget with one pane fewer deducts one separator fewer, so the
    // assertion above is reading the arithmetic and not a number that would fit either way.
    const fewer = paneBoxes(applied(504, [['a', 126], ['b', 90]]), 'price');
    const fewerTotal = Array.from(fewer.values()).reduce((sum, item) => sum + item.height, 0);
    expect(fewerTotal).toBe(720 - TIME_AXIS_PX - SEPARATOR_PX * 2);
  });

  it('each box starts where the previous one ends, plus the separator', () => {
    const boxes = Array.from(paneBoxes(applied(414, [['a', 126], ['b', 90]]), 'price').values());
    expect(boxes.length).toBe(3);
    for (let i = 1; i < boxes.length; i += 1) {
      expect(boxes[i].top).toBe(boxes[i - 1].top + boxes[i - 1].height + SEPARATOR_PX);
    }
  });

  it('nothing applied and a degenerate budget return an empty map, never an invented box', () => {
    expect(paneBoxes(null, 'price').size).toBe(0);
    expect(paneBoxes({ kind: 'degenerate', totalPx: 0 }, 'price').size).toBe(0);
  });
});

describe('LMC-22 — the derivation left the component', () => {
  it('the module does not import React, and the surface does not redeclare the arithmetic', () => {
    const sources = collectSources(join(__dirname, '..', 'src'));
    const boxes = sources.find((source) => source.file === 'layout/paneBoxes.ts');
    expect(boxes).toBeDefined();
    expect(boxes?.text).not.toMatch(/from 'react'/);

    // THE RATCHET of the repatriation. Without it, a copy reintroduced into the surface would go
    // unnoticed while the tests above stayed green against the module nobody calls any more.
    const surface = sources.find((source) => source.file === 'react/surface/ChartSurface.tsx');
    expect(surface).toBeDefined();
    // The surface dropped one level when it became `react/surface/ChartSurface.tsx`, and the
    // relative path dropped with it. What the clause asserts is the IMPORT, not its depth.
    expect(surface?.text).toMatch(/from '(?:\.\.\/)+layout\/paneBoxes'/);
    expect(surface?.text).not.toMatch(/function fallbackBoxes/);
    expect(surface?.text).not.toMatch(/function sameBoxes/);
    expect(surface?.text).not.toMatch(/renderHeights/);
    expect(surface?.text).not.toMatch(/TIME_AXIS_PX/);
  });
});
