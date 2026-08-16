/**
 * The binary in widget shape, under the right ARIA role.
 * See docs/explanation/react-chrome.md#toggle-switch-and-aria-checked-never-aria-pressed
 * See docs/explanation/react-chrome.md#toggle-label-is-mandatory
 * See docs/explanation/react-chrome.md#toggle-enter-and-space-belong-to-the-browser
 */
import { memo } from 'react';
import type { CSSProperties, ReactElement } from 'react';

import type { WorkspaceTheme } from '../theme';
import type { ToggleProps } from './slots';

const TRACK_WIDTH_PX = 28;
const TRACK_HEIGHT_PX = 16;
const KNOB_SIZE_PX = 12;

function trackStyle(theme: WorkspaceTheme, checked: boolean, disabled: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    width: TRACK_WIDTH_PX,
    height: TRACK_HEIGHT_PX,
    padding: 1,
    borderRadius: TRACK_HEIGHT_PX / 2,
    border: `1px solid ${checked ? theme.accent : theme.border}`,
    background: checked ? theme.accentFill : 'transparent',
    color: theme.text,
    fontFamily: theme.fontFamily,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.35 : 1,
  };
}

function knobStyle(theme: WorkspaceTheme, checked: boolean): CSSProperties {
  return {
    width: KNOB_SIZE_PX,
    height: KNOB_SIZE_PX,
    borderRadius: '50%',
    background: checked ? theme.accent : theme.text,
    // The offset is the state itself, drawn; nothing here is read by a screen reader.
    transform: `translateX(${checked ? TRACK_WIDTH_PX - KNOB_SIZE_PX - 4 : 0}px)`,
  };
}

export const Toggle = memo(function Toggle({
  label,
  checked,
  onChange,
  theme,
  disabled,
}: ToggleProps): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={trackStyle(theme, checked, disabled === true)}
    >
      <span aria-hidden="true" style={knobStyle(theme, checked)} />
    </button>
  );
});
