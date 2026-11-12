'use client';

import { useEffect, useRef, useState } from 'react';

import { coins } from '@/lib/format';
import { PLINKO, PLINKO_RISK_LABEL, PLINKO_ROWS, type PlinkoRisk } from '@/lib/solo';
import { useLive } from '../SocketProvider';
import { BetInput } from '../ui';
import { GameFrame } from './GameFrame';
import { sound } from './sound';
import { useT } from '@/components/I18n';

type Drop = { path: number[]; slot: number; multiplier: number; payout: number };
type Ball = Drop & { id: number; start: number; bet: number };

const DURATION = 1200;
const GAP = 10; // distance between pegs in SVG units
const TOP = 8;
const WIDTH = (PLINKO_ROWS + 3) * GAP;
const HEIGHT = TOP + PLINKO_ROWS * GAP + 4;
const CX = WIDTH / 2;

const PEGS = Array.from({ length: PLINKO_ROWS }, (_, r) => Array.from({ length: r + 3 }, (_, j) => [CX + (j - (r + 2) / 2) * GAP, TOP + r * GAP]));

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${coins(Math.abs(n))}`;
const tone = (m: number) => (m >= 10 ? 'bg-loss/20 text-loss' : m >= 2 ? 'bg-gold/15 text-gold' : m >= 1 ? 'bg-accent/15 text-accent' : 'bg-raised text-muted');

/** Ball position at `t` (0–1): it sits on peg k of its path after k bounces, falling with gravity in between. */
function ballAt(path: number[], t: number) {
  const steps = path.length;
  const pos = Math.min(t, 0.9999) * steps;
  const k = Math.floor(pos);
  const f = pos - k;
  const rights = path.slice(0, k).reduce((a, b) => a + b, 0);
  const x0 = CX + (rights - k / 2) * GAP;
  const x1 = x0 + (path[k] - 0.5) * GAP;
  const y0 = TOP + k * GAP - 3;
  return { x: x0 + (x1 - x0) * f, y: y0 + GAP * f * f };
}

export function Plinko() {
  const t = useT();
  const { call, balance, holdBalance, shiftBalance } = useLive();
  const [amount, setAmount] = useState(100);
  const [risk, setRisk] = useState<PlinkoRisk>('medium');
  const [balls, setBalls] = useState<Ball[]>([]);
  const [results, setResults] = useState<(Drop & { bet: number })[]>([]);
  const [now, setNow] = useState(0);
  const [hit, setHit] = useState<{ id: number; slot: number; net: number } | null>(null);
  const [session, setSession] = useState({ balls: 0, net: 0 });
  const nextId = useRef(0);
  const table = PLINKO[risk];

  const animating = balls.length > 0;
  useEffect(() => {
    if (!animating) return;
    let frame = requestAnimationFrame(function tick(t) {
      setNow(t);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [animating]);

  const drop = async () => {
    const bet = amount;
    const release = holdBalance();
    const res = await call<Drop>('plinko:drop', { amount: bet, risk });
    if (!res) return release();
    shiftBalance(-bet); // the stake is gone right away …
    const ball: Ball = { ...res, bet, id: nextId.current++, start: performance.now() };
    setBalls((b) => [...b, ball]);
    setTimeout(() => {
      shiftBalance(res.payout); // … and the payout arrives when the ball lands
      setBalls((b) => b.filter((x) => x.id !== ball.id));
      setResults((r) => [{ ...res, bet }, ...r].slice(0, 12));
      setHit({ id: ball.id, slot: res.slot, net: res.payout - bet });
      setSession((s) => ({ balls: s.balls + 1, net: s.net + res.payout - bet }));
      release();
      if (res.multiplier >= 2) sound.win(res.multiplier >= 10 ? 2 : 1);
      else if (res.multiplier >= 1) sound.gem();
      else sound.stop();
    }, DURATION);
  };

  const stage = (
    <div className="panel p-3 sm:p-6">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="mx-auto block w-full max-w-xl" role="img" aria-label={t('Plinko-Brett')}>
        {PEGS.flat().map(([x, y], i) => <circle key={i} cx={x} cy={y} r={1.1} className="fill-faint" />)}
        {balls.map((b) => {
          const { x, y } = ballAt(b.path, Math.max(0, now - b.start) / DURATION);
          return <circle key={b.id} cx={x} cy={y} r={2.2} className="fill-accent" />;
        })}
      </svg>
      <div className="mx-auto grid max-w-xl gap-px" style={{ gridTemplateColumns: `repeat(${table.length}, minmax(0, 1fr))`, paddingInline: `${(GAP / WIDTH) * 100}%` }}>
        {table.map((m, i) => (
          <span key={i} className="relative">
            <span key={hit?.slot === i ? hit.id : undefined} className={`num block rounded py-1 text-center text-[9px] font-medium sm:text-xs ${tone(m)} ${hit?.slot === i ? 'pop-in ring-2 ring-fg/70' : ''}`}>{m}</span>
            {hit?.slot === i && (
              <span key={hit.id} className={`plinko-float num pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-xs font-semibold whitespace-nowrap sm:text-sm ${hit.net >= 0 ? 'text-win' : 'text-loss'}`}>
                {signed(hit.net)}
              </span>
            )}
          </span>
        ))}
      </div>
      {session.balls > 0 && (
        <p className="mx-auto mt-3 flex max-w-xl justify-between text-xs text-muted">
          <span>{t('{n} Bälle in dieser Sitzung', { n: session.balls })}</span>
          <span>
            {t('Netto')} <span className={`num font-semibold ${session.net >= 0 ? 'text-win' : 'text-loss'}`}>{signed(session.net)}</span>
          </span>
        </p>
      )}
    </div>
  );

  const controls = (
    <div className="card space-y-4">
      <BetInput value={amount} onChange={setAmount} balance={balance} />
      <div>
        <label className="label">{t('Risiko')}</label>
        <div className="flex gap-2">
          {(Object.keys(PLINKO) as PlinkoRisk[]).map((r) => (
            <button key={r} className={risk === r ? 'chip-active' : 'chip'} onClick={() => setRisk(r)}>{t(PLINKO_RISK_LABEL[r])}</button>
          ))}
        </div>
      </div>
      <button className="btn-primary h-12 w-full text-base" onClick={drop}>{t('Ball fallen lassen')}</button>
      <p className="text-xs text-faint">{PLINKO_ROWS} Reihen · bis {Math.max(...table)}×</p>
    </div>
  );

  const extra = results.length > 0 && (
    <div className="panel">
      <p className="border-b border-line px-4 py-3 text-sm font-semibold">{t('Letzte Bälle')}</p>
      <ul className="divide-y divide-line text-sm">
        {results.map((r, i) => (
          <li key={i} className="flex justify-between gap-2 px-4 py-2.5">
            <span className="num text-muted">
              {coins(r.bet)} · {r.multiplier}× = {coins(r.payout)}
            </span>
            <span className={`num font-medium ${r.payout >= r.bet ? 'text-win' : 'text-loss'}`}>{signed(r.payout - r.bet)}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  return <GameFrame title="Plinko" subtitle={t('Lass die Kugel fallen und hoff auf die Ränder.')} stage={stage} controls={controls} extra={extra} />;
}
