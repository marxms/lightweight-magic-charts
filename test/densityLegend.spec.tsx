/**
 * @jest-environment jsdom
 *
 * LIQ-06 — the legend that says what the top of the ramp is worth.
 *
 * A colour scale with no number on it is decoration: the reader sees that one cell is brighter than
 * another and has no way to learn what either one holds. The number is the HOST's, already
 * formatted — this package knows nothing about the unit, in the same way it knows nothing else about
 * the consumer's domain.
 */
import { render, screen } from '@testing-library/react';

import { DEFAULT_DENSITY_RAMP, DEFAULT_DENSITY_TUNING } from '../src/overlays/densityField';
import { DEFAULT_WORKSPACE_CHROME_LABELS } from '../src/react/chrome/labels';
import { DEFAULT_DENSITY_LEGEND_LABELS, DensityLegend } from '../src/react/DensityLegend';
import { DEFAULT_WORKSPACE_THEME } from '../src/react/theme';

describe('LIQ-06 — the density legend', () => {
  it('shows the top label exactly as the host wrote it, adding no unit of its own', () => {
    // `$12.4M` is a decision of the consumer's locale and currency. A package that appended `USD`
    // here would be asserting a domain it has no business knowing.
    render(<DensityLegend peakLabel="$12.4M" />);
    expect(screen.getByTestId('density-legend-peak')).toHaveTextContent('$12.4M');
  });

  it('mounts on the top label alone, filling labels and theme from the package defaults', () => {
    render(<DensityLegend peakLabel="$1" />);
    const strip = screen.getByTestId('density-legend');

    expect(DEFAULT_DENSITY_LEGEND_LABELS).toBe(DEFAULT_WORKSPACE_CHROME_LABELS.densityLegend);
    expect(strip).toHaveAttribute('aria-label', DEFAULT_DENSITY_LEGEND_LABELS.group);
    expect(strip).toHaveTextContent(DEFAULT_DENSITY_LEGEND_LABELS.empty);
    expect(strip).toHaveStyle({ color: DEFAULT_WORKSPACE_THEME.text });
  });

  it('lets the label channel replace both of its words', () => {
    render(
      <DensityLegend peakLabel="12,4 mi" labels={{ group: 'Escala de densidade', empty: 'nada' }} />,
    );
    expect(screen.getByTestId('density-legend')).toHaveAttribute(
      'aria-label',
      'Escala de densidade',
    );
    expect(screen.getByTestId('density-legend')).toHaveTextContent('nada');
  });

  it('paints from the theme it is handed, so the tokens are read and not hard-coded', () => {
    render(
      <DensityLegend
        peakLabel="$1"
        theme={{ ...DEFAULT_WORKSPACE_THEME, text: 'rgb(1, 2, 3)', control: 'rgb(4, 5, 6)' }}
      />,
    );
    expect(screen.getByTestId('density-legend')).toHaveStyle({ color: 'rgb(1, 2, 3)' });
    expect(screen.getByTestId('density-legend-ramp')).toHaveStyle({
      backgroundColor: 'rgb(4, 5, 6)',
    });
  });

  it('draws the ramp the consumer gave the field, so the two cannot disagree on the palette', () => {
    // A legend painted from a palette the overlay is not using is worse than no legend: it reads as
    // an answer and it is a different question.
    const swatches = (): readonly string[] =>
      Array.from(screen.getByTestId('density-legend-ramp').children).map(
        (child) => (child as HTMLElement).style.backgroundColor,
      );

    const { rerender } = render(<DensityLegend peakLabel="$1" ramp={() => 'rgb(9, 9, 9)'} />);
    expect(swatches()).toEqual(Array(9).fill('rgb(9, 9, 9)'));

    rerender(<DensityLegend peakLabel="$1" />);
    // Compared as NUMBERS: the browser re-serialises a colour, so `rgba(245,40,70,0.620)` comes
    // back as `rgba(245, 40, 70, 0.62)` and a string equality would be about the serialiser.
    const channels = (value: string): readonly number[] => (value.match(/[0-9.]+/g) ?? []).map(Number);
    const painted = swatches();
    expect(channels(painted[painted.length - 1])).toEqual(
      channels(DEFAULT_DENSITY_RAMP(1, DEFAULT_DENSITY_TUNING.gamma)),
    );
    expect(channels(painted[0])).toEqual(
      channels(DEFAULT_DENSITY_RAMP(0, DEFAULT_DENSITY_TUNING.gamma)),
    );
  });

  it('names the strip and reads both ends, and the bar itself is decoration', () => {
    // A bar with no accessible name and no text beside it announces nothing at all. The name is on
    // the group, the two ends are text, and the gradient is hidden because it repeats them in paint.
    render(<DensityLegend peakLabel="$12.4M" />);
    expect(screen.getByRole('group', { name: DEFAULT_DENSITY_LEGEND_LABELS.group })).toBeInTheDocument();
    expect(screen.getByTestId('density-legend-ramp')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('density-legend')).toHaveTextContent(
      `${DEFAULT_DENSITY_LEGEND_LABELS.empty}$12.4M`,
    );
  });
});
