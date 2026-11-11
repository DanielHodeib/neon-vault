'use client';

import { useCallback, useState } from 'react';

import { coins } from '@/lib/format';
import { MINES_MAX, MINES_MIN, MINES_TILES, minesMultiplier } from '@/lib/solo';
import { useJoin, useLive } from '../SocketProvider';
import { BetInput } from '../ui';
import { GameFrame } from './GameFrame';
import { sound } from './sound';

type Round = { bet: number; mines: number; revealed: number[]; multiplier: number };
type Reveal = { bomb: boolean; tile: number; multiplier?: number; done?: boolean; bombs?: number[]; payout?: number };
type Cashout = { multiplier: number; payout: number; bombs: number[] };
type Outcome = { win: boolean; payout: number; multiplier: number };

const PRESETS = [1, 3, 5, 10, 24];

export function Mines() {
  const { call, balance } = useLive();
  const [amount, setAmount] = useState(100);
  const [mines, setMines] = useState(3);
  const [round, setRound] = useState<Round | null>(null);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [bombs, setBombs] = useState<number[]>([]);
  const [hit, setHit] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);

  const restore = useCallback((r: { round: Round | null }) => {
    if (!r.round) return;
    setRound(r.round);
    setMines(r.round.mines);
    setRevealed(r.round.revealed);
    setBombs([]);
    setHit(null);
    setOutcome(null);
  }, []);
  useJoin('mines:state', restore);

  const run = async <T,>(event: string, data?: unknown) => {
    setBusy(true);
    const res = await call<T>(event, data);
    setBusy(false);
    return res;
  };

  const start = async () => {
    const res = await run<{ round: Round }>('mines:start', { amount, mines });
    if (res) restore(res);
  };

  const end = (res: Cashout) => {
    setRound(null);
    setBombs(res.bombs);
    setOutcome({ win: true, payout: res.payout, multiplier: res.multiplier });
    sound.win(res.multiplier >= 3 ? 2 : 1);
  };

  const reveal = async (tile: number) => {
    if (!round || busy || revealed.includes(tile)) return;
    const res = await run<Reveal>('mines:reveal', { tile });
    if (!res) return;
    if (res.bomb) {
      setRound(null);
      setHit(tile);
      setBombs(res.bombs ?? []);
      setOutcome({ win: false, payout: 0, multiplier: 0 });
      sound.bomb();
      return;
    }
    if (!res.done) sound.gem();
    setRevealed((r) => [...r, tile]);
    if (res.done) end(res as Cashout);
    else setRound({ ...round, revealed: [...round.revealed, tile], multiplier: res.multiplier ?? round.multiplier });
  };

  const cashout = async () => {
    const res = await run<Cashout>('mines:cashout');
    if (res) end(res);
  };

  const next = round ? minesMultiplier(round.mines, round.revealed.length + 1) : minesMultiplier(mines, 1);

  const stage = (
    <div className="panel p-3 sm:p-6">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-2 sm:gap-3">
        {Array.from({ length: MINES_TILES }, (_, i) => {
          const gem = revealed.includes(i);
          const bomb = bombs.includes(i);
          const style = gem
            ? 'border-accent/60 bg-accent/15'
            : bomb
              ? `border-loss/60 ${i === hit ? 'bg-loss/30' : 'bg-loss/10'}`
              : round
                ? 'border-line-strong bg-raised hover:border-faint active:scale-95'
                : 'border-line bg-raised/50';
          return (
            <button
              key={i}
              aria-label={`Feld ${i + 1}`}
              disabled={!round || busy || gem}
              onClick={() => reveal(i)}
              className={`grid aspect-square place-items-center rounded-lg border transition ${style} ${outcome && !gem && !bomb ? 'opacity-40' : ''}`}
            >
              {gem && <span className="h-1/3 w-1/3 rotate-45 rounded-sm bg-accent" />}
              {bomb && <span className="h-1/3 w-1/3 rounded-full bg-loss" />}
            </button>
          );
        })}
      </div>
      <p className="mt-4 min-h-7 text-center text-lg font-semibold">
        {outcome ? (
          outcome.win ? (
            <span className="text-win">+<span className="num">{coins(outcome.payout)}</span> NVC · {outcome.multiplier}×</span>
          ) : (
            <span className="text-loss">Mine getroffen</span>
          )
        ) : (
          round && <span className="text-muted">Nächstes Feld: <span className="num text-fg">{next}×</span></span>
        )}
      </p>
    </div>
  );

  const controls = (
    <div className="card space-y-4">
      <BetInput value={amount} onChange={setAmount} balance={balance} />
      <div>
        <label className="label">Minen</label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((m) => (
            <button key={m} className={mines === m ? 'chip-active' : 'chip'} disabled={!!round} onClick={() => setMines(m)}>{m}</button>
          ))}
          <select className="input h-8 w-20 rounded-full text-xs" value={mines} disabled={!!round} onChange={(e) => setMines(Number(e.target.value))}>
            {Array.from({ length: MINES_MAX - MINES_MIN + 1 }, (_, i) => i + MINES_MIN).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
      {round ? (
        <button className="btn-primary h-12 w-full text-base" onClick={cashout} disabled={busy || !round.revealed.length}>
          Auszahlen · <span className="num">{round.multiplier}× = {coins(Math.floor(round.bet * round.multiplier))}</span>
        </button>
      ) : (
        <button
          className="btn-primary h-12 w-full text-base"
          disabled={busy}
          onClick={() => {
            setRevealed([]);
            setBombs([]);
            setHit(null);
            setOutcome(null);
            void start();
          }}
        >
          Start
        </button>
      )}
      <p className="text-xs text-faint">Erstes sicheres Feld: {minesMultiplier(round?.mines ?? mines, 1)}×. 1 % Hausvorteil.</p>
    </div>
  );

  return <GameFrame title="Mines" subtitle="Decke Edelsteine auf und steig rechtzeitig aus." stage={stage} controls={controls} />;
}
