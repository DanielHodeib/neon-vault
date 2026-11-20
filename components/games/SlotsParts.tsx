'use client';

import { type ReactNode } from 'react';
import { coins } from '@/lib/format';
import { useT } from '@/components/I18n';
import { useCountUp } from '../useCountUp';

export function BigWin({ label, amount }: { label: string; amount: number }) {
  const t = useT();
  const value = useCountUp(amount, 2200);
  return (
    <span className="pop-in block text-center">
      <span className="slot-glow block text-sm font-bold tracking-[0.3em] text-gold uppercase">{label}</span>
      <span className="num mt-1 block text-4xl font-bold text-white sm:text-5xl">{coins(value)}</span>
      <span className="mt-2 block text-xs text-white/50">{t('Tippen zum Schließen')}</span>
    </span>
  );
}

export const Meter = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-semibold tracking-wider text-white/50 uppercase">{label}</p>
    <p className="num truncate text-sm text-white/85">{value}</p>
  </div>
);

export const Badge = ({ children }: { children: ReactNode }) => <span className="pop-in rounded-full bg-gold/15 px-2.5 py-1 font-medium text-gold">{children}</span>;

export const Odd = ({ label, value, hint }: { label: string; value: string; hint: string }) => (
  <div className="rounded-xl border border-line bg-surface px-3 py-2.5">
    <dt className="text-[11px] text-muted">{label}</dt>
    <dd className="num text-base font-semibold">{value}</dd>
    <dd className="truncate text-[11px] text-faint">{hint}</dd>
  </div>
);

export const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-xs text-muted">{label}</dt>
    <dd className="num font-medium">{value}</dd>
  </div>
);

export const pct = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
