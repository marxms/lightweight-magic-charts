/**
 * @jest-environment jsdom
 *
 * The two knobs, and the two ways a knob lies.
 *
 * A slider whose direction does not match the word next to it is worse than no slider: the reader
 * drags right for "more", the field gets dimmer, and the only conclusion available is that the data
 * changed. And a slider whose range disagrees with the range its value is clamped to produces a
 * stored setting the control can never return to.
 */
import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import { DensityControls } from '../src/react/DensityControls';
import { DEFAULT_DENSITY_RAMP, DEFAULT_DENSITY_TUNING } from '../src/overlays/densityField';
import type { DensityTuning } from '../src/overlays/densityField';
import { DENSITY_TUNING_BOUNDS, clampDensityTuning } from '../src/overlays/densityTuning';

function mount(tuning: DensityTuning = DEFAULT_DENSITY_TUNING): {
  readonly changes: DensityTuning[];
  readonly show: (next: DensityTuning) => void;
} {
  const changes: DensityTuning[] = [];
  const element = (value: DensityTuning): ReactElement => (
    <DensityControls tuning={value} onChange={(next) => changes.push(next)} />
  );
  const { rerender } = render(element(tuning));
  return { changes, show: (next) => rerender(element(next)) };
}

const slider = (id: string): HTMLInputElement => screen.getByTestId(id) as HTMLInputElement;

describe('the knobs are bounded by ONE declaration', () => {
  it('takes both sliders straight from the bounds the clamp uses', () => {
    mount();

    expect(slider('density-floor').min).toBe(String(DENSITY_TUNING_BOUNDS.floor.min));
    expect(slider('density-floor').max).toBe(String(DENSITY_TUNING_BOUNDS.floor.max));
    expect(slider('density-gamma').min).toBe(String(DENSITY_TUNING_BOUNDS.gamma.min));
    expect(slider('density-gamma').max).toBe(String(DENSITY_TUNING_BOUNDS.gamma.max));

    // CONTROL POSITIVE: the clamp really is bounded by the same numbers. Were the two declared
    // separately, this is the pair that would silently disagree.
    expect(clampDensityTuning({ floor: 99, gamma: 99 })).toEqual({
      floor: DENSITY_TUNING_BOUNDS.floor.max,
      gamma: DENSITY_TUNING_BOUNDS.gamma.max,
    });
  });

  it('shows a restored out-of-range setting at a position it can actually leave', () => {
    // The failure this prevents: a saved file holding gamma 9, a slider that cannot represent it, and
    // a first drag that jumps somewhere unrelated.
    mount({ floor: 9, gamma: 9 });

    expect(Number(slider('density-floor').value)).toBeLessThanOrEqual(DENSITY_TUNING_BOUNDS.floor.max);
    expect(Number(slider('density-gamma').value)).toBeGreaterThanOrEqual(
      DENSITY_TUNING_BOUNDS.gamma.min,
    );
    expect(screen.getByText('γ 2.5')).toBeInTheDocument();
  });
});

describe('the boost slider runs backwards, and that is what makes it truthful', () => {
  it('turns a drag to the RIGHT into a brighter field', () => {
    const { changes } = mount({ floor: 0.05, gamma: 1.5 });
    const before = slider('density-gamma').value;

    fireEvent.change(slider('density-gamma'), { target: { value: String(Number(before) + 1) } });

    const next = changes.at(-1);
    // Right on the slider is a LOWER exponent...
    expect(next?.gamma).toBeLessThan(1.5);
    // ...and a lower exponent is literally more alpha for the same cell. This is the assertion that
    // makes the inversion a fact about the picture and not about a sign convention.
    const alphaOf = (gamma: number): number =>
      Number(/,([0-9.]+)\)$/.exec(DEFAULT_DENSITY_RAMP(0.2, gamma))?.[1] ?? 0);
    expect(alphaOf(next?.gamma ?? 0)).toBeGreaterThan(alphaOf(1.5));
  });

  it('reflects onto its own range, so the slider returns to where the drag left it', () => {
    // The reflection is its own inverse. If it were not, every render-drag-render cycle would walk
    // the stored exponent one step away from where the user put it — a slider that creeps.
    const { changes, show } = mount({ floor: 0.05, gamma: 1.5 });
    expect(slider('density-gamma').value).toBe('1.3');

    fireEvent.change(slider('density-gamma'), { target: { value: '2' } });
    const stored = changes.at(-1)?.gamma;
    expect(stored).toBe(0.8);

    // Feed the stored exponent straight back in: the handle lands on the position it was dragged to.
    show({ floor: 0.05, gamma: stored ?? 0 });
    expect(slider('density-gamma').value).toBe('2');
  });

  it('prints the EXPONENT next to it, not the slider position', () => {
    mount({ floor: 0.05, gamma: 0.5 });
    // 0.5 is the stored exponent; the slider sits at 2.3. Printing 2.3 would leave the reader with a
    // number that appears in no saved workspace and in no ramp.
    expect(screen.getByText('γ 0.5')).toBeInTheDocument();
    expect(slider('density-gamma').value).toBe('2.3');
  });
});

describe('the floor knob', () => {
  it('reports its share as a percentage and passes the raw fraction on', () => {
    const { changes } = mount({ floor: 0.05, gamma: 1.5 });
    expect(screen.getByText('5%')).toBeInTheDocument();

    fireEvent.change(slider('density-floor'), { target: { value: '0.25' } });
    expect(changes.at(-1)).toEqual({ floor: 0.25, gamma: 1.5 });
    // CONTROL POSITIVE: the gamma rode along unchanged, so the handler is editing one knob and not
    // rebuilding the tuning from its own defaults.
    expect(changes.at(-1)?.gamma).toBe(1.5);
  });

  it('resets both knobs to the declared default', () => {
    const { changes } = mount({ floor: 0.3, gamma: 0.4 });
    fireEvent.click(screen.getByTestId('density-reset'));
    expect(changes.at(-1)).toEqual(DEFAULT_DENSITY_TUNING);
  });
});
