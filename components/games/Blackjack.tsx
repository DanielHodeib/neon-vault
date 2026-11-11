'use client';

import { useEffect, useState } from 'react';

import { coins } from '@/lib/format';
import { useLive, useSocketEvent } from '../SocketProvider';
import { BetInput } from '../ui';
import { sound } from './sound';
import { Felt, PlayingCard, TableBar, TableLobby } from './TableLobby';
import { useCue } from './useCue';

type Hand = { cards: string[]; total: number; soft: boolean; bet: number; done: boolean; result?: string; won?: number };
type Seat = { userId: string | null; name: string; isBot: boolean; bet: number; hands: Hand[]; insurance: number; net: number | null };
type State = { id: string; isPrivate: boolean; phase: 'betting' | 'insurance' | 'playing' | 'result'; deadline: number; turn: { seat: number; hand: number } | null; seats: Seat[]; dealer: string[]; dealerTotal: number | null };

const CHIPS = [50, 100, 500, 1000, 5000];

const RESULT: Record<string, string> = { blackjack: 'Blackjack', win: 'Gewonnen', push: 'Push', lose: 'Verloren' };

export function Blackjack() {
  const { call, balance, me } = useLive();
  const [state, setState] = useState<State | null>(null);
  const [amount, setAmount] = useState(100);
  const [now, setNow] = useState(() => Date.now());

  useSocketEvent('bj:state', setState);
  const meSeat = state?.seats.findIndex((s) => s.userId === me.id) ?? -1;
  const cards = state ? state.dealer.length + state.seats.reduce((n, s) => n + s.hands.reduce((m, h) => m + h.cards.length, 0), 0) : 0;
  useCue(cards, (next, prev) => next > prev && sound.card());
  useCue(state?.phase === 'playing' && state.turn?.seat === meSeat, (myTurn) => myTurn && sound.turn());
  useCue(state?.phase === 'result' ? (state.seats[meSeat]?.net ?? null) : null, (net) => {
    if (net === null) return;
    if (net > 0) sound.win(1);
    else if (net < 0) sound.lose();
  });
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
        title="Blackjack"
        subtitle="Allein, mit Bots oder mit Freunden an einem Tisch. Dealer steht auf 17, Blackjack zahlt 3:2."
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
    <div>
      <TableBar id={state.id} isPrivate={state.isPrivate} info="Code an Freunde schicken" leaveLabel="Tisch verlassen" onLeave={() => call('bj:leave').then(() => setState(null))} />

      <Felt>
        <div className="text-center">
          <p className="eyebrow text-white/50">
            Dealer {state.dealerTotal !== null && <span className="num">· {state.dealer.includes('??') ? `zeigt ${state.dealerTotal}` : state.dealerTotal}</span>}
          </p>
          <div className="mt-2 flex min-h-[clamp(3rem,10vw,4.6rem)] justify-center gap-1.5">{state.dealer.map((c, i) => <PlayingCard key={i} card={c} />)}</div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-2 sm:mt-10 sm:gap-3 lg:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
          {state.seats.map((s, si) => (
            <div
              key={si}
              className={`rounded-xl border p-2.5 text-center sm:p-3 ${state.turn?.seat === si ? 'border-accent bg-black/20' : 'border-white/10 bg-black/10'} ${s.userId === me.id ? 'ring-1 ring-accent/30' : ''}`}
            >
              <p className="truncate text-xs font-medium text-white/80 sm:text-sm">
                {s.isBot && <span className="text-white/40">Bot · </span>}
                {s.name}
              </p>
              {s.bet > 0 && <p className="num text-[11px] text-gold">{coins(s.bet)}</p>}
              {s.hands.map((h, hi) => (
                <div key={hi} className="mt-2">
                  <div className="flex justify-center -space-x-3 sm:-space-x-2">{h.cards.map((c, i) => <PlayingCard key={i} card={c} />)}</div>
                  <p className="mt-1 text-xs">
                    <span className="num text-white/70">{h.soft && h.total < 21 ? `Soft ${h.total}` : h.total}</span>
                    {h.result && <span className={h.result === 'lose' ? ' text-loss' : h.result === 'push' ? ' text-white/60' : ' text-win'}> · {RESULT[h.result]}{h.won ? ` +${coins(h.won)}` : ''}</span>}
                  </p>
                </div>
              ))}
              {s.insurance > 0 && <p className="mt-1 text-[11px] text-white/50">Versichert {coins(s.insurance)}</p>}
              {s.net !== null && state.phase === 'result' && (
                <p className={`num mt-1 text-xs font-semibold ${s.net > 0 ? 'text-win' : s.net < 0 ? 'text-loss' : 'text-white/60'}`}>
                  {s.net > 0 ? '+' : ''}
                  {coins(s.net)}
                </p>
              )}
            </div>
          ))}
        </div>
      </Felt>

      <div className="card mt-4">
        {state.phase === 'betting' && !mySeat?.bet && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {CHIPS.map((c) => (
                <button key={c} className={amount === c ? 'chip-active' : 'chip'} onClick={() => setAmount(c)}>{coins(c)}</button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <BetInput value={amount} onChange={setAmount} balance={balance} />
              <button className="btn-primary h-10 px-8" onClick={() => call('bj:bet', { amount })}>Setzen</button>
            </div>
          </div>
        )}
        {state.phase === 'insurance' && (
          <div className="space-y-3 text-center">
            <p className="text-sm">
              Der Dealer zeigt ein Ass. {mySeat?.hands.length ? (mySeat.insurance ? 'Du bist versichert.' : `Versichern für ${coins(Math.floor(mySeat.hands[0].bet / 2))}?`) : ''}
              <span className="num text-muted"> · {seconds}s</span>
            </p>
            {mySeat?.hands.length > 0 && !mySeat.insurance && (
              <button className="btn-secondary" onClick={() => call('bj:insurance')}>Versichern (zahlt 2:1 bei Dealer-Blackjack)</button>
            )}
          </div>
        )}
        {state.phase === 'betting' && mySeat?.bet > 0 && <p className="text-center text-sm text-muted">Warte auf die anderen Spieler{state.deadline > 0 && ` · ${seconds}s`}</p>}
        {state.phase === 'playing' && !myTurn && <p className="text-center text-sm text-muted">{state.turn ? `${state.seats[state.turn.seat]?.name} ist am Zug …` : 'Dealer spielt …'}</p>}
        {myHand && (
          <div className="space-y-3">
            <p className="text-center text-xs text-muted">Du bist dran · <span className="num">{seconds}s</span></p>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-center">
              <button className="btn-primary" onClick={() => act('hit')}>Karte</button>
              <button className="btn-secondary" onClick={() => act('stand')}>Halten</button>
              {myHand.cards.length === 2 && <button className="btn-secondary" onClick={() => act('double')}>Verdoppeln</button>}
              {myHand.cards.length === 2 && mySeat.hands.length === 1 && <button className="btn-secondary" onClick={() => act('split')}>Teilen</button>}
            </div>
          </div>
        )}
        {state.phase === 'result' && (
          <p className="text-center text-sm text-muted">
            {mySeat?.net != null && (
              <span className={`num mr-2 font-semibold ${mySeat.net > 0 ? 'text-win' : mySeat.net < 0 ? 'text-loss' : ''}`}>
                {mySeat.net > 0 ? `Gewonnen +${coins(mySeat.net)}` : mySeat.net < 0 ? `Verloren ${coins(mySeat.net)}` : 'Unentschieden'} ·
              </span>
            )}
            Nächste Runde in <span className="num">{seconds}s</span>
          </p>
        )}
      </div>
    </div>
  );
}
