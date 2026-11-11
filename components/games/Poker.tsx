'use client';

import { useCallback, useEffect, useState } from 'react';

import { coins } from '@/lib/format';
import { useJoin, useLive, useSocketEvent } from '../SocketProvider';
import { PlayingCard, TableLobby } from './TableLobby';

type Seat = { name: string; isBot: boolean; isMe: boolean; stack: number; bet: number; folded: boolean; allIn: boolean; cards: string[] };
type State = {
  id: string;
  isPrivate: boolean;
  phase: string;
  board: string[];
  button: number;
  toAct: number;
  currentBet: number;
  minRaise: number;
  deadline: number;
  pot: number;
  results: { name: string; won: number; hand?: string }[];
  seats: Seat[];
};

const PHASE: Record<string, string> = { waiting: 'Warte auf Spieler', preflop: 'Pre-Flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };

export function Poker() {
  const { call, me } = useLive();
  const [state, setState] = useState<State | null>(null);
  const [buyIn, setBuyIn] = useState(10_000);
  const [raise, setRaise] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useJoin<{ state: State | null }>('poker:watch', useCallback((r) => setState(r.state), []));
  useSocketEvent('poker:state', setState);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const meIndex = state?.seats.findIndex((s) => s.isMe) ?? -1;
  const mySeat = state?.seats[meIndex];

  if (!state || !mySeat) {
    return (
      <TableLobby
        game="poker"
        maxBots={5}
        extra={
          <div>
            <label className="label">Buy-in (1.000 – 1.000.000)</label>
            <input className="input font-mono" type="number" min={1000} value={buyIn} onChange={(e) => setBuyIn(Math.floor(Number(e.target.value)))} />
          </div>
        }
        onCreate={(opts) => call('poker:create', { ...opts, buyIn })}
        onJoin={(id) => call('poker:join', { id, buyIn })}
      />
    );
  }

  const myTurn = state.toAct === meIndex;
  const toCall = state.currentBet - mySeat.bet;
  const seconds = Math.max(0, Math.ceil((state.deadline - now) / 1000));
  const raiseTo = raise ?? state.currentBet + state.minRaise;
  const act = (type: string, to?: number) => {
    setRaise(null);
    return call('poker:action', to ? { type, to } : { type });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">
          Tisch <b className="font-mono text-slate-200">#{state.id}</b> {state.isPrivate && '(privat)'} · Blinds 50/100 · {me.username}
        </span>
        <button className="btn-ghost" onClick={() => call('poker:leave').then(() => setState(null))}>Aufstehen & auszahlen</button>
      </div>

      <div className="card bg-gradient-to-b from-emerald-950/50 to-panel text-center">
        <p className="label">{PHASE[state.phase]} · Pot <span className="font-mono text-amber-300">{coins(state.pot)}</span></p>
        <div className="my-4 flex min-h-20 justify-center gap-2">{state.board.map((c, i) => <PlayingCard key={i} card={c} />)}</div>
        {state.results.length > 0 && (
          <p className="mb-4 text-emerald-300">
            {state.results.map((r) => `${r.name} gewinnt ${coins(r.won)}${r.hand ? ` (${r.hand})` : ''}`).join(' · ')}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {state.seats.map((s, i) => (
            <div key={i} className={`rounded-xl border p-3 ${state.toAct === i ? 'border-accent' : 'border-line'} ${s.folded ? 'opacity-40' : ''} ${s.isMe ? 'bg-accent/5' : ''}`}>
              <p className="text-sm font-semibold">
                {s.name} {state.button === i && <span className="rounded-full bg-white px-1.5 text-[10px] text-slate-900">D</span>}
              </p>
              <p className="font-mono text-xs text-amber-300">{coins(s.stack)} {s.allIn && <span className="text-red-300">ALL-IN</span>}</p>
              <div className="mt-2 flex justify-center gap-1">{s.cards.map((c, j) => <PlayingCard key={j} card={c} />)}</div>
              {s.bet > 0 && <p className="mt-1 text-xs">Einsatz: {coins(s.bet)}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        {myTurn ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button className="btn-ghost" onClick={() => act('fold')}>Fold</button>
            {toCall === 0 ? (
              <button className="btn-primary" onClick={() => act('check')}>Check</button>
            ) : (
              <button className="btn-primary" onClick={() => act('call')}>Call {coins(Math.min(toCall, mySeat.stack))}</button>
            )}
            <input className="input w-32 font-mono" type="number" value={raiseTo} onChange={(e) => setRaise(Math.floor(Number(e.target.value)))} />
            <button className="btn-ghost" onClick={() => act('raise', raiseTo)}>Raise auf</button>
            <button className="btn-danger" onClick={() => act('allin')}>All-in</button>
            <span className="text-sm text-muted">{seconds}s</span>
          </div>
        ) : (
          <p className="text-center text-muted">
            {state.phase === 'waiting' ? 'Warte auf mindestens 2 Spieler …' : state.toAct >= 0 ? `${state.seats[state.toAct]?.name} ist dran …` : 'Nächste Hand gleich …'}
          </p>
        )}
      </div>
    </div>
  );
}
