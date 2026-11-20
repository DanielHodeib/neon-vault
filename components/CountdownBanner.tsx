'use client';

import { RefreshCw, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from './I18n';
import { useLive } from './SocketProvider';

/** Countdown strip under the header for a server restart or scheduled maintenance. */
export function CountdownBanner() {
  const { countdown } = useLive();
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!countdown) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [countdown]);
  if (!countdown) return null;
  const left = Math.max(0, Math.ceil((countdown.at - now) / 1000));
  const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  const restart = countdown.kind === 'restart';
  return (
    <div
      role="status"
      className={`flex shrink-0 items-center justify-center gap-2 px-3 py-2 text-center text-sm font-medium ${restart ? 'bg-sky-500/15 text-sky-200' : 'bg-gold/15 text-gold'}`}
    >
      {restart ? <RefreshCw size={15} className={left ? '' : 'animate-spin'} /> : <Wrench size={15} />}
      <span>
        {left
          ? restart
            ? t('Server-Neustart in ')
            : countdown.minutes
              ? t('Wartung (ca. {n} Min.) in ', { n: countdown.minutes })
              : t('Wartung in ')
          : restart
            ? t('Neustart läuft – gleich wieder da …')
            : t('Wartung beginnt …')}
        {left > 0 && <span className="num font-bold">{time}</span>}
      </span>
      <span className="hidden text-xs opacity-70 sm:inline">· {t('Laufende Einsätze werden zurückgebucht')}</span>
    </div>
  );
}
