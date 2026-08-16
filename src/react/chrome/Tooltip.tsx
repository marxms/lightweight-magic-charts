/**
 * Dismissible, hoverable and persistent, with no portal and no focus trap.
 * See docs/explanation/react-chrome.md#tooltip-the-wrapper-is-the-whole-trick
 * See docs/explanation/react-chrome.md#tooltip-the-panel-describes-it-does-not-label
 * See docs/explanation/react-chrome.md#tooltip-turned-off-it-falls-back-to-the-native-title
 */
import { cloneElement, memo, useCallback, useId, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';

import { useHoverDismiss, useHoverIntent } from '../hoverIntent';
import type { WorkspaceTheme } from '../theme';
import type { TooltipProps } from './slots';

function panelStyle(theme: WorkspaceTheme): CSSProperties {
  return {
    position: 'absolute',
    top: '100%',
    left: 0,
    zIndex: 1,
    marginTop: 4,
    padding: '4px 8px',
    borderRadius: 4,
    border: `1px solid ${theme.border}`,
    background: theme.surface,
    color: theme.text,
    fontFamily: theme.fontFamily,
    fontSize: 11.5,
    whiteSpace: 'nowrap',
    // Reading is not interacting: the panel never captures the pointer of what is beneath it.
    pointerEvents: 'auto',
  };
}

export const Tooltip = memo(function Tooltip({ content, children, theme, disabled }: TooltipProps): ReactElement {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const hover = useHoverIntent();

  const close = useCallback(() => setOpen(false), []);
  useHoverDismiss(wrapperRef, { enabled: open && disabled !== true, onDismiss: close });

  const onKeyDown = (event: ReactKeyboardEvent<HTMLSpanElement>): void => {
    if (event.key !== 'Escape') return;
    event.stopPropagation(); // the tip's Escape is not the Escape of the chart behind it
    hover.cancel();
    setOpen(false);
  };

  if (disabled === true) return cloneElement(children, { title: content });

  return (
    // The wrapper is not the control: it delegates. The listeners sit here, not on the trigger.
    // See docs/explanation/react-chrome.md#tooltip-the-wrapper-is-the-whole-trick
    // biome-ignore lint/a11y/noStaticElementInteractions: see the comment above.
    <span
      ref={wrapperRef}
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => hover.open(() => setOpen(true))}
      onMouseLeave={() => hover.cancel()}
      onFocus={() => {
        hover.cancel();
        setOpen(true);
      }}
      onBlur={close}
      onKeyDown={onKeyDown}
    >
      {cloneElement(children, { 'aria-describedby': open ? panelId : undefined })}
      {open ? (
        <div role="tooltip" id={panelId} style={panelStyle(theme)}>
          {content}
        </div>
      ) : null}
    </span>
  );
});
