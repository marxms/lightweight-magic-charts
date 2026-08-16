import {
  coerceIndicatorList,
  parseTabsLayout,
  serializeTabsLayout,
  type TabsCodecOptions,
} from '../src/tabs/codec';
import { MAX_WORKSPACE_TABS, type TabsState } from '../src/tabs/workspaceTabs';

/**
 * LMC-17, LMC-20, LMC-22 — the tabs codec, repatriated.
 *
 * The setup is an opaque object here on purpose: the codec does not know what a tab contains, and
 * that is the boundary that keeps it generic. Parity against the previous implementation, with a
 * REAL `setup` instead of the opaque marker used here, was measured once outside this library,
 * against a recording of the output from before any line moved — a verification that has no
 * successor inside the lib in this form. What this suite guarantees today is the envelope contract
 * by itself: version, active tab and the list of tabs, for a `setup` of any shape. The coercion of a
 * real `setup` — what each field means and how it behaves in the face of an earlier payload — is a
 * contract apart, covered in `workspaceSetup.spec.ts`.
 */

interface Setup {
  readonly mark: string;
}

const SEED: TabsState<Setup> = {
  tabs: [{ id: 'seed', name: 'Seed', setup: { mark: 'seed' } }],
  active: 0,
};
const FALLBACK: TabsState<Setup> = {
  tabs: [{ id: 'fb', name: 'Default', setup: { mark: 'fallback' } }],
  active: 0,
};

const options = (over: Partial<TabsCodecOptions<Setup>> = {}): TabsCodecOptions<Setup> => ({
  version: 4,
  coerceSetup: (raw) => ({
    mark:
      raw !== null && typeof raw === 'object' && typeof (raw as { mark?: unknown }).mark === 'string'
        ? ((raw as { mark: string }).mark)
        : 'coerced',
  }),
  defaultName: (index) => `Tab ${index + 1}`,
  seed: () => SEED,
  fallback: () => FALLBACK,
  ...over,
});

const tab = (id: string, name: string, mark: string): unknown => ({ id, name, setup: { mark } });

describe('serializeTabsLayout — what gets written', () => {
  it('writes version, active tab and the tabs, and the result comes back through the reader', () => {
    const state: TabsState<Setup> = {
      tabs: [
        { id: 't1', name: 'One', setup: { mark: 'a' } },
        { id: 't2', name: 'Two', setup: { mark: 'b' } },
      ],
      active: 1,
    };
    const written = serializeTabsLayout(state, 4);
    expect(JSON.parse(written)).toEqual({ version: 4, active: 1, tabs: state.tabs });

    // The way out and the way back are the same contract. A write the reader would not accept would
    // be a workspace lost on reload, and the defect would only show up in the second session.
    expect(parseTabsLayout(written, options())).toEqual(state);
  });

  it('the version written is the one the reader demands — different numbers never meet', () => {
    const state: TabsState<Setup> = { tabs: [{ id: 't1', name: 'One', setup: { mark: 'a' } }], active: 0 };
    expect(parseTabsLayout(serializeTabsLayout(state, 9), options({ version: 9 }))).toEqual(state);
    expect(parseTabsLayout(serializeTabsLayout(state, 9), options({ version: 4 }))).toEqual(FALLBACK);
  });
});

describe('parseTabsLayout — version, recovery and the two answers to "nothing readable"', () => {
  it('a PRISTINE state seeds; a saved and unreadable payload falls back to the default', () => {
    // The two answers are different on purpose. Seeding on top of a payload that exists and has
    // degraded would invent tabs where the user had their own.
    expect(parseTabsLayout(null, options())).toEqual(SEED);
    expect(parseTabsLayout('{ not json', options())).toEqual(FALLBACK);
    expect(parseTabsLayout('[]', options())).toEqual(FALLBACK);
    expect(parseTabsLayout('null', options())).toEqual(FALLBACK);
    expect(parseTabsLayout('7', options())).toEqual(FALLBACK);
  });

  it('never throws, whatever the text', () => {
    for (const payload of ['{', '{"version":', '\0', '"just a string"', '{"version":4}']) {
      expect(() => parseTabsLayout(payload, options())).not.toThrow();
    }
  });

  it('a payload from an earlier version LOADS, and migration is offered before the default', () => {
    const migrated: TabsState<Setup> = {
      tabs: [{ id: 'm', name: 'Migrated', setup: { mark: 'v3' } }],
      active: 0,
    };
    const withMigration = options({
      migrate: (record) => (record.version === 3 ? migrated : null),
    });
    expect(parseTabsLayout(JSON.stringify({ version: 3, panes: [] }), withMigration)).toEqual(
      migrated,
    );

    // POSITIVE CONTROL, in both directions. Without the migration, the SAME payload degrades — so
    // the result above is the migration speaking. And a payload the migration refuses degrades too,
    // instead of the refusal turning into a half-built state.
    expect(parseTabsLayout(JSON.stringify({ version: 3, panes: [] }), options())).toEqual(FALLBACK);
    expect(parseTabsLayout(JSON.stringify({ version: 99 }), withMigration)).toEqual(FALLBACK);
  });

  it('migration is NOT offered to the native format — otherwise it would rewrite what is right', () => {
    const migrate = jest.fn(() => FALLBACK);
    const payload = JSON.stringify({ version: 4, active: 0, tabs: [tab('t1', 'One', 'a')] });
    const state = parseTabsLayout(payload, options({ migrate }));
    expect(migrate).not.toHaveBeenCalled();
    expect(state.tabs[0].setup.mark).toBe('a');
  });

  it('the tab ceiling still holds, and the excess is TRUNCATED instead of refused', () => {
    const many = Array.from({ length: MAX_WORKSPACE_TABS + 12 }, (_unused, at) =>
      tab(`t${at}`, `Tab ${at}`, 'x'),
    );
    const state = parseTabsLayout(
      JSON.stringify({ version: 4, active: 0, tabs: many }),
      options(),
    );
    expect(state.tabs).toHaveLength(MAX_WORKSPACE_TABS);
    // Truncated, not refused: a file that is too large still brings the tabs that fit. Refusing
    // would return the default and the user would lose the 24 that were perfectly usable.
    expect(state).not.toEqual(FALLBACK);
    expect(MAX_WORKSPACE_TABS).toBe(24);
  });

  it('an empty tab list is an unusable payload, not a workspace with zero tabs', () => {
    // The whole chain refuses zero tabs, and that is why the answer here is the default: an empty
    // state that exists only to be recovered is worse than not offering it at all.
    expect(parseTabsLayout(JSON.stringify({ version: 4, tabs: [] }), options())).toEqual(FALLBACK);
    expect(parseTabsLayout(JSON.stringify({ version: 4, tabs: 'none' }), options())).toEqual(
      FALLBACK,
    );
  });

  it('the recorded active tab is trimmed to the range that exists', () => {
    const two = JSON.stringify({
      version: 4,
      active: 9,
      tabs: [tab('t1', 'One', 'a'), tab('t2', 'Two', 'b')],
    });
    expect(parseTabsLayout(two, options()).active).toBe(1);
    const negative = two.replace('"active":9', '"active":-3');
    expect(parseTabsLayout(negative, options()).active).toBe(0);
    const fractional = two.replace('"active":9', '"active":1.5');
    expect(parseTabsLayout(fractional, options()).active).toBe(0);
    const absent = two.replace('"active":9,', '');
    expect(parseTabsLayout(absent, options()).active).toBe(0);
  });

  it('a duplicate id is re-minted, and a missing name falls back to the consumer’s default', () => {
    const state = parseTabsLayout(
      JSON.stringify({
        version: 4,
        active: 0,
        tabs: [tab('t1', 'One', 'a'), tab('t1', 'Two', 'b'), { id: 't3', setup: { mark: 'c' } }],
      }),
      options(),
    );
    expect(new Set(state.tabs.map((t) => t.id)).size).toBe(3);
    expect(state.tabs[2].name).toBe('Tab 3');
  });

  it('imports no React and reaches no platform — exercised without a DOM', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });
});

describe('coerceIndicatorList — the list of studies, and the field it replaced', () => {
  it('duplicates go, order stays, and the excess is cut from the END', () => {
    // Cutting from the end is what makes the ceiling a limit and not a replacement: the old pool,
    // once full, overwrote the first slot, and that is how a study vanished with nobody removing it.
    expect(coerceIndicatorList(['a', 'b', 'a', 'c', 'd', 'e'], undefined, 4)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(coerceIndicatorList(['a', 'b'], undefined, 4)).toEqual(['a', 'b']);
  });

  it('the LEGACY field is accepted and compacted in the order it was in', () => {
    expect(coerceIndicatorList(undefined, ['x', null, 'y'], 4)).toEqual(['x', 'y']);
    expect(coerceIndicatorList('none', ['x', 'y'], 4)).toEqual(['x', 'y']);
  });

  it('the NEW field rules over the legacy one — otherwise the old residue would pull it back', () => {
    expect(coerceIndicatorList(['n'], ['v'], 4)).toEqual(['n']);
    // And an EMPTY new list is a choice, not an absence: it beats the legacy field too.
    expect(coerceIndicatorList([], ['v'], 4)).toEqual([]);
  });

  it('an entry that is not an identifier is discarded', () => {
    expect(coerceIndicatorList([1, 'a', '', 'b', null], undefined, 4)).toEqual(['a', 'b']);
    expect(coerceIndicatorList(undefined, undefined, 4)).toEqual([]);
  });
});
