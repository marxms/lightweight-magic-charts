/**
 * The interval control, as the library's own chrome: theme tokens only, injected names.
 * See docs/explanation/react.md#theme-tokens-only-and-an-injected-accessible-name
 */
import { useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';

import { Pill } from './chrome/Pill';
import { nextRovingIndex } from './chrome/rovingFocus';
import { DEFAULT_WORKSPACE_THEME } from './theme';
import type { WorkspaceTheme } from './theme';

export interface TimeframeChipsProps {
  readonly options: readonly string[];
  readonly active: string;
  readonly onChange: (timeframe: string) => void;
  /** The accessible name of one chip. The face shows the interval; the name may say more. */
  readonly describe?: (timeframe: string) => string;
  /** The group's accessible name. */
  readonly label?: string;
  readonly theme?: WorkspaceTheme;
}

export function TimeframeChips({
  options,
  active,
  onChange,
  describe,
  label = 'Timeframe',
  theme = DEFAULT_WORKSPACE_THEME,
}: TimeframeChipsProps): ReactElement {
  const group = useRef<HTMLFieldSetElement | null>(null);
  const activeIndex = options.indexOf(active);
  // INVARIANT: exactly one chip holds the tab stop, and with nothing active the first one takes it.
  // A group with no tab stop is a group the keyboard cannot enter at all.
  const stop = activeIndex < 0 ? 0 : activeIndex;

  const onKeyDown = (event: ReactKeyboardEvent<HTMLFieldSetElement>): void => {
    const chips = Array.from(group.current?.querySelectorAll('button') ?? []);
    const focused = chips.findIndex((chip) => chip === document.activeElement);
    const next = nextRovingIndex(event.key, focused, chips.length, 'horizontal');
    // `null` means the key is not ours, and swallowing it would steal Tab and the host's shortcuts.
    if (next === null) return;
    event.preventDefault();
    chips[next]?.focus();
  };

  return (
    // A REAL `fieldset`, the element the platform already has for a named set of controls.
    <fieldset
      ref={group}
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        border: 'none',
        margin: 0,
        padding: 0,
        fontFamily: theme.fontFamily,
      }}
    >
      {options.map((timeframe, index) => (
        <Pill
          key={timeframe}
          theme={theme}
          state={{ kind: 'toggle', pressed: timeframe === active }}
          label={describe?.(timeframe)}
          tabIndex={index === stop ? 0 : -1}
          onSelect={() => onChange(timeframe)}
        >
          {timeframe}
        </Pill>
      ))}
    </fieldset>
  );
}
