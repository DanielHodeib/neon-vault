'use client';

import { useCallback, useEffect, useState } from 'react';

import { coins } from '@/lib/format';
import { useJoin, useLive, useSocketEvent } from '../SocketProvider';
import { Felt, PlayingCard, TableBar, TableLobby } from './TableLobby';

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
  const { call } = useLive();
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
        title="Poker"
        subtitle="Texas Hold'em, Blinds 50/100. Dein Buy-in wird beim Aufstehen wieder ausgezahlt."
        game="poker"
        maxBots={5}
        extra={
          <div>
            <label className="label">Buy-in</label>
            <input className="input num" type="number" inputMode="numeric" min={1000} value={buyIn || ''} onChange={(e) => setBuyIn(Math.floor(Number(e.target.value)))} />
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
    <div>
      <TableBar id={state.id} isPrivate={state.isPrivate} info="Blinds 50/100" leaveLabel="Aufstehen & auszahlen" onLeave={() => call('poker:leave').then(() => setState(null))} />

      <Felt>
        <div className="text-center">
          <p className="eyebrow text-white/50">
            {PHASE[state.phase]} · Pot <span className="num text-gold">{coins(state.pot)}</span>
          </p>
          <div className="mt-3 flex min-h-[clamp(3rem,10vw,4.6rem)] justify-center gap-1.5">{state.board.map((c, i) => <PlayingCard key={i} card={c} />)}</div>
          {state.results.length > 0 && (
            <p className="mt-3 text-sm text-win">{state.results.map((r) => `${r.name} gewinnt ${coins(r.won)}${r.hand ? ` mit ${r.hand}` : ''}`).join(' · ')}</p>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:mt-8 sm:grid-cols-3 sm:gap-3">
          {state.seats.map((s, i) => (
            <div
              key={i}
              className={`rounded-xl border p-2.5 text-center transition sm:p-3 ${state.toAct === i ? 'border-accent bg-black/20' : 'border-white/10 bg-black/10'} ${s.folded ? 'opacity-40' : ''} ${s.isMe ? 'ring-1 ring-accent/30' : ''}`}
            >
              <p className="flex items-center justify-center gap-1.5 truncate text-xs font-medium text-white/80 sm:text-sm">
                {state.button === i && <span className="grid h-4 w-4 place-items-center rounded-full bg-white text-[9px] font-bold text-black">D</span>}
                {s.isBot && <span className="text-white/40">Bot ·</span>} {s.name}
              </p>
              <p className="num text-[11px] text-gold">
                {coins(s.stack)} {s.allIn && <span className="text-loss">· All-in</span>}
              </p>
              <div className="mt-2 flex justify-center -space-x-3 sm:-space-x-2">{s.cards.map((c, j) => <PlayingCard key={j} card={c} />)}</div>
              <p className="num mt-1 h-4 text-[11px] text-white/60">{s.bet > 0 && `Einsatz ${coins(s.bet)}`}</p>
            </div>
          ))}
        </div>
      </Felt>

      <div className="card mt-4">
        {myTurn ? (
          <div className="space-y-3">
            <p className="text-center text-xs text-muted">Du bist dran · <span className="num">{seconds}s</span></p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button className="btn-secondary" onClick={() => act('fold')}>Fold</button>
              {toCall === 0 ? (
                <button className="btn-primary" onClick={() => act('check')}>Check</button>
              ) : (
                <button className="btn-primary" onClick={() => act('call')}>Call <span className="num">{coins(Math.min(toCall, mySeat.stack))}</span></button>
              )}
              <button className="btn-danger col-span-2 sm:col-span-1 sm:order-last" onClick={() => act('allin')}>All-in</button>
              <div className="col-span-2 flex rounded-lg border border-line bg-bg sm:col-span-1">
                <input className="num h-10 w-full min-w-0 bg-transparent px-3 text-sm outline-none" type="number" inputMode="numeric" value={raiseTo} onChange={(e) => setRaise(Math.floor(Number(e.target.value)))} />
                <button className="border-l border-line px-3 text-sm font-medium" onClick={() => act('raise', raiseTo)}>Raise</button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-center text-sm text-muted">
            {state.phase === 'waiting' ? 'Warte auf mindestens zwei Spieler …' : state.toAct >= 0 ? `${state.seats[state.toAct]?.name} ist am Zug …` : 'Nächste Hand gleich …'}
          </p>
        )}
      </div>
    </div>
  );
}
