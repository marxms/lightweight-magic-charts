/**
 * POINTER INTENT — the delay that separates "meant to" from "passed over". Schedules only.
 * See docs/explanation/react.md#why-pointer-intent-is-a-module
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';

/** See docs/explanation/react.md#the-two-delays-and-why-they-are-asymmetric */
export const HOVER_OPEN_DELAY_MS = 140;
/** LONGER than the opening delay: it forgives the trip from the trigger to the panel. */
export const HOVER_CLOSE_DELAY_MS = 300;

export interface HoverIntent {
  /** Schedules with the OPENING delay. Replaces any pending one. */
  readonly open: (run: () => void) => void;
  /** Schedules with the CLOSING delay. Replaces any pending one. */
  readonly close: (run: () => void) => void;
  readonly cancel: () => void;
}

/** ONE pending timer per instance, always. See docs/explanation/react.md#one-timer-per-instance */
export function useHoverIntent(
  openDelayMs: number = HOVER_OPEN_DELAY_MS,
  closeDelayMs: number = HOVER_CLOSE_DELAY_MS,
): HoverIntent {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const schedule = useCallback(
    (delayMs: number, run: () => void) => {
      cancel();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        run();
      }, delayMs);
    },
    [cancel],
  );

  // A timer that outlives the unmount writes state into a dead component.
  useEffect(() => cancel, [cancel]);

  return useMemo(
    () => ({
      open: (run: () => void) => schedule(openDelayMs, run),
      close: (run: () => void) => schedule(closeDelayMs, run),
      cancel,
    }),
    [schedule, openDelayMs, closeDelayMs, cancel],
  );
}

export interface HoverDismissOptions {
  /** The host is what knows whether the box is open. Switched off, nothing is listened to. */
  readonly enabled: boolean;
  readonly onDismiss: () => void;
  readonly delayMs?: number;
}

/** "Leaving the box closes it", with two refusals. See docs/explanation/react.md#the-two-refusals-of-hover-dismiss */
export function useHoverDismiss(
  ref: RefObject<HTMLElement | null>,
  { enabled, onDismiss, delayMs = HOVER_CLOSE_DELAY_MS }: HoverDismissOptions,
): void {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const node = ref.current;
    if (node === null || !enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    /** A drag that STARTED inside. A slider taken outside must not close the box. */
    let dragging = false;

    const clear = (): void => {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
    };

    const onEnter = (): void => clear();

    const onLeave = (): void => {
      clear();
      timer = setTimeout(() => {
        timer = null;
        if (dragging) return;
        // The pointer does not close what the keyboard is using.
        if (node.contains(document.activeElement)) return;
        dismissRef.current();
      }, delayMs);
    };

    // CAPTURE phase, on the document: a slider that stops propagation would vanish from a bubble.
    const onDown = (event: MouseEvent): void => {
      dragging = event.target instanceof Node && node.contains(event.target);
    };
    const onUp = (): void => {
      dragging = false;
    };

    node.addEventListener('mouseenter', onEnter);
    node.addEventListener('mouseleave', onLeave);
    document.addEventListener('mousedown', onDown, true);
    window.addEventListener('mouseup', onUp);
    return () => {
      clear();
      node.removeEventListener('mouseenter', onEnter);
      node.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('mouseup', onUp);
    };
  }, [ref, enabled, delayMs]);
}
