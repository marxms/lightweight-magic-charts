/**
 * The colour ramp, read back: what the top of the scale is worth, in the host's own unit.
 */
import type { CSSProperties, ReactElement } from 'react';

import {
  DEFAULT_DENSITY_RAMP,
  DEFAULT_DENSITY_TUNING,
  type DensityRamp,
} from '../overlays/densityField';
import { DEFAULT_WORKSPACE_CHROME_LABELS } from './chrome/labels';
import { DEFAULT_WORKSPACE_THEME, type WorkspaceTheme } from './theme';

export interface DensityLegendLabels {
  /** Accessible name of the strip. */
  readonly group: string;
  /** The low end of the ramp, where a cell holds nothing worth painting. */
  readonly empty: string;
}

/** The same object the whole contract carries — a second copy would drift on the first edit. */
export const DEFAULT_DENSITY_LEGEND_LABELS: DensityLegendLabels =
  DEFAULT_WORKSPACE_CHROME_LABELS.densityLegend;

export interface DensityLegendProps {
  /** The top of the ramp, ALREADY formatted. This package does not know what the unit is. */
  readonly peakLabel: string;
  readonly ramp?: DensityRamp;
  readonly gamma?: number;
  readonly labels?: DensityLegendLabels;
  readonly theme?: WorkspaceTheme;
  readonly testIdPrefix?: string;
}

/** Samples taken off the ramp. Enough for the eye to read a gradient, few enough to stay a string. */
const STOPS = 9;

export function DensityLegend({
  peakLabel,
  ramp = DEFAULT_DENSITY_RAMP,
  gamma = DEFAULT_DENSITY_TUNING.gamma,
  labels = DEFAULT_DENSITY_LEGEND_LABELS,
  theme = DEFAULT_WORKSPACE_THEME,
  testIdPrefix = 'density',
}: DensityLegendProps): ReactElement {
  const end: CSSProperties = { fontVariantNumeric: 'tabular-nums', opacity: 0.85 };
  const sampled = Array.from({ length: STOPS }, (_, at) => at / (STOPS - 1));

  return (
    <div
      role="group"
      aria-label={labels.group}
      data-testid={`${testIdPrefix}-legend`}
      style={{
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        fontFamily: theme.fontFamily,
        fontSize: 10.5,
        color: theme.text,
      }}
    >
      <span style={end}>{labels.empty}</span>
      {/* DECORATION: the bar carries no text, and both of its ends are read as text beside it. */}
      <span
        aria-hidden="true"
        data-testid={`${testIdPrefix}-legend-ramp`}
        style={{
          display: 'flex',
          width: 84,
          height: 8,
          borderRadius: 2,
          overflow: 'hidden',
          border: `1px solid ${theme.border}`,
          backgroundColor: theme.control,
        }}
      >
        {/* Sampled swatches rather than a CSS gradient: the ramp's alpha needs a surface under it. */}
        {sampled.map((share) => (
          <span key={share} style={{ flex: 1, backgroundColor: ramp(share, gamma) }} />
        ))}
      </span>
      <span style={end} data-testid={`${testIdPrefix}-legend-peak`}>
        {peakLabel}
      </span>
    </div>
  );
}

export default DensityLegend;
