import {
  coerceWorkspaceSetup,
  defaultWorkspaceSetup,
  type StudySettings,
  type WorkspaceSetup,
  type WorkspaceSetupPolicy,
} from '../src/tabs/setup';
import { parseTabsLayout, serializeTabsLayout } from '../src/tabs/codec';
import { reduceTabs } from '../src/tabs/workspaceTabs';
import type { TabsState } from '../src/tabs/workspaceTabs';
import { DEFAULT_DENSITY_TUNING } from '../src/overlays/densityField';
import type { PaneCatalogueEntry } from '../src/pane/budget';

/**
 * PARAM-01..06 and PARAM-08 — the tab holds values it never reads.
 *
 * WHAT THIS SUITE IS FOR. `WorkspaceSetup` is a closed shape and `coerceWorkspaceSetup` rebuilds it
 * field by field, discarding anything it does not know. Per-study parameter values are the one thing
 * a host cannot persist on its own, and they are also the one thing this package must never look
 * inside: the moment `src/` reads a member of a value, it has named an indicator's vocabulary and
 * the boundary this package defines itself by is gone. So the value is typed `unknown`, and the
 * compiler — not a comment — is what stops the package from reading it.
 *
 * WHY THE PROTOTYPE CLAUSE IS NOT PEDANTRY. The first draft of the pruning used `in`. Measured:
 * `onlyActive({}, ['toString'])` returned `{toString: <function>}` — the package FABRICATING a value
 * the host never wrote, which is PARAM-03 violated by the code written to serve it. It is reachable
 * without malice: study ids come from a third-party registry of 457 entries, and a host may load
 * someone else's exported workspace file.
 *
 * SPEC_DEVIATION (design, not spec): design.md names `Object.hasOwn` as the predicate. This package
 * declares `lib: ["ES2021", "DOM"]` and `Object.hasOwn` is ES2022 — `tsc` refuses it with TS2550.
 * Raising the lib would widen the runtime floor that the spec's assumption table says is UNCHANGED,
 * so the implementation uses `Object.prototype.hasOwnProperty.call`, which is what `Object.hasOwn`
 * was standardised to replace and is own-property-exact. The BEHAVIOUR the design specified — an
 * inherited key yields no value — is asserted below in both directions.
 */

const CATALOGUE: PaneCatalogueEntry[] = [
  { id: 'alpha', defaultVisible: true, heightPx: 126 },
  { id: 'beta', defaultVisible: false, heightPx: 90 },
];
const LANES = 4;

const coerceIndicators = (raw: unknown, legacy: unknown): readonly string[] => {
  const source = Array.isArray(raw) ? raw : Array.isArray(legacy) ? legacy : [];
  const list: string[] = [];
  for (const item of source) {
    if (typeof item !== 'string' || item === '' || list.includes(item)) continue;
    list.push(item);
    if (list.length === LANES) break;
  }
  return list;
};

const POLICY: WorkspaceSetupPolicy = {
  catalogue: CATALOGUE,
  servedTimeframes: ['1h', '4h'],
  gridFallback: ['1h'],
  maxGridCells: 2,
  density: DEFAULT_DENSITY_TUNING,
  showDensity: false,
  showProfile: false,
  autoFit: false,
  coerceIndicators,
};

/** The wire version the host owns. It is the SAME number before and after this feature — that is the claim. */
const VERSION = 3;

const codec = {
  version: VERSION,
  coerceSetup: (raw: unknown): WorkspaceSetup => coerceWorkspaceSetup(raw, POLICY),
  defaultName: (index: number): string => `Tab ${index + 1}`,
  seed: (): TabsState<WorkspaceSetup> => ({
    tabs: [{ id: 'tab-1', name: 'Tab 1', setup: defaultWorkspaceSetup(POLICY) }],
    active: 0,
  }),
  fallback: (): TabsState<WorkspaceSetup> => ({
    tabs: [{ id: 'fallback', name: 'Fallback', setup: defaultWorkspaceSetup(POLICY) }],
    active: 0,
  }),
};

const stateOf = (setup: WorkspaceSetup): TabsState<WorkspaceSetup> => ({
  tabs: [{ id: 'tab-1', name: 'Tab 1', setup }],
  active: 0,
});

describe('PARAM-04 — a value comes from an OWN property or from nowhere', () => {
  it('yields NO value for a study whose key lives only on the prototype chain', () => {
    // The exact stimulus the first draft failed on, in its two reachable spellings.
    const inherited = Object.create({ ma: { period: 9 } }) as Record<string, unknown>;
    expect(coerceWorkspaceSetup(
      { indicators: ['ma'], studySettings: inherited },
      POLICY,
    ).studySettings).toBeUndefined();

    expect(coerceWorkspaceSetup(
      { indicators: ['toString', 'constructor'], studySettings: {} },
      POLICY,
    ).studySettings).toBeUndefined();
  });

  it('CONTROL POSITIVE: the same key written as an OWN property yields the value', () => {
    // Without this clause a coercion that returned `undefined` for everything would pass above.
    const own = Object.create({ ma: { period: 9 } }) as Record<string, unknown>;
    own.ma = { period: 20 };
    expect(coerceWorkspaceSetup({ indicators: ['ma'], studySettings: own }, POLICY).studySettings)
      .toEqual({ ma: { period: 20 } });
    expect(coerceWorkspaceSetup(
      { indicators: ['toString'], studySettings: { toString: { period: 5 } } },
      POLICY,
    ).studySettings).toEqual({ toString: { period: 5 } });
  });
});

describe('PARAM-03 — the package stores the value and returns it, never reading inside it', () => {
  it('returns the SAME value it was handed, whatever shape it has', () => {
    const object = { period: 20, source: 'close', nested: { deep: [1, 2, 3] } };
    const setup = coerceWorkspaceSetup(
      {
        indicators: ['ma', 'rsi', 'atr', 'obv'],
        studySettings: { ma: object, rsi: 'a string', atr: null, obv: 42 },
      },
      POLICY,
    );
    const held = setup.studySettings as Record<string, StudySettings>;
    // Identity, not equality: a package that "validated" or rebuilt the value would fail here.
    expect(held.ma).toBe(object);
    expect(held.rsi).toBe('a string');
    expect(held.atr).toBeNull();
    expect(held.obv).toBe(42);
  });

  it('coercing the same payload twice yields the same setup', () => {
    const raw = { indicators: ['ma'], studySettings: { ma: { period: 20 } } };
    expect(coerceWorkspaceSetup(raw, POLICY)).toEqual(coerceWorkspaceSetup(raw, POLICY));
  });

  it('treats a non-object map as absent instead of throwing', () => {
    // Edge case from spec.md: "IF a stored payload declares parameter values as a non-object".
    for (const raw of ['none', 7, null, true, ['ma']]) {
      expect(coerceWorkspaceSetup({ indicators: ['ma'], studySettings: raw }, POLICY).studySettings)
        .toBeUndefined();
    }
  });
});

describe('PARAM-06 — values for a study that is no longer in the list are dropped', () => {
  it('keeps the active study’s values and drops the departed one’s', () => {
    const setup = coerceWorkspaceSetup(
      { indicators: ['ma'], studySettings: { ma: { period: 20 }, gone: { period: 99 } } },
      POLICY,
    );
    expect(setup.studySettings).toEqual({ ma: { period: 20 } });
    // Named, so a pruning that dropped everything cannot pass the clause above.
    expect(setup.studySettings).not.toHaveProperty('gone');
  });

  it('drops the whole map when nothing in it is still listed', () => {
    expect(coerceWorkspaceSetup(
      { indicators: [], studySettings: { ma: { period: 20 } } },
      POLICY,
    ).studySettings).toBeUndefined();
  });
});

describe('PARAM-05 — the host’s own coercion decides a value, and refusing one is not refusing the payload', () => {
  it('loads the study with no values when the host’s coercion rejects the value', () => {
    const policy: WorkspaceSetupPolicy = {
      ...POLICY,
      coerceStudySettings: (raw, indicators) => {
        const source = raw as Record<string, { period?: unknown }> | null;
        const kept: Record<string, StudySettings> = {};
        for (const id of indicators) {
          const value = source?.[id];
          // The host's rule, written here because only the host may have one: a period is a number.
          if (typeof value?.period === 'number') kept[id] = value;
        }
        return kept;
      },
    };
    const setup = coerceWorkspaceSetup(
      {
        timeframe: '4h',
        indicators: ['ma', 'rsi'],
        studySettings: { ma: { period: 'twenty' }, rsi: { period: 14 } },
      },
      policy,
    );
    // The rejected study is still listed, with no values — and the rest of the payload survived.
    expect(setup.indicators).toEqual(['ma', 'rsi']);
    expect(setup.studySettings).toEqual({ rsi: { period: 14 } });
    expect(setup.timeframe).toBe('4h');
  });

  it('WITHOUT the sibling, values PASS THROUGH key-pruned instead of being emptied', () => {
    // The first draft emptied them silently: a policy that never declares the member handed
    // `resolve` an empty map after a remount, and nothing was red.
    expect(POLICY.coerceStudySettings).toBeUndefined();
    expect(coerceWorkspaceSetup(
      { indicators: ['ma'], studySettings: { ma: { period: 50 } } },
      POLICY,
    ).studySettings).toEqual({ ma: { period: 50 } });
  });

  it('the package still prunes by key when the host’s coercion over-answers', () => {
    const policy: WorkspaceSetupPolicy = {
      ...POLICY,
      coerceStudySettings: () => ({ ma: { period: 20 }, gone: { period: 99 } }),
    };
    expect(coerceWorkspaceSetup({ indicators: ['ma'] }, policy).studySettings)
      .toEqual({ ma: { period: 20 } });
  });
});

describe('PARAM-01, PARAM-02, PARAM-08 — the values survive the tab', () => {
  it('restores every value byte-for-byte through the REAL codec', () => {
    const saved = coerceWorkspaceSetup(
      {
        indicators: ['ma', 'rsi'],
        studySettings: { ma: { period: 20, source: 'close' }, rsi: { period: 14 } },
      },
      POLICY,
    );
    const payload = serializeTabsLayout(stateOf(saved), VERSION);
    const restored = parseTabsLayout(payload, codec);
    expect(restored.tabs).toHaveLength(1);
    expect(restored.tabs[0].setup.studySettings).toEqual({
      ma: { period: 20, source: 'close' },
      rsi: { period: 14 },
    });
    expect(restored.tabs[0].setup.indicators).toEqual(['ma', 'rsi']);
  });

  it('changing a value leaves the identity, the lane and the position untouched', () => {
    const before = coerceWorkspaceSetup(
      { indicators: ['ma', 'rsi'], studySettings: { ma: { period: 20 } } },
      POLICY,
    );
    const after: WorkspaceSetup = { ...before, studySettings: { ma: { period: 50 } } };
    expect(after.indicators).toEqual(before.indicators);
    expect(after.indicators).toEqual(['ma', 'rsi']);
    expect(after.panes).toEqual(before.panes);
    expect(after.studySettings).toEqual({ ma: { period: 50 } });
  });

  it('a duplicated tab carries the same values as the original', () => {
    const setup = coerceWorkspaceSetup(
      { indicators: ['ma'], studySettings: { ma: { period: 20 } } },
      POLICY,
    );
    const duplicated = reduceTabs(stateOf(setup), {
      kind: 'duplicate-active',
      id: 'tab-2',
      name: 'Tab 2',
    });
    expect(duplicated.tabs).toHaveLength(2);
    expect(duplicated.tabs[1].setup.studySettings).toEqual({ ma: { period: 20 } });
  });
});

describe('PARAM-07 — a payload written before this feature loads unchanged', () => {
  it('loads with no error, at the SAME version, with every study carrying no values', () => {
    // Written by hand in the shape 0.2.1 wrote it: no `studySettings` key anywhere.
    const before = JSON.stringify({
      version: VERSION,
      active: 0,
      tabs: [{ id: 'tab-1', name: 'Tab 1', setup: { timeframe: '4h', indicators: ['ma', 'rsi'] } }],
    });
    const restored = parseTabsLayout(before, codec);
    // Not the fallback: the payload was READ, not degraded.
    expect(restored.tabs[0].id).toBe('tab-1');
    expect(restored.tabs[0].setup.indicators).toEqual(['ma', 'rsi']);
    expect(restored.tabs[0].setup.studySettings).toBeUndefined();
  });

  it('a setup with no values writes the SAME bytes it wrote before the feature', () => {
    // The member is absent rather than empty on purpose: an always-present `{}` would rewrite every
    // exported file on the first save, which is a wire-format change nobody asked for.
    const setup = coerceWorkspaceSetup({ timeframe: '4h', indicators: ['ma'] }, POLICY);
    expect(JSON.stringify(setup)).not.toContain('studySettings');
    expect(JSON.stringify(defaultWorkspaceSetup(POLICY))).not.toContain('studySettings');
    // CONTROL POSITIVE: with a value, the field IS written.
    const held = coerceWorkspaceSetup(
      { indicators: ['ma'], studySettings: { ma: { period: 20 } } },
      POLICY,
    );
    expect(JSON.stringify(held)).toContain('"studySettings":{"ma":{"period":20}}');
  });
});
