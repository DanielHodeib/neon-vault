'use client';

import { useEffect, useRef } from 'react';

/** Calls `fn(next, prev)` whenever `key` changes after the first render, e.g. to play a sound on a phase change. */
export function useCue<T>(key: T, fn: (next: T, prev: T) => void) {
  const prev = useRef(key);
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    if (prev.current !== key) latest.current(key, prev.current);
    prev.current = key;
  }, [key]);
}
