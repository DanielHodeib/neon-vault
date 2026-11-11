'use client';

import { useEffect, useRef, useState } from 'react';

import { coins } from '@/lib/format';
import { MACHINES } from '@/lib/games';
import { useLive } from '../SocketProvider';
import { BetInput } from '../ui';

type Result = { reels: string[]; multiplier: number; features: string[]; win: number; bet: number; freeSpinsLeft: number };

const FEATURE_TEXT: Record<string, string> = { expand: '📖 Expanding Book!', freespins: '🎁 Free Spins gewonnen!', cascade: '💥 Kaskade!', chaos: '🌀 Chaos-Multiplikator' };

export function Slots() {
  const { call, balance } = useLive();
  const [key, setKey] = useState('classic');
  const machine = MACHINES[key];
  const [amount, setAmount] = useState(machine.minBet);
  const [reels, setReels] = useState<string[]>(() => machine.symbols.slice(0, machine.reels));
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [freeSpins, setFreeSpins] = useState(0);
  const ticker = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => () => clearInterval(ticker.current), []);

  const choose = (k: string) => {
    setKey(k);
    setAmount(Math.max(amount, MACHINES[k].minBet));
    setReels(MACHINES[k].symbols.slice(0, MACHINES[k].reels));
    setResult(null);
  };

  const spin = async () => {
    setSpinning(true);
    setResult(null);
    const started = Date.now();
    ticker.current = setInterval(() => setReels(Array.from({ length: machine.reels }, () => machine.symbols[Math.floor(Math.random() * machine.symbols.length)])), 80);
    const res = await call<Result>('slots:spin', { machine: key, amount });
    // Keep the reels spinning for the machine's minimum spin time.
    await new Promise((r) => setTimeout(r, Math.max(0, machine.spinMs - (Date.now() - started))));
    clearInterval(ticker.current);
    if (res) {
      setReels(res.reels);
      setResult(res);
      setFreeSpins(res.freeSpinsLeft);
    }
    setSpinning(false);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap gap-2">
        {Object.entries(MACHINES).map(([k, m]) => (
          <button key={k} onClick={() => choose(k)} disabled={spinning} className={k === key ? 'btn-primary' : 'btn-ghost'}>
            {m.name}
          </button>
        ))}
      </div>

      <div className="card text-center">
        <p className="text-sm text-muted">
          {machine.name} · {machine.reels} Walzen · ab {coins(machine.minBet)} NVC
          {machine.expand && ' · Expanding'} {machine.cascade && ' · Kaskaden'} {machine.scatter && ' · Free Spins'} {machine.chaos && ' · Chaos'}
        </p>
        <div className="my-8 flex justify-center gap-3">
          {reels.map((s, i) => (
            <div key={i} className={`grid h-24 w-20 place-items-center rounded-xl border border-line bg-bg text-5xl ${spinning ? 'blur-[1px]' : ''}`}>
              {s}
            </div>
          ))}
        </div>
        <div className="h-12">
          {result && (
            <p className={`text-xl font-bold ${result.win ? 'glow text-accent' : 'text-muted'}`}>
              {result.win ? `+${coins(result.win)} NVC (${result.multiplier}×)` : 'Kein Gewinn'}
            </p>
          )}
          {result?.features.map((f) => <p key={f} className="text-sm text-accent-2">{FEATURE_TEXT[f]}</p>)}
        </div>
      </div>

      <div className="card flex flex-wrap items-end gap-4">
        <div className="min-w-60 flex-1">
          <BetInput value={amount} onChange={setAmount} balance={balance} min={machine.minBet} />
        </div>
        <button className="btn-primary px-10 py-3 text-lg" onClick={spin} disabled={spinning}>
          {spinning ? 'Dreht …' : freeSpins ? `Free Spin (${freeSpins})` : 'Drehen'}
        </button>
      </div>
    </div>
  );
}
