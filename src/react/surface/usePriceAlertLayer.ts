/**
 * THE USER'S LEVELS — declared as state, dragged as a gesture, and observed on every close.
 * See docs/explanation/react-surface.md#three-effects-one-module
 */

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

import type { PriceAlert } from '../../alerts/priceAlerts';
import type { Bar } from '../../domain/types';
import type { ChartHandles, LiveHandles } from './chartHandles';

/** Positional: `handles` is the reactive dependency, `live` the synchronous view for the gesture.
 * See docs/explanation/react-surface.md#the-drag-goes-on-capture */
export function usePriceAlertLayer(
  handles: ChartHandles | null,
  live: LiveHandles,
  hostRef: RefObject<HTMLDivElement | null>,
  bars: readonly Bar[],
  levels: readonly number[] | undefined,
  onLevelsChange: ((levels: readonly number[]) => void) | undefined,
  onCrossed: ((crossed: readonly PriceAlert[]) => void) | undefined,
): void {
  // BY REFERENCE: reporting a finished drag must not rewire the listeners mid-gesture.
  const changeRef = useRef(onLevelsChange);
  changeRef.current = onLevelsChange;

  /** The declared levels, reconciled onto the drawn ones. Rebuilt only when the SET differs. */
  useEffect(() => {
    const lines = handles?.alerts ?? null;
    if (lines === null) return;
    const wanted = [...(levels ?? [])].sort((a, b) => b - a);
    const drawn = lines.all().map((alert) => alert.price);
    if (drawn.length === wanted.length && drawn.every((price, at) => price === wanted[at])) return;
    lines.clear();
    for (const level of wanted) lines.add(level);
  }, [handles, levels]);

  useEffect(() => {
    const lines = handles?.alerts ?? null;
    if (lines === null || bars.length === 0) return;
    const crossed = lines.observe(bars[bars.length - 1].close);
    if (crossed.length > 0) onCrossed?.(crossed);
  }, [bars, handles, onCrossed]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const yOf = (event: MouseEvent): number => event.clientY - host.getBoundingClientRect().top;

    const onDown = (event: MouseEvent): void => {
      const lines = live.current?.alerts ?? null;
      if (lines === null || !lines.beginDrag(yOf(event))) return;
      event.preventDefault();
      event.stopPropagation();
      live.current?.chart.applyOptions({ handleScroll: false, handleScale: false });
    };
    const onMove = (event: MouseEvent): void => {
      const lines = live.current?.alerts ?? null;
      if (lines?.isDragging() === true) lines.dragTo(yOf(event));
    };
    const onUp = (): void => {
      const lines = live.current?.alerts ?? null;
      if (lines === null || !lines.isDragging()) return;
      lines.endDrag();
      live.current?.chart.applyOptions({ handleScroll: true, handleScale: true });
      changeRef.current?.(lines.all().map((alert) => alert.price));
    };

    // TRUE, and it is the feature's whole line: without it the chart wins and the drag becomes a pan.
    host.addEventListener('mousedown', onDown, true);
    // On WINDOW, not on the host: a drag that leaves the canvas must still track and still end.
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      host.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // Wired ONCE: the inputs are refs of stable identity, and the linter refuses refs in the list.
  }, [hostRef, live]);
}
