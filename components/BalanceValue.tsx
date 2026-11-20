'use client';

import { useState } from 'react';
import { coins } from '@/lib/format';
import { useCountUp } from './useCountUp';

/** Header balance: counts to the new value and flashes green or red on a change. */
export function BalanceValue({ value }: { value: number }) {
  const shown = useCountUp(value, 700);
  const [last, setLast] = useState(value);
  const [flash, setFlash] = useState<{ up: boolean; n: number } | null>(null);
  if (value !== last) {
    // derived from the previous render, so no effect is needed
    setLast(value);
    setFlash((f) => ({ up: value > last, n: (f?.n ?? 0) + 1 }));
  }
  return (
    <span key={flash?.n} className={`num truncate text-sm font-semibold text-gold ${flash ? (flash.up ? 'balance-up' : 'balance-down') : ''}`}>
      {coins(shown)}
    </span>
  );
}
