'use client';

import { useEffect, useRef, useState } from 'react';

import { coins } from '@/lib/format';
import { DICE_MAX, DICE_MIN, diceChance, diceMultiplier, type DiceSide } from '@/lib/solo';
import { useLive } from '../SocketProvider';
import { BetInput } from '../ui';
import { GameFrame } from './GameFrame';
import { sound } from './sound';
import { useT } from '@/components/I18n';

type Result = { roll: number; win: boolean; multiplier: number; payout: number };

const GLIDE_MS = 500;
const fmt = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Dice() {
  const t = useT();
  const { call, balance, holdBalance } = useLive();
  const [amount, setAmount] = useState(100);
  const [target, setTarget] = useState(50);
  const [side, setSide] = useState<DiceSide>('under');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Result[]>([]);
  const last = history[0];

  const chance = diceChance(target, side);
  const multiplier = diceMultiplier(chance);

  // The number glides to the result (no random flicker): easing from the last shown value, over ~0.5 s.
  const [shown, setShown] = useState<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const glide = (to: number) =>
    new Promise<void>((resolve) => {
      const from = shown ?? 50;
      const start = performance.now();
      const done = () => {
        cancelAnimationFrame(raf.current);
        setShown(to);
        resolve();
      };
      raf.current = requestAnimationFrame(function step(now) {
        const p = Math.min(1, (now - start) / GLIDE_MS);
        setShown(from + (to - from) * (1 - (1 - p) ** 3));
        if (p < 1) raf.current = requestAnimationFrame(step);
        else done();
      });
      setTimeout(done, GLIDE_MS + 120); // background tabs pause animation frames
    });

  const roll = async () => {
    setBusy(true);
    const release = holdBalance();
    const res = await call<Result>('dice:roll', { amount, target, side });
    if (!res) {
      setBusy(false);
      return release();
    }
    setAnimating(true);
    sound.tick();
    await glide(res.roll);
    setAnimating(false);
    setBusy(false);
    release();
    setHistory((h) => [res, ...h].slice(0, 10));
    if (res.win) sound.win(res.multiplier >= 3 ? 2 : 1);
    else sound.lose();
  };

  const stage = (
    <div className="panel px-4 py-8 sm:py-12">
      <p className={`num text-center text-6xl font-semibold sm:text-7xl ${animating || !last ? 'text-faint' : last.win ? 'text-win' : 'text-loss'}`}>
        {shown !== null ? fmt(shown) : '--,--'}
      </p>
      <p className="mt-2 min-h-6 text-center text-sm text-muted">
        {last && !animating && (last.win ? <>+<span className="num text-win">{coins(last.payout)}</span> NVC</> : t('Leider verloren'))}
      </p>
      <div className="mx-auto mt-8 max-w-lg">
        <div className="relative h-2 rounded-full bg-loss/40">
          <div className="absolute inset-y-0 rounded-full bg-win/70" style={side === 'under' ? { left: 0, width: `${target}%` } : { left: `${target}%`, right: 0 }} />
          {shown !== null && <span className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded bg-fg" style={{ left: `${shown}%` }} />}
        </div>
        <input
          type="range"
          aria-label={t('Zielzahl')}
          className="-my-2 mt-2 h-8 w-full accent-accent"
          min={DICE_MIN}
          max={DICE_MAX}
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
        />
        <div className="num flex justify-between text-xs text-faint"><span>0</span><span>50</span><span>100</span></div>
      </div>
      <div className="mx-auto mt-6 grid max-w-lg grid-cols-3 gap-2 text-center">
        {[[t('Ziel'), `${side === 'under' ? '<' : '>'} ${target}`], ['Chance', `${chance} %`], [t('Multiplikator'), `${multiplier}×`]].map(([label, value]) => (
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
          <button key={s} className={side === s ? 'btn-primary' : 'btn-secondary'} onClick={() => setSide(s)}>{s === 'under' ? t('Unter') : t('Über')}</button>
        ))}
      </div>
      <p className="flex justify-between text-sm text-muted">
        {t('Möglicher Gewinn')} <span className="num text-gold">{coins(Math.floor(amount * multiplier))}</span>
      </p>
      <button className="btn-primary h-12 w-full text-base" onClick={roll} disabled={busy}>{t('Würfeln')}</button>
    </div>
  );

  const extra = history.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {history.map((r, i) => (
        <span key={i} className={`chip num ${r.win ? 'text-win' : 'text-loss'}`}>{fmt(r.roll)}</span>
      ))}
    </div>
  );

  return <GameFrame title="Dice" subtitle={t('Wähle Zielzahl und Richtung, dann würfeln.')} stage={stage} controls={controls} extra={extra} />;
}
