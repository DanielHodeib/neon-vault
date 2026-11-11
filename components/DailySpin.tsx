'use client';

import { Flame } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import toast from 'react-hot-toast';

import { dailySpinAction } from '@/app/actions/account';
import { coins } from '@/lib/format';
import { DAILY_SEGMENTS, streakMultiplier } from '@/lib/games';
import { useT } from './I18n';

const SEG = 360 / DAILY_SEGMENTS.length;
const SPIN_MS = 4200;
const label = (v: number) => (v >= 1000 ? `${String(v / 1000).replace('.', ',')}k` : String(v));
const fill = (v: number) => (v >= 25_000 ? 'var(--color-gold)' : v >= 7_500 ? 'var(--accent)' : null);
const WHEEL_BG = `conic-gradient(${DAILY_SEGMENTS.map((s, i) => `${fill(s.value) ?? (i % 2 ? '#1d2127' : '#252a32')} ${i * SEG}deg ${(i + 1) * SEG}deg`).join(',')})`;
const factor = (m: number) => `×${m.toFixed(1).replace('.', ',')}`;

export function DailySpin({ username, claimedToday, streak }: { username: string; claimedToday: boolean; streak: number }) {
  const router = useRouter();
  const t = useT();
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [done, setDone] = useState(claimedToday);

  const spin = async () => {
    setSpinning(true);
    const res = await dailySpinAction();
    if (!res.ok) {
      toast.error(t(res.error));
      setSpinning(false);
      return;
    }
    // Land the winning segment under the pointer at the top.
    setRotation((r) => r - (r % 360) + 360 * 5 + (360 - res.index * SEG - SEG / 2));
    setTimeout(() => {
      toast.success(`+${coins(res.reward)} NVC · ${t('Tag {n}', { n: res.streak })} (${factor(res.multiplier)})`);
      setSpinning(false);
      setDone(true);
      router.refresh();
    }, SPIN_MS);
  };

  // `streak` is today's streak once spun, otherwise the streak a spin today would reach.
  const shown = streak;
  const next = done ? streak + 1 : streak;

  return (
    <section className="panel grid gap-6 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
      <div className="space-y-4">
        <div>
          <p className="eyebrow">{t('Willkommen zurück')}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{username}</h1>
        </div>
        <div>
          <p className="flex items-center gap-2 text-sm">
            <Flame size={16} className={shown > 1 ? 'text-gold' : 'text-faint'} />
            <span>
              {t('Serie:')} <span className="num font-semibold">{shown}</span> {shown === 1 ? t('Tag') : t('Tage')}
            </span>
            <span className="text-muted">· Bonus {factor(streakMultiplier(shown))}</span>
          </p>
          <div className="mt-2 flex gap-1" aria-hidden>
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i < Math.min(shown, 10) ? 'bg-gold' : 'bg-raised'}`} />
            ))}
          </div>
          <p className="mt-2 text-xs text-faint">
            {done ? t('Morgen wieder drehen – dann Tag {n} mit {f}.', { n: next, f: factor(streakMultiplier(next)) }) : t('Jeden Tag drehen: +10 % pro Tag in Folge, bis ×1,9.')}
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="absolute -top-1.5 left-1/2 z-10 h-0 w-0 -translate-x-1/2 border-x-[7px] border-t-[12px] border-x-transparent border-t-fg" />
          <div
            className="relative h-44 w-44 rounded-full border-4 border-raised"
            style={{ background: WHEEL_BG, transform: `rotate(${rotation}deg)`, transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(.12,.7,.2,1)` : 'none' }}
          >
            {DAILY_SEGMENTS.map((s, i) => (
              <span
                key={i}
                className="num absolute top-1/2 left-1/2 text-[10px] font-semibold"
                style={{ transform: `translate(-50%, -50%) rotate(${i * SEG + SEG / 2}deg) translateY(-62px)`, color: fill(s.value) ? '#0a0b0d' : 'var(--color-fg)' }}
              >
                {label(s.value)}
              </span>
            ))}
          </div>
          <div className="absolute inset-0 m-auto h-10 w-10 rounded-full border border-line bg-surface" />
        </div>
        <button className="btn-primary w-44" onClick={spin} disabled={spinning || done}>
          {spinning ? t('Dreht …') : done ? t('Morgen wieder') : 'Daily Spin'}
        </button>
      </div>
    </section>
  );
}
