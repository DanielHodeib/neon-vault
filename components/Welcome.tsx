'use client';

import { Check, X } from 'lucide-react';
import Link from 'next/link';

import { useGameShortcuts } from './GamesPanel';
import { useT } from './I18n';
import { usePref } from './usePref';

/** First steps for new players: three small goals that tick off by themselves; gone once done or dismissed. */
export function Welcome({ spun, friends }: { spun: boolean; friends: number }) {
  const t = useT();
  const { recent } = useGameShortcuts();
  const [dismissed, setDismissed] = usePref('nv-welcome-done', '0');
  const steps = [
    { done: spun, label: 'Dreh das Glücksrad oben – jeden Tag gratis Coins', href: null },
    { done: recent.length > 0, label: 'Probier ein Spiel aus', href: '/play/slots' },
    { done: friends > 0, label: 'Füg einen Freund hinzu', href: '/friends' },
  ];
  if (dismissed === '1' || steps.every((s) => s.done)) return null;
  const left = steps.filter((s) => !s.done).length;
  return (
    <section className="card relative">
      <button onClick={() => setDismissed('1')} className="btn-ghost absolute top-2 right-2 h-8 w-8 px-0" aria-label={t('Ausblenden')}>
        <X size={15} />
      </button>
      <p className="font-semibold">{t('Willkommen in Neon Vault 👋')}</p>
      <p className="text-sm text-muted">{left === 1 ? t('Noch ein Schritt zum Start:') : t('Noch {n} kleine Schritte zum Start:', { n: left })}</p>
      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        {steps.map((s, i) => {
          const body = (
            <>
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${s.done ? 'bg-win text-black' : 'border border-line-strong text-muted'}`}>{s.done ? <Check size={13} /> : i + 1}</span>
              <span className={s.done ? 'text-muted line-through' : ''}>{t(s.label)}</span>
            </>
          );
          return (
            <li key={i}>
              {s.href && !s.done ? (
                <Link href={s.href} className="flex items-center gap-2.5 rounded-xl border border-line p-3 text-sm transition hover:border-accent/60">{body}</Link>
              ) : (
                <div className="flex items-center gap-2.5 rounded-xl border border-line p-3 text-sm">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
