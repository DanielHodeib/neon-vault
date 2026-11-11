'use client';

import { useCallback, useSyncExternalStore } from 'react';

// Small per-browser UI preferences (collapsed sidebar, closed nav groups …) in localStorage.
// The server always renders the fallback; the stored value takes over right after hydration.
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const memory = new Map<string, string>(); // fallback when storage is blocked
const read = (key: string) => {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export function usePref(key: string, fallback: string) {
  const value = useSyncExternalStore(subscribe, () => read(key) ?? fallback, () => fallback);
  const set = useCallback(
    (next: string) => {
      memory.set(key, next);
      try {
        localStorage.setItem(key, next);
      } catch {
        // storage blocked: the choice lasts until the page reloads
      }
      listeners.forEach((fn) => fn());
    },
    [key],
  );
  return [value, set] as const;
}
