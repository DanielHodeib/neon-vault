'use client';

import { useT } from '@/components/I18n';
import { coins } from '@/lib/format';
import { lineCount, type Machine } from '@/lib/slots';
import { Section } from '../ui';
import { pct, Stat } from './SlotsParts';

export type SlotsSession = { spins: number; bet: number; won: number; best: number };
export type SlotsHistory = { id: number; machine: string; win: number; mult: number }[];

/** Paytable of the chosen machine plus this session's numbers. */
export function SlotsInfo({ machine, amount, session, history }: { machine: Machine; amount: number; session: SlotsSession; history: SlotsHistory }) {
  const t = useT();
  const lineBet = amount / lineCount(machine);
  const totalWeight = machine.symbols.reduce((sum, x) => sum + x.weight, 0);
  return (
    <>
    <Section title={t('Gewinntabelle')} action={<span className="text-xs text-muted">{t('bei {n} NVC Einsatz', { n: coins(amount) })}</span>} pad>
      <p className="mb-3 text-sm text-muted">{t(machine.feature)}</p>
      <p className="mb-2 text-[11px] text-faint">{t('Prozent = Chance, dass ein Feld dieses Symbol zeigt.')}</p>
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {[...machine.symbols].reverse().map((s) => (
          <li key={s.icon} className="flex items-center gap-3 text-sm">
            <span className="w-8 text-center text-2xl">{s.icon}</span>
            <span className="num w-12 shrink-0 text-right text-[11px] text-faint" title={t('Chance pro Feld')}>{pct((s.weight / totalWeight) * 100)} %</span>
            <span className="min-w-0 flex-1 text-xs text-muted">
              {s.mystery ? t('Mystery – alle werden zum selben Symbol') : s.wild && !s.pays ? t('Wild – ersetzt alle Symbole') : (
                <>
                  {s.wild && <span className="text-gold">Wild{s.scatter && ' + Scatter'} · </span>}
                  {s.scatter && !s.wild && <span className="text-gold">Scatter · </span>}
                  {Object.entries(s.pays ?? {}).map(([n, p]) => (
                    <span key={n} className="mr-2 whitespace-nowrap">
                      {n}× <span className="num text-fg">{coins(Math.floor(s.scatter ? p * amount : machine.lines ? p * lineBet : (p * amount) / machine.waysDivisor!))}</span>
                    </span>
                  ))}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>
      {!machine.lines && <p className="mt-3 text-xs text-faint">{t('Werte pro Weg. Mehrere gleiche Symbole auf einer Walze multiplizieren die Wege.')}</p>}
    </Section>
    {session.spins > 0 && (
      <Section title={t('Diese Sitzung')} pad>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Spins" value={String(session.spins)} />
          <Stat label="Eingesetzt" value={coins(session.bet)} />
          <Stat label="Gewonnen" value={coins(session.won)} />
          <Stat label="Bester Treffer" value={coins(session.best)} />
        </dl>
        {history.length > 0 && (
          <ul className="mt-4 divide-y divide-line text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex justify-between py-2">
                <span className="text-muted">{h.machine}</span>
                <span>
                  <span className="num text-win">+{coins(h.win)}</span> <span className="text-xs text-faint">{h.mult.toFixed(1)}×</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    )}
    </>
  );
}
