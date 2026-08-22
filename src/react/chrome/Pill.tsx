/**
 * The text chip, and the highest-traffic role in this library.
 * See docs/explanation/react-chrome.md#pill-a-native-button-never-a-div-with-a-role
 * See docs/explanation/react-chrome.md#pill-the-state-decides-the-aria-and-the-type-decides-the-state
 * See docs/explanation/react-chrome.md#pill-no-focus-ring-declared
 */
import { memo } from 'react';
import type { CSSProperties, ReactElement } from 'react';

import { accented, type WorkspaceTheme } from '../theme';
import { isActive, stateAttributes } from './chromeState';
import type { ChromeState, PillProps } from './slots';

/** The paint comes from the chip already in the series menu; here it stops being local. */
function pillStyle(theme: WorkspaceTheme, active: boolean, disabled: boolean): CSSProperties {
  return {
    padding: '4px 10px',
    cursor: disabled ? 'default' : 'pointer',
    borderRadius: 4,
    border: `1px solid ${active ? theme.accent : theme.border}`,
    fontSize: 11.5,
    fontFamily: theme.fontFamily,
    ...accented(theme, active),
    textAlign: 'left',
    opacity: disabled ? 0.35 : 1,
  };
}

export const Pill = memo(function Pill({
  children,
  state,
  theme,
  onSelect,
  disabled,
  label,
  tabIndex,
}: PillProps): ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      {...(label === undefined ? {} : { 'aria-label': label, title: label })}
      tabIndex={tabIndex}
      onClick={onSelect}
      style={pillStyle(theme, isActive(state), disabled === true)}
      {...stateAttributes(state)}
    >
      {children}
    </button>
  );
});
