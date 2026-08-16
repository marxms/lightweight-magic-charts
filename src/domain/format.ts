/**
 * Turning a `ValueFormat` into glyphs — the axis and the legend read the same function.
 * See docs/explanation/domain.md#one-formatter-for-axis-and-legend
 */

import type { ValueFormat } from './types';

/** Price decimals adapt to magnitude. See docs/explanation/domain.md#price-decimals-adapt-to-magnitude */
function formatPrice(value: number): string {
  return value.toFixed(value >= 1000 ? 1 : value >= 1 ? 2 : 6);
}

function formatCompact(value: number, decimals: number): string {
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(decimals)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(decimals)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(decimals)}K`;
  return value.toFixed(decimals);
}

export function formatterFor(format: ValueFormat): (value: number) => string {
  switch (format.kind) {
    case 'price':
      return formatPrice;
    case 'percent':
      return (value) => `${(value * 100).toFixed(format.decimals)}%`;
    case 'compact':
      return (value) => formatCompact(value, format.decimals);
    case 'ratio':
      return (value) => value.toFixed(format.decimals);
    case 'custom':
      return format.format;
  }
}

/** The axis step. Coarser than the formatter's resolution and labels collide or repeat. */
export function minMoveOf(format: ValueFormat): number {
  switch (format.kind) {
    case 'price':
    case 'custom':
      return format.minMove;
    case 'percent':
    case 'compact':
    case 'ratio':
      return 10 ** -format.decimals;
  }
}
