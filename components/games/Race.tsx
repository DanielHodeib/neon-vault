'use client';

import { Flag } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { coins } from '@/lib/format';
import { HORSES, RACE_RUN_MS, racePosition } from '@/lib/race';
import { useJoin, useLive, useSocketEvent } from '../SocketProvider';
import { BetInput, Empty } from '../ui';
import { GameFrame } from './GameFrame';
import { NameDot, Reactions } from './Reactions';
import { sound } from './sound';
import { useCue } from './useCue';
import { useT } from '@/components/I18n';

type Bet = { horse: number; amount: number };
type State = {
  phase: 'betting' | 'racing' | 'result';
  endsAt: number;
  field: { chance: number; odds: number }[];
  seeds: number[];
  winner: number | null;
  finish: number[] | null;
  history: number[];
  players: { userId: string; username: string; bets: Bet[] }[];
};

const pct = (p: number) => `${(p * 100).toLocaleString('de-DE', { maximumFractionDigits: 0 })} %`;
const odds = (o: number) => `${o.toLocaleString('de-DE')}×`;

export function Race() {
  const t = useT();
  const { call, balance, me } = useLive();
  const [state, setState] = useState<State | null>(null);
  const [amount, setAmount] = useState(100);
  const [now, setNow] = useState(() => Date.now());

  useJoin<{ state: State }>('race:join', useCallback((r) => setState(r.state), []));
  useSocketEvent('race:state', setState);

  // Smooth frames while racing, a slow tick otherwise (countdown).
  const racing = state?.phase === 'racing';
  useEffect(() => {
    if (racing) {
      let frame = requestAnimationFrame(function tick() {
        setNow(Date.now());
        frame = requestAnimationFrame(tick);
      });
      return () => cancelAnimationFrame(frame);
    }
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [racing]);

  const myBets = state?.players.find((p) => p.userId === me.id)?.bets ?? [];
  useCue(state?.phase, (phase) => {
    if (phase === 'racing') sound.start();
    if (phase === 'result' && state?.winner != null) (myBets.some((b) => b.horse === state.winner) ? () => sound.win(2) : sound.stop)();
  });

  if (!state) return <GameFrame title="Pferderennen" stage={<div className="panel aspect-[2/1] animate-pulse" />} controls={null} />;

  const open = state.phase === 'betting';
  const seconds = Math.max(0, Math.ceil((state.endsAt - now) / 1000));
  const elapsed = state.phase === 'racing' ? RACE_RUN_MS - (state.endsAt - now) : state.phase === 'result' ? RACE_RUN_MS : 0;
  const onHorse = (i: number) => myBets.filter((b) => b.horse === i).reduce((s, b) => s + b.amount, 0);
  const position = (i: number) => (state.finish ? racePosition(Math.max(0, elapsed), state.finish[i], state.seeds[i]) : 0);
  const leader = state.finish ? HORSES.map((_, i) => i).sort((a, b) => position(b) - position(a))[0] : null;

  const stage = (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 text-sm">
        <span className="font-medium">
          {open ? t('Einsätze offen · Start in {n}s', { n: seconds }) : state.phase === 'racing' ? t('Das Rennen läuft!') : t('Sieger: {name}', { name: HORSES[state.winner!].name })}
        </span>
        <span className="flex gap-1">
          {state.history.slice(0, 8).map((h, i) => (
            <span key={i} className="h-3 w-3 rounded-full" style={{ background: HORSES[h].color }} title={HORSES[h].name} />
          ))}
        </span>
      </div>
      <div className="space-y-1.5 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,.02)_0_40px,transparent_40px_80px)] p-3 sm:p-4">
        {HORSES.map((h, i) => {
          const won = state.phase === 'result' && state.winner === i;
          return (
            <div key={h.name} className="flex items-center gap-2">
              <span className={`w-16 shrink-0 truncate text-xs font-semibold ${leader === i && racing ? 'text-gold' : won ? 'text-gold' : 'text-fg/70'}`}>{h.name}</span>
              <div className={`relative h-10 flex-1 rounded-lg border sm:h-11 ${won ? 'border-gold bg-gold/10' : 'border-line bg-bg/60'}`}>
                <span className="absolute inset-y-0 right-3 w-px border-r-2 border-dashed border-white/25" />
                {/* The token runs from the start (left) to the finish line (right). */}
                <span
                  className="absolute top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-base shadow"
                  style={{ background: h.color, left: `calc((100% - 2.75rem) * ${position(i)} + 0.25rem)` }}
                >
                  🏇
                </span>
                {won && <Flag size={14} className="absolute top-1 right-4 text-gold" />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const controls = (
    <div className="card space-y-4">
      <BetInput value={amount} onChange={setAmount} balance={balance} />
      <div className="space-y-1.5">
        {HORSES.map((h, i) => {
          const f = state.field[i];
          return (
            <button
              key={h.name}
              disabled={!open || amount < 1}
              onClick={() => call('race:bet', { horse: i, amount })}
              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition hover:bg-raised disabled:opacity-60 ${
                state.phase === 'result' && state.winner === i ? 'border-gold' : 'border-line'
              }`}
            >
              <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: h.color }} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{h.name}</span>
                <span className="block text-[11px] text-muted">{onHorse(i) ? t('Gesetzt: {n}', { n: coins(onHorse(i)) }) : `Chance ${pct(f.chance)}`}</span>
              </span>
              <span className="num text-sm font-semibold text-gold">{odds(f.odds)}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-faint">{t('Quoten ändern sich jede Runde. Gewinnt dein Pferd, bekommst du Einsatz × Quote.')}</p>
    </div>
  );

  const extra = (
    <div className="panel">
      <p className="border-b border-line px-4 py-3 text-sm font-semibold">{t('Wetten dieser Runde')}</p>
      {state.players.length === 0 ? (
        <Empty>{t('Noch keine Wetten.')}</Empty>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {state.players.map((p) => (
            <li key={p.userId} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className={`flex min-w-0 items-center gap-2 ${p.userId === me.id ? 'text-accent' : ''}`}>
                <NameDot name={p.username} /> <span className="truncate">{p.username}</span>
              </span>
              <span className="flex flex-wrap justify-end gap-1">
                {p.bets.map((b, i) => (
                  <span key={i} className="num rounded px-1.5 py-px text-[11px]" style={{ background: `${HORSES[b.horse].color}40` }}>
                    {HORSES[b.horse].name} {coins(b.amount)}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return <GameFrame title="Pferderennen" subtitle={t('Alle wetten, ein Rennen, live.')} stage={<Reactions room="race">{stage}</Reactions>} controls={controls} extra={extra} />;
}
