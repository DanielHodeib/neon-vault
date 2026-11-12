'use client';

import { Pencil, ThumbsUp } from 'lucide-react';
import { useState, useTransition } from 'react';

import { setShowcase } from '@/app/actions/account';
import { toggleLike } from '@/app/actions/social';
import { useT } from './I18n';
import { toastAction } from './ui';

/** 👍 with the count; your own profile only shows the count. */
export function LikeButton({ userId, liked, count, self }: { userId: string; liked: boolean; count: number; self: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [pop, setPop] = useState(0);
  if (self) {
    return (
      <span className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm text-muted">
        <ThumbsUp size={15} /> <span className="num">{count}</span>
      </span>
    );
  }
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (!liked) setPop((n) => n + 1);
        start(() => toastAction(toggleLike(userId)));
      }}
      aria-pressed={liked}
      title={liked ? t('Like zurücknehmen') : t('Profil liken')}
      className={`btn h-10 border ${liked ? 'border-accent bg-accent/15 text-accent' : 'border-line-strong bg-raised text-fg hover:border-faint'}`}
    >
      <ThumbsUp key={pop} size={16} className={pop ? 'pop-in' : ''} fill={liked ? 'currentColor' : 'none'} /> <span className="num">{count}</span>
    </button>
  );
}

type Badge = { key: string; title: string; icon: string };

/** Own profile: pick which (up to three) earned badges sit in the showcase. */
export function ShowcaseEditor({ earned, pinned }: { earned: Badge[]; pinned: string[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(pinned);
  const [pending, start] = useTransition();
  if (!earned.length) return null;
  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length < 3 ? [...p, k] : p));
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-xs text-muted hover:text-fg">
        <Pencil size={12} /> {t('Vitrine bearbeiten')}
      </button>
      {open && (
        <div className="mt-3 space-y-3 rounded-xl border border-line bg-bg p-3">
          <p className="text-xs text-muted">{t('Wähle bis zu 3 Abzeichen für deine Vitrine.')}</p>
          <div className="flex flex-wrap gap-1.5">
            {earned.map((b) => (
              <button key={b.key} onClick={() => toggle(b.key)} aria-pressed={picked.includes(b.key)} className={picked.includes(b.key) ? 'chip-active' : 'chip'}>
                {b.icon} {t(b.title)}
              </button>
            ))}
          </div>
          <button
            disabled={pending}
            onClick={() => start(() => toastAction(setShowcase(picked)).then(() => setOpen(false)))}
            className="btn-primary h-9 text-xs"
          >
            {t('Speichern')}
          </button>
        </div>
      )}
    </div>
  );
}
