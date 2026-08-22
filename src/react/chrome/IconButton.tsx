/**
 * The glyph-only control, with a mandatory accessible name enforced in two layers.
 * See docs/explanation/react-chrome.md#iconbutton-two-layers-for-one-accessible-name-rule
 * See docs/explanation/react-chrome.md#iconbutton-ref-is-a-normal-prop-not-forwardref
 */
import { memo, useEffect } from 'react';
import type { CSSProperties, ReactElement } from 'react';

import { accented, type WorkspaceTheme } from '../theme';
import { isActive, stateAttributes } from './chromeState';
import type { IconButtonProps } from './slots';

const GLYPH_SIZE_PX = 28;

function iconStyle(theme: WorkspaceTheme, disabled: boolean, active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: GLYPH_SIZE_PX,
    height: GLYPH_SIZE_PX,
    padding: 0,
    borderRadius: 4,
    border: `1px solid ${active ? theme.accent : 'transparent'}`,
    ...accented(theme, active),
    fontFamily: theme.fontFamily,
    fontSize: 14,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.35 : 1,
    // See docs/explanation/react-chrome.md#iconbutton-the-glyph-does-not-shrink
    flexShrink: 0,
  };
}

/**
 * Recurrent on purpose: it fires on every mount and on every change of `label`.
 * See docs/explanation/react-chrome.md#iconbutton-the-sensor-repeats-instead-of-latching
 */
function useAccessibleNameSensor(label: string): void {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (label.trim().length > 0) return;
    console.error(
      'IconButton: `label` arrived empty. The control has no visible text, so without `label` ' +
        'it is announced only as "button". Pass an accessible name.',
    );
  }, [label]);
}

export const IconButton = memo(function IconButton({
  label,
  children,
  theme,
  onSelect,
  disabled,
  state,
  controls,
  tabIndex,
  testId,
  hover,
  ref,
}: IconButtonProps): ReactElement {
  useAccessibleNameSensor(label);

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      // The same name, also as the native hint.
      // See docs/explanation/react-chrome.md#iconbutton-title-repeats-the-accessible-name
      title={label}
      disabled={disabled}
      tabIndex={tabIndex}
      data-testid={testId}
      onClick={onSelect}
      onMouseEnter={hover?.onEnter}
      onMouseLeave={hover?.onLeave}
      style={iconStyle(theme, disabled === true, isActive(state))}
      {...stateAttributes(state, controls)}
    >
      {children}
    </button>
  );
});
