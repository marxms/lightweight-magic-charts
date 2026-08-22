/**
 * LMC-84 — the text channel, judged on the two properties a host actually depends on.
 *
 * ONE: the default is WHOLE. A consumer that mounts the root and brings no words at all has to get
 * the screen it had before this channel existed. A partial default is worse than the wrong language
 * — the wrong language can be read, and a blank accessible name announces a control as "button".
 *
 * TWO: bringing one word keeps the other forty. The failure this guards against is the one every
 * merge-by-spread has: a member the host did not mention arriving as `undefined` and erasing a
 * filled default, which shows up as a hole rather than as an error.
 */
import {
  DEFAULT_WORKSPACE_CHROME_LABELS,
  resolveWorkspaceLabels,
} from '../src/react/chrome/labels';
import type { WorkspaceChromeLabels } from '../src/react/chrome/labels';

/** Every leaf of the contract, addressed by the path a reviewer would write down. */
function leaves(value: unknown, at = ''): readonly (readonly [string, unknown])[] {
  if (typeof value !== 'object' || value === null) return [[at, value]];
  return Object.entries(value).flatMap(([key, held]) =>
    leaves(held, at === '' ? key : `${at}.${key}`),
  );
}

/**
 * A function is asked for its sentence; a string is its own. Neither may come back empty.
 *
 * The three argument shapes are tried in turn because the contract carries all three — a name, a
 * pair of counts, a list of names — and a member that answers none of them is a member no caller
 * can use, which is exactly what this wants to catch.
 */
const ARGUMENTS: readonly (readonly unknown[])[] = [
  ['X', 'Y'],
  [1, 2],
  [['A', 'B'], ['C']],
];

function spoken(value: unknown): string {
  if (typeof value !== 'function') return String(value);
  for (const args of ARGUMENTS) {
    try {
      const said = (value as (...given: unknown[]) => string)(...args);
      if (typeof said === 'string' && said.trim().length > 0) return said;
    } catch {
      // The next shape answers. A member that answers none falls through to the empty verdict.
    }
  }
  return '';
}

describe('the default the package ships', () => {
  it('is whole: every member of the contract is filled, and none of them is empty', () => {
    const said = leaves(DEFAULT_WORKSPACE_CHROME_LABELS);
    // The count is stated so that a member added to the interface and forgotten in the default
    // fails here rather than in somebody's product. `filled` cannot invent what was never written.
    // EIGHTY-SEVEN, and the number is MEASURED on the merged contract rather than picked off one
    // side of it. Two lines of history land on the same count: a pick that repeats an identity got
    // a sentence while a truncation readout left, which cancelled to 85; the density legend then
    // brought its group and its empty word, which is the +2. `duplicateStudy` is OPTIONAL on its
    // group — a host that typed the whole of `notices` by hand must still compile — and this count
    // is exactly what stops "optional" from quietly meaning "absent from the default too".
    expect(said.length).toBe(87);
    expect(said.filter(([, value]) => value === undefined || value === null)).toEqual([]);
    expect(said.filter(([, value]) => spoken(value).trim().length === 0)).toEqual([]);
  });

  it('is in English, which is this package default and not its only option', () => {
    expect(DEFAULT_WORKSPACE_CHROME_LABELS.panes.group).toBe('Visible panes');
    expect(DEFAULT_WORKSPACE_CHROME_LABELS.panes.up('RSI')).toBe('Move RSI up');
    expect(DEFAULT_WORKSPACE_CHROME_LABELS.studies.trigger).toBe('Studies');
    expect(DEFAULT_WORKSPACE_CHROME_LABELS.primary.autoFit).toBe('Auto-fit');
    expect(DEFAULT_WORKSPACE_CHROME_LABELS.tabName(0)).toBe('Tab 1');
  });

  it('puts a number or a name in a FUNCTION, never in a string with a marker in it', () => {
    // A marker scheme freezes English word order: `Move {pane} up` cannot become
    // `Mover {pane} para cima` without the host being allowed to write the sentence itself.
    const markers = leaves(DEFAULT_WORKSPACE_CHROME_LABELS)
      .filter(([, value]) => typeof value === 'string')
      .filter(([, value]) => /\{\d?\}|%[sd]|\$\{/.test(String(value)));
    expect(markers).toEqual([]);
  });
});

describe('what resolution does with what a host brings', () => {
  it('hands back the default itself when nothing was brought', () => {
    expect(resolveWorkspaceLabels()).toBe(DEFAULT_WORKSPACE_CHROME_LABELS);
    expect(resolveWorkspaceLabels(undefined)).toBe(DEFAULT_WORKSPACE_CHROME_LABELS);
  });

  it('keeps the other forty when one word arrives, at either level', () => {
    // non-english-fixture: host words in another language — English here would prove nothing
    const resolved = resolveWorkspaceLabels({
      dismiss: 'Dispensar',
      panes: { group: 'Panes visíveis' },
    });
    expect(resolved.dismiss).toBe('Dispensar');
    expect(resolved.panes.group).toBe('Panes visíveis');
    // The eight members of the group the host did not mention, and the whole of the rest of it.
    expect(resolved.panes.up('RSI')).toBe('Move RSI up');
    expect(resolved.panes.handle).toBe('drag to reorder');
    expect(resolved.studies.trigger).toBe('Studies');
    expect(leaves(resolved).filter(([, value]) => value === undefined)).toEqual([]);
  });

  it('refuses to let an explicit `undefined` erase a filled default', () => {
    // The hole a spread leaves: `{...defaults, ...given}` writes `undefined` over `Dismiss`, and a
    // host that builds its overrides from an optional field does exactly that without meaning to.
    const resolved = resolveWorkspaceLabels({
      dismiss: undefined as unknown as string,
      panes: { up: undefined as unknown as (pane: string) => string },
    });
    expect(resolved.dismiss).toBe('Dismiss');
    expect(resolved.panes.up('RSI')).toBe('Move RSI up');
  });

  it('replaces a whole sentence rather than merging into one', () => {
    // A function is never recursed into: a host replacing `state` gets its sentence, not a hybrid.
    const resolved = resolveWorkspaceLabels({
      state: (symbol, timeframe, panes) => `${symbol}/${timeframe}: ${panes}`,
    });
    expect(resolved.state('BTC', '1h', 3)).toBe('BTC/1h: 3');
  });

  it('leaves the default untouched, so one mount cannot translate another', () => {
    resolveWorkspaceLabels({ studies: { trigger: 'Indicadores' } });
    expect(DEFAULT_WORKSPACE_CHROME_LABELS.studies.trigger).toBe('Studies');
  });

  it('accepts a complete contract unchanged, which is what the root passes down', () => {
    const whole: WorkspaceChromeLabels = DEFAULT_WORKSPACE_CHROME_LABELS;
    expect(resolveWorkspaceLabels(whole).panes.group).toBe('Visible panes');
  });
});
