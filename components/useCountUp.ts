'use client';

import { useEffect, useRef, useState } from 'react';

/** Number that glides from its last shown value to `target` (ease-out); 0 shows at once. */
export function useCountUp(target: number, ms = 800) {
  const [value, setValue] = useState(target);
  const shown = useRef(target);
  useEffect(() => {
    if (target === 0) {
      shown.current = 0; // reset instantly (e.g. a new slot spin): the next value counts up from zero
      return;
    }
    const from = shown.current;
    if (from === target) return;
    const start = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const p = Math.min(1, (now - start) / ms);
      shown.current = Math.round(from + (target - from) * (1 - (1 - p) ** 3));
      setValue(shown.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return target === 0 ? 0 : value;
}
