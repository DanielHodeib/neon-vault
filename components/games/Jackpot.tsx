'use client';

import { useCallback, useEffect, useState } from 'react';

import { coins } from '@/lib/format';
import { JACKPOT_CLOSE_MS, JACKPOT_FEE } from '@/lib/wheel';
import { useJoin, useLive, useSocketEvent } from '../SocketProvider';
import { BetInput, Empty } from '../ui';
import { GameFrame } from './GameFrame';
import { NameDot, Reactions } from './Reactions';
import { sound } from './sound';
import { useCue } from './useCue';
import { useT } from '@/components/I18n';

type Winner = { userId: string; username: string; win: number; pot: number; chance: number };
type State = {
  phase: 'open' | 'drawing';
  endsAt: number | null;
  pot: number;
  winner: Winner | null;
  history: Winner[];
  players: { userId: string; username: string; total: number; chance: number }[];
};

const COLORS = ['#2f7fd1', '#8b5cf6', '#e4c06a', '#4ade80', '#f87171', '#22b8cf', '#f59e0b', '#ec4899'];
const pct = (n: number) => `${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;

export function Jackpot() {
  const t = useT();
  const { call, me, balance } = useLive();
  const [state, setState] = useState<State | null>(null);
  const [amount, setAmount] = useState(100);
  const [highlight, setHighlight] = useState<Winner | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useJoin<{ state: State }>('jackpot:join', useCallback((r) => setState(r.state), []));
  useSocketEvent('jackpot:state', setState);
  useSocketEvent('jackpot:result', setHighlight);
  useCue(highlight?.userId ?? null, (winner) => winner && (winner === me.id ? sound.big() : sound.stop()));

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!highlight) return;
    const t = setTimeout(() => setHighlight(null), 5000);
    return () => clearTimeout(t);
  }, [highlight]);

  if (!state) return <GameFrame title="Jackpot" stage={<div className="panel aspect-[2/1] animate-pulse" />} controls={null} />;

  const seconds = state.endsAt === null ? null : Math.max(0, Math.ceil((state.endsAt - now) / 1000));
  const open = state.phase === 'open' && (state.endsAt === null || state.endsAt - now >= JACKPOT_CLOSE_MS);
  const status = state.phase === 'drawing' ? t('Ziehung …') : seconds === null ? t('Wartet auf einen zweiten Spieler') : open ? t('Ziehung in {n}s', { n: seconds }) : t('Einzahlungen geschlossen');

  const stage = (
    <div className="panel space-y-5 p-4 sm:p-6">
      <div className="text-center">
        <p className="eyebrow">Pot</p>
        <p className="num text-4xl font-semibold text-gold sm:text-5xl">{coins(state.pot)}</p>
        <p className="mt-1 text-sm text-muted">{status}</p>
        {highlight && (
          <p className="mt-3 text-sm">
            <span className="font-semibold text-win">{highlight.username}</span> {t('gewinnt')} <span className="num font-semibold text-gold">{coins(highlight.win)}</span> {t('mit {p} Chance', { p: pct(highlight.chance) })}
          </p>
        )}
      </div>
      {state.players.length > 0 && (
        <div className="flex h-3 overflow-hidden rounded-full bg-raised">
          {state.players.map((p, i) => (
            <div key={p.userId} style={{ width: `${p.chance}%`, background: COLORS[i % COLORS.length] }} />
          ))}
        </div>
      )}
      {state.players.length === 0 ? (
        <Empty>{t('Noch keine Einzahlungen in dieser Runde.')}</Empty>
      ) : (
        <ul className="space-y-2">
          {state.players.map((p, i) => (
            <li key={p.userId} className={`rounded-lg border p-3 transition ${highlight?.userId === p.userId ? 'border-win bg-win/10' : 'border-line'}`}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className={`flex min-w-0 items-center gap-2 ${p.userId === me.id ? 'text-accent' : ''}`}>
                <NameDot name={p.username} /> <span className="truncate">{p.username}</span>
              </span>
                <span className="num shrink-0 text-muted">
                  {coins(p.total)} · <span className="text-fg">{pct(p.chance)}</span>
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised">
                <div className="h-full rounded-full" style={{ width: `${p.chance}%`, background: COLORS[i % COLORS.length] }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const controls = (
    <div className="card space-y-4">
      <BetInput value={amount} onChange={setAmount} balance={balance} />
      <button className="btn-primary w-full" onClick={() => void call('jackpot:deposit', { amount })} disabled={!open || amount < 1}>
        {t('Einzahlen')}
      </button>
      <p className="text-xs text-muted">
        {t('Gewinnchance proportional zur Einzahlung. Der Gewinner bekommt den Pot abzüglich {fee} % Gebühr. Die Runde startet ab zwei Spielern.', { fee: JACKPOT_FEE * 100 })}
      </p>
    </div>
  );

  const extra = (
    <div className="panel">
      <p className="border-b border-line px-4 py-3 text-sm font-semibold">{t('Letzte Gewinner')}</p>
      {state.history.length === 0 ? (
        <Empty>{t('Noch keine Ziehung.')}</Empty>
      ) : (
        <ul className="divide-y divide-line text-sm">
          {state.history.map((w, i) => (
            <li key={i} className="flex justify-between gap-3 px-4 py-2.5">
              <span className={`truncate ${w.userId === me.id ? 'text-accent' : ''}`}>{w.username}</span>
              <span className="num shrink-0 text-muted">
                <span className="text-gold">{coins(w.win)}</span> · {pct(w.chance)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return <GameFrame title="Jackpot" subtitle={t('Gemeinsamer Pot · einer gewinnt alles')} stage={<Reactions room="jackpot">{stage}</Reactions>} controls={controls} extra={extra} />;
}
