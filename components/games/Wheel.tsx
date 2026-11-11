'use client';

import { useCallback, useEffect, useState } from 'react';

import { coins } from '@/lib/format';
import { WHEEL_OPTIONS, WHEEL_SEGMENTS, wheelColor } from '@/lib/wheel';
import { useJoin, useLive, useSocketEvent } from '../SocketProvider';
import { BetInput, Empty } from '../ui';
import { GameFrame } from './GameFrame';

type Bet = { multiplier: number; amount: number };
type State = { phase: 'betting' | 'spinning' | 'result'; endsAt: number; index: number | null; history: number[]; players: { userId: string; username: string; bets: Bet[] }[] };

const SEG = 360 / WHEEL_SEGMENTS.length;
const WHEEL_BG = `conic-gradient(${WHEEL_SEGMENTS.map((m, i) => `${wheelColor(m)} ${i * SEG}deg ${(i + 1) * SEG - 0.6}deg, #0a0b0d ${(i + 1) * SEG - 0.6}deg ${(i + 1) * SEG}deg`).join(',')})`;
const label = (m: number) => `${String(m).replace('.', ',')}×`;

export function Wheel() {
  const { call, me, balance } = useLive();
  const [state, setState] = useState<State | null>(null);
  const [amount, setAmount] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const onState = useCallback((s: State) => {
    setState(s);
    // Spin so the winning segment ends under the pointer at the top.
    if (s.phase === 'spinning' && s.index !== null) {
      const index = s.index;
      setRotation((r) => r - (r % 360) + 360 * 6 + (360 - index * SEG - SEG / 2));
    }
  }, []);
  useJoin<{ state: State }>('wheel:join', useCallback((r) => onState(r.state), [onState]));
  useSocketEvent('wheel:state', onState);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  if (!state) return <GameFrame title="Glücksrad" stage={<div className="panel aspect-[2/1] animate-pulse" />} controls={null} />;

  const open = state.phase === 'betting';
  const result = state.index === null ? null : WHEEL_SEGMENTS[state.index];
  const seconds = Math.max(0, Math.ceil((state.endsAt - now) / 1000));
  const mine = state.players.find((p) => p.userId === me.id)?.bets ?? [];
  const onMine = (m: number) => mine.filter((b) => b.multiplier === m).reduce((s, b) => s + b.amount, 0);
  const bet = (multiplier: number) => void call('wheel:bet', { bets: [{ multiplier, amount }] });

  const stage = (
    <div className="panel space-y-5 p-4 sm:p-5">
      <div className="flex flex-col items-center gap-5 sm:flex-row">
        <div className="relative shrink-0">
          <div className="absolute -top-1 left-1/2 z-10 h-0 w-0 -translate-x-1/2 border-x-[8px] border-t-[14px] border-x-transparent border-t-fg" />
          <div
            className="h-56 w-56 rounded-full border-[6px] border-raised shadow-inner sm:h-64 sm:w-64"
            style={{ background: WHEEL_BG, transform: `rotate(${rotation}deg)`, transition: state.phase === 'spinning' ? 'transform 5.5s cubic-bezier(.12,.7,.2,1)' : 'none' }}
          />
          <div className="absolute inset-0 m-auto grid h-24 w-24 place-items-center rounded-full border border-line bg-surface">
            {state.phase === 'result' && result !== null ? (
              <span className="num text-3xl font-semibold" style={{ color: wheelColor(result) }}>{label(result)}</span>
            ) : (
              <span className="num text-xl text-muted">{state.phase === 'spinning' ? '…' : `${seconds}s`}</span>
            )}
          </div>
        </div>
        <div className="w-full min-w-0 text-center sm:text-left">
          <p className="text-sm font-medium">{open ? 'Einsätze offen' : state.phase === 'spinning' ? 'Das Rad dreht sich' : 'Ergebnis'}</p>
          <p className="text-xs text-muted">Setze auf einen Multiplikator – trifft er, bekommst du Einsatz × Multiplikator.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-1 sm:justify-start">
            {state.history.slice(0, 14).map((m, i) => (
              <span key={i} className="num grid h-7 min-w-9 place-items-center rounded-md px-1 text-[11px] font-semibold text-white" style={{ background: wheelColor(m) }}>{label(m)}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const controls = (
    <div className="card space-y-4">
      <BetInput value={amount} onChange={setAmount} balance={balance} />
      <div className="grid grid-cols-2 gap-2">
        {WHEEL_OPTIONS.map((o) => (
          <button
            key={o.multiplier}
            onClick={() => bet(o.multiplier)}
            disabled={!open || amount < 1}
            className={`rounded-lg border-2 px-3 py-2.5 text-left transition hover:brightness-125 disabled:opacity-50 ${result === o.multiplier && state.phase === 'result' ? 'ring-2 ring-fg' : ''}`}
            style={{ borderColor: o.color, background: `${o.color}26` }}
          >
            <span className="num block text-lg font-semibold">{label(o.multiplier)}</span>
            <span className="num block text-xs text-muted">{onMine(o.multiplier) ? `Gesetzt: ${coins(onMine(o.multiplier))}` : `${o.count} von 30 Feldern`}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const extra = (
    <div className="panel">
      <p className="border-b border-line px-4 py-3 text-sm font-semibold">Am Rad</p>
      {state.players.length === 0 ? (
        <Empty>Noch keine Einsätze in dieser Runde.</Empty>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {state.players.map((p) => (
            <li key={p.userId} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className={`truncate ${p.userId === me.id ? 'text-accent' : ''}`}>{p.username}</span>
              <span className="flex flex-wrap justify-end gap-1">
                {p.bets.map((b, i) => (
                  <span key={i} className="num rounded px-1.5 py-px text-[11px]" style={{ background: `${wheelColor(b.multiplier)}40` }}>
                    {label(b.multiplier)} {coins(b.amount)}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return <GameFrame title="Glücksrad" subtitle="Gemeinsames Rad · neue Runde alle 25 Sekunden" stage={stage} controls={controls} extra={extra} />;
}
