'use client';

import { useCallback, useEffect, useState } from 'react';

import { coins } from '@/lib/format';
import { useJoin, useLive, useSocketEvent } from '../SocketProvider';
import { Felt, PlayingCard, TableBar, TableLobby } from './TableLobby';

type Seat = { name: string; isBot: boolean; isMe: boolean; stack: number; bet: number; folded: boolean; allIn: boolean; lastAction: string; hand: string | null; cards: string[] };
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
  log: string[];
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
  const between = state.phase === 'showdown' || state.phase === 'waiting';
  const broke = mySeat.stack < 100; // can't post a big blind any more
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
              {s.hand && <p className="mt-1 text-[11px] font-medium text-accent">{s.hand}</p>}
              <p className="mt-1 h-5">
                {s.lastAction && <span className="rounded bg-black/40 px-1.5 py-0.5 text-[11px] text-white/80">{s.lastAction}</span>}
              </p>
            </div>
          ))}
        </div>
      </Felt>

      <div className="card mt-4">
        {myTurn ? (
          <div className="space-y-3">
            <p className="text-center text-xs text-muted">
              {mySeat.hand && <span className="text-accent">{mySeat.hand} · </span>}Du bist dran · <span className="num">{seconds}s</span>
            </p>
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
        ) : between ? (
          <div className="space-y-3 text-center">
            {broke ? (
              <>
                <p className="text-sm text-muted">Deine Chips sind weg. Kauf nach, um weiterzuspielen.</p>
                <div className="mx-auto flex max-w-xs rounded-lg border border-line bg-bg">
                  <input className="num h-10 w-full min-w-0 bg-transparent px-3 text-sm outline-none" type="number" inputMode="numeric" min={1000} value={buyIn || ''} onChange={(e) => setBuyIn(Math.floor(Number(e.target.value)))} />
                  <button className="border-l border-line px-3 text-sm font-medium text-accent" onClick={() => call('poker:rebuy', { buyIn })}>Nachkaufen</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">{state.phase === 'showdown' ? `Nächste Hand startet in ${seconds}s` : 'Bereit für die nächste Hand.'}</p>
                <button className="btn-primary" onClick={() => call('poker:next')}>Nächste Hand starten</button>
              </>
            )}
          </div>
        ) : (
          <p className="text-center text-sm text-muted">
            {mySeat.hand && <span className="mr-2 text-accent">Deine Hand: {mySeat.hand} ·</span>}
            {state.toAct >= 0 ? `${state.seats[state.toAct]?.name} ist am Zug …` : 'Gleich geht es weiter …'}
          </p>
        )}
      </div>

      {state.log.length > 0 && (
        <div className="panel mt-4">
          <p className="border-b border-line px-4 py-2.5 text-sm font-semibold">Verlauf</p>
          <ul className="max-h-48 space-y-1 overflow-y-auto px-4 py-3 text-sm">
            {[...state.log].reverse().map((line, i) => (
              <li key={i} className={line.startsWith('—') ? 'text-faint' : line.includes('gewinnt') ? 'text-win' : 'text-muted'}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
