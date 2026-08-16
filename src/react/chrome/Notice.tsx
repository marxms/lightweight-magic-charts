/**
 * The library's only error surface, and the only one that carries a live region.
 * See docs/explanation/react-chrome.md#notice-severity-is-mandatory-and-the-live-region-is-unique
 */
import { memo } from 'react';
import type { CSSProperties, ReactElement } from 'react';

import type { NoticeSeverity, NoticeProps } from './slots';
import type { WorkspaceTheme } from '../theme';
import { IconButton } from './IconButton';
import { DEFAULT_WORKSPACE_CHROME_LABELS } from './labels';
import { Text } from './primitives';

/** Last line of defence. See docs/explanation/react-chrome.md#notice-the-fallback-dismiss-label */
const FALLBACK_DISMISS_LABEL = DEFAULT_WORKSPACE_CHROME_LABELS.dismiss;

/** `alert` is already assertive and `status` is already polite, by definition of the role.
 * See docs/explanation/react-chrome.md#notice-the-role-alone-decides-the-insistence */
function liveRoleOf(severity: NoticeSeverity): 'alert' | 'status' {
  return severity === 'info' ? 'status' : 'alert';
}

function panelStyle(theme: WorkspaceTheme, severity: NoticeSeverity): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    borderRadius: 4,
    border: `1px solid ${severity === 'info' ? theme.border : theme.accent}`,
    background: severity === 'info' ? 'transparent' : theme.accentFill,
    color: theme.text,
    fontFamily: theme.fontFamily,
    boxSizing: 'border-box',
  };
}

export const Notice = memo(function Notice({
  severity,
  children,
  theme,
  onDismiss,
  dismissLabel,
}: NoticeProps): ReactElement {
  return (
    <div role={liveRoleOf(severity)} style={panelStyle(theme, severity)}>
      <Text theme={theme} size={12} style={{ flex: 1 }}>
        {children}
      </Text>
      {onDismiss === undefined ? null : (
        <IconButton
          theme={theme}
          label={
            dismissLabel === undefined || dismissLabel.trim().length === 0
              ? FALLBACK_DISMISS_LABEL
              : dismissLabel
          }
          onSelect={onDismiss}
        >
          ×
        </IconButton>
      )}
    </div>
  );
});
