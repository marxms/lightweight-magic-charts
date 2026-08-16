/**
 * The two overlays drawn BEHIND the price action: created ONCE, toggled by their data.
 * See docs/explanation/react.md#overlays-are-created-once-and-never-swapped
 */
import { useEffect, useMemo } from 'react';

import type { Bar } from '../domain/types';
import type { Overlay } from '../extension/plugins';
import { DensityFieldOverlay, toDensityColumns } from '../overlays/densityField';
import type { DensitySlice, DensityTuning } from '../overlays/densityField';
import { TroughProfileOverlay, buildProfile } from '../overlays/troughProfile';

/** Buckets the profile is built over. Enough to separate levels, few enough to stay a shape. */
const PROFILE_BUCKETS = 80;

export interface OverlayFields {
  readonly bars: readonly Bar[];
  /** Already adapted by the host: which grid a slice describes is the host's vocabulary, not ours. */
  readonly density?: readonly DensitySlice[];
  readonly tuning?: DensityTuning;
  readonly showDensity?: boolean;
  readonly showProfile?: boolean;
}

const NO_SLICES: readonly DensitySlice[] = [];

export function useOverlayFields({
  bars,
  density = NO_SLICES,
  tuning,
  showDensity = false,
  showProfile = false,
}: OverlayFields): readonly Overlay[] {
  const field = useMemo(() => new DensityFieldOverlay(), []);
  const profile = useMemo(() => new TroughProfileOverlay(), []);

  // Only what is switched ON is attached — a primitive asked to draw nothing still costs a frame.
  const overlays = useMemo<readonly Overlay[]>(
    () => [...(showDensity ? [field] : []), ...(showProfile ? [profile] : [])],
    [field, profile, showDensity, showProfile],
  );

  useEffect(() => {
    field.setColumns(showDensity ? toDensityColumns(density) : []);
  }, [field, density, showDensity]);

  useEffect(() => {
    if (tuning !== undefined) field.setTuning(tuning);
  }, [field, tuning]);

  useEffect(() => {
    profile.setProfile(showProfile ? buildProfile(bars, PROFILE_BUCKETS) : null);
    // The newest bar, so the distribution cannot be drawn over the live edge it was built from.
    profile.setLiveEdge(bars.length === 0 ? null : bars[bars.length - 1].time);
  }, [profile, bars, showProfile]);

  return overlays;
}
