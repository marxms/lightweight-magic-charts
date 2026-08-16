/**
 * The two knobs that make a density field readable: a floor, and a gamma slider that runs backwards.
 * See docs/explanation/react.md#the-inverted-gamma-slider
 */
import type { ChangeEvent, CSSProperties, ReactElement } from 'react';

import { DEFAULT_DENSITY_TUNING, type DensityTuning } from '../overlays/densityField';
import { DENSITY_TUNING_BOUNDS, clampDensityTuning } from '../overlays/densityTuning';
import { DEFAULT_WORKSPACE_CHROME_LABELS } from './chrome/labels';
import { DEFAULT_WORKSPACE_THEME, type WorkspaceTheme } from './theme';

export interface DensityControlLabels {
  readonly floor: string;
  readonly boost: string;
  readonly reset: string;
  readonly group: string;
  /** The exponent, read out beside its slider. `γ` is universal, the number's shape is not. */
  readonly readout: (gamma: number) => string;
}

/** The same object the whole contract carries — a second copy would drift on the first edit. */
export const DEFAULT_DENSITY_CONTROL_LABELS: DensityControlLabels =
  DEFAULT_WORKSPACE_CHROME_LABELS.density;

export interface DensityControlsProps {
  readonly tuning: DensityTuning;
  readonly onChange: (tuning: DensityTuning) => void;
  readonly labels?: DensityControlLabels;
  readonly theme?: WorkspaceTheme;
  readonly testIdPrefix?: string;
}

/** Reflects a value onto the other end of its own range; its own inverse, so drags do not drift. */
const reflectGamma = (value: number): number =>
  DENSITY_TUNING_BOUNDS.gamma.min + DENSITY_TUNING_BOUNDS.gamma.max - value;

/** One decimal is the gamma step; keeping the reflection on that grid keeps the slider addressable. */
const onGammaGrid = (value: number): number => Number(value.toFixed(1));

/** Available to assistive technology, absent to the eye. `display: none` would remove it from both. */
const CLIPPED: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export function DensityControls({
  tuning,
  onChange,
  labels = DEFAULT_DENSITY_CONTROL_LABELS,
  theme = DEFAULT_WORKSPACE_THEME,
  testIdPrefix = 'density',
}: DensityControlsProps): ReactElement {
  const safe = clampDensityTuning(tuning);

  const row: CSSProperties = { display: 'flex', gap: 4, alignItems: 'center' };
  const readout: CSSProperties = { fontVariantNumeric: 'tabular-nums', opacity: 0.85 };

  const handleFloor = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange(clampDensityTuning({ ...safe, floor: Number(event.target.value) }));
  };

  const handleGamma = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange(
      clampDensityTuning({ ...safe, gamma: onGammaGrid(reflectGamma(Number(event.target.value))) }),
    );
  };

  return (
    // A REAL `fieldset`. See docs/explanation/react.md#a-real-fieldset-a-clipped-legend-and-a-wrapping-label
    <fieldset
      data-testid={`${testIdPrefix}-tuning`}
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        border: 'none',
        margin: 0,
        padding: 0,
        fontFamily: theme.fontFamily,
        fontSize: 10.5,
        color: theme.text,
      }}
    >
      {/* Named for a screen reader, clipped for the eye: the strip has no row for a heading. */}
      <legend style={CLIPPED}>{labels.group}</legend>
      {/* The label WRAPS the input, so the association holds without minting a collidable id. */}
      <label style={row}>
        {labels.floor}
        <input
          type="range"
          data-testid={`${testIdPrefix}-floor`}
          min={DENSITY_TUNING_BOUNDS.floor.min}
          max={DENSITY_TUNING_BOUNDS.floor.max}
          step={DENSITY_TUNING_BOUNDS.floor.step}
          value={safe.floor}
          onChange={handleFloor}
          style={{ width: 70, accentColor: theme.accent }}
        />
        <span style={{ ...readout, width: 30 }}>{`${Math.round(safe.floor * 100)}%`}</span>
      </label>

      <label style={row}>
        {labels.boost}
        <input
          type="range"
          data-testid={`${testIdPrefix}-gamma`}
          min={DENSITY_TUNING_BOUNDS.gamma.min}
          max={DENSITY_TUNING_BOUNDS.gamma.max}
          step={DENSITY_TUNING_BOUNDS.gamma.step}
          value={onGammaGrid(reflectGamma(safe.gamma))}
          onChange={handleGamma}
          style={{ width: 70, accentColor: theme.accent }}
        />
        {/* The EXPONENT is shown, never the slider's reflected position — that number is nowhere else. */}
        <span style={{ ...readout, width: 46 }}>{labels.readout(safe.gamma)}</span>
      </label>

      <button
        type="button"
        data-testid={`${testIdPrefix}-reset`}
        onClick={() => onChange(DEFAULT_DENSITY_TUNING)}
        style={{
          background: 'transparent',
          border: `1px solid ${theme.border}`,
          borderRadius: 4,
          color: 'inherit',
          cursor: 'pointer',
          fontSize: 10,
          padding: '1px 6px',
        }}
      >
        {labels.reset}
      </button>
    </fieldset>
  );
}

export default DensityControls;
