/** How much height is LEFT for the canvas — measured from the box, never subtracted from a guess. */
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/** `null` until a real box has been measured: SSR and jsdom have none, and zero is not a height. */
export function useResidualSurfaceHeight(boxRef: RefObject<HTMLElement | null>): number | null {
  const [measured, setMeasured] = useState<number | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (box === null || typeof ResizeObserver === 'undefined') return;
    // One frame in flight, and THIS effect owns it: a callback outliving teardown writes into a
    // component that is gone.
    let frame = 0;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.height ?? 0);
      if (next <= 0) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setMeasured(next));
    });
    observer.observe(box);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [boxRef]);

  return measured;
}
