'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { SCRATCH_PRIZES } from '@/lib/arcade';
import { coins } from '@/lib/format';
import { useT } from '@/components/I18n';
import { useLive } from '../SocketProvider';
import { BetInput } from '../ui';
import { GameFrame } from './GameFrame';
import { sound } from './sound';

type Card = { fields: string[]; multiplier: number; symbol: string | null; payout: number; bet: number };

const BRUSH = 22;

/** Rubbellos: buy a card, scratch the silver layer off (mouse or finger), three equal symbols win. */
export function Scratch() {
  const t = useT();
  const { call, balance, holdBalance, shiftBalance } = useLive();
  const [amount, setAmount] = useState(100);
  const [card, setCard] = useState<Card | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const release = useRef<(() => void) | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // Paint the silver layer whenever a new card arrives.
  useEffect(() => {
    const c = canvas.current;
    if (!card || !c) return;
    const box = c.getBoundingClientRect();
    c.width = box.width * devicePixelRatio;
    c.height = box.height * devicePixelRatio;
    const g = c.getContext('2d')!;
    g.scale(devicePixelRatio, devicePixelRatio);
    const grad = g.createLinearGradient(0, 0, box.width, box.height);
    grad.addColorStop(0, '#b8bcc6');
    grad.addColorStop(0.5, '#e6e8ee');
    grad.addColorStop(1, '#9aa0ab');
    g.fillStyle = grad;
    g.fillRect(0, 0, box.width, box.height);
    g.fillStyle = '#7c828e';
    g.font = '600 13px system-ui, sans-serif';
    g.textAlign = 'center';
    for (let y = 30; y < box.height; y += 46) for (let x = 40; x < box.width; x += 90) g.fillText('NEON', x + ((y / 46) % 2) * 45, y);
    g.globalCompositeOperation = 'destination-out';
  }, [card]);

  const finish = useCallback(() => {
    if (!card || revealed) return;
    setRevealed(true);
    shiftBalance(card.payout); // the stake left on purchase; the prize shows up once it's uncovered
    release.current?.();
    release.current = null;
    if (card.multiplier >= 20) sound.big();
    else if (card.multiplier >= 2) sound.win(card.multiplier >= 5 ? 2 : 1);
    else if (card.multiplier) sound.gem();
    else sound.lose();
  }, [card, revealed, shiftBalance]);

  // Leaving the page mid-card must not freeze the balance.
  useEffect(() => () => release.current?.(), []);

  const scratch = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || revealed) return;
    const c = e.currentTarget;
    const box = c.getBoundingClientRect();
    const g = c.getContext('2d')!;
    const p = { x: e.clientX - box.left, y: e.clientY - box.top };
    // A line from the last point: fast swipes skip pointer events and would leave only dots.
    g.lineWidth = BRUSH * 2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(last.current?.x ?? p.x, last.current?.y ?? p.y);
    g.lineTo(p.x, p.y);
    g.stroke();
    last.current = p;
  };

  // How much silver is gone: sample a grid of pixels; more than 55 % reveals the rest.
  const checkCleared = () => {
    const c = canvas.current;
    if (!c || revealed) return;
    const { data } = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    let clear = 0;
    let total = 0;
    for (let i = 3; i < data.length; i += 4 * 97) {
      total++;
      if (data[i] === 0) clear++;
    }
    if (clear / total > 0.55) finish();
  };

  const buy = async () => {
    setBusy(true);
    const hold = holdBalance(5 * 60_000); // scratching may take a while; the result stays hidden meanwhile
    const res = await call<Omit<Card, 'bet'>>('scratch:buy', { amount });
    setBusy(false);
    if (!res) return hold();
    release.current?.();
    release.current = hold;
    shiftBalance(-amount);
    setRevealed(false);
    setCard({ ...res, bet: amount });
    sound.start();
  };

  const winning = (s: string) => revealed && card?.symbol === s;

  const stage = (
    <div className="panel p-3 sm:p-6">
      <div className="relative mx-auto max-w-sm overflow-hidden rounded-2xl border-4 border-gold/40 bg-gradient-to-br from-[#2a1d05] to-[#120d04] p-3 shadow-[0_0_40px_#e4c06a22]">
        <p className="mb-2 text-center text-xs font-bold tracking-[.25em] text-gold uppercase">{t('3 gleiche gewinnen')}</p>
        <div className="relative">
          <div className="grid grid-cols-3 gap-2">
            {(card?.fields ?? Array.from({ length: 9 }, () => '❔')).map((s, i) => (
              <div
                key={i}
                className={`grid aspect-square place-items-center rounded-xl bg-black/40 text-4xl transition sm:text-5xl ${winning(s) ? 'scale-105 bg-gold/20 ring-2 ring-gold' : revealed && card?.symbol ? 'opacity-40' : ''}`}
              >
                {s}
              </div>
            ))}
          </div>
          {card && !revealed && (
            <canvas
              ref={canvas}
              className="absolute inset-0 h-full w-full cursor-crosshair touch-none rounded-xl"
              onPointerDown={(e) => {
                drawing.current = true;
                last.current = null;
                e.currentTarget.setPointerCapture(e.pointerId);
                scratch(e);
              }}
              onPointerMove={scratch}
              onPointerUp={() => {
                drawing.current = false;
                checkCleared();
              }}
              onPointerCancel={() => (drawing.current = false)}
            />
          )}
          {!card && <div className="absolute inset-0 grid place-items-center rounded-xl bg-black/50 text-sm text-white/80">{t('Kauf ein Los')}</div>}
        </div>
      </div>
      <p className="mt-4 min-h-7 text-center text-lg font-semibold">
        {card && revealed ? (
          card.multiplier ? (
            <span className="text-win">
              {card.symbol} {card.multiplier}× · +<span className="num">{coins(card.payout)}</span> NVC
            </span>
          ) : (
            <span className="text-muted">{t('Leider nichts – nächstes Los?')}</span>
          )
        ) : (
          card && <span className="text-muted">{t('Rubbel mit Maus oder Finger')}</span>
        )}
      </p>
    </div>
  );

  const controls = (
    <div className="card space-y-4">
      <BetInput value={amount} onChange={setAmount} balance={balance} />
      {card && !revealed ? (
        <button className="btn-secondary h-12 w-full text-base" onClick={finish}>
          {t('Alles aufdecken')}
        </button>
      ) : (
        <button className="btn-primary h-12 w-full text-base" onClick={buy} disabled={busy}>
          {t('Los kaufen')} · <span className="num">{coins(amount)}</span>
        </button>
      )}
      <ul className="space-y-1 text-sm">
        {SCRATCH_PRIZES.map((p) => (
          <li key={p.symbol} className={`flex items-center justify-between rounded-lg px-2 py-1 ${winning(p.symbol) ? 'bg-gold/15 text-gold' : ''}`}>
            <span>
              {p.symbol} {p.symbol} {p.symbol}
            </span>
            <span className="num">
              {p.multiplier}× <span className="text-faint">= {coins(Math.floor(amount * p.multiplier))}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-faint">{t('Jedes Los hat 9 Felder. 98 % fließen im Schnitt zurück.')}</p>
    </div>
  );

  return <GameFrame title="Rubbellos" subtitle={t('Rubbeln, hoffen, jubeln.')} stage={stage} controls={controls} />;
}
