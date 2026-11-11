'use client';

import { useCallback, useEffect, useState } from 'react';

import { coins } from '@/lib/format';
import { multiplierAt } from '@/lib/games';
import { useJoin, useLive, useSocketEvent } from '../SocketProvider';
import { BetInput, Empty } from '../ui';
import { GameFrame } from './GameFrame';
import { sound } from './sound';
import { useCue } from './useCue';
import { useT } from '@/components/I18n';

type Bet = { userId: string; username: string; amount: number; cashedAt: number | null };
type State = { id: number; phase: 'waiting' | 'running' | 'crashed'; startsAt: number; startedAt: number; multiplier: number; point: number | null; history: number[]; bets: Bet[] };

const W = 600;
const H = 300;

export function Crash() {
  const t = useT();
  const { call, balance, me } = useLive();
  const [state, setState] = useState<State | null>(null);
  const [multiplier, setMultiplier] = useState(1);
  const [amount, setAmount] = useState(100);
  const [auto, setAuto] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const onState = useCallback((s: State) => {
    setState(s);
    setMultiplier(s.phase === 'crashed' ? (s.point ?? s.multiplier) : s.multiplier);
  }, []);
  useSocketEvent('crash:state', onState);
  useSocketEvent('crash:tick', setMultiplier);
  useJoin<{ state: State }>('crash:join', useCallback((r) => onState(r.state), [onState]));

  const mine = state?.bets.find((b) => b.userId === me.id);
  useCue(`${state?.phase}|${mine ? 'bet' : ''}|${mine?.cashedAt ?? ''}`, (next, prev) => {
    const [phase, bet, cashed] = next.split('|');
    if (cashed && !prev.endsWith(`|${cashed}`)) sound.win(1);
    else if (phase !== prev.split('|')[0]) {
      if (phase === 'running') sound.start();
      if (phase === 'crashed') (bet && !cashed ? sound.bomb : sound.stop)();
    }
  });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  if (!state) return <GameFrame title="Crash" stage={<div className="panel aspect-[2/1] animate-pulse" />} controls={null} />;

  const myBet = state.bets.find((b) => b.userId === me.id);
  const crashed = state.phase === 'crashed';
  const countdown = Math.max(0, (state.startsAt - now) / 1000);

  // Curve: sample the shared formula up to the current multiplier.
  const elapsed = Math.log(Math.max(multiplier, 1)) / 0.00006;
  const maxT = Math.max(elapsed, 10_000);
  const maxM = Math.max(multiplier, 2);
  const points = Array.from({ length: 48 }, (_, i) => {
    const t = (elapsed * i) / 47;
    return [(t / maxT) * W, H - ((multiplierAt(t) - 1) / (maxM - 1)) * (H - 24)];
  });
  const [tipX, tipY] = points.at(-1)!;
  const stroke = crashed ? 'var(--color-loss)' : 'var(--accent)';
  const path = points.map((p) => p.join(',')).join(' ');

  const stage = (
    <div className="space-y-3">
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {state.history.map((h, i) => (
          <span key={i} className={`num shrink-0 rounded-md px-2 py-1 text-xs ${h >= 2 ? 'bg-win/10 text-win' : 'bg-raised text-muted'}`}>
            {h.toFixed(2)}×
          </span>
        ))}
      </div>
      <div className="panel relative overflow-hidden">
        <svg viewBox={`0 0 ${W} ${H}`} className="block aspect-[2/1] w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="crash-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={stroke} stopOpacity="0.25" />
              <stop offset="1" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((y) => (
            <line key={y} x1="0" x2={W} y1={H * y} y2={H * y} stroke="var(--color-line)" strokeDasharray="4 6" />
          ))}
          {state.phase !== 'waiting' && (
            <>
              <polygon points={`0,${H} ${path} ${tipX},${H}`} fill="url(#crash-fill)" />
              <polyline points={path} fill="none" stroke={stroke} strokeWidth={3} vectorEffect="non-scaling-stroke" />
              <circle cx={tipX} cy={tipY} r={6} fill={stroke} />
            </>
          )}
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          {state.phase === 'waiting' ? (
            <div className="text-center">
              <p className="text-sm text-muted">{t('Nächste Runde startet in')}</p>
              <p className="num mt-1 text-4xl font-semibold sm:text-5xl">{countdown.toFixed(1)}s</p>
            </div>
          ) : (
            <div className="text-center">
              <p className={`num text-5xl font-semibold tracking-tight sm:text-7xl ${crashed ? 'text-loss' : ''}`}>{multiplier.toFixed(2)}×</p>
              {crashed && <p className="mt-1 text-sm text-loss">{t('Abgestürzt')}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const controls = (
    <div className="card space-y-4">
      <BetInput value={amount} onChange={setAmount} balance={balance} />
      <div>
        <label className="label">{t('Automatisch aussteigen bei')}</label>
        <input className="input num" type="number" inputMode="decimal" step="0.1" min="1.01" placeholder="z. B. 2,00" value={auto} onChange={(e) => setAuto(e.target.value)} />
      </div>
      {state.phase === 'running' && myBet && !myBet.cashedAt ? (
        <button className="btn-primary h-12 w-full text-base" onClick={() => call('crash:cashout')}>
          {t('Auszahlen')} · <span className="num">{coins(Math.floor(myBet.amount * multiplier))}</span>
        </button>
      ) : state.phase === 'waiting' && myBet ? (
        <button className="btn-secondary h-12 w-full" onClick={() => call('crash:cancel')}>{t('Einsatz zurückziehen')}</button>
      ) : (
        <button className="btn-primary h-12 w-full text-base" disabled={state.phase !== 'waiting'} onClick={() => call('crash:bet', { amount, auto: auto ? Number(auto.replace(',', '.')) : null })}>
          {state.phase === 'waiting' ? t('Einsatz platzieren') : t('Nächste Runde abwarten')}
        </button>
      )}
      {myBet?.cashedAt && <p className="text-center text-sm text-win">{t('Ausgestiegen bei {x}×', { x: myBet.cashedAt.toFixed(2) })}</p>}
    </div>
  );

  const extra = (
    <div className="panel">
      <p className="border-b border-line px-4 py-3 text-sm font-semibold">{t('Diese Runde · {n} Spieler', { n: state.bets.length })}</p>
      {state.bets.length === 0 ? (
        <Empty>{t('Noch keine Einsätze.')}</Empty>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {state.bets.map((b) => (
            <li key={b.userId} className="flex justify-between px-4 py-2.5">
              <span>{b.username}</span>
              <span className={`num ${b.cashedAt ? 'text-win' : crashed ? 'text-loss' : 'text-muted'}`}>
                {b.cashedAt ? `${b.cashedAt.toFixed(2)}× · +${coins(Math.floor(b.amount * b.cashedAt))}` : coins(b.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return <GameFrame title="Crash" subtitle={t('Steig aus, bevor der Multiplikator crasht.')} stage={stage} controls={controls} extra={extra} />;
}
