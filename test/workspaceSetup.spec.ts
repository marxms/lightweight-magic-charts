import { readFileSync } from 'fs';
import { join } from 'path';
import {
  coerceWorkspaceSetup,
  defaultWorkspaceSetup,
  reconcileGridCells,
  seedWorkspaceTabs,
  type WorkspaceSetup,
  type WorkspaceSetupPolicy,
} from '../src/tabs/setup';
import { MAX_WORKSPACE_TABS, reduceTabs, sanitizeTabs } from '../src/tabs/workspaceTabs';
import { DEFAULT_DENSITY_TUNING } from '../src/overlays/densityField';
import type { PaneCatalogueEntry } from '../src/pane/budget';

/**
 * LMC-17, LMC-20, LMC-22 — the shape of the tab setup and its coercion, repatriated.
 *
 * ── HOW THE PARITY RECORD WAS MADE (LMC-22) ──
 *
 * The PREVIOUS implementation — `coerceTabSetup` / `reconcileGridCells` in
 * `apps/web/src/hooks/useChartWorkspaceTabs.ts`, at commit 5bd1cbc — was run over the corpus
 * declared below before a single line moved, and the output was recorded in
 * `fixtures/workspaceSetupParity.json`. The corpus is the INPUT half of that run; the record is the
 * OUTPUT half, taken from code that no longer exists.
 *
 * The pane ids are neutral (`alpha`/`beta`/`gamma`) because nothing in this arithmetic reads an id
 * for anything other than identity — and that is what keeps the promise that a business name does
 * not cross this boundary.
 *
 * ── WHAT VIS-01 CHANGED, AND WHY THE RECORD DID NOT MOVE WITH IT ──
 *
 * The record was captured from code that no longer exists, and that is its entire value: it is the
 * only evidence the move was faithful. VIS-01 reverses ONE of the rules it recorded — a switch the
 * policy owns is now tri-state — so re-recording would erase the evidence to hide the change. The
 * file stays byte for byte as taken; the divergence is re-derived below from the requirement and
 * asserted by name, so what changed is readable instead of absorbed.
 */

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'workspaceSetupParity.json'), 'utf8'),
) as {
  readonly setups: ReadonlyArray<readonly [string, WorkspaceSetup]>;
  readonly grid: ReadonlyArray<readonly [string, readonly string[]]>;
};

const CATALOGUE: PaneCatalogueEntry[] = [
  { id: 'alpha', defaultVisible: true, heightPx: 126 },
  { id: 'beta', defaultVisible: false, heightPx: 90 },
  { id: 'gamma', defaultVisible: true, heightPx: 126 },
];
const SERVED = ['15m', '1h', '4h', '1d', '1w'];
const FALLBACK_CELLS = ['15m', '1d'];
const MAX_CELLS = 3;
const LANES = 4;

/**
 * The coercion of the study LIST, as the app wrote it — repeated here instead of imported because
 * it is injected, and parity has to measure the policy, not the injected part.
 */
const coerceIndicators = (raw: unknown, legacy: unknown): readonly string[] => {
  const source = Array.isArray(raw) ? raw : Array.isArray(legacy) ? legacy : [];
  const seen = new Set<string>();
  const list: string[] = [];
  for (const item of source) {
    if (typeof item !== 'string' || item === '' || seen.has(item)) continue;
    seen.add(item);
    list.push(item);
    if (list.length === LANES) break;
  }
  return list;
};

const POLICY: WorkspaceSetupPolicy = {
  catalogue: CATALOGUE,
  servedTimeframes: SERVED,
  gridFallback: FALLBACK_CELLS,
  maxGridCells: MAX_CELLS,
  density: DEFAULT_DENSITY_TUNING,
  showDensity: true,
  showProfile: false,
  autoFit: false,
  coerceIndicators,
};

const SETUPS: ReadonlyArray<readonly [string, unknown]> = [
  ['null', null],
  ['not an object', 7],
  ['empty object', {}],
  ['timeframe served', { timeframe: '4h' }],
  ['timeframe not served', { timeframe: '3d' }],
  ['timeframe not a string', { timeframe: 4 }],
  ['grid mode', { layoutMode: 'grade' }],
  ['focus mode', { layoutMode: 'foco' }],
  ['unknown mode falls back to focus', { layoutMode: 'mosaico' }],
  ['a translated mode is NOT accepted', { layoutMode: 'grid' }],
  ['grid cells served', { gridCells: ['1h', '1d'] }],
  ['cells above the ceiling are cut', { gridCells: ['15m', '1h', '4h', '1d'] }],
  ['cells not served fall back to the default', { gridCells: ['3d', '2w'] }],
  ['cells with a non-string item', { gridCells: ['1h', 5, '1d'] }],
  ['panes saved', { panes: [{ id: 'beta', visible: true, heightPx: 200 }] }],
  ['panes with an unknown id', { panes: [{ id: 'antigo', visible: true }] }],
  ['density inside the limits', { density: { floor: 0.2, gamma: 1.1 } }],
  ['density outside the limits', { density: { floor: 9, gamma: -3 } }],
  ['partial density', { density: { floor: 0.1 } }],
  ['density not an object', { density: 'a lot' }],
  ['showDensity explicitly false', { showDensity: false }],
  ['showDensity as a string does not switch it on', { showDensity: 'yes' }],
  ['showProfile true', { showProfile: true }],
  ['autoFit true', { autoFit: true }],
  ['autoFit as a string does not switch it on', { autoFit: 'yes' }],
  ['indicators in a list', { indicators: ['a', 'b', 'a', 'c', 'd', 'e'] }],
  ['indicators in the legacy slots field', { slots: ['x', null, 'y'] }],
  ['the new field wins over the legacy one', { indicators: ['n'], slots: ['v'] }],
  ['series styles', { seriesStyles: { s1: 'line', s2: 7, s3: 'area' } }],
  ['styles not an object', { seriesStyles: 'none' }],
  ['a persisted symbol is ignored', { symbol: 'ETHUSDT', timeframe: '1h' }],
];

const GRID: ReadonlyArray<readonly [string, unknown, readonly string[]]> = [
  ['list served', ['1h', '1d'], SERVED],
  ['an empty list falls back to the default', [], SERVED],
  ['nothing is a list', 'none', SERVED],
  ['above the ceiling', ['15m', '1h', '4h', '1d'], SERVED],
  ['nothing served returns everything', ['1h', '9y'], []],
  ['default not served, first served', ['3d'], ['1h', '4h']],
];

/**
 * The record with the one field VIS-01 moved re-derived from the raw payload.
 *
 * The rule is written HERE, from the requirement, and not read from the module under test: an
 * expectation that asks the implementation what it does proves nothing about what it should do.
 */
const recordUnderPolicySwitches = (raw: unknown, recorded: WorkspaceSetup): WorkspaceSetup => {
  if (raw === null || typeof raw !== 'object') return recorded;
  const saved = (raw as Record<string, unknown>).showDensity;
  return { ...recorded, showDensity: typeof saved === 'boolean' ? saved : POLICY.showDensity };
};

/** The corpus cases the record and the coercion still agree on, to the byte. */
const AGREED_WITH_RECORD = ['null', 'not an object', 'showDensity explicitly false'];

describe('LMC-22 — parity of the tab setup', () => {
  it('the corpus and the record have the same size and the same names', () => {
    expect(SETUPS.map(([name]) => name)).toEqual(FIXTURE.setups.map(([name]) => name));
    expect(GRID.map(([name]) => name)).toEqual(FIXTURE.grid.map(([name]) => name));
    expect(SETUPS.length).toBeGreaterThanOrEqual(30);
  });

  it.each(SETUPS.map(([name], at) => [name, at] as const))(
    'coerces the same as before, but for the switch VIS-01 moved: %s',
    (_n, at) => {
      expect(coerceWorkspaceSetup(SETUPS[at][1], POLICY)).toEqual(
        recordUnderPolicySwitches(SETUPS[at][1], FIXTURE.setups[at][1]),
      );
    },
  );

  it('the record and the coercion differ on ONE field, and agree everywhere else', () => {
    // Without this, "parity except for a re-derivation" is a hole of unknown size: the per-case
    // comparison above would swallow a second changed field as long as the derivation covered it.
    // The union of differing field names is the measurement that closes it.
    const differing = (at: number): string[] => {
      const now = coerceWorkspaceSetup(SETUPS[at][1], POLICY) as unknown as Record<string, unknown>;
      const before = FIXTURE.setups[at][1] as unknown as Record<string, unknown>;
      return Object.keys(before).filter(
        (key) => JSON.stringify(now[key]) !== JSON.stringify(before[key]),
      );
    };
    expect([...new Set(SETUPS.flatMap((_case, at) => differing(at)))]).toEqual(['showDensity']);

    // And WHICH cases moved, by name. A payload that never mentions the field, or mentions it with
    // something that is not a boolean, now takes the policy's ON; only these three still match.
    expect(SETUPS.filter((_c, at) => differing(at).length === 0).map(([name]) => name)).toEqual(
      AGREED_WITH_RECORD,
    );
    expect(SETUPS.length - AGREED_WITH_RECORD.length).toBe(28);
  });

  it.each(GRID.map(([name], at) => [name, at] as const))(
    'reconciles cells the same as before: %s',
    (_n, at) => {
      const [, raw, served] = GRID[at];
      expect(reconcileGridCells(raw, served, FALLBACK_CELLS, MAX_CELLS)).toEqual(
        FIXTURE.grid[at][1],
      );
    },
  );

  it('the record DISCRIMINATES — each altered rule breaks the parity of a named case', () => {
    // A comparison loop passes just as well over a record that asserts nothing. These are the four
    // rules easiest to "fix" by mistake, and each one is seen breaking.
    const at = (name: string): number => SETUPS.findIndex(([n]) => n === name);

    // 1. The switch VIS-01 moved, with BOTH sides pinned. The record answers false for a payload
    //    that never mentioned the field; the coercion now answers the policy's true. Pinning one
    //    side only is how a reverted rule comes back green — the record would still read false.
    expect(FIXTURE.setups[at('empty object')][1].showDensity).toBe(false);
    expect(coerceWorkspaceSetup({}, POLICY).showDensity).toBe(true);
    expect(coerceWorkspaceSetup(null, POLICY).showDensity).toBe(true);

    // 2. The cell ceiling cuts from the END.
    expect(FIXTURE.setups[at('cells above the ceiling are cut')][1].gridCells).toHaveLength(
      MAX_CELLS,
    );

    // 3. A duplicate in the study list goes out, and the excess is cut at the lane ceiling.
    expect(FIXTURE.setups[at('indicators in a list')][1].indicators).toEqual(['a', 'b', 'c', 'd']);

    // 4. A non-numeric value in the density falls back to the default, not to zero.
    expect(FIXTURE.setups[at('density not an object')][1].density).toEqual(DEFAULT_DENSITY_TUNING);
  });
});

/**
 * VIS-01 — a switch the policy owns is TRI-STATE, on all three of them.
 *
 * `=== true` answered two different questions with one value: "the payload says off" and "the
 * payload says nothing" both arrived as false, so a product whose default is ON could never reach a
 * tab that had been stored once. Reading the TYPE separates them.
 *
 * The policy is swept over both values on every clause. A single-valued policy cannot tell "took
 * the policy" from "returned a constant that happens to match it".
 */
const SWITCHES = ['showDensity', 'showProfile', 'autoFit'] as const;

const policyWithSwitches = (value: boolean): WorkspaceSetupPolicy => ({
  ...POLICY,
  showDensity: value,
  showProfile: value,
  autoFit: value,
});

describe('VIS-01 — the switches the policy owns are tri-state', () => {
  it.each(SWITCHES)('%s: absent from a stored payload falls to the policy', (field) => {
    expect(coerceWorkspaceSetup({}, policyWithSwitches(true))[field]).toBe(true);
    expect(coerceWorkspaceSetup({}, policyWithSwitches(false))[field]).toBe(false);
  });

  it.each(SWITCHES)('%s: an explicit boolean wins over the policy, either way', (field) => {
    expect(coerceWorkspaceSetup({ [field]: false }, policyWithSwitches(true))[field]).toBe(false);
    expect(coerceWorkspaceSetup({ [field]: true }, policyWithSwitches(false))[field]).toBe(true);
    // The pair the old rule could not express: an explicit false against an ON policy. Under
    // `=== true` it read the same as silence, which is why silence could never mean ON.
    expect(coerceWorkspaceSetup({ [field]: true }, policyWithSwitches(true))[field]).toBe(true);
    expect(coerceWorkspaceSetup({ [field]: false }, policyWithSwitches(false))[field]).toBe(false);
  });

  it.each(SWITCHES)('%s: what is not a boolean falls to the policy, it is not coerced', (field) => {
    for (const hostile of ['yes', 'false', 1, 0, null, [], {}]) {
      expect(coerceWorkspaceSetup({ [field]: hostile }, policyWithSwitches(true))[field]).toBe(true);
      expect(coerceWorkspaceSetup({ [field]: hostile }, policyWithSwitches(false))[field]).toBe(
        false,
      );
    }
  });

  it.each(SWITCHES)('%s: the seed and a stored payload without the field agree', (field) => {
    // The three construction paths answer the same thing, which is what stops a tab from being
    // born different from how it is restored.
    for (const value of [true, false]) {
      const policy = policyWithSwitches(value);
      expect(defaultWorkspaceSetup(policy)[field]).toBe(value);
      expect(coerceWorkspaceSetup(null, policy)[field]).toBe(value);
      expect(coerceWorkspaceSetup({}, policy)[field]).toBe(value);
      expect(
        seedWorkspaceTabs(undefined, policy, (index) => `Tab ${index + 1}`).tabs[0].setup[field],
      ).toBe(value);
    }
  });

  it('the three are read INDEPENDENTLY — one field does not decide another', () => {
    // Every clause above sweeps the policy with all three switches on the SAME value, which is what
    // makes it a sweep and also what makes it blind to a cross-wiring. These two payloads give the
    // three fields different answers, so a switch reading a neighbour's saved value or a
    // neighbour's policy field lands on the wrong one.
    const mixed = { ...POLICY, showDensity: true, showProfile: false, autoFit: true };

    const saved = coerceWorkspaceSetup({ showDensity: false, autoFit: false }, mixed);
    expect(saved.showDensity).toBe(false); // explicit false beats an ON policy
    expect(saved.showProfile).toBe(false); // absent takes its OWN policy, which is OFF
    expect(saved.autoFit).toBe(false); // explicit false beats an ON policy

    // And the fallback path alone, where a cross-wired POLICY field is the only thing that shows.
    const silent = coerceWorkspaceSetup({}, mixed);
    expect(silent.showDensity).toBe(true);
    expect(silent.showProfile).toBe(false);
    expect(silent.autoFit).toBe(true);
  });
});

describe('LMC-17 — the tab’s shape, in the tabs layer', () => {
  it('the PERSISTED mode values are preserved to the character', () => {
    // Translating them would be a wire-format break: every saved payload would fall back to the
    // default on the next load, and whoever had a grid set up would lose it with nothing having
    // gone wrong.
    expect(coerceWorkspaceSetup({ layoutMode: 'grade' }, POLICY).layoutMode).toBe('grade');
    expect(coerceWorkspaceSetup({ layoutMode: 'foco' }, POLICY).layoutMode).toBe('foco');
    // And the translation is NOT accepted — otherwise the format would have two values for the
    // same mode, which is the break coming in through the back door.
    expect(coerceWorkspaceSetup({ layoutMode: 'grid' }, POLICY).layoutMode).toBe('foco');
    expect(coerceWorkspaceSetup({ layoutMode: 'focus' }, POLICY).layoutMode).toBe('foco');
  });

  it('keeps no field that names a market — the tab describes configuration', () => {
    const setup = coerceWorkspaceSetup({ symbol: 'ETHUSDT', timeframe: '1h' }, POLICY);
    expect(JSON.stringify(setup)).not.toContain('ETHUSDT');
    expect(setup.timeframe).toBe('1h'); // control positive: the rest of the payload survived
  });

  it('the policy is DATA: changing the served catalogue changes the coercion, module untouched', () => {
    const other: WorkspaceSetupPolicy = { ...POLICY, servedTimeframes: ['1h'] };
    expect(coerceWorkspaceSetup({ timeframe: '4h' }, POLICY).timeframe).toBe('4h');
    expect(coerceWorkspaceSetup({ timeframe: '4h' }, other).timeframe).toBeNull();
  });

  it('keeps only what is served and never returns an empty grid', () => {
    // THE THREE ASSERTIONS THAT CAME ALONG, literal, from the previous hook's test in the app —
    // same inputs, same outputs, with the default and the ceiling now injected instead of read
    // from a module constant.
    expect(reconcileGridCells(['15m', '3m', '1d'], SERVED, FALLBACK_CELLS, MAX_CELLS)).toEqual([
      '15m',
      '1d',
    ]);
    // Nothing survives: the filtered default takes over.
    expect(reconcileGridCells(['3m'], SERVED, FALLBACK_CELLS, MAX_CELLS)).toEqual(['15m', '1d']);
    // Not even the default is served: at least one cell on the first served timeframe.
    expect(reconcileGridCells(['3m'], ['2h', '6h'], FALLBACK_CELLS, MAX_CELLS)).toEqual(['2h']);
  });

  it('the grid is never born empty, even when nothing from the default is served', () => {
    const setup = coerceWorkspaceSetup(
      { gridCells: ['3d'] },
      { ...POLICY, servedTimeframes: ['1h', '4h'] },
    );
    expect(setup.gridCells).toEqual(['1h']);
    expect(setup.gridCells.length).toBeGreaterThan(0);
  });

  it('RECONCILES with the existing tabs module, instead of being born in parallel', () => {
    // The clause that stops the new module from being a second path to the same thing: the
    // coercion is exactly what `sanitizeTabs` already asked for as an argument, so an imported
    // list crosses ONE door, not two.
    const tabs = sanitizeTabs(
      [{ id: 't1', name: 'One', setup: { layoutMode: 'grade', timeframe: '4h' } }],
      (raw) => coerceWorkspaceSetup(raw, POLICY),
    );
    expect(tabs).not.toBeNull();
    expect((tabs as { setup: WorkspaceSetup }[])[0].setup.layoutMode).toBe('grade');
    expect((tabs as { setup: WorkspaceSetup }[])[0].setup.timeframe).toBe('4h');

    // And the module's default is the same object the coercion produces for "nothing saved" — two
    // answers here would be the tab being born different from how it is restored.
    expect(defaultWorkspaceSetup(POLICY)).toEqual(coerceWorkspaceSetup(null, POLICY));
  });

  it('WITHOUT an initial tab list, it mints ONE tab from the catalogue’s visible panes', () => {
    // The behaviour has to be DEFINED, and the reason is that three independent points of this
    // package refuse an empty list. All three are exercised just below: together, they mean that a
    // workspace that reached zero tabs would not come back — so "the host brought no list" cannot
    // be a mount failure.
    const minted = seedWorkspaceTabs(undefined, POLICY, (index) => `Tab ${index + 1}`);
    expect(minted.tabs).toHaveLength(1);
    expect(minted.active).toBe(0);
    expect(minted.tabs[0].name).toBe('Tab 1');
    expect(minted.tabs[0].setup).toEqual(defaultWorkspaceSetup(POLICY));
    // The panes come from the catalogue, each at ITS own default.
    expect(minted.tabs[0].setup.panes.map((pane) => pane.visible)).toEqual([true, false, true]);

    // An EMPTY list says the same thing as an absent list.
    expect(seedWorkspaceTabs([], POLICY, (index) => `Tab ${index + 1}`)).toEqual(minted);

    // CONTROL POSITIVE: with a list, it passes through intact and nothing is minted.
    const given = [{ id: 'x', name: 'Mine', setup: coerceWorkspaceSetup({ timeframe: '4h' }, POLICY) }];
    expect(seedWorkspaceTabs(given, POLICY, (index) => `Tab ${index + 1}`).tabs).toEqual(given);
  });

  it('THE THREE POINTS that refuse an empty list, exercised — why the fallback exists', () => {
    // 1. the sanitizer returns `null` for an empty list
    expect(sanitizeTabs([], (raw) => coerceWorkspaceSetup(raw, POLICY))).toBeNull();
    // 2. the replace action refuses an empty list, returning the SAME state
    const state = seedWorkspaceTabs(undefined, POLICY, (index) => `Tab ${index + 1}`);
    expect(reduceTabs(state, { kind: 'replace', tabs: [] })).toBe(state);
    // 3. the last tab does not close
    expect(reduceTabs(state, { kind: 'close', index: 0 })).toBe(state);

    // CONTROL POSITIVE of all three: with content, each one accepts.
    const two = reduceTabs(state, { kind: 'duplicate-active', id: 'x', name: 'Two' });
    expect(two.tabs).toHaveLength(2);
    expect(reduceTabs(two, { kind: 'close', index: 1 }).tabs).toHaveLength(1);
    expect(reduceTabs(state, { kind: 'replace', tabs: two.tabs }).tabs).toHaveLength(2);
    expect(sanitizeTabs([{ id: 'a', name: 'A', setup: {} }], (raw) => coerceWorkspaceSetup(raw, POLICY))).not.toBeNull();
  });

  it('the injected list is trimmed at the format ceiling, not lost on the first write', () => {
    const many = Array.from({ length: MAX_WORKSPACE_TABS + 5 }, (_unused, at) => ({
      id: `t${at}`,
      name: `Tab ${at}`,
      setup: defaultWorkspaceSetup(POLICY),
    }));
    expect(seedWorkspaceTabs(many, POLICY, (index) => `Tab ${index + 1}`).tabs).toHaveLength(
      MAX_WORKSPACE_TABS,
    );
  });

  it('does not import React, and is exercised with no DOM', () => {
    // LMC-20: this suite runs under `testEnvironment: node`. A module that reached `document`
    // would fail here instead of working by accident under jsdom.
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });
});
