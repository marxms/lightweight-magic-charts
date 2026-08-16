/**
 * The titled legend — one line per pane, overlaid on the canvas and rendered by React.
 * See docs/explanation/react.md#why-a-legend-overlay-exists-at-all
 */
import type { ReactElement } from 'react';

import { DEFAULT_WORKSPACE_THEME, type WorkspaceTheme } from './theme';

/** Re-exported; the shape is declared one layer down. See docs/explanation/react.md#where-a-legend-line-is-declared */
export type { LegendEntry, LegendLine } from '../layout/legendModel';
import type { LegendLine } from '../layout/legendModel';

export interface WorkspaceLegendProps {
  readonly lines: readonly LegendLine[];
  readonly theme?: WorkspaceTheme;
  /** Prefix for the per-line test ids, so a host can host two workspaces without a collision. */
  readonly testIdPrefix?: string;
}

export function WorkspaceLegend({
  lines,
  theme = DEFAULT_WORKSPACE_THEME,
  testIdPrefix = 'chart-workspace-legend',
}: WorkspaceLegendProps): ReactElement {
  return (
    <div
      data-testid={`${testIdPrefix}s`}
      style={{
        position: 'absolute',
        inset: 0,
        // The chart owns every gesture on this area; swallowing the press would kill panning.
        pointerEvents: 'none',
        zIndex: 3,
        fontFamily: theme.fontFamily,
      }}
    >
      {lines.map((line) => (
        <div
          key={line.id}
          data-testid={`${testIdPrefix}-${line.id}`}
          data-pane-legend={line.id}
          style={{
            position: 'absolute',
            top: `${line.topPx + 3}px`,
            left: 8,
            whiteSpace: 'nowrap',
            fontSize: 11,
            lineHeight: 1.4,
            color: theme.text,
            textShadow: theme.legendShadow,
          }}
        >
          <span style={{ fontWeight: 700, opacity: 0.65, marginRight: 10 }}>{line.title}</span>
          {line.entries
            // A mute entry identifies nothing. See docs/explanation/react.md#mute-entries-are-filtered-out
            .filter((entry) => entry.label !== '' || entry.value !== '—')
            .map((entry) => (
            <span key={entry.id} style={{ color: entry.color ?? theme.text, marginRight: 10 }}>
              {entry.label === '' ? entry.value : `${entry.label} ${entry.value}`}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export default WorkspaceLegend;
