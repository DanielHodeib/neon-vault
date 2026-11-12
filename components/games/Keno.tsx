'use client';

import { Eraser, Shuffle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { KENO_MAX_PICKS, KENO_NUMBERS, KENO_PAYS } from '@/lib/arcade';
import { coins } from '@/lib/format';
import { useT } from '@/components/I18n';
import { useLive } from '../SocketProvider';
import { BetInput } from '../ui';
import { GameFrame } from './GameFrame';
import { sound } from './sound';

type Result = { drawn: number[]; hits: number; multiplier: number; payout: number };
const STEP_MS = 220;

/** Keno: pick up to 10 of 40 numbers; the house draws 10, one after another. */
export function Keno() {
  const t = useT();
  const { call, balance, holdBalance, shiftBalance } = useLive();
  const [amount, setAmount] = useState(100);
  const [picks, setPicks] = useState<number[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [shown, setShown] = useState(0); // drawn numbers revealed so far
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  const drawnNow = result?.drawn.slice(0, shown) ?? [];
  const drawing = !!result && shown < result.drawn.length;
  const toggle = (n: number) => {
    if (drawing) return;
    setResult(null);
    setPicks((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length < KENO_MAX_PICKS ? [...p, n] : p));
  };
  const quickPick = () => {
    const pool = Array.from({ length: KENO_NUMBERS }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
    setResult(null);
    setPicks(pool.slice(0, picks.length || 5));
  };

  const play = async () => {
    if (!picks.length) return;
    setBusy(true);
    const release = holdBalance();
    const res = await call<Result>('keno:play', { amount, picks });
    setBusy(false);
    if (!res) return release();
    shiftBalance(-amount);
    setResult(res);
    setShown(0);
    let n = 0;
    timer.current = setInterval(() => {
      n++;
      setShown(n);
      if (picks.includes(res.drawn[n - 1])) sound.gem();
      else sound.tick();
      if (n >= res.drawn.length) {
        clearInterval(timer.current!);
        shiftBalance(res.payout);
        release();
        if (res.multiplier >= 10) sound.big();
        else if (res.multiplier >= 1) sound.win(res.multiplier >= 3 ? 2 : 1);
        else sound.lose();
      }
    }, STEP_MS);
  };

  const table = KENO_PAYS[picks.length] ?? {};
  const hitsNow = drawnNow.filter((n) => picks.includes(n)).length;

  const stage = (
    <div className="panel p-3 sm:p-6">
      <div className="mx-auto grid max-w-lg grid-cols-8 gap-1.5 sm:gap-2">
        {Array.from({ length: KENO_NUMBERS }, (_, i) => {
          const n = i + 1;
          const picked = picks.includes(n);
          const drawn = drawnNow.includes(n);
          return (
            <button
              key={n}
              onClick={() => toggle(n)}
              disabled={drawing}
              aria-pressed={picked}
              className={`num grid aspect-square place-items-center rounded-lg border text-sm font-semibold transition sm:text-base ${
                picked && drawn
                  ? 'pop-in border-gold bg-gold text-black shadow-[0_0_16px_#e4c06a88]'
                  : drawn
                    ? 'pop-in border-line-strong bg-raised text-fg'
                    : picked
                      ? 'border-accent bg-accent/20 text-fg'
                      : 'border-line bg-raised/40 text-muted hover:border-faint hover:text-fg'
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
      <p className="mt-4 min-h-7 text-center text-lg font-semibold">
        {result && !drawing ? (
          result.multiplier ? (
            <span className="text-win">
              {t('{h} Treffer', { h: result.hits })} · {result.multiplier}× · +<span className="num">{coins(result.payout)}</span> NVC
            </span>
          ) : (
            <span className="text-muted">{t('{h} Treffer – kein Gewinn', { h: result.hits })}</span>
          )
        ) : drawing ? (
          <span className="text-muted">
            {t('Ziehung {n}/10', { n: shown })} · <span className="text-gold">{t('{h} Treffer', { h: hitsNow })}</span>
          </span>
        ) : (
          <span className="text-muted">{picks.length ? t('{n} von {max} Zahlen gewählt', { n: picks.length, max: KENO_MAX_PICKS }) : t('Wähle bis zu 10 Zahlen')}</span>
        )}
      </p>
    </div>
  );

  const controls = (
    <div className="card space-y-4">
      <BetInput value={amount} onChange={setAmount} balance={balance} />
      <div className="flex gap-2">
        <button className="btn-secondary h-9 flex-1 text-xs" onClick={quickPick} disabled={drawing}>
          <Shuffle size={14} /> {t('Zufällig')}
        </button>
        <button className="btn-ghost h-9 flex-1 border border-line text-xs" onClick={() => (setPicks([]), setResult(null))} disabled={drawing || !picks.length}>
          <Eraser size={14} /> {t('Leeren')}
        </button>
      </div>
      <button className="btn-primary h-12 w-full text-base" onClick={play} disabled={busy || drawing || !picks.length}>
        {t('Ziehen')}
      </button>
      {picks.length > 0 && (
        <div>
          <p className="label">{t('Gewinne bei {n} Zahlen', { n: picks.length })}</p>
          <ul className="space-y-0.5 text-sm">
            {Object.entries(table)
              .reverse()
              .map(([h, m]) => (
                <li key={h} className={`flex justify-between rounded-md px-2 py-0.5 ${result && !drawing && result.hits === Number(h) ? 'bg-gold/15 text-gold' : ''}`}>
                  <span>{t('{h} Treffer', { h })}</span>
                  <span className="num">
                    {m}× <span className="text-faint">= {coins(Math.floor(amount * m))}</span>
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );

  return <GameFrame title="Keno" subtitle={t('Zahlen tippen, Kugeln ziehen.')} stage={stage} controls={controls} />;
}
