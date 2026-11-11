'use client';

import { useEffect, useState } from 'react';

import { coins } from '@/lib/format';
import { useLive, useSocketEvent } from '../SocketProvider';
import { BetInput } from '../ui';
import { PlayingCard, TableLobby } from './TableLobby';

type Hand = { cards: string[]; total: number; bet: number; done: boolean; result?: string; won?: number };
type Seat = { userId: string | null; name: string; isBot: boolean; bet: number; hands: Hand[]; insurance: number };
type State = { id: string; isPrivate: boolean; phase: 'betting' | 'playing' | 'result'; deadline: number; turn: { seat: number; hand: number } | null; seats: Seat[]; dealer: string[]; dealerTotal: number | null };

const RESULT = { blackjack: 'Blackjack!', win: 'Gewonnen', push: 'Unentschieden', lose: 'Verloren' } as Record<string, string>;

export function Blackjack() {
  const { call, balance, me } = useLive();
  const [state, setState] = useState<State | null>(null);
  const [amount, setAmount] = useState(100);
  const [now, setNow] = useState(() => Date.now());

  useSocketEvent('bj:state', setState);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => {
      clearInterval(t);
      void call('bj:leave');
    };
  }, [call]);

  const enter = (r: { state: State } | null) => r && setState(r.state);

  if (!state) {
    return (
      <TableLobby
        game="bj"
        maxBots={3}
        onCreate={(opts) => call<{ state: State }>('bj:create', opts).then(enter)}
        onJoin={(id) => call<{ state: State }>('bj:join', { id }).then(enter)}
      />
    );
  }

  const meIndex = state.seats.findIndex((s) => s.userId === me.id);
  const mySeat = state.seats[meIndex];
  const myTurn = state.turn?.seat === meIndex;
  const myHand = myTurn ? mySeat.hands[state.turn!.hand] : null;
  const seconds = Math.max(0, Math.ceil((state.deadline - now) / 1000));
  const act = (action: string) => call('bj:action', { action });

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">Tisch <b className="font-mono text-slate-200">#{state.id}</b> {state.isPrivate && '(privat – Code teilen)'}</span>
        <button className="btn-ghost" onClick={() => call('bj:leave').then(() => setState(null))}>Tisch verlassen</button>
      </div>

      <div className="card bg-gradient-to-b from-emerald-950/50 to-panel text-center">
        <p className="label">Dealer {state.dealerTotal !== null && `· ${state.dealerTotal}`}</p>
        <div className="flex min-h-20 justify-center gap-2">{state.dealer.map((c, i) => <PlayingCard key={i} card={c} />)}</div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {state.seats.map((s, si) => (
            <div key={si} className={`rounded-xl border p-3 ${state.turn?.seat === si ? 'border-accent' : 'border-line'} ${s.userId === me.id ? 'bg-accent/5' : ''}`}>
              <p className="text-sm font-semibold">{s.name} {s.bet > 0 && <span className="font-mono text-amber-300">· {coins(s.bet)}</span>}</p>
              {s.hands.map((h, hi) => (
                <div key={hi} className="mt-2">
                  <div className="flex justify-center gap-1">{h.cards.map((c, i) => <PlayingCard key={i} card={c} />)}</div>
                  <p className="mt-1 text-xs text-muted">
                    {h.total} {h.result && <b className={h.result === 'lose' ? 'text-red-300' : 'text-emerald-300'}>· {RESULT[h.result]} {h.won ? `+${coins(h.won)}` : ''}</b>}
                  </p>
                </div>
              ))}
              {s.insurance > 0 && <p className="text-xs text-muted">Versichert: {coins(s.insurance)}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        {state.phase === 'betting' && !mySeat?.bet && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-60 flex-1"><BetInput value={amount} onChange={setAmount} balance={balance} /></div>
            <button className="btn-primary px-8" onClick={() => call('bj:bet', { amount })}>Setzen</button>
          </div>
        )}
        {state.phase === 'betting' && mySeat?.bet > 0 && <p className="text-center text-muted">Warte auf die anderen Spieler … {state.deadline > 0 && `${seconds}s`}</p>}
        {state.phase === 'playing' && !myTurn && <p className="text-center text-muted">{state.turn ? `${state.seats[state.turn.seat]?.name} ist dran …` : 'Dealer spielt …'}</p>}
        {myHand && (
          <div className="flex flex-wrap justify-center gap-2">
            <button className="btn-primary" onClick={() => act('hit')}>Karte</button>
            <button className="btn-ghost" onClick={() => act('stand')}>Halten</button>
            {myHand.cards.length === 2 && <button className="btn-ghost" onClick={() => act('double')}>Verdoppeln</button>}
            {myHand.cards.length === 2 && mySeat.hands.length === 1 && <button className="btn-ghost" onClick={() => act('split')}>Teilen</button>}
            {myHand.cards.length === 2 && state.dealer[0]?.[0] === 'A' && !mySeat.insurance && <button className="btn-ghost" onClick={() => act('insurance')}>Versichern</button>}
            <span className="self-center text-sm text-muted">{seconds}s</span>
          </div>
        )}
        {state.phase === 'result' && <p className="text-center text-muted">Neue Runde in {seconds}s …</p>}
      </div>
    </div>
  );
}
