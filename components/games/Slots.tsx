'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { coins } from '@/lib/format';
import { MACHINES } from '@/lib/games';
import { useJoin, useLive } from '../SocketProvider';
import { BetInput } from '../ui';
import { GameFrame } from './GameFrame';

type FreeSpins = { machine: string; spins: number; bet: number } | null;
type Result = { reels: string[]; multiplier: number; features: string[]; win: number; bet: number; freeSpins: FreeSpins };

const FEATURE_TEXT: Record<string, string> = { expand: 'Expanding Book', freespins: 'Free Spins gewonnen', cascade: 'Kaskade', chaos: 'Chaos-Multiplikator' };

export function Slots() {
  const { call, balance } = useLive();
  const [key, setKey] = useState('classic');
  const machine = MACHINES[key];
  const [amount, setAmount] = useState(machine.minBet);
  const [reels, setReels] = useState<string[]>(() => machine.symbols.slice(0, machine.reels));
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [free, setFree] = useState<FreeSpins>(null);
  const ticker = useRef<ReturnType<typeof setInterval>>(undefined);

  useJoin<{ freeSpins: FreeSpins }>('slots:state', useCallback((r) => setFree(r.freeSpins), []));
  useEffect(() => () => clearInterval(ticker.current), []);

  const choose = (k: string) => {
    setKey(k);
    setAmount((a) => Math.max(a, MACHINES[k].minBet));
    setReels(MACHINES[k].symbols.slice(0, MACHINES[k].reels));
    setResult(null);
  };

  const spin = async () => {
    setSpinning(true);
    setResult(null);
    const started = Date.now();
    ticker.current = setInterval(() => setReels(Array.from({ length: machine.reels }, () => machine.symbols[Math.floor(Math.random() * machine.symbols.length)])), 70);
    const res = await call<Result>('slots:spin', { machine: key, amount });
    // Keep the reels spinning for the machine's minimum spin time.
    await new Promise((r) => setTimeout(r, Math.max(0, machine.spinMs - (Date.now() - started))));
    clearInterval(ticker.current);
    if (res) {
      setReels(res.reels);
      setResult(res);
      setFree(res.freeSpins);
    }
    setSpinning(false);
  };

  const freeHere = free?.machine === key ? free.spins : 0;
  const features = [machine.expand && 'Expanding', machine.cascade && 'Kaskaden', machine.scatter && 'Free Spins', machine.chaos && 'Chaos'].filter(Boolean);

  const stage = (
    <div className="space-y-3">
      <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:flex-wrap sm:px-0">
        {Object.entries(MACHINES).map(([k, m]) => (
          <button key={k} onClick={() => choose(k)} disabled={spinning} className={k === key ? 'chip-active' : 'chip'}>
            {m.name}
            {free?.machine === k && <span className="ml-1.5 rounded bg-accent px-1 text-[10px] text-accent-fg">{free.spins}</span>}
          </button>
        ))}
      </div>
      <div className="panel px-3 py-8 text-center sm:py-12">
        <p className="text-xs text-muted">
          {machine.reels} Walzen · ab {coins(machine.minBet)} NVC{features.length > 0 && ` · ${features.join(' · ')}`}
        </p>
        <div className="mx-auto my-6 flex max-w-md justify-center gap-2 sm:my-8 sm:gap-3">
          {reels.map((s, i) => (
            <div
              key={i}
              className={`grid aspect-[4/5] max-w-24 flex-1 place-items-center rounded-xl border bg-bg text-[clamp(1.75rem,8vw,3rem)] transition ${
                spinning ? 'border-line opacity-70 blur-[1px]' : result?.win ? 'border-accent/60' : 'border-line'
              }`}
            >
              {s}
            </div>
          ))}
        </div>
        <div className="min-h-12">
          {result && (
            <p className={`text-lg font-semibold ${result.win ? 'text-win' : 'text-faint'}`}>
              {result.win ? <>+<span className="num">{coins(result.win)}</span> NVC · {result.multiplier}×</> : 'Kein Gewinn'}
            </p>
          )}
          {result?.features.map((f) => <p key={f} className="text-sm text-accent">{FEATURE_TEXT[f]}</p>)}
        </div>
      </div>
    </div>
  );

  const controls = (
    <div className="card space-y-4">
      {freeHere > 0 ? (
        <p className="rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
          {freeHere} Free Spins zu je <span className="num">{coins(free!.bet)}</span> NVC
        </p>
      ) : (
        <BetInput value={amount} onChange={setAmount} balance={balance} min={machine.minBet} />
      )}
      <button className="btn-primary h-12 w-full text-base" onClick={spin} disabled={spinning}>
        {spinning ? 'Dreht …' : freeHere ? 'Free Spin' : 'Drehen'}
      </button>
    </div>
  );

  return <GameFrame title="Slots" subtitle={machine.name} stage={stage} controls={controls} />;
}
