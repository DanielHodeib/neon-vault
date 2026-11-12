'use client';

import { useEffect, useRef, useState } from 'react';

import { LIMBO_MAX, LIMBO_MIN, limboChance } from '@/lib/arcade';
import { coins } from '@/lib/format';
import { useT } from '@/components/I18n';
import { useLive } from '../SocketProvider';
import { BetInput } from '../ui';
import { GameFrame } from './GameFrame';
import { sound } from './sound';

type Result = { result: number; target: number; payout: number };
const QUICK = [1.5, 2, 3, 5, 10, 100];
const RISE_MS = 700;

/** Limbo: set a target multiplier; the number shoots up and has to reach it. */
export function Limbo() {
  const t = useT();
  const { call, balance, holdBalance, shiftBalance } = useLive();
  const [amount, setAmount] = useState(100);
  const [target, setTarget] = useState(2);
  const [shown, setShown] = useState<number | null>(null);
  const [last, setLast] = useState<Result | null>(null);
  const [history, setHistory] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const valid = target >= LIMBO_MIN && target <= LIMBO_MAX;
  const play = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setLast(null);
    const release = holdBalance();
    const res = await call<Result>('limbo:play', { amount, target });
    if (!res) {
      setBusy(false);
      return release();
    }
    shiftBalance(-amount);
    // Count up from 1.00× on a log curve, so big results still take the same time.
    const start = performance.now();
    const to = Math.log(Math.max(1, res.result));
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf.current);
      setShown(res.result);
      setLast(res);
      setHistory((h) => [res, ...h].slice(0, 14));
      shiftBalance(res.payout);
      release();
      setBusy(false);
      if (res.payout) (res.target >= 10 ? sound.big : () => sound.win(res.target >= 3 ? 2 : 1))();
      else sound.lose();
    };
    raf.current = requestAnimationFrame(function step(now) {
      const p = Math.min(1, (now - start) / RISE_MS);
      setShown(Math.max(1, Math.exp(to * (1 - (1 - p) ** 3))));
      if (p < 1) raf.current = requestAnimationFrame(step);
      else finish();
    });
    // Background tabs pause animation frames; the round still has to end.
    setTimeout(finish, RISE_MS + 150);
  };

  const win = last && last.payout > 0;
  const stage = (
    <div className="panel relative overflow-hidden p-6 text-center sm:p-10">
      <div className={`pointer-events-none absolute inset-0 transition-colors duration-500 ${last ? (win ? 'bg-win/10' : 'bg-loss/10') : ''}`} />
      <p className={`num relative text-6xl font-black tracking-tight transition-colors sm:text-8xl ${last ? (win ? 'text-win' : 'text-loss') : 'text-fg'}`}>
        {(shown ?? 1).toFixed(2)}×
      </p>
      <p className="relative mt-3 text-sm text-muted">
        {last ? (win ? t('Ziel {x}× erreicht · +{n} NVC', { x: last.target, n: coins(last.payout) }) : t('Ziel {x}× verpasst', { x: last.target })) : t('Ziel: {x}× · Chance {p} %', { x: target, p: (limboChance(target) * 100).toFixed(2) })}
      </p>
      {history.length > 0 && (
        <div className="relative mt-6 flex flex-wrap justify-center gap-1.5">
          {history.map((h, i) => (
            <span key={i} className={`num rounded-md px-2 py-0.5 text-xs ${h.payout ? 'bg-win/15 text-win' : 'bg-raised text-muted'}`}>
              {h.result.toFixed(2)}×
            </span>
          ))}
        </div>
      )}
    </div>
  );

  const controls = (
    <div className="card space-y-4">
      <BetInput value={amount} onChange={setAmount} balance={balance} />
      <div>
        <label className="label" htmlFor="limbo-target">{t('Ziel-Multiplikator')}</label>
        <input id="limbo-target" className="input num" type="number" step={0.01} min={LIMBO_MIN} max={LIMBO_MAX} value={target} onChange={(e) => setTarget(Number(e.target.value))} />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button key={q} className={target === q ? 'chip-active' : 'chip'} onClick={() => setTarget(q)}>{q}×</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center text-xs">
        <div className="rounded-lg bg-bg p-2">
          <p className="text-faint">{t('Chance')}</p>
          <p className="num text-sm font-semibold">{valid ? (limboChance(target) * 100).toFixed(2) : '–'} %</p>
        </div>
        <div className="rounded-lg bg-bg p-2">
          <p className="text-faint">{t('Möglicher Gewinn')}</p>
          <p className="num text-sm font-semibold text-gold">{valid ? coins(Math.floor(amount * target)) : '–'}</p>
        </div>
      </div>
      <button className="btn-primary h-12 w-full text-base" onClick={play} disabled={busy || !valid}>
        {t('Los')}
      </button>
      <p className="text-xs text-faint">{t('Erreicht die Zahl dein Ziel, gewinnst du Einsatz × Ziel. 1 % Hausvorteil.')}</p>
    </div>
  );

  return <GameFrame title="Limbo" subtitle={t('Wie hoch traust du dich?')} stage={stage} controls={controls} />;
}
