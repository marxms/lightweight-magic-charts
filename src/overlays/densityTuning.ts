/** What a `DensityTuning` is ALLOWED to be, declared once. See docs/explanation/overlays.md#one-declaration-of-the-bounds */

import type { DensityTuning } from './densityField';
import { DEFAULT_DENSITY_TUNING } from './densityField';

/** Re-exported on purpose: the module about the VALUE. See docs/explanation/overlays.md#why-the-type-is-re-exported */
export type { DensityTuning };

export interface TuningBound {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export const DENSITY_TUNING_BOUNDS: Readonly<Record<'floor' | 'gamma', TuningBound>> = {
  floor: { min: 0, max: 0.4, step: 0.01 },
  gamma: { min: 0.3, max: 2.5, step: 0.1 },
};

const clampTo = (bound: TuningBound, value: number, fallback: number): number =>
  Number.isFinite(value) ? Math.min(bound.max, Math.max(bound.min, value)) : fallback;

const absoluteFloor = (value: number): number => (Number.isFinite(value) ? Math.max(0, value) : 0);

/** Any tuning, made representable. A restored file is untrusted input like any other. */
export function clampDensityTuning(tuning: DensityTuning): DensityTuning {
  const gamma = clampTo(DENSITY_TUNING_BOUNDS.gamma, tuning.gamma, DEFAULT_DENSITY_TUNING.gamma);
  // Zero, never the relative default. See docs/explanation/overlays.md#why-an-absolute-floor-exists
  if (tuning.floorMode === 'absolute') {
    return { floor: absoluteFloor(tuning.floor), gamma, floorMode: 'absolute' };
  }
  return {
    floor: clampTo(DENSITY_TUNING_BOUNDS.floor, tuning.floor, DEFAULT_DENSITY_TUNING.floor),
    gamma,
  };
}
