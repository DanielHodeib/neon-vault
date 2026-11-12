'use client';

import { Download, Share, X } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { useT } from './I18n';
import { usePref } from './usePref';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const noSubscribe = () => () => {};
// iPhone/iPad Safari has no install event; there it's "Share → Add to Home Screen".
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !('MSStream' in window);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Phone-only banner: install the casino as an app (Android prompt, iOS hint). Dismissed for good with ×. */
export function InstallPrompt() {
  const t = useT();
  const [dismissed, setDismissed] = usePref('nv-install-dismissed', '0');
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const ios = useSyncExternalStore(noSubscribe, () => isIos() && !isStandalone(), () => false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // show our own banner instead of the browser's mini bar
      setEvent(e as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (dismissed === '1' || (!event && !ios)) return null;
  return (
    <div className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex items-center gap-3 rounded-xl border border-accent/40 bg-surface/95 p-3 shadow-2xl backdrop-blur animate-[sheet-up_.3s_ease] md:hidden">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/15 text-accent">
        {event ? <Download size={18} /> : <Share size={18} />}
      </span>
      <p className="min-w-0 flex-1 text-xs">
        <span className="block font-semibold">{t('Neon Vault als App')}</span>
        <span className="text-muted">{event ? t('Vollbild, ohne Browserleiste, direkt vom Homescreen.') : t('Tippe auf „Teilen“ und dann „Zum Home-Bildschirm“.')}</span>
      </p>
      {event && (
        <button
          className="btn-primary h-8 px-3 text-xs"
          onClick={async () => {
            await event.prompt();
            await event.userChoice;
            setEvent(null);
            setDismissed('1');
          }}
        >
          {t('Installieren')}
        </button>
      )}
      <button onClick={() => setDismissed('1')} className="btn-ghost h-8 w-8 shrink-0 px-0" aria-label={t('Schließen')}>
        <X size={16} />
      </button>
    </div>
  );
}
