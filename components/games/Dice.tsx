'use client';

import { useEffect, useState } from 'react';

import { coins } from '@/lib/format';
import { DICE_MAX, DICE_MIN, diceChance, diceMultiplier, type DiceSide } from '@/lib/solo';
import { useLive } from '../SocketProvider';
import { BetInput } from '../ui';
import { GameFrame } from './GameFrame';
import { sound } from './sound';

type Result = { roll: number; win: boolean; multiplier: number; payout: number };

const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Dice() {
  const { call, balance, holdBalance } = useLive();
  const [amount, setAmount] = useState(100);
  const [target, setTarget] = useState(50);
  const [side, setSide] = useState<DiceSide>('under');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Result[]>([]);
  const last = history[0];

  const chance = diceChance(target, side);
  const multiplier = diceMultiplier(chance);

  const [rolling, setRolling] = useState<number | null>(null);

  // Short shuffle of random numbers before the result shows.
  const isRolling = rolling !== null;
  useEffect(() => {
    if (!isRolling) return;
    const t = setInterval(() => {
      setRolling(Math.random() * 100);
      sound.tick();
    }, 55);
    return () => clearInterval(t);
  }, [isRolling]);

  const roll = async () => {
    setBusy(true);
    const release = holdBalance();
    setRolling(50);
    const [res] = await Promise.all([call<Result>('dice:roll', { amount, target, side }), new Promise((r) => setTimeout(r, 550))]);
    setRolling(null);
    setBusy(false);
    release();
    if (!res) return;
    setHistory((h) => [res, ...h].slice(0, 10));
    if (res.win) sound.win(res.multiplier >= 3 ? 2 : 1);
    else sound.lose();
  };

  const stage = (
    <div className="panel px-4 py-8 sm:py-12">
      <p className={`num text-center text-6xl font-semibold sm:text-7xl ${rolling !== null || !last ? 'text-faint' : last.win ? 'text-win' : 'text-loss'}`}>
        {rolling !== null ? fmt(rolling) : last ? fmt(last.roll) : '--,--'}
      </p>
      <p className="mt-2 min-h-6 text-center text-sm text-muted">
        {last && (last.win ? <>+<span className="num text-win">{coins(last.payout)}</span> NVC</> : 'Leider verloren')}
      </p>
      <div className="mx-auto mt-8 max-w-lg">
        <div className="relative h-2 rounded-full bg-loss/40">
          <div className="absolute inset-y-0 rounded-full bg-win/70" style={side === 'under' ? { left: 0, width: `${target}%` } : { left: `${target}%`, right: 0 }} />
          {last && <span className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-fg" style={{ left: `${last.roll}%` }} />}
        </div>
        <input
          type="range"
          aria-label="Zielzahl"
          className="mt-4 w-full accent-accent"
          min={DICE_MIN}
          max={DICE_MAX}
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
        />
        <div className="num flex justify-between text-xs text-faint"><span>0</span><span>50</span><span>100</span></div>
      </div>
      <div className="mx-auto mt-6 grid max-w-lg grid-cols-3 gap-2 text-center">
        {[['Ziel', `${side === 'under' ? '<' : '>'} ${target}`], ['Chance', `${chance} %`], ['Multiplikator', `${multiplier}×`]].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-raised px-2 py-2.5">
            <p className="eyebrow">{label}</p>
            <p className="num mt-1 text-sm font-medium">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );

  const controls = (
    <div className="card space-y-4">
      <BetInput value={amount} onChange={setAmount} balance={balance} />
      <div className="grid grid-cols-2 gap-2">
        {(['under', 'over'] as const).map((s) => (
          <button key={s} className={side === s ? 'btn-primary' : 'btn-secondary'} onClick={() => setSide(s)}>{s === 'under' ? 'Unter' : 'Über'}</button>
        ))}
      </div>
      <p className="flex justify-between text-sm text-muted">
        Möglicher Gewinn <span className="num text-gold">{coins(Math.floor(amount * multiplier))}</span>
      </p>
      <button className="btn-primary h-12 w-full text-base" onClick={roll} disabled={busy}>Würfeln</button>
    </div>
  );

  const extra = history.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {history.map((r, i) => (
        <span key={i} className={`chip num ${r.win ? 'text-win' : 'text-loss'}`}>{fmt(r.roll)}</span>
      ))}
    </div>
  );

  return <GameFrame title="Dice" subtitle="Wähle Zielzahl und Richtung, dann würfeln." stage={stage} controls={controls} extra={extra} />;
}
