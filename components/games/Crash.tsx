'use client';

import { useCallback, useEffect, useState } from 'react';

import { coins } from '@/lib/format';
import { multiplierAt } from '@/lib/games';
import { useJoin, useLive, useSocketEvent } from '../SocketProvider';
import { BetInput } from '../ui';

type Bet = { userId: string; username: string; amount: number; cashedAt: number | null };
type State = { id: number; phase: 'waiting' | 'running' | 'crashed'; startsAt: number; startedAt: number; multiplier: number; point: number | null; history: number[]; bets: Bet[] };

const W = 600;
const H = 300;

export function Crash({ variant = 'rocket' }: { variant?: 'rocket' | 'aviator' }) {
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

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);

  if (!state) return <p className="text-muted">Verbinde …</p>;

  const myBet = state.bets.find((b) => b.userId === me.id);
  const crashed = state.phase === 'crashed';
  const countdown = Math.max(0, (state.startsAt - now) / 1000);

  // Curve: sample the shared formula up to the current multiplier.
  const elapsed = Math.log(Math.max(multiplier, 1)) / 0.00006;
  const maxT = Math.max(elapsed, 10_000);
  const maxM = Math.max(multiplier, 2);
  const points = Array.from({ length: 40 }, (_, i) => {
    const t = (elapsed * i) / 39;
    return [(t / maxT) * W, H - ((multiplierAt(t) - 1) / (maxM - 1)) * (H - 20)];
  });
  const [tipX, tipY] = points.at(-1)!;
  const color = crashed ? '#ef4444' : variant === 'aviator' ? '#f43f5e' : 'var(--accent)';

  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <div className="flex gap-2 overflow-x-auto">
          {state.history.map((h, i) => (
            <span key={i} className={`rounded-full px-3 py-1 font-mono text-xs ${h >= 2 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>
              {h.toFixed(2)}×
            </span>
          ))}
        </div>

        <div className={`card relative overflow-hidden p-0 ${variant === 'aviator' ? 'bg-gradient-to-b from-rose-950/40 to-panel' : ''}`}>
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-72 w-full">
            {state.phase !== 'waiting' && (
              <>
                <polyline points={points.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={4} />
                <text x={tipX} y={tipY} fontSize={34} textAnchor="middle" dominantBaseline="middle">
                  {crashed ? '💥' : variant === 'aviator' ? '✈️' : '🚀'}
                </text>
              </>
            )}
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div className="text-center">
              {state.phase === 'waiting' ? (
                <>
                  <p className="text-sm text-muted">Nächste Runde in</p>
                  <p className="font-mono text-5xl font-black">{countdown.toFixed(1)}s</p>
                </>
              ) : (
                <p className={`font-mono text-6xl font-black ${crashed ? 'text-red-400' : 'glow'}`}>{multiplier.toFixed(2)}×</p>
              )}
              {crashed && <p className="mt-1 text-sm text-red-300">Abgestürzt!</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card space-y-3">
          <BetInput value={amount} onChange={setAmount} balance={balance} />
          <div>
            <label className="label">Auto-Cashout (optional)</label>
            <input className="input font-mono" type="number" step="0.1" min="1.01" placeholder="z. B. 2.0" value={auto} onChange={(e) => setAuto(e.target.value)} />
          </div>
          {state.phase === 'running' && myBet && !myBet.cashedAt ? (
            <button className="btn-primary w-full py-4 text-lg" onClick={() => call('crash:cashout')}>
              Cashout {coins(Math.floor(myBet.amount * multiplier))}
            </button>
          ) : state.phase === 'waiting' && myBet ? (
            <button className="btn-ghost w-full py-4" onClick={() => call('crash:cancel')}>Einsatz zurückziehen</button>
          ) : (
            <button
              className="btn-primary w-full py-4 text-lg"
              disabled={state.phase !== 'waiting'}
              onClick={() => call('crash:bet', { amount, auto: auto ? Number(auto) : null })}
            >
              {state.phase === 'waiting' ? 'Setzen' : 'Warte auf nächste Runde'}
            </button>
          )}
          {myBet?.cashedAt && <p className="text-center text-sm text-emerald-300">Ausgestiegen bei {myBet.cashedAt.toFixed(2)}×</p>}
        </div>

        <div className="card">
          <p className="label">Spieler dieser Runde ({state.bets.length})</p>
          <ul className="space-y-1 text-sm">
            {state.bets.map((b) => (
              <li key={b.userId} className="flex justify-between">
                <span>{b.username}</span>
                <span className={`font-mono ${b.cashedAt ? 'text-emerald-300' : crashed ? 'text-red-300' : ''}`}>
                  {b.cashedAt ? `${b.cashedAt.toFixed(2)}× +${coins(Math.floor(b.amount * b.cashedAt))}` : coins(b.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
