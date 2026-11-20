'use client';

import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { setLang, setTheme } from '@/app/actions/account';
import { logout } from '@/app/actions/auth';
import { THEME_INFO, THEMES } from '@/lib/format';
import { useLang, useT } from './I18n';
import { Avatar } from './ui';
import { NavItem, User } from './shellTypes';

/** Avatar button with the account menu: profile, stats, settings, support, admin, logout. */
export function UserMenu({ user, items }: { user: User; items: NavItem[] }) {
  const t = useT();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const [theme, pickTheme] = useState(user.theme);
  const close = () => setOpen(false);
  const changeTheme = (t: string) => {
    document.documentElement.setAttribute('data-theme', t); // instant, no reload
    document.documentElement.style.removeProperty('--accent'); // the theme brings its own accent
    document.documentElement.style.removeProperty('--accent-fg');
    pickTheme(t);
    void setTheme(t);
  };
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-2.5 rounded-lg p-1 hover:bg-raised sm:pr-2">
        <Avatar url={user.avatarUrl} name={user.username} size={30} frame={user.frame} />
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-medium">{user.username}</span>
          <span className="block text-[11px] text-faint">Level {user.level}</span>
        </span>
        <ChevronDown size={14} className={`hidden text-faint transition-transform sm:block ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="panel absolute top-12 right-0 z-50 w-56 p-1.5 shadow-2xl shadow-black/50">
            <Link href={`/profile/${user.username}`} onClick={close} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-raised">
              <UserRound size={16} className="text-muted" /> {t('Mein Profil')}
            </Link>
            {items.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={close} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-raised">
                <Icon size={16} className="text-muted" /> {t(label)}
              </Link>
            ))}
            <div className="my-1 border-t border-line" />
            <p className="px-3 pt-1.5 pb-1 text-[11px] text-faint">Theme</p>
            <div className="grid grid-cols-8 gap-1 px-2 pb-2">
              {THEMES.map((th) => (
                <button
                  key={th}
                  onClick={() => changeTheme(th)}
                  title={t(THEME_INFO[th].name)}
                  aria-label={`Theme ${t(THEME_INFO[th].name)}`}
                  aria-pressed={theme === th}
                  className={`grid aspect-square place-items-center rounded-full ring-offset-2 ring-offset-surface ${theme === th ? 'ring-2 ring-fg' : 'hover:ring-1 hover:ring-faint'}`}
                >
                  <span className="h-full w-full rounded-full" style={{ background: THEME_INFO[th].color }} />
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 px-3 py-1.5">
              <span className="text-[11px] text-faint">{t('Sprache')}</span>
              <div className="flex rounded-md bg-bg p-0.5 text-xs">
                {(['de', 'en'] as const).map((l) => (
                  <button key={l} onClick={() => void setLang(l)} className={`rounded px-2 py-0.5 font-medium ${lang === l ? 'bg-raised text-fg' : 'text-muted hover:text-fg'}`}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div className="my-1 border-t border-line" />
            <button onClick={() => logout()} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-raised hover:text-fg">
              <LogOut size={16} /> {t('Abmelden')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
