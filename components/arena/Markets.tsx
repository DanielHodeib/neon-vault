'use client';

import { Check, ChevronDown, Clock, Plus, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { cancelMarket, createMarket, placeMarketBet, settleMarket } from '@/app/actions/markets';
import { coins } from '@/lib/format';
import { MARKET_FEE, MARKET_MIN_BET, marketOdds, type MarketOption } from '@/lib/markets';
import { FormButton } from '../FormButton';
import { useT } from '../I18n';
import { useLive, useSocketEvent } from '../SocketProvider';
import { ActionForm, Empty, SubmitButton, toastAction } from '../ui';

export type MarketView = {
  id: string;
  question: string;
  optionA: string;
  optionB: string;
  creator: string;
  mine: boolean; // I created it
  canSettle: boolean;
  closesAt: number;
  status: 'open' | 'settled' | 'cancelled';
  outcome: MarketOption | null;
  poolA: number;
  poolB: number;
  bettors: number;
  myA: number;
  myB: number;
};

const DURATIONS = [
  { label: '30 Min.', minutes: 30 },
  { label: '2 Std.', minutes: 120 },
  { label: '1 Tag', minutes: 1440 },
  { label: '3 Tage', minutes: 4320 },
  { label: '7 Tage', minutes: 10080 },
];

function timeLeft(ms: number, t: (s: string, v?: Record<string, string | number>) => string) {
  if (ms <= 0) return t('geschlossen');
  const m = Math.round(ms / 60_000);
  const days = Math.round(m / 1440);
  return m < 60 ? t('noch {n} Min.', { n: m }) : m < 1440 ? t('noch {n} Std.', { n: Math.round(m / 60) }) : days === 1 ? t('noch 1 Tag') : t('noch {n} Tage', { n: days });
}

/** Friendly bets: anyone asks a question with two answers, others bet, the creator settles. */
export function Markets({ open, done, now }: { open: MarketView[]; done: MarketView[]; now: number }) {
  const t = useT();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [minutes, setMinutes] = useState(1440);
  useSocketEvent('markets', () => router.refresh());

  return (
    <div className="space-y-4">
      <section className="card">
        <button onClick={() => setCreating(!creating)} className="flex w-full items-center justify-between text-left" aria-expanded={creating}>
          <span className="flex items-center gap-2 font-semibold">
            <Plus size={18} className="text-accent" /> {t('Neue Wette')}
          </span>
          <ChevronDown size={16} className={`text-muted transition ${creating ? 'rotate-180' : ''}`} />
        </button>
        {creating && (
          <ActionForm action={createMarket} className="mt-4 space-y-3">
            <div>
              <label className="label" htmlFor="m-q">{t('Frage')}</label>
              <input id="m-q" name="question" className="input" maxLength={120} required placeholder={t('z. B. Schafft Lisa heute die Million?')} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input name="optionA" className="input" maxLength={30} defaultValue={t('Ja')} aria-label={t('Antwort 1')} />
              <input name="optionB" className="input" maxLength={30} defaultValue={t('Nein')} aria-label={t('Antwort 2')} />
            </div>
            <div>
              <p className="label">{t('Einsätze bis')}</p>
              <input type="hidden" name="minutes" value={minutes} />
              <div className="flex flex-wrap gap-1.5">
                {DURATIONS.map((d) => (
                  <button key={d.minutes} type="button" className={minutes === d.minutes ? 'chip-active' : 'chip'} onClick={() => setMinutes(d.minutes)}>{t(d.label)}</button>
                ))}
              </div>
            </div>
            <SubmitButton className="btn-primary">{t('Wette eröffnen')}</SubmitButton>
            <p className="text-xs text-faint">{t('Du entscheidest am Ende, welche Antwort stimmt – setzen kannst du selbst nicht. Gewinner teilen den Pot (minus {fee} %).', { fee: MARKET_FEE * 100 })}</p>
          </ActionForm>
        )}
      </section>

      {open.length === 0 ? (
        <section className="panel">
          <Empty>{t('Noch keine offenen Wetten – eröffne die erste!')}</Empty>
        </section>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {open.map((m) => (
            <MarketCard key={m.id} m={m} now={now} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <section className="panel">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">{t('Entschieden')}</h2>
          <ul className="divide-y divide-line text-sm">
            {done.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0 truncate">{m.question}</span>
                <span className={`shrink-0 text-xs ${m.status === 'cancelled' ? 'text-faint' : 'text-win'}`}>
                  {m.status === 'cancelled' ? t('abgesagt') : `✓ ${m.outcome === 'A' ? m.optionA : m.optionB}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MarketCard({ m, now }: { m: MarketView; now: number }) {
  const t = useT();
  const { balance } = useLive();
  const [amount, setAmount] = useState(100);
  const [pending, start] = useTransition();
  const pot = m.poolA + m.poolB;
  const shareA = pot ? Math.round((m.poolA / pot) * 100) : 50;
  const closed = m.closesAt <= now;
  const bet = (o: MarketOption) => start(() => toastAction(placeMarketBet(m.id, o, amount)));

  const option = (o: MarketOption) => {
    const name = o === 'A' ? m.optionA : m.optionB;
    const odds = marketOdds(m.poolA, m.poolB, o);
    const myStake = o === 'A' ? m.myA : m.myB;
    return (
      <button
        disabled={pending || closed || m.mine || amount < MARKET_MIN_BET || amount > balance}
        onClick={() => bet(o)}
        className={`flex flex-1 flex-col items-center rounded-xl border px-2 py-2.5 transition disabled:opacity-60 ${o === 'A' ? 'border-sky-400/40 hover:bg-sky-400/10' : 'border-pink-400/40 hover:bg-pink-400/10'}`}
      >
        <span className="max-w-full truncate text-sm font-semibold">{name}</span>
        <span className="num text-xs text-muted">{odds ? `${odds.toFixed(2)}×` : t('noch leer')}</span>
        {myStake > 0 && <span className="num mt-0.5 text-[11px] text-accent">{t('du: {n}', { n: coins(myStake) })}</span>}
      </button>
    );
  };

  return (
    <article className="card space-y-3">
      <div>
        <p className="font-semibold leading-snug">{m.question}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>{t('von {name}', { name: m.creator })}</span>
          <span className="flex items-center gap-1"><Users size={12} /> {m.bettors}</span>
          <span className="flex items-center gap-1"><Clock size={12} /> {timeLeft(m.closesAt - now, t)}</span>
          <span className="num text-gold">{t('Pot {n}', { n: coins(pot) })}</span>
        </p>
      </div>
      {/* pot split between the two answers */}
      <div className="flex h-2 overflow-hidden rounded-full bg-raised">
        <span className="bg-sky-400 transition-[width] duration-500" style={{ width: `${pot ? shareA : 50}%`, opacity: pot ? 1 : 0.3 }} />
        <span className="bg-pink-400 transition-[width] duration-500" style={{ width: `${pot ? 100 - shareA : 50}%`, opacity: pot ? 1 : 0.3 }} />
      </div>
      <div className="flex gap-2">
        {option('A')}
        {option('B')}
      </div>
      {!m.mine && !closed && (
        <div className="flex items-center gap-2">
          <input type="number" min={MARKET_MIN_BET} className="input num h-9" value={amount} onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value))))} aria-label={t('Einsatz')} />
          <span className="text-xs whitespace-nowrap text-faint">{t('dann Antwort tippen')}</span>
        </div>
      )}
      {m.canSettle && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="text-xs text-muted">{t('Auflösen:')}</span>
          <FormButton action={settleMarket.bind(null, m.id, 'A')} confirm={t('„{a}“ als richtige Antwort festlegen?', { a: m.optionA })} className="btn-secondary h-8 text-xs">
            <Check size={13} /> {m.optionA}
          </FormButton>
          <FormButton action={settleMarket.bind(null, m.id, 'B')} confirm={t('„{a}“ als richtige Antwort festlegen?', { a: m.optionB })} className="btn-secondary h-8 text-xs">
            <Check size={13} /> {m.optionB}
          </FormButton>
          <FormButton action={cancelMarket.bind(null, m.id)} confirm={t('Wette absagen? Alle bekommen ihren Einsatz zurück.')} className="btn-ghost ml-auto h-8 text-xs">
            <X size={13} /> {t('Absagen')}
          </FormButton>
        </div>
      )}
    </article>
  );
}
