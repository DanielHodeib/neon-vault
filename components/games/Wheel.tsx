'use client';

import { useCallback, useEffect, useState } from 'react';

import { coins } from '@/lib/format';
import { bonusColor, WHEEL_BONUS_MS, WHEEL_BONUS_SEGMENTS, WHEEL_BONUS_TRIGGER, WHEEL_OPTIONS, WHEEL_SEGMENTS, wheelColor } from '@/lib/wheel';
import { useJoin, useLive, useSocketEvent } from '../SocketProvider';
import { BetInput, Empty } from '../ui';
import { GameFrame } from './GameFrame';
import { NameDot, Reactions } from './Reactions';
import { sound } from './sound';
import { useCue } from './useCue';
import { useT } from '@/components/I18n';

type Bet = { multiplier: number; amount: number };
type State = { phase: 'betting' | 'spinning' | 'bonus' | 'result'; endsAt: number; index: number | null; bonusIndex: number | null; history: number[]; players: { userId: string; username: string; bets: Bet[] }[] };

const SEG = 360 / WHEEL_SEGMENTS.length;
const WHEEL_BG = `conic-gradient(${WHEEL_SEGMENTS.map((m, i) => `${wheelColor(m)} ${i * SEG}deg ${(i + 1) * SEG - 0.6}deg, #0a0b0d ${(i + 1) * SEG - 0.6}deg ${(i + 1) * SEG}deg`).join(',')})`;
const label = (m: number) => `${String(m).replace('.', ',')}×`;
const BSEG = 360 / WHEEL_BONUS_SEGMENTS.length;
const BONUS_BG = `conic-gradient(${WHEEL_BONUS_SEGMENTS.map((m, i) => `${bonusColor(m)} ${i * BSEG}deg ${(i + 1) * BSEG - 0.8}deg, #0a0b0d ${(i + 1) * BSEG - 0.8}deg ${(i + 1) * BSEG}deg`).join(',')})`;

/** Second wheel after a gold hit: spins to the bonus multiplier the server drew. */
function BonusWheel({ index, settled }: { index: number; settled: boolean }) {
  const t = useT();
  const [rotation, setRotation] = useState(0);
  useEffect(() => {
    // next frame, so the transition runs from 0 to the target
    const id = requestAnimationFrame(() => setRotation(360 * 7 + (360 - index * BSEG - BSEG / 2)));
    return () => cancelAnimationFrame(id);
  }, [index]);
  const value = WHEEL_BONUS_SEGMENTS[index];
  return (
    <div className="pop-in flex flex-col items-center gap-3 rounded-2xl border border-gold/50 bg-gradient-to-b from-gold/15 to-transparent p-4 shadow-[0_0_50px_#e4c06a33]">
      <p className="text-xs font-bold tracking-[.3em] text-gold uppercase">{t('Bonus-Rad')}</p>
      <div className="relative">
        <div className="absolute -top-1 left-1/2 z-10 h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[12px] border-x-transparent border-t-gold" />
        <div className="relative h-44 w-44 rounded-full border-4 border-gold/60" style={{ background: BONUS_BG, transform: `rotate(${rotation}deg)`, transition: `transform ${WHEEL_BONUS_MS - 1200}ms cubic-bezier(.12,.7,.2,1)` }}>
          {WHEEL_BONUS_SEGMENTS.map((m, i) => (
            <span key={i} className="num absolute top-1/2 left-1/2 text-[9px] font-bold text-white" style={{ transform: `translate(-50%, -50%) rotate(${i * BSEG + BSEG / 2}deg) translateY(-70px)` }}>
              {m}
            </span>
          ))}
        </div>
        <div className="absolute inset-0 m-auto grid h-16 w-16 place-items-center rounded-full border border-gold/40 bg-surface">
          <span className={`num font-bold ${settled ? 'pop-in text-2xl' : 'text-sm text-muted'}`} style={settled ? { color: bonusColor(value) } : undefined}>
            {settled ? label(value) : '…'}
          </span>
        </div>
      </div>
      <p className="text-center text-xs text-muted">{t('Alle Einsätze auf 30× zahlen den Bonus-Multiplikator.')}</p>
    </div>
  );
}

export function Wheel() {
  const t = useT();
  const { call, me, balance } = useLive();
  const [state, setState] = useState<State | null>(null);
  const [amount, setAmount] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const onState = useCallback((s: State) => {
    setState(s);
    // Spin so the winning segment ends under the pointer at the top.
    if (s.phase === 'spinning' && s.index !== null) {
      const index = s.index;
      setRotation((r) => r - (r % 360) + 360 * 6 + (360 - index * SEG - SEG / 2));
    }
  }, []);
  useJoin<{ state: State }>('wheel:join', useCallback((r) => onState(r.state), [onState]));
  useSocketEvent('wheel:state', onState);

  useCue(state?.phase, (phase) => {
    if (phase === 'spinning') sound.start();
    if (phase === 'bonus') sound.feature();
    if (phase === 'result' && state?.index != null) {
      const hit = state.players.some((p) => p.userId === me.id && p.bets.some((b) => b.multiplier === WHEEL_SEGMENTS[state.index!]));
      (hit ? () => (state.bonusIndex !== null ? sound.big() : sound.win(1)) : sound.stop)();
    }
  });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  if (!state) return <GameFrame title="Glücksrad" stage={<div className="panel aspect-[2/1] animate-pulse" />} controls={null} />;

  const open = state.phase === 'betting';
  const result = state.index === null ? null : WHEEL_SEGMENTS[state.index];
  const seconds = Math.max(0, Math.ceil((state.endsAt - now) / 1000));
  const mine = state.players.find((p) => p.userId === me.id)?.bets ?? [];
  const onMine = (m: number) => mine.filter((b) => b.multiplier === m).reduce((s, b) => s + b.amount, 0);
  const bet = (multiplier: number) => void call('wheel:bet', { bets: [{ multiplier, amount }] });

  const stage = (
    <div className="panel space-y-5 p-4 sm:p-5">
      <div className="flex flex-col items-center gap-5 sm:flex-row">
        <div className="relative shrink-0">
          <div className="absolute -top-1 left-1/2 z-10 h-0 w-0 -translate-x-1/2 border-x-[8px] border-t-[14px] border-x-transparent border-t-fg" />
          <div
            className="h-56 w-56 rounded-full border-[6px] border-raised shadow-inner sm:h-64 sm:w-64"
            style={{ background: WHEEL_BG, transform: `rotate(${rotation}deg)`, transition: state.phase === 'spinning' ? 'transform 5.5s cubic-bezier(.12,.7,.2,1)' : 'none' }}
          />
          <div className="absolute inset-0 m-auto grid h-24 w-24 place-items-center rounded-full border border-line bg-surface">
            {state.phase === 'bonus' ? (
              <span className="text-sm font-bold tracking-wider text-gold">BONUS!</span>
            ) : state.phase === 'result' && result !== null ? (
              <span className="num text-3xl font-semibold" style={{ color: wheelColor(result) }}>{label(result)}</span>
            ) : (
              <span className="num text-xl text-muted">{state.phase === 'spinning' ? '…' : `${seconds}s`}</span>
            )}
          </div>
        </div>
        <div className="w-full min-w-0 text-center sm:text-left">
          <p className="text-sm font-medium">{open ? t('Einsätze offen') : state.phase === 'spinning' ? t('Das Rad dreht sich') : state.phase === 'bonus' ? t('Gold! Das Bonus-Rad dreht sich …') : t('Ergebnis')}</p>
          <p className="text-xs text-muted">{t('Setze auf einen Multiplikator – trifft er, bekommst du Einsatz × Multiplikator.')}</p>
          <div className="mt-3 flex flex-wrap justify-center gap-1 sm:justify-start">
            {state.history.slice(0, 14).map((m, i) => (
              <span key={i} className="num grid h-7 min-w-9 place-items-center rounded-md px-1 text-[11px] font-semibold text-white" style={{ background: wheelColor(m) }}>{label(m)}</span>
            ))}
          </div>
        </div>
      </div>
      {state.bonusIndex !== null && result === WHEEL_BONUS_TRIGGER && <BonusWheel index={state.bonusIndex} settled={state.phase === 'result'} />}
    </div>
  );

  const controls = (
    <div className="card space-y-4">
      <BetInput value={amount} onChange={setAmount} balance={balance} />
      <div className="grid grid-cols-2 gap-2">
        {WHEEL_OPTIONS.map((o) => (
          <button
            key={o.multiplier}
            onClick={() => bet(o.multiplier)}
            disabled={!open || amount < 1}
            className={`rounded-lg border-2 px-3 py-2.5 text-left transition hover:brightness-125 disabled:opacity-50 ${result === o.multiplier && state.phase === 'result' ? 'ring-2 ring-fg' : ''}`}
            style={{ borderColor: o.color, background: `${o.color}26` }}
          >
            <span className="num block text-lg font-semibold">{label(o.multiplier)}</span>
            <span className="num block text-xs text-muted">{onMine(o.multiplier) ? t('Gesetzt: {n}', { n: coins(onMine(o.multiplier)) }) : o.multiplier === WHEEL_BONUS_TRIGGER ? t('Bonus-Rad bis 200×') : t('{n} von 30 Feldern', { n: o.count })}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const extra = (
    <div className="panel">
      <p className="border-b border-line px-4 py-3 text-sm font-semibold">{t('Am Rad')}</p>
      {state.players.length === 0 ? (
        <Empty>{t('Noch keine Einsätze in dieser Runde.')}</Empty>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {state.players.map((p) => (
            <li key={p.userId} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className={`flex min-w-0 items-center gap-2 ${p.userId === me.id ? 'text-accent' : ''}`}>
                <NameDot name={p.username} /> <span className="truncate">{p.username}</span>
              </span>
              <span className="flex flex-wrap justify-end gap-1">
                {p.bets.map((b, i) => (
                  <span key={i} className="num rounded px-1.5 py-px text-[11px]" style={{ background: `${wheelColor(b.multiplier)}40` }}>
                    {label(b.multiplier)} {coins(b.amount)}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return <GameFrame title="Glücksrad" subtitle={t('Gemeinsames Rad · neue Runde alle 25 Sekunden')} stage={<Reactions room="wheel">{stage}</Reactions>} controls={controls} extra={extra} />;
}
