/**
 * The tab-set arithmetic, held to the rules that make a strip of tabs behave.
 *
 * Every case that matters is about FOLLOWING: which tab is active after a close, a duplicate, an
 * import. Getting these wrong is invisible in a render test — the strip still draws — and shows up
 * only as the user's edits landing in a neighbouring tab.
 */
import {
  MAX_TAB_NAME,
  MAX_WORKSPACE_TABS,
  exportTabsPayload,
  parseTabsPayload,
  reduceTabs,
  sanitizeTabs,
  type TabsState,
  type WorkspaceTab,
} from '../src/tabs/workspaceTabs';

interface Setup {
  readonly timeframe: string;
}

const tab = (id: string, timeframe = '1h'): WorkspaceTab<Setup> => ({
  id,
  name: `name-${id}`,
  setup: { timeframe },
});

const state = (tabs: WorkspaceTab<Setup>[], active = 0): TabsState<Setup> => ({ tabs, active });

/** The host's coercion: only `timeframe` survives, and only as a string. */
const coerce = (raw: unknown): Setup => {
  const record = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return { timeframe: typeof record.timeframe === 'string' ? record.timeframe : '1h' };
};

describe('reduceTabs — selection follows the tab, never the index', () => {
  it('closing a tab to the RIGHT of the active one leaves the selection alone', () => {
    const next = reduceTabs(state([tab('a'), tab('b'), tab('c')], 1), { kind: 'close', index: 2 });
    expect(next.tabs.map((t) => t.id)).toEqual(['a', 'b']);
    expect(next.active).toBe(1);
  });

  it('closing a tab to the LEFT shifts the selection down so it still names the same tab', () => {
    const next = reduceTabs(state([tab('a'), tab('b'), tab('c')], 2), { kind: 'close', index: 0 });
    expect(next.tabs[next.active].id).toBe('c');
  });

  it('closing the ACTIVE tab lands on its neighbour rather than jumping home', () => {
    const next = reduceTabs(state([tab('a'), tab('b'), tab('c')], 2), { kind: 'close', index: 2 });
    expect(next.tabs[next.active].id).toBe('b');
  });

  it('refuses to close the last tab — an empty set has no setup to apply', () => {
    const only = state([tab('a')]);
    expect(reduceTabs(only, { kind: 'close', index: 0 })).toBe(only);
  });

  it('duplicate clones the ACTIVE setup, appends, and selects the clone', () => {
    const next = reduceTabs(state([tab('a', '4h'), tab('b', '15m')], 0), {
      kind: 'duplicate-active',
      id: 'c',
      name: 'Aba 3',
    });
    expect(next.tabs).toHaveLength(3);
    expect(next.active).toBe(2);
    // The clone carries the setup of the tab the user was ON, not the last one.
    expect(next.tabs[2].setup.timeframe).toBe('4h');
  });

  it('caps the set: at the limit, duplicate is a no-op', () => {
    const full = state(Array.from({ length: MAX_WORKSPACE_TABS }, (_, i) => tab(`t${i}`)));
    expect(reduceTabs(full, { kind: 'duplicate-active', id: 'x', name: 'x' })).toBe(full);
  });

  it('update-active rewrites only the active setup', () => {
    const next = reduceTabs(state([tab('a', '4h'), tab('b', '15m')], 1), {
      kind: 'update-active',
      setup: { timeframe: '1d' },
    });
    expect(next.tabs[0].setup.timeframe).toBe('4h');
    expect(next.tabs[1].setup.timeframe).toBe('1d');
  });

  it('replace swaps the whole set and returns to the first tab; an empty replace is refused', () => {
    const current = state([tab('a')], 0);
    const next = reduceTabs(current, { kind: 'replace', tabs: [tab('x'), tab('y')] });
    expect(next.tabs.map((t) => t.id)).toEqual(['x', 'y']);
    expect(next.active).toBe(0);
    expect(reduceTabs(current, { kind: 'replace', tabs: [] })).toBe(current);
  });

  it('rename bounds the name', () => {
    const next = reduceTabs(state([tab('a')]), {
      kind: 'rename',
      index: 0,
      name: 'x'.repeat(MAX_TAB_NAME + 10),
    });
    expect(next.tabs[0].name).toHaveLength(MAX_TAB_NAME);
  });

  it('rename REFUSES a blank name — the previous one stands and NOTHING is written', () => {
    const current = state([tab('a')]);
    for (const blank of ['', '   ', '\n\t ']) {
      // The very SAME object back, not an equal one: the persisting caller writes only when the
      // state changed, so identity is what makes "refused" mean "never touched the store".
      expect(reduceTabs(current, { kind: 'rename', index: 0, name: blank })).toBe(current);
    }
    // CONTROL POSITIVE: a name with actual characters goes through the same door.
    expect(reduceTabs(current, { kind: 'rename', index: 0, name: 'Swing' }).tabs[0].name).toBe(
      'Swing',
    );
  });

  it('rename trims the edges, and renaming to the SAME name changes nothing', () => {
    const current = state([tab('a')]);
    expect(reduceTabs(current, { kind: 'rename', index: 0, name: '  Swing  ' }).tabs[0].name).toBe(
      'Swing',
    );
    expect(reduceTabs(current, { kind: 'rename', index: 0, name: ' name-a ' })).toBe(current);
  });

  it('rename trims BEFORE bounding, so padding never eats the name budget', () => {
    const padded = `   ${'x'.repeat(MAX_TAB_NAME)}   `;
    const next = reduceTabs(state([tab('a')]), { kind: 'rename', index: 0, name: padded });
    expect(next.tabs[0].name).toBe('x'.repeat(MAX_TAB_NAME));
  });
});

describe('sanitizeTabs — the import gate treats a picked file as untrusted input', () => {
  it('coerces each entry through the HOST function and re-mints duplicate ids', () => {
    const clean = sanitizeTabs(
      [
        { id: 'a', name: 'one', timeframe: '4h' },
        { id: 'a', name: 'two', timeframe: '1d' },
      ],
      coerce,
    );
    expect(clean).not.toBeNull();
    const ids = (clean as WorkspaceTab<Setup>[]).map((t) => t.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toBe('a');
    // CONTROL POSITIVE: the setups themselves survived the re-mint.
    expect((clean as WorkspaceTab<Setup>[])[1].setup.timeframe).toBe('1d');
  });

  it('drops a field the host does not coerce — an instrument in an old payload does not survive', () => {
    // The migration for payloads written when a tab still carried a market: the coercion has no
    // field for it, so it cannot come out the other side no matter what the file says.
    const clean = sanitizeTabs([{ id: 'a', symbol: 'XX/YY', timeframe: '4h' }], coerce);
    expect((clean as WorkspaceTab<Setup>[])[0].setup).toEqual({ timeframe: '4h' });
  });

  it('caps a hostile file and answers null for a payload that is not a list', () => {
    const oversized = Array.from({ length: MAX_WORKSPACE_TABS + 10 }, (_, i) => ({ id: `t${i}` }));
    expect(sanitizeTabs(oversized, coerce)).toHaveLength(MAX_WORKSPACE_TABS);
    expect(sanitizeTabs({ tabs: [] }, coerce)).toBeNull();
    expect(sanitizeTabs([], coerce)).toBeNull();
  });

  it('round-trips through the export payload', () => {
    const tabs = [tab('a', '4h'), tab('b', '1w')];
    const back = parseTabsPayload(exportTabsPayload(tabs), coerce);
    expect(back).toEqual(tabs);
    // CONTROL POSITIVE: malformed JSON is a bad file, never a crash.
    expect(parseTabsPayload('{not json', coerce)).toBeNull();
  });
});
