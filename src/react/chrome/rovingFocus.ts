/** Arrow traversal, as arithmetic — no DOM, no focus, no React.
 * See docs/explanation/react-chrome.md#rovingfocus-why-this-is-a-module-and-not-a-handler */

export type RovingOrientation = 'vertical' | 'horizontal';

/** The index that should take the focus, or `null` when the key is not a traversal key.
 * See docs/explanation/react-chrome.md#rovingfocus-null-means-not-mine-and-it-wraps-around */
export function nextRovingIndex(
  key: string,
  index: number,
  size: number,
  orientation: RovingOrientation,
): number | null {
  if (size <= 0) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return size - 1;

  const forward = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
  const backward = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
  if (key === forward) return index < 0 ? 0 : (index + 1) % size;
  if (key === backward) return index < 0 ? size - 1 : (index + size - 1) % size;
  return null;
}
