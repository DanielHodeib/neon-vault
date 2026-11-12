'use client';

import { useCallback, useEffect, useState } from 'react';

import { coins, compact } from '@/lib/format';
import { REDS, WHEEL } from '@/lib/games';
import { useJoin, useLive, useSocketEvent } from '../SocketProvider';
import { Empty } from '../ui';
import { GameFrame } from './GameFrame';
import { NameDot, Reactions } from './Reactions';
import { sound } from './sound';
import { useCue } from './useCue';
import { useT } from '@/components/I18n';

type Bet = { type: string; value?: number; amount: number };
type BetKey = Omit<Bet, 'amount'>;
type State = { phase: 'betting' | 'spinning' | 'result'; endsAt: number; result: number | null; history: number[]; players: { userId: string; username: string; bets: Bet[] }[] };

const CHIPS = [10, 50, 100, 500, 1000, 5000];
const SEG = 360 / WHEEL.length;
const RED = '#c2413b';
const BLACK = '#1d2026';
const GREEN = '#1f8a5b';
const color = (n: number) => (n === 0 ? GREEN : REDS.has(n) ? RED : BLACK);
const WHEEL_BG = `conic-gradient(${WHEEL.map((n, i) => `${color(n)} ${i * SEG}deg ${(i + 1) * SEG}deg`).join(',')})`;
// Column-major (3,2,1, 6,5,4 …): three rows on wide screens, three columns on phones.
const NUMBERS = Array.from({ length: 12 }, (_, c) => [c * 3 + 3, c * 3 + 2, c * 3 + 1]).flat();

const OUTSIDE: { label: string; bet: BetKey }[] = [
  { label: '1–18', bet: { type: 'low' } },
  { label: 'Gerade', bet: { type: 'even' } },
  { label: 'Rot', bet: { type: 'red' } },
  { label: 'Schwarz', bet: { type: 'black' } },
  { label: 'Ungerade', bet: { type: 'odd' } },
  { label: '19–36', bet: { type: 'high' } },
  ...[1, 2, 3].map((v) => ({ label: `${(v - 1) * 12 + 1}–${v * 12}`, bet: { type: 'dozen', value: v } })),
  ...[1, 2, 3].map((v) => ({ label: `${v}. Reihe`, bet: { type: 'column', value: v } })),
];

const same = (a: BetKey, b: BetKey) => a.type === b.type && a.value === b.value;

export function Roulette() {
  const t = useT();
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

  useCue(state?.phase, (phase) => {
    if (phase === 'spinning') sound.start();
    if (phase === 'result') sound.stop();
  });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  if (!state) return <GameFrame title="Roulette" stage={<div className="panel aspect-[2/1] animate-pulse" />} controls={null} />;

  const open = state.phase === 'betting';
  const add = (bet: BetKey) => {
    if (!open) return;
    setSlip((s) => (s.some((b) => same(b, bet)) ? s.map((b) => (same(b, bet) ? { ...b, amount: b.amount + chip } : b)) : [...s, { ...bet, amount: chip }]));
  };
  const amountOn = (bet: BetKey) => slip.find((b) => same(b, bet))?.amount;
  const total = slip.reduce((s, b) => s + b.amount, 0);
  const place = async () => {
    if (await call('roulette:bet', { bets: slip })) setSlip([]);
  };
  const seconds = Math.max(0, Math.ceil((state.endsAt - now) / 1000));

  const cell = (bet: BetKey, label: string, bg: string, extra = '') => (
    <button
      key={label}
      onClick={() => add(bet)}
      disabled={!open}
      className={`relative grid h-9 place-items-center rounded-md text-xs font-semibold text-white transition hover:brightness-125 disabled:opacity-60 sm:h-10 sm:text-sm ${extra}`}
      style={{ background: bg }}
    >
      {label}
      {amountOn(bet) && <span className="num absolute -top-1.5 -right-1.5 z-10 rounded-full bg-gold px-1.5 text-[10px] text-black">{compact(amountOn(bet)!)}</span>}
    </button>
  );

  const stage = (
    <div className="panel space-y-5 p-4 sm:p-5">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <div className="relative shrink-0">
          <div className="absolute -top-1 left-1/2 z-10 h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[12px] border-x-transparent border-t-fg" />
          <div
            className="h-44 w-44 rounded-full border-[6px] border-raised shadow-inner sm:h-48 sm:w-48"
            style={{ background: WHEEL_BG, transform: `rotate(${rotation}deg)`, transition: state.phase === 'spinning' ? 'transform 5.5s cubic-bezier(.12,.7,.2,1)' : 'none' }}
          />
          <div className="absolute inset-0 m-auto grid h-20 w-20 place-items-center rounded-full border border-line bg-surface">
            {state.phase === 'result' ? (
              <span className="num text-3xl font-semibold" style={{ color: state.result === 0 ? GREEN : REDS.has(state.result!) ? '#ff6b61' : undefined }}>{state.result}</span>
            ) : (
              <span className="num text-xl text-muted">{state.phase === 'spinning' ? '…' : `${seconds}s`}</span>
            )}
          </div>
        </div>
        <div className="w-full min-w-0 text-center sm:text-left">
          <p className="text-sm font-medium">{open ? t('Einsätze offen') : state.phase === 'spinning' ? t('Nichts geht mehr') : t('Ergebnis')}</p>
          <p className="text-xs text-muted">{t('Alle Spieler setzen auf dieselbe Kugel.')}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-1 sm:justify-start">
            {state.history.slice(0, 14).map((n, i) => (
              <span key={i} className="num grid h-7 w-7 place-items-center rounded-md text-[11px] font-semibold text-white" style={{ background: color(n) }}>{n}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-1 sm:grid-cols-[3rem_1fr]">
        {cell({ type: 'number', value: 0 }, '0', GREEN, 'sm:h-full')}
        {/* rtl on phones flips each row so it reads 1 2 3 left to right */}
        <div className="grid grid-cols-3 gap-1 [direction:rtl] sm:grid-flow-col sm:grid-cols-none sm:grid-rows-3 sm:[direction:ltr]">
          {NUMBERS.map((n) => cell({ type: 'number', value: n }, String(n), color(n)))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">{OUTSIDE.map((o) => cell(o.bet, t(o.label), o.bet.type === 'red' ? RED : o.bet.type === 'black' ? BLACK : 'var(--color-raised)'))}</div>
    </div>
  );

  const controls = (
    <div className="card space-y-4">
      <div>
        <p className="label">{t('Chip-Wert')}</p>
        <div className="grid grid-cols-6 gap-1.5">
          {CHIPS.map((c) => (
            <button key={c} onClick={() => setChip(c)} className={`num aspect-square rounded-full border text-xs font-semibold transition ${chip === c ? 'border-accent bg-accent/15 text-fg' : 'border-line text-muted'}`}>
              {compact(c)}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{t('Gesamteinsatz')}</span>
        <span className="num font-semibold text-gold">{coins(total)}</span>
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <button className="btn-secondary" onClick={() => setSlip([])} disabled={!slip.length}>{t('Leeren')}</button>
        <button className="btn-primary" onClick={place} disabled={!slip.length || !open}>{t('Setzen')}</button>
      </div>
    </div>
  );

  const extra = (
    <div className="panel">
      <p className="border-b border-line px-4 py-3 text-sm font-semibold">{t('Am Tisch')}</p>
      {state.players.length === 0 ? (
        <Empty>{t('Noch keine Einsätze in dieser Runde.')}</Empty>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {state.players.map((p) => (
            <li key={p.userId} className="pop-in flex items-center justify-between gap-2 px-4 py-2.5">
              <span className={`flex min-w-0 items-center gap-2 ${p.userId === me.id ? 'text-accent' : ''}`}>
                <NameDot name={p.username} /> <span className="truncate">{p.username}</span>
              </span>
              <span className="num text-muted">{coins(p.bets.reduce((s, b) => s + b.amount, 0))}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return <GameFrame title="Roulette" subtitle={t('Europäisches Roulette · neue Runde alle 25 Sekunden')} stage={<Reactions room="roulette">{stage}</Reactions>} controls={controls} extra={extra} />;
}
