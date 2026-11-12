'use client';

import { useEffect, useRef, useState } from 'react';

import { BACCARAT_LABEL, BACCARAT_PAYS, baccaratTotal, type BaccaratSide } from '@/lib/arcade';
import { coins } from '@/lib/format';
import { useT } from '@/components/I18n';
import { useLive } from '../SocketProvider';
import { BetInput } from '../ui';
import { GameFrame } from './GameFrame';
import { sound } from './sound';
import { Felt, PlayingCard } from './TableLobby';

type Hand = { player: string[]; banker: string[]; playerTotal: number; bankerTotal: number; winner: BaccaratSide; side: BaccaratSide; multiplier: number; payout: number };
const SIDES: BaccaratSide[] = ['player', 'tie', 'banker'];
const STEP_MS = 450;

/** Baccarat: bet on Spieler, Bank or Unentschieden; cards are dealt one by one like at the table. */
export function Baccarat() {
  const t = useT();
  const { call, balance, holdBalance, shiftBalance } = useLive();
  const [amount, setAmount] = useState(100);
  const [side, setSide] = useState<BaccaratSide>('banker');
  const [hand, setHand] = useState<Hand | null>(null);
  const [dealt, setDealt] = useState(0); // cards shown so far, in table order
  const [roads, setRoads] = useState<BaccaratSide[]>([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  // Table order: P1, B1, P2, B2, then the third cards (player first). By position: an 8-deck shoe can repeat a card.
  const step = (who: 'player' | 'banker', i: number) => (i < 2 ? i * 2 + (who === 'banker' ? 1 : 0) : who === 'player' ? 4 : 4 + (hand && hand.player.length > 2 ? 1 : 0));
  const shownPlayer = hand ? hand.player.filter((_, i) => step('player', i) < dealt) : [];
  const shownBanker = hand ? hand.banker.filter((_, i) => step('banker', i) < dealt) : [];
  const done = !!hand && dealt >= hand.player.length + hand.banker.length;

  const play = async () => {
    setBusy(true);
    const release = holdBalance();
    const res = await call<Hand>('baccarat:play', { amount, side });
    if (!res) {
      setBusy(false);
      return release();
    }
    shiftBalance(-amount);
    setHand(res);
    setDealt(0);
    const total = res.player.length + res.banker.length;
    let n = 0;
    timer.current = setInterval(() => {
      n++;
      setDealt(n);
      sound.card();
      if (n >= total) {
        clearInterval(timer.current!);
        shiftBalance(res.payout);
        release();
        setBusy(false);
        setRoads((r) => [res.winner, ...r].slice(0, 30));
        if (res.multiplier > 1) (res.side === 'tie' ? sound.big : () => sound.win(2))();
        else if (res.multiplier === 1) sound.gem();
        else sound.lose();
      }
    }, STEP_MS);
  };

  const box = (who: 'player' | 'banker', cards: string[]) => (
    <div className={`flex-1 rounded-xl border p-3 text-center transition ${done && hand?.winner === who ? 'border-gold bg-gold/10' : 'border-white/10'}`}>
      <p className="text-xs font-semibold tracking-wider text-white/60 uppercase">{t(BACCARAT_LABEL[who])}</p>
      <div className="vp-cards mt-2 flex min-h-[5rem] justify-center gap-1.5">
        {cards.map((c, i) => (
          <span key={i} className="pop-in">
            <PlayingCard card={c} />
          </span>
        ))}
      </div>
      <p className="num mt-2 text-2xl font-bold text-white">{cards.length ? baccaratTotal(cards) : '–'}</p>
    </div>
  );

  const stage = (
    <Felt>
      <div className="flex gap-3">
        {box('player', shownPlayer)}
        {box('banker', shownBanker)}
      </div>
      <p className="mt-4 min-h-7 text-center text-lg font-semibold">
        {done && hand ? (
          hand.multiplier > 1 ? (
            <span className="text-win">{t('{who} gewinnt', { who: t(BACCARAT_LABEL[hand.winner]) })} · +<span className="num">{coins(hand.payout)}</span> NVC</span>
          ) : hand.multiplier === 1 ? (
            <span className="text-white/80">{t('Unentschieden – Einsatz zurück')}</span>
          ) : (
            <span className="text-white/60">{t('{who} gewinnt', { who: t(BACCARAT_LABEL[hand.winner]) })}</span>
          )
        ) : null}
      </p>
      {roads.length > 0 && (
        <div className="mt-3 flex flex-wrap justify-center gap-1" aria-label={t('Letzte Ergebnisse')}>
          {roads.map((r, i) => (
            <span key={i} className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${r === 'player' ? 'bg-sky-500 text-white' : r === 'banker' ? 'bg-red-500 text-white' : 'bg-win text-black'}`}>
              {t(BACCARAT_LABEL[r])[0]}
            </span>
          ))}
        </div>
      )}
    </Felt>
  );

  const controls = (
    <div className="card space-y-4">
      <BetInput value={amount} onChange={setAmount} balance={balance} />
      <div className="grid grid-cols-3 gap-2">
        {SIDES.map((s) => (
          <button key={s} onClick={() => setSide(s)} aria-pressed={side === s} disabled={busy} className={`flex flex-col items-center rounded-xl border py-3 text-sm transition ${side === s ? 'border-accent bg-accent/15' : 'border-line hover:border-line-strong'}`}>
            <span className="font-semibold">{t(BACCARAT_LABEL[s])}</span>
            <span className="num text-xs text-muted">{BACCARAT_PAYS[s]}×</span>
          </button>
        ))}
      </div>
      <button className="btn-primary h-12 w-full text-base" onClick={play} disabled={busy}>
        {t('Geben')}
      </button>
      <p className="text-xs text-faint">{t('Wer näher an 9 kommt, gewinnt. Bank zahlt 1,95× (5 % Kommission), bei Unentschieden kommen Spieler- und Bank-Einsätze zurück.')}</p>
    </div>
  );

  return <GameFrame title="Baccarat" subtitle={t('Spieler oder Bank – wer kommt näher an die 9?')} stage={stage} controls={controls} />;
}
