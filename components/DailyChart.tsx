'use client';

import { useState, type ReactNode } from 'react';

import { coins, gameName } from '@/lib/format';
import { useLang, useT } from './I18n';

type Day = { day: string; net: number; rounds: number; staked: number; won: number; topGame: string | null };

const signed = (n: number) => `${n > 0 ? '+' : ''}${coins(n)}`;

/** Net result per day as up/down bars; hovering (or tapping) a day shows its details. */
export function DailyChart({ days }: { days: Day[] }) {
  const t = useT();
  const lang = useLang();
  const [active, setActive] = useState<number | null>(null);
  const peak = Math.max(1, ...days.map((d) => Math.abs(d.net)));
  const date = (day: string, long = false) =>
    new Date(day).toLocaleDateString(lang === 'en' ? 'en-GB' : 'de-DE', long ? { weekday: 'long', day: 'numeric', month: 'long' } : undefined);
  const shown = active === null ? null : days[active];

  return (
    <div onMouseLeave={() => setActive(null)}>
      <div className="relative flex h-40 items-center gap-1">
        {days.map((d, i) => (
          <button
            key={d.day}
            type="button"
            aria-label={`${date(d.day)}: ${signed(d.net)} NVC`}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onClick={() => setActive(active === i ? null : i)}
            className={`flex h-full flex-1 flex-col justify-center rounded-md transition ${active === i ? 'bg-raised' : 'hover:bg-raised/60'}`}
          >
            <span className="flex h-1/2 w-full items-end px-0.5">
              {d.net > 0 && <span className="block w-full rounded-t bg-win/70" style={{ height: `${(d.net / peak) * 100}%` }} />}
            </span>
            <span className="block h-px w-full bg-line" />
            <span className="flex h-1/2 w-full items-start px-0.5">
              {d.net < 0 && <span className="block w-full rounded-b bg-loss/70" style={{ height: `${(-d.net / peak) * 100}%` }} />}
            </span>
          </button>
        ))}

        {shown && active !== null && (
          <div
            role="status"
            className="pointer-events-none absolute -top-2 z-10 w-52 -translate-y-full rounded-xl border border-line-strong bg-surface p-3 text-xs shadow-2xl shadow-black/50"
            // keep the box inside the chart near the edges
            style={{ left: `clamp(0px, calc(${((active + 0.5) / days.length) * 100}% - 6.5rem), calc(100% - 13rem))` }}
          >
            <p className="mb-2 font-semibold text-fg">{date(shown.day, true)}</p>
            {shown.rounds === 0 && shown.staked === 0 ? (
              <p className="text-muted">{t('An diesem Tag nicht gespielt.')}</p>
            ) : (
              <dl className="space-y-1">
                <Row label={t('Netto')} value={<span className={shown.net >= 0 ? 'text-win' : 'text-loss'}>{signed(shown.net)}</span>} />
                <Row label={t('Runden')} value={coins(shown.rounds)} />
                <Row label={t('Eingesetzt')} value={coins(shown.staked)} />
                <Row label={t('Ausgezahlt')} value={coins(shown.won)} />
                {shown.topGame && <Row label={t('Meist gespielt')} value={t(gameName(shown.topGame))} />}
              </dl>
            )}
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-faint">
        <span>{date(days[0].day)}</span>
        <span>{t('heute')}</span>
      </div>
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex justify-between gap-3">
    <dt className="text-muted">{label}</dt>
    <dd className="num font-medium text-fg">{value}</dd>
  </div>
);
