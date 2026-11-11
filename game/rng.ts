import { randomInt } from 'node:crypto';

/** Uniform float in [0, 1) from a CSPRNG. */
export const rand = () => randomInt(2 ** 48 - 1) / 2 ** 48;
export const randInt = (max: number) => randomInt(max);
export const pick = <T>(items: readonly T[]) => items[randomInt(items.length)];

export function shuffle<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export const id = () => randomInt(36 ** 6).toString(36).padStart(6, '0');
