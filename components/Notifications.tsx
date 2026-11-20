'use client';

import { Bell, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { clearNotifications, readNotifications } from '@/app/actions/account';
import { respondFriend } from '@/app/actions/social';
import { FormButton } from './FormButton';
import { timeAgo } from '@/lib/format';
import { useT } from './I18n';
import { Notification } from './shellTypes';

export function Notifications({ items }: { items: Notification[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const unread = items.filter((n) => !n.isRead).length;
  const toggle = () => {
    setOpen(!open);
    if (!open && unread) void readNotifications();
  };
  return (
    <div className="relative">
      <button onClick={toggle} className="btn-ghost relative h-9 w-9 px-0" aria-label={t('Benachrichtigungen')}>
        <Bell size={18} />
        {unread > 0 && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="panel fixed inset-x-3 top-16 z-50 p-2 shadow-2xl shadow-black/50 sm:absolute sm:inset-x-auto sm:top-11 sm:right-0 sm:w-80">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-sm font-semibold">{t('Benachrichtigungen')}</span>
              {items.length > 0 && <button className="text-xs text-muted hover:text-fg" onClick={() => clearNotifications()}>{t('Alle löschen')}</button>}
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {items.length === 0 && <p className="py-8 text-center text-sm text-faint">{t('Keine Benachrichtigungen')}</p>}
              {items.map((n) => {
                const body = (
                  <>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {!n.isRead && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                      <span className="min-w-0 flex-1">{t(n.title)}</span>
                      {n.link && <ChevronRight size={14} className="shrink-0 text-faint" />}
                    </p>
                    <p className="text-sm text-muted">{t(n.message)}</p>
                    <p className="mt-0.5 text-[11px] text-faint">{t(timeAgo(n.createdAt))}</p>
                  </>
                );
                return (
                  <div key={n.id} className="rounded-lg hover:bg-raised">
                    {n.link ? (
                      <Link href={n.link} onClick={() => setOpen(false)} className="block px-2 py-2.5">
                        {body}
                      </Link>
                    ) : (
                      <div className="px-2 py-2.5">{body}</div>
                    )}
                    {n.friendId && (
                      <div className="flex gap-2 px-2 pb-2.5">
                        <FormButton action={respondFriend.bind(null, n.friendId, true)} className="btn-primary h-8 flex-1 text-xs">Annehmen</FormButton>
                        <FormButton action={respondFriend.bind(null, n.friendId, false)} className="btn-secondary h-8 flex-1 text-xs">Ablehnen</FormButton>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
