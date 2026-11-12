'use client';

import { useCallback, useState } from 'react';

import { VIDEO_POKER_PAYS, type VideoPokerHand } from '@/lib/arcade';
import { coins } from '@/lib/format';
import { useT } from '@/components/I18n';
import { useJoin, useLive } from '../SocketProvider';
import { BetInput } from '../ui';
import { GameFrame } from './GameFrame';
import { sound } from './sound';
import { Felt, PlayingCard } from './TableLobby';

type Draw = { cards: string[]; hand: VideoPokerHand | null; multiplier: number; payout: number };

/** Video Poker (Jacks or Better): five cards, hold the good ones, draw once. */
export function VideoPoker() {
  const t = useT();
  const { call, balance } = useLive();
  const [amount, setAmount] = useState(100);
  const [cards, setCards] = useState<string[]>(['??', '??', '??', '??', '??']);
  const [hold, setHold] = useState([false, false, false, false, false]);
  const [phase, setPhase] = useState<'idle' | 'dealt' | 'done'>('idle');
  const [hand, setHand] = useState<VideoPokerHand | null>(null);
  const [bet, setBet] = useState(0);
  const [result, setResult] = useState<Draw | null>(null);
  const [deal, setDeal] = useState(0); // remounts the cards so they flip in again
  const [busy, setBusy] = useState(false);

  // A hand dealt before a reload is still open on the server.
  useJoin(
    'vpoker:state',
    useCallback((r: { hand: { bet: number; cards: string[] } | null }) => {
      if (!r.hand) return;
      setCards(r.hand.cards);
      setBet(r.hand.bet);
      setPhase('dealt');
    }, []),
  );

  const dealCards = async () => {
    setBusy(true);
    const res = await call<{ cards: string[]; hand: VideoPokerHand | null }>('vpoker:deal', { amount });
    setBusy(false);
    if (!res) return;
    setCards(res.cards);
    setHand(res.hand);
    setHold([false, false, false, false, false]);
    setBet(amount);
    setResult(null);
    setPhase('dealt');
    setDeal((d) => d + 1);
    sound.card();
  };

  const draw = async () => {
    setBusy(true);
    const res = await call<Draw>('vpoker:draw', { hold });
    setBusy(false);
    if (!res) return;
    setCards(res.cards);
    setHand(res.hand);
    setResult(res);
    setPhase('done');
    setDeal((d) => d + 1);
    if (res.multiplier >= 25) sound.big();
    else if (res.multiplier >= 2) sound.win(res.multiplier >= 6 ? 2 : 1);
    else if (res.multiplier) sound.gem();
    else sound.lose();
  };

  const best = VIDEO_POKER_PAYS.find((p) => p.key === hand);

  const stage = (
    <Felt>
      <div className="vp-cards flex justify-center gap-2 py-4 sm:gap-3">
        {cards.map((c, i) => (
          <button
            key={`${deal}-${i}`}
            disabled={phase !== 'dealt'}
            onClick={() => setHold((h) => h.map((x, j) => (j === i ? !x : x)))}
            aria-pressed={hold[i]}
            className={`pop-in flex flex-col items-center gap-1.5 transition ${hold[i] ? '-translate-y-2' : ''}`}
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <PlayingCard card={c} />
            <span className={`h-5 rounded px-2 text-[10px] font-bold tracking-wider uppercase ${hold[i] ? 'bg-gold text-black' : 'text-transparent'}`}>{t('Halten')}</span>
          </button>
        ))}
      </div>
      <p className="min-h-7 text-center text-lg font-semibold">
        {phase === 'done' && result ? (
          result.multiplier ? (
            <span className="text-win">
              {t(best?.name ?? '')} · +<span className="num">{coins(result.payout)}</span> NVC
            </span>
          ) : (
            <span className="text-white/60">{t('Nichts dabei')}</span>
          )
        ) : phase === 'dealt' ? (
          <span className="text-white/70">{best ? t('Du hast schon: {hand}', { hand: t(best.name) }) : t('Tippe die Karten an, die du halten willst')}</span>
        ) : null}
      </p>
    </Felt>
  );

  const controls = (
    <div className="card space-y-4">
      <BetInput value={amount} onChange={setAmount} balance={balance} />
      {phase === 'dealt' ? (
        <button className="btn-primary h-12 w-full text-base" onClick={draw} disabled={busy}>
          {t('Ziehen')} · {t('{n} gehalten', { n: hold.filter(Boolean).length })}
        </button>
      ) : (
        <button className="btn-primary h-12 w-full text-base" onClick={dealCards} disabled={busy}>
          {t('Geben')}
        </button>
      )}
      <ul className="space-y-0.5 text-sm">
        {VIDEO_POKER_PAYS.map((p) => (
          <li key={p.key} className={`flex justify-between rounded-md px-2 py-0.5 ${hand === p.key ? (phase === 'done' ? 'bg-gold/20 text-gold' : 'bg-accent/10 text-fg') : ''}`}>
            <span>{t(p.name)}</span>
            <span className="num">
              {p.multiplier}× <span className="text-faint">= {coins(Math.floor((phase === 'dealt' ? bet : amount) * p.multiplier))}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-faint">{t('Jacks or Better: ab einem Paar Buben gewinnst du. Mit klugem Halten ≈ 98 %.')}</p>
    </div>
  );

  return <GameFrame title="Video Poker" subtitle={t('Halten, ziehen, gewinnen.')} stage={stage} controls={controls} />;
}
