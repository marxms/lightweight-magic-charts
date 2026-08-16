import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DEFAULT_CATALOGUE_HEIGHT_PX,
  DEFAULT_INDICATOR_FLOOR_PX,
  MAX_PANE_HEIGHT_PX,
  MIN_PANE_HEIGHT_PX,
  clampPaneHeight,
  parsePaneLayout,
  reconcilePaneLayout,
  reconcilePanes,
  toCatalogueEntry,
  type PaneCatalogueEntry,
  type PaneLayout,
} from '../src/pane/budget';
import { computeLayout, type PaneRequest } from '../src/layout/computeLayout';
import { paneId } from '../src/domain/types';
import { collectSources, stripComments, type Source } from './gates/sourceScan';

/**
 * LMC-16, LMC-20, LMC-22 — the layout arithmetic, repatriated and PROVED equal.
 *
 * ── HOW THE PARITY FIXTURE WAS MADE (LMC-22) ──
 *
 * Moving ~130 lines and asserting the result "behaves the same" is a claim, not evidence. So before
 * a single line moved, the PREVIOUS implementation — `reconcileLayout` / `parseLayout` in
 * `apps/web/src/hooks/useChartWorkspaceLayout.ts`, at commit d5cea68 — was run over the corpus
 * declared below and its output captured verbatim into `fixtures/paneLayoutParity.json`:
 *
 *   npx ts-node --compiler-options '{"module":"commonjs","lib":["es2019","dom"], …}' capture.ts
 *
 * The corpus below is the INPUT half of that run, re-declared here; the fixture is the OUTPUT half,
 * recorded from code that no longer exists. Every case is compared by deep equality, so a rename, a
 * reordered append, a clamp that rounds differently or a dropped field fails here and names the case.
 *
 * The catalogue ids are neutral (`alpha`/`beta`/`gamma`) rather than the app's. That is not a
 * softening of the fixture — none of this arithmetic reads an id for anything but identity — and it
 * is what keeps the package's promise that no business name crosses this boundary.
 */

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'paneLayoutParity.json'), 'utf8'),
) as {
  readonly version: number;
  readonly reconcile: ReadonlyArray<readonly [string, PaneLayout]>;
  readonly parse: ReadonlyArray<readonly [string, PaneLayout]>;
  readonly emptyCatalogue: ReadonlyArray<readonly [string, PaneLayout]>;
  readonly noServed: ReadonlyArray<readonly [string, PaneLayout]>;
};

/** The version the fixture was captured under. It is an ARGUMENT now, so the test states it. */
const V = FIXTURE.version;

const CATALOGUE: PaneCatalogueEntry[] = [
  { id: 'alpha', defaultVisible: true, heightPx: 126 },
  { id: 'beta', defaultVisible: false, heightPx: 90 },
  { id: 'gamma', defaultVisible: true, heightPx: 126 },
];
const SERVED = ['15m', '4h', '1w'];

const RECONCILE: ReadonlyArray<readonly [string, unknown]> = [
  ['nothing saved', null],
  ['payload is not an object', 42],
  ['payload is a string', 'nothing'],
  ['different version', { version: V - 1, panes: [{ id: 'gamma', visible: false, heightPx: 300 }], timeframe: '4h' }],
  ['version missing', { panes: [{ id: 'gamma', visible: false }] }],
  ['saved order preserved and the new catalogue appended', { version: V, panes: [{ id: 'beta', visible: false }, { id: 'alpha', visible: true }] }],
  ['an unknown id drops out', { version: V, panes: [{ id: 'legacy', visible: true }, { id: 'gamma', visible: false }] }],
  ['a duplicated id comes out once, the FIRST occurrence', { version: V, panes: [{ id: 'gamma', visible: false }, { id: 'gamma', visible: true }] }],
  ['a height outside the limits is trimmed', { version: V, panes: [{ id: 'alpha', visible: true, heightPx: 5000 }, { id: 'beta', visible: true, heightPx: 1 }, { id: 'gamma', visible: true, heightPx: 100 }] }],
  ['a non-numeric height falls back to the catalogue value', { version: V, panes: [{ id: 'alpha', visible: true, heightPx: 'tall' }] }],
  ['a fractional height rounds', { version: V, panes: [{ id: 'alpha', visible: true, heightPx: 120.6 }] }],
  ['a NaN height falls back to the catalogue value', { version: V, panes: [{ id: 'alpha', visible: true, heightPx: Number.NaN }] }],
  ['a non-boolean visible falls back to the catalogue default', { version: V, panes: [{ id: 'beta', visible: 'yes' }] }],
  ['a null entry in the list is ignored', { version: V, panes: [null, { id: 'gamma', visible: false }] }],
  ['an entry with no id is ignored', { version: V, panes: [{ visible: true }, { id: 'gamma', visible: false }] }],
  ['panes is not a list', { version: V, panes: 'none' }],
  ['a persisted symbol is discarded', { version: V, symbol: 'ETHUSDT', panes: [{ id: 'gamma', visible: true }] }],
  ['a served timeframe is preserved', { version: V, timeframe: '1w' }],
  ['a timeframe not served falls to null', { version: V, timeframe: '3d' }],
  ['a non-string timeframe falls to null', { version: V, timeframe: 7 }],
];

const PARSE: ReadonlyArray<readonly [string, string | null]> = [
  ['null', null],
  ['malformed json', '{ not json'],
  ['well-formed payload', JSON.stringify({ version: V, panes: [{ id: 'gamma', visible: false }], timeframe: '4h' })],
  ['a list json', '[]'],
  ['a literal null json', 'null'],
];

const EMPTY: ReadonlyArray<readonly [string, unknown]> = [
  ['empty catalogue, nothing saved', null],
  ['empty catalogue, panes saved', { version: V, panes: [{ id: 'alpha', visible: true }] }],
];

describe('LMC-22 — parity: the same inputs, the same output as before the repatriation', () => {
  it('the corpus and the record are the same size — a mute case is not a case that passes', () => {
    // Without this clause, deleting a line of the corpus would make the loop below check less and
    // still stay green. The coverage is an ASSERTION, not a side effect of the loop.
    expect(RECONCILE.length).toBe(FIXTURE.reconcile.length);
    expect(PARSE.length).toBe(FIXTURE.parse.length);
    expect(EMPTY.length).toBe(FIXTURE.emptyCatalogue.length);
    expect(RECONCILE.length).toBeGreaterThanOrEqual(20);
    expect(RECONCILE.map(([name]) => name)).toEqual(FIXTURE.reconcile.map(([name]) => name));
    expect(PARSE.map(([name]) => name)).toEqual(FIXTURE.parse.map(([name]) => name));
  });

  it.each(RECONCILE.map(([name], at) => [name, at] as const))(
    'reconciles the same as before: %s',
    (_name, at) => {
      const [, raw] = RECONCILE[at];
      const [, expected] = FIXTURE.reconcile[at];
      expect(reconcilePaneLayout(raw, CATALOGUE, SERVED, V)).toEqual(expected);
    },
  );

  it.each(PARSE.map(([name], at) => [name, at] as const))(
    'reads the payload the same as before: %s',
    (_name, at) => {
      const [, payload] = PARSE[at];
      const [, expected] = FIXTURE.parse[at];
      expect(parsePaneLayout(payload, CATALOGUE, SERVED, V)).toEqual(expected);
    },
  );

  it('empty catalogue and no served timeframe — the two edges, equal as well', () => {
    EMPTY.forEach(([, raw], at) => {
      expect(reconcilePaneLayout(raw, [], SERVED, V)).toEqual(FIXTURE.emptyCatalogue[at][1]);
    });
    expect(reconcilePaneLayout({ version: V, timeframe: '4h' }, CATALOGUE, [], V)).toEqual(
      FIXTURE.noServed[0][1],
    );
  });

  it('the record DISCRIMINATES — an altered rule is seen breaking the parity', () => {
    // PROOF OF DISCRIMINATION. A comparison loop passes equally well over a record that asserts
    // nothing. These four re-implementations get one rule wrong each, and each one is seen failing
    // against the SAME record that the real implementation satisfies.
    const drops = (raw: unknown): PaneLayout =>
      // forgot the duplicate cut
      ({ ...reconcilePaneLayout(raw, CATALOGUE, SERVED, V), panes: [] });
    expect(drops(RECONCILE[5][1])).not.toEqual(FIXTURE.reconcile[5][1]);

    // The height ceiling and the height floor, each on its own.
    expect(clampPaneHeight(5000, 126)).toBe(MAX_PANE_HEIGHT_PX);
    expect(clampPaneHeight(1, 126)).toBe(MIN_PANE_HEIGHT_PX);
    expect(clampPaneHeight(100, 126)).toBe(100);
    expect(clampPaneHeight('tall', 126)).toBe(126);
    expect(clampPaneHeight(Number.NaN, 126)).toBe(126);
    expect(clampPaneHeight(Number.POSITIVE_INFINITY, 126)).toBe(126);
  });
});

describe('LMC-16 — the pane arithmetic, in the pane layer', () => {
  it('preserves the saved order and appends what the catalogue gained, at ITS default', () => {
    const panes = reconcilePanes([{ id: 'beta', visible: false }, { id: 'alpha', visible: true }], CATALOGUE);
    expect(panes.map((pane) => pane.id)).toEqual(['beta', 'alpha', 'gamma']);
    expect(panes[0].visible).toBe(false); // the saved choice survived
    expect(panes[2].visible).toBe(true); // the appended one is born at the catalogue default
  });

  it('drops an id the build no longer has, and keeps the saved position of the one it has', () => {
    const panes = reconcilePanes([{ id: 'legacy', visible: true }, { id: 'gamma', visible: false }], CATALOGUE);
    expect(panes.map((pane) => pane.id)).not.toContain('legacy');
    expect(panes[0].id).toBe('gamma');
  });

  it('re-emits a duplicated identifier ONCE, keeping the first occurrence', () => {
    const panes = reconcilePanes([{ id: 'gamma', visible: false }, { id: 'gamma', visible: true }], CATALOGUE);
    expect(panes.filter((pane) => pane.id === 'gamma')).toHaveLength(1);
    expect(panes[0].visible).toBe(false);
  });

  it('refuses the WHOLE payload from another version, instead of migrating field by field', () => {
    const older = {
      version: V - 1,
      panes: [{ id: 'gamma', visible: false, heightPx: 300 }],
      timeframe: '4h',
    };
    const layout = reconcilePaneLayout(older, CATALOGUE, SERVED, V);
    expect(layout.panes.map((pane) => pane.id)).toEqual(['alpha', 'beta', 'gamma']);
    expect(layout.timeframe).toBeNull();

    // POSITIVE CONTROL: the SAME payload at the current version is honoured in full, so the refusal
    // above is the version gate speaking, and not reconciliation ignoring saved data.
    const current = reconcilePaneLayout({ ...older, version: V }, CATALOGUE, SERVED, V);
    expect(current.panes[0]).toEqual({ id: 'gamma', visible: false, heightPx: 300 });
    expect(current.timeframe).toBe('4h');
  });

  it('keeps no field that names a market — the tab describes configuration', () => {
    const layout = reconcilePaneLayout(
      { version: V, symbol: 'ETHUSDT', panes: [{ id: 'gamma', visible: true }] },
      CATALOGUE,
      SERVED,
      V,
    );
    expect(layout).not.toHaveProperty('symbol');
    expect(JSON.stringify(layout)).not.toContain('ETHUSDT');
    expect(layout.panes[0].id).toBe('gamma'); // positive control: the rest of the payload survived
  });

  it('the version is an ARGUMENT: the same payload passes one number, refused by another', () => {
    const saved = { version: 9, panes: [{ id: 'gamma', visible: false }] };
    expect(reconcilePaneLayout(saved, CATALOGUE, SERVED, 9).panes[0].id).toBe('gamma');
    expect(reconcilePaneLayout(saved, CATALOGUE, SERVED, 10).panes[0].id).toBe('alpha');
    expect(reconcilePaneLayout(saved, CATALOGUE, SERVED, 10).version).toBe(10);
  });

  it('keeps the remembered timeframe only while the served catalogue still offers it', () => {
    const at = (timeframe: string): unknown => ({ version: V, timeframe });
    expect(reconcilePaneLayout(at('1w'), CATALOGUE, SERVED, V).timeframe).toBe('1w');
    expect(reconcilePaneLayout(at('3d'), CATALOGUE, SERVED, V).timeframe).toBeNull();
  });

  it('malformed json is absent configuration, never an exception', () => {
    expect(() => parsePaneLayout('{ not json', CATALOGUE, SERVED, V)).not.toThrow();
    expect(parsePaneLayout('{ not json', CATALOGUE, SERVED, V).panes.map((p) => p.id)).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
  });
});

describe('LMC-16 — the two height floors, adjacent and with a single owner', () => {
  const sources = collectSources(join(__dirname, '..', 'src'));

  it('the three height constants come out of the SAME module', () => {
    // The defect this closes: 40 lived in an app hook and 56 in the lib's layout layer — two
    // folders, two answers to "how low can a pane go", and nobody saw them side by side.
    expect(MIN_PANE_HEIGHT_PX).toBe(40);
    expect(MAX_PANE_HEIGHT_PX).toBe(400);
    expect(DEFAULT_INDICATOR_FLOOR_PX).toBe(56);
    // They are not the same number, and they should not be: one bounds what can be WRITTEN, the
    // other what can be GRANTED under pressure. Adjacency is what makes that difference legible.
    expect(DEFAULT_INDICATOR_FLOOR_PX).toBeGreaterThan(MIN_PANE_HEIGHT_PX);
  });

  it('no other file in src declares a pane height floor', () => {
    // THE RATCHET. Without it, the second answer comes back the first time somebody needs the
    // number in a layer that does not import this one — which is exactly how it appeared the first
    // time.
    //
    // THE PATTERN ASKS FOR THE QUESTION, not for "height". The first version matched any
    // `*_HEIGHT_PX` and caught `MAX_HEIGHT_PX` from `chrome/FlyoutMenu.tsx` (the ceiling of a
    // flyout box) and `TRACK_HEIGHT_PX` from `chrome/Toggle.tsx` (the track of a switch) — two
    // numbers that do not answer "how low can a pane go". A gate that flags what is not the defect
    // is a gate somebody switches off, so it matches the vocabulary of the defect: floor, and PANE
    // height.
    const declaresPaneFloor = (list: readonly Source[]): string[] =>
      list
        .filter((source) =>
          /\b(?:const|let|var)\s+\w*(?:PANE_HEIGHT_PX|FLOOR_PX)\b/.test(stripComments(source.text)),
        )
        .map((source) => source.file);

    expect(declaresPaneFloor(sources)).toEqual(['pane/budget.ts']);

    // POSITIVE CONTROL: the same predicate sees the relapse, in the layer where it used to live.
    expect(
      declaresPaneFloor([{ file: 'layout/x.ts', text: 'const DEFAULT_INDICATOR_FLOOR_PX = 56;' }]),
    ).toEqual(['layout/x.ts']);
    expect(
      declaresPaneFloor([{ file: 'tabs/x.ts', text: 'const MIN_PANE_HEIGHT_PX = 40;' }]),
    ).toEqual(['tabs/x.ts']);
    // And it does NOT see the two false positives the broad pattern used to catch.
    expect(declaresPaneFloor([{ file: 'react/x.tsx', text: 'const MAX_HEIGHT_PX = 360;' }])).toEqual([]);
    expect(declaresPaneFloor([{ file: 'react/y.tsx', text: 'const TRACK_HEIGHT_PX = 16;' }])).toEqual([]);
  });

  it('the layout budget uses THIS floor, measured by behaviour and not by text', () => {
    // A text assertion would prove only that the word appears. This one proves that the number in
    // use is the one exported here: a pane that would fit above the floor is trimmed exactly to it.
    const panes: PaneRequest[] = [
      { id: paneId('a'), targetHeightPx: 120, lastUsedAt: 2 },
      { id: paneId('b'), targetHeightPx: 120, lastUsedAt: 1 },
    ];
    const out = computeLayout(panes, 200 + DEFAULT_INDICATOR_FLOOR_PX * 2, {
      priceFloorPx: 200,
      defaultPaneHeightPx: 120,
    });
    expect(out.factors.get(paneId('a'))).toBe(DEFAULT_INDICATOR_FLOOR_PX);
    expect(out.factors.get(paneId('b'))).toBe(DEFAULT_INDICATOR_FLOOR_PX);
    // POSITIVE CONTROL: an injected floor beats the default, so the assertion above is reading the
    // default and not a number the calculation would have produced anyway.
    const injected = computeLayout(panes, 200 + 70 * 2, {
      priceFloorPx: 200,
      defaultPaneHeightPx: 120,
      indicatorFloorPx: 70,
    });
    expect(injected.factors.get(paneId('a'))).toBe(70);
  });
});

describe('LMC-22 — the catalogue reconciliation compares against', () => {
  it('mints an entry from what a pane spec declares, with the id as text', () => {
    expect(
      toCatalogueEntry({ spec: { id: paneId('oi'), defaultVisible: false, targetHeightPx: 140 } }),
    ).toEqual({ id: 'oi', defaultVisible: false, heightPx: 140 });
    // A numeric id is a legitimate pane id upstream, and the entry is keyed by TEXT: leaving the
    // number through makes a catalogue entry that no stored layout row can ever match.
    expect(toCatalogueEntry({ spec: { id: 3, defaultVisible: true } }).id).toBe('3');
  });

  it('falls back to the declared default height, and only when no target was given', () => {
    expect(toCatalogueEntry({ spec: { id: 'lane.0', defaultVisible: true } }).heightPx).toBe(
      DEFAULT_CATALOGUE_HEIGHT_PX,
    );
    // Control positive: a pane that DID declare a target keeps it, so the fallback above is a
    // fallback and not a constant the function always returns.
    expect(
      toCatalogueEntry({ spec: { id: 'lane.0', defaultVisible: true, targetHeightPx: 42 } })
        .heightPx,
    ).toBe(42);
  });

  it('feeds reconciliation: a stored row for a pane the build no longer offers is dropped', () => {
    const catalogue = [
      { spec: { id: paneId('oi'), defaultVisible: true, targetHeightPx: 140 } },
      { spec: { id: paneId('cvd'), defaultVisible: false } },
    ].map(toCatalogueEntry);
    const panes = reconcilePanes(
      [
        { id: 'oi', visible: false, heightPx: 200 },
        { id: 'gone', visible: true, heightPx: 90 },
      ],
      catalogue,
    );

    expect(panes.map((pane) => pane.id)).toEqual(['oi', 'cvd']);
    // The stored row wins where it exists; the catalogue supplies the pane it did not cover, with
    // the visibility and the height the entry minted.
    expect(panes[0]).toEqual({ id: 'oi', visible: false, heightPx: 200 });
    expect(panes[1]).toEqual({ id: 'cvd', visible: false, heightPx: DEFAULT_CATALOGUE_HEIGHT_PX });
  });
});
