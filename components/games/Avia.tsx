'use client';

import { useEffect, useRef, useState } from 'react';

import { useT } from '@/components/I18n';
import { AVIA_LAND, AVIA_SLOTS, aviaLabel, type AviaItem } from '@/lib/avia';
import { coins } from '@/lib/format';
import { useLive } from '../SocketProvider';
import { BetInput } from '../ui';
import { GameFrame } from './GameFrame';
import { sound } from './sound';

type Result = { items: AviaItem[]; steps: number[]; multiplier: number; landed: boolean; payout: number };

const SPEEDS = [
  { key: 'Langsam', ms: 9000 },
  { key: 'Normal', ms: 6000 },
  { key: 'Schnell', ms: 4000 },
  { key: 'Turbo', ms: 2500 },
] as const;

// Scene in SVG units. The plane takes off from the left ship, passes five items and lands on the right ship or falls into the sea.
const W = 480;
const H = 330;
const SEA = 262;
const SLOT_Y = [160, 104, 168, 110, 158];
const SLOT_X = [104, 172, 240, 308, 376];
const START = { x: 40, y: 244 };
// Waypoints: start deck, five items, end (carrier deck or water). Times are when the plane is at each one.
const TIMES = [0, 0.2, 0.36, 0.52, 0.68, 0.84, 1];
const smooth = (u: number) => u * u * (3 - 2 * u);

function planeAt(p: number, landed: boolean) {
  const end = landed ? { x: 436, y: 238 } : { x: 408, y: 302 };
  const pts = [START, ...SLOT_X.map((x, i) => ({ x, y: SLOT_Y[i] })), end];
  const k = Math.min(TIMES.length - 2, TIMES.findIndex((t, i) => p < TIMES[i + 1] || i === TIMES.length - 2));
  const u = smooth(Math.min(1, Math.max(0, (p - TIMES[k]) / (TIMES[k + 1] - TIMES[k]))));
  return { x: pts[k].x + (pts[k + 1].x - pts[k].x) * u, y: pts[k].y + (pts[k + 1].y - pts[k].y) * u };
}

/** How many items the plane has met at progress `p`. */
const passedAt = (p: number) => TIMES.slice(1, 1 + AVIA_SLOTS).filter((t) => p >= t).length;

function ItemBubble({ item, x, y, hit }: { item: AviaItem; x: number; y: number; hit: boolean }) {
  if (item.kind === 'none') return null;
  const rocket = item.kind === 'rocket';
  const fill = rocket ? '#ef4444' : item.kind === 'mul' ? '#f5b942' : '#38bdf8';
  return (
    <g transform={`translate(${x} ${y})`} opacity={hit ? 0.25 : 1} style={{ transition: 'opacity .3s' }}>
      <circle r="20" fill={fill} fillOpacity=".25" stroke={fill} strokeWidth="2" />
      <text textAnchor="middle" dy={rocket ? 7 : 6} fontSize={rocket ? 20 : 16} fontWeight="700" fill="#fff" style={{ fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
        {rocket ? '🚀' : aviaLabel(item)}
      </text>
    </g>
  );
}

function Plane({ x, y, angle }: { x: number; y: number; angle: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle}) scale(1.15)`}>
      <ellipse cx="0" cy="0" rx="17" ry="6.5" fill="#ef4444" />
      <rect x="-8" y="-17" width="9" height="34" rx="3" fill="#dc2626" stroke="#f5b942" strokeWidth="1.5" />
      <polygon points="-17,-1 -25,-10 -21,-1 -25,6" fill="#b91c1c" />
      <circle cx="6" cy="-3" r="3.4" fill="#bfe3ff" />
      <rect x="16" y="-6" width="2.5" height="12" rx="1" fill="#e5e7eb" />
    </g>
  );
}

/** Avia Masters: the server decides the whole flight at once, this plays it back. */
export function Avia() {
  const t = useT();
  const { call, balance, holdBalance, shiftBalance } = useLive();
  const [amount, setAmount] = useState(100);
  const [speed, setSpeed] = useState<number>(1);
  const [busy, setBusy] = useState(false);
  const [flight, setFlight] = useState<Result | null>(null);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [history, setHistory] = useState<Result[]>([]);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const passed = flight ? passedAt(progress) : 0;
  const shownMultiplier = flight ? (passed === 0 ? 1 : flight.steps[passed - 1]) : 1;

  // One sound per item the plane meets.
  const lastSound = useRef(0);
  useEffect(() => {
    if (!flight || passed === 0 || passed === lastSound.current) return;
    lastSound.current = passed;
    const item = flight.items[passed - 1];
    if (item.kind === 'rocket') sound.bomb();
    else if (item.kind !== 'none') sound.gem();
  }, [passed, flight]);

  const play = async () => {
    if (busy) return;
    setBusy(true);
    setDone(false);
    setFlight(null);
    setProgress(0);
    lastSound.current = 0;
    const release = holdBalance(25_000);
    const res = await call<Result>('avia:play', { amount });
    if (!res) {
      setBusy(false);
      return release();
    }
    shiftBalance(-amount);
    setFlight(res);
    const ms = SPEEDS[speed].ms;
    const start = performance.now();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf.current);
      setProgress(1);
      setDone(true);
      setHistory((h) => [res, ...h].slice(0, 12));
      shiftBalance(res.payout);
      release();
      setBusy(false);
      if (!res.landed) sound.lose();
      else if (res.multiplier >= 10) sound.big();
      else sound.win(res.payout >= amount ? 2 : 1);
    };
    sound.start();
    raf.current = requestAnimationFrame(function step(now) {
      const p = Math.min(1, (now - start) / ms);
      setProgress(p);
      if (p < 1) raf.current = requestAnimationFrame(step);
      else finish();
    });
    // Background tabs pause animation frames; the round still has to end.
    setTimeout(finish, ms + 400);
  };

  const pos = planeAt(progress, flight?.landed ?? true);
  const ahead = planeAt(Math.min(1, progress + 0.01), flight?.landed ?? true);
  const angle = (Math.atan2(ahead.y - pos.y, ahead.x - pos.x) * 180) / Math.PI;
  const splash = done && flight && !flight.landed;
  const win = done && flight?.landed;

  const stage = (
    <div className="panel overflow-hidden p-0">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Avia Masters">
          <defs>
            <linearGradient id="avia-sky" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#1e3a8a" />
              <stop offset="1" stopColor="#3b82f6" />
            </linearGradient>
            <linearGradient id="avia-sea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#0c4a8a" />
              <stop offset="1" stopColor="#082f5c" />
            </linearGradient>
          </defs>
          <rect width={W} height={SEA} fill="url(#avia-sky)" />
          <g fill="#fff" fillOpacity=".55">
            <ellipse cx="80" cy="46" rx="34" ry="10" />
            <ellipse cx="260" cy="30" rx="44" ry="11" />
            <ellipse cx="410" cy="60" rx="34" ry="10" />
          </g>
          <rect y={SEA} width={W} height={H - SEA} fill="url(#avia-sea)" />
          <path d={`M0 ${SEA} q30 -8 60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 t60 0 V${SEA + 6} H0z`} fill="#38bdf8" fillOpacity=".35" />
          {/* take-off ship and landing ship */}
          <g fill="#64748b">
            <polygon points="2,262 78,262 68,280 12,280" />
            <rect x="2" y="252" width="76" height="10" fill="#94a3b8" />
          </g>
          <g fill="#64748b">
            <polygon points="384,262 478,262 468,282 394,282" />
            <rect x="384" y="249" width="94" height="13" fill="#94a3b8" />
            <rect x="392" y="254" width="78" height="2" fill="#f5b942" />
          </g>
          {flight?.items.map((item, i) => <ItemBubble key={i} item={item} x={SLOT_X[i]} y={SLOT_Y[i]} hit={i < passed} />)}
          {splash && <circle cx={408} cy={SEA + 10} r="24" fill="none" stroke="#bfe3ff" strokeWidth="3" opacity=".8" />}
          {!splash && <Plane x={pos.x} y={pos.y} angle={angle} />}
        </svg>
      </div>
      <p className={`num pt-3 text-center text-4xl font-bold ${flight && shownMultiplier < 1 ? 'text-loss' : 'text-gold'}`} aria-label={t('Multiplikator')}>
        ×{shownMultiplier.toFixed(2)}
      </p>
      <p className={`min-h-6 px-4 pb-4 pt-2 text-center text-sm ${win ? 'text-win' : splash ? 'text-loss' : 'text-muted'}`}>
        {done && flight
          ? flight.landed
            ? t('Gelandet mit ×{x} · +{n} NVC', { x: flight.multiplier.toFixed(2), n: coins(flight.payout) })
            : t('Ins Wasser gestürzt – der Einsatz ist weg.')
          : busy
            ? t('Das Flugzeug ist unterwegs …')
            : t('{plus} addiert, {times} multipliziert, 🚀 halbiert. Landet es auf dem Träger, zahlt Einsatz × Multiplikator – sonst nichts.', { plus: '+n', times: '×n' })}
      </p>
    </div>
  );

  const controls = (
    <div className="card space-y-4">
      <BetInput value={amount} onChange={setAmount} balance={balance} />
      <div>
        <p className="label">{t('Tempo')}</p>
        <div className="grid grid-cols-4 gap-1.5">
          {SPEEDS.map((s, i) => (
            <button key={s.key} className={`${speed === i ? 'btn-primary' : 'btn-secondary'} px-0 text-xs`} onClick={() => setSpeed(i)} disabled={busy}>
              {t(s.key)}
            </button>
          ))}
        </div>
      </div>
      <p className="flex justify-between text-sm text-muted">
        {t('Landechance')} <span className="num">{(AVIA_LAND * 100).toFixed(1)} %</span>
      </p>
      <button className="btn-primary h-12 w-full text-base" onClick={play} disabled={busy}>
        {busy ? t('Unterwegs …') : t('Starten')}
      </button>
    </div>
  );

  const extra = history.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {history.map((r, i) => (
        <span key={i} className={`chip num ${r.landed ? (r.payout >= amount ? 'text-win' : 'text-gold') : 'text-loss'}`}>
          {r.landed ? `×${r.multiplier.toFixed(2)}` : '🌊'}
        </span>
      ))}
    </div>
  );

  return <GameFrame title="Avia Masters" subtitle={t('Sammle Items, lande auf dem Träger.')} stage={stage} controls={controls} extra={extra} />;
}
