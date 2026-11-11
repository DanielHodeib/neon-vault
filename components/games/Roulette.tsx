'use client';

import { useCallback, useEffect, useState } from 'react';

import { coins } from '@/lib/format';
import { REDS, WHEEL } from '@/lib/games';
import { useJoin, useLive, useSocketEvent } from '../SocketProvider';

type Bet = { type: string; value?: number; amount: number };
type State = { phase: 'betting' | 'spinning' | 'result'; endsAt: number; result: number | null; history: number[]; players: { userId: string; username: string; bets: Bet[] }[] };

const CHIPS = [10, 50, 100, 500, 1000, 5000];
const SEG = 360 / WHEEL.length;
const color = (n: number) => (n === 0 ? '#16a34a' : REDS.has(n) ? '#dc2626' : '#111827');
const WHEEL_BG = `conic-gradient(${WHEEL.map((n, i) => `${color(n)} ${i * SEG}deg ${(i + 1) * SEG}deg`).join(',')})`;

const OUTSIDE: { label: string; bet: Omit<Bet, 'amount'> }[] = [
  { label: '1–18', bet: { type: 'low' } },
  { label: 'Gerade', bet: { type: 'even' } },
  { label: 'Rot', bet: { type: 'red' } },
  { label: 'Schwarz', bet: { type: 'black' } },
  { label: 'Ungerade', bet: { type: 'odd' } },
  { label: '19–36', bet: { type: 'high' } },
  ...[1, 2, 3].map((v) => ({ label: `${v}. Dutzend`, bet: { type: 'dozen', value: v } })),
  ...[1, 2, 3].map((v) => ({ label: `${v}. Reihe`, bet: { type: 'column', value: v } })),
];

const same = (a: Omit<Bet, 'amount'>, b: Omit<Bet, 'amount'>) => a.type === b.type && a.value === b.value;

export function Roulette() {
  const { call, me } = useLive();
  const [state, setState] = useState<State | null>(null);
  const [chip, setChip] = useState(100);
  const [slip, setSlip] = useState<Bet[]>([]);
  const [rotation, setRotation] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const onState = useCallback((s: State) => {
    setState(s);
    // Spin so the winning pocket ends under the pointer at the top.
    if (s.phase === 'spinning' && s.result !== null) {
      const index = WHEEL.indexOf(s.result);
      setRotation((r) => r - (r % 360) + 360 * 6 + (360 - index * SEG - SEG / 2));
    }
  }, []);
  useJoin<{ state: State }>('roulette:join', useCallback((r) => onState(r.state), [onState]));
  useSocketEvent('roulette:state', onState);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  if (!state) return <p className="text-muted">Verbinde …</p>;

  const add = (bet: Omit<Bet, 'amount'>) => {
    if (state.phase !== 'betting') return;
    setSlip((s) => (s.some((b) => same(b, bet)) ? s.map((b) => (same(b, bet) ? { ...b, amount: b.amount + chip } : b)) : [...s, { ...bet, amount: chip }]));
  };
  const amountOn = (bet: Omit<Bet, 'amount'>) => slip.find((b) => same(b, bet))?.amount;
  const total = slip.reduce((s, b) => s + b.amount, 0);
  const place = async () => {
    if (await call('roulette:bet', { bets: slip })) setSlip([]);
  };
  const mine = state.players.find((p) => p.userId === me.id);
  const seconds = Math.max(0, Math.ceil((state.endsAt - now) / 1000));

  const cell = (bet: Omit<Bet, 'amount'>, label: string, bg: string) => (
    <button key={label} onClick={() => add(bet)} className="relative grid h-10 place-items-center rounded text-sm font-bold text-white hover:ring-2 hover:ring-accent" style={{ background: bg }}>
      {label}
      {amountOn(bet) && <span className="absolute -right-1 -top-2 rounded-full bg-amber-400 px-1 text-[10px] text-slate-900">{amountOn(bet)}</span>}
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="card grid place-items-center">
          <div className="relative">
            <div className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 text-2xl">▼</div>
            <div
              className="h-56 w-56 rounded-full border-4 border-amber-500/60"
              style={{ background: WHEEL_BG, transform: `rotate(${rotation}deg)`, transition: state.phase === 'spinning' ? 'transform 5.5s cubic-bezier(.1,.7,.2,1)' : 'none' }}
            />
            <div className="absolute inset-0 m-auto grid h-24 w-24 place-items-center rounded-full bg-panel text-3xl font-black">
              {state.phase === 'result' ? state.result : state.phase === 'spinning' ? '…' : `${seconds}s`}
            </div>
          </div>
          <p className="mt-4 text-sm text-muted">
            {state.phase === 'betting' ? 'Einsätze offen' : state.phase === 'spinning' ? 'Nichts geht mehr' : 'Ergebnis'}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-1">
            {state.history.slice(0, 12).map((n, i) => (
              <span key={i} className="grid h-7 w-7 place-items-center rounded-full text-xs font-bold" style={{ background: color(n) }}>{n}</span>
            ))}
          </div>
        </div>

        <div className="card space-y-3">
          <div className="grid grid-cols-[48px_1fr] gap-1">
            {cell({ type: 'number', value: 0 }, '0', color(0))}
            <div className="grid grid-cols-12 gap-1">
              {[3, 2, 1].flatMap((row) => Array.from({ length: 12 }, (_, c) => c * 3 + row)).map((n) => cell({ type: 'number', value: n }, String(n), color(n)))}
            </div>
          </div>
          <div className="grid grid-cols-6 gap-1">{OUTSIDE.map((o) => cell(o.bet, o.label, '#1c2438'))}</div>

          <div className="flex flex-wrap items-center gap-2">
            {CHIPS.map((c) => (
              <button key={c} onClick={() => setChip(c)} className={`h-11 w-11 rounded-full border-2 text-xs font-bold ${chip === c ? 'border-accent bg-accent/20' : 'border-line'}`}>
                {c >= 1000 ? `${c / 1000}k` : c}
              </button>
            ))}
            <span className="ml-auto text-sm">Einsatz: <b className="font-mono text-amber-300">{coins(total)}</b></span>
            <button className="btn-ghost" onClick={() => setSlip([])} disabled={!slip.length}>Leeren</button>
            <button className="btn-primary" onClick={place} disabled={!slip.length || state.phase !== 'betting'}>Setzen</button>
          </div>
        </div>
      </div>

      <div className="card">
        <p className="label">Am Tisch</p>
        {state.players.length === 0 && <p className="text-sm text-muted">Noch keine Einsätze in dieser Runde.</p>}
        <ul className="space-y-1 text-sm">
          {state.players.map((p) => (
            <li key={p.userId} className="flex justify-between">
              <span className={p === mine ? 'text-accent' : ''}>{p.username}</span>
              <span className="font-mono">{coins(p.bets.reduce((s, b) => s + b.amount, 0))}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
