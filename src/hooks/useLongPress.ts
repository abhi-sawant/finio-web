import { useCallback, useRef } from 'react';

const DEFAULT_DELAY = 500;

/**
 * Pointer handlers that fire `onLongPress` after holding for `delay` ms. `firedRef` flips to
 * true right when it fires — check it in the element's own click handler and swallow the click
 * that the same press/release still generates, or a long-press would also navigate/submit.
 */
export function useLongPress(onLongPress: () => void, delay = DEFAULT_DELAY) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const start = useCallback(() => {
    firedRef.current = false;
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, delay);
  }, [onLongPress, delay]);

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  return {
    firedRef,
    handlers: {
      onPointerDown: start,
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
    },
  };
}
