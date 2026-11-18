'use client';

import { useState } from 'react';

import { coins, gameName } from '@/lib/format';
import type { LedgerRow } from '@/lib/stats';
import { useLang, useT } from '../I18n';
import { Empty } from '../ui';

const KIND: Record<string, { label: string; icon: string }> = {
  BET: { label: 'Einsatz', icon: '🎲' },
  WIN: { label: 'Gewinn', icon: '🏆' },
  CANCEL: { label: 'Einsatz zurück', icon: '↩️' },
  REFUND: { label: 'Cashback', icon: '💸' },
  BUYIN: { label: 'Buy-in', icon: '🪙' },
  CASHOUT: { label: 'Auszahlung', icon: '🪙' },
  FAUCET: { label: 'Bonus', icon: '🎁' },
  QUEST: { label: 'Quest', icon: '🎯' },
  TRANSFER: { label: 'Überweisung', icon: '🤝' },
  RAIN: { label: 'Rain', icon: '🌧️' },
  ADMIN: { label: 'Team', icon: '🛠️' },
  BONUS: { label: 'Belohnung', icon: '⭐' },
  SHOP: { label: 'Shop', icon: '🛍️' },
};
const FILTERS = [
  { key: 'all', label: 'Alles' },
  { key: 'win', label: 'Gewinne' },
  { key: 'loss', label: 'Einsätze & Käufe' },
  { key: 'other', label: 'Boni & Sonstiges' },
] as const;
const isGame = (k: string) => ['BET', 'WIN', 'CANCEL', 'BUYIN', 'CASHOUT'].includes(k);

/** The last bookings, filterable; every line shows what it was, where, and how much. */
export function Ledger({ rows }: { rows: LedgerRow[] }) {
  const t = useT();
  const lang = useLang();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const shown = rows.filter((r) => (filter === 'all' ? true : filter === 'win' ? r.kind === 'WIN' : filter === 'loss' ? r.amount < 0 : r.amount > 0 && r.kind !== 'WIN'));
  const fmt = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return (
    <div>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-line px-4 py-3">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key} className={filter === f.key ? 'chip-active' : 'chip'}>
            {t(f.label)}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <Empty>Hier ist noch nichts.</Empty>
      ) : (
        <ul key={filter} className="stagger divide-y divide-line">
          {shown.map((r) => {
            const k = KIND[r.kind] ?? { label: r.kind, icon: '•' };
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-raised text-base">{k.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {t(k.label)}
                    {r.game && isGame(r.kind) && <span className="font-normal text-muted"> · {t(gameName(r.game))}</span>}
                    {r.kind === 'SHOP' && r.note && <span className="font-normal text-muted"> · {t(r.note)}</span>}
                  </span>
                  <span className="text-xs text-faint">{fmt.format(r.at)}</span>
                </span>
                <span className={`num shrink-0 ${r.amount >= 0 ? 'text-win' : 'text-loss'}`}>
                  {r.amount > 0 ? '+' : ''}
                  {coins(r.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
