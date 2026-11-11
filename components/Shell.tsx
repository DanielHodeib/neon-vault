'use client';

import type { Role } from '@prisma/client';
import { Bell, CloudRain, Coins as CoinsIcon, Crown, Gamepad2, Headphones, Home, LogOut, Menu, MessageSquare, Settings, Shield, Trophy, Users, X, Zap } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { logout } from '@/app/actions/auth';
import { clearNotifications, readNotifications } from '@/app/actions/account';
import { atLeast } from '@/lib/roles';
import { coins, timeAgo } from '@/lib/format';
import { Chat } from './Chat';
import { useLive } from './SocketProvider';
import { Avatar } from './ui';

const GAMES = [
  ['crash', 'Crash'],
  ['aviator', 'Aviator'],
  ['slots', 'Slots'],
  ['blackjack', 'Blackjack'],
  ['roulette', 'Roulette'],
  ['poker', 'Poker'],
  ['coinflip', 'Coinflip'],
] as const;

type Notification = { id: string; title: string; message: string; isRead: boolean; createdAt: string };

export function Shell({
  user,
  notifications,
  maintenance,
  children,
}: {
  user: { username: string; avatarUrl: string | null; level: number; role: Role };
  notifications: Notification[];
  maintenance: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { balance, event, rain } = useLive();
  const [menuOpen, setMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);

  const nav = [
    ['/', 'Lobby', Home],
    ['/friends', 'Freunde', Users],
    ['/leaderboard', 'Bestenliste', Trophy],
    ['/quests', 'Quests', Crown],
    ['/support', 'Support', Headphones],
    ['/settings', 'Einstellungen', Settings],
    ...(atLeast(user.role, 'SUPPORT') ? [['/admin', 'Admin', Shield] as const] : []),
  ] as const;

  const link = (href: string, active: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${active ? 'bg-accent/15 text-accent' : 'text-slate-300 hover:bg-white/5'}`;

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 shrink-0 overflow-y-auto border-r border-line bg-panel p-4 transition-transform md:static md:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <Link href="/" className="glow mb-6 block text-xl font-black text-accent">NEON VAULT</Link>
        <p className="label mb-2 flex items-center gap-2"><Gamepad2 size={14} /> Spiele</p>
        <nav className="mb-6 space-y-1">
          {GAMES.map(([slug, name]) => (
            <Link key={slug} href={`/play/${slug}`} className={link(slug, pathname === `/play/${slug}`)} onClick={() => setMenuOpen(false)}>
              {name}
            </Link>
          ))}
        </nav>
        <nav className="space-y-1">
          {nav.map(([href, name, Icon]) => (
            <Link key={href} href={href} className={link(href, pathname === href)} onClick={() => setMenuOpen(false)}>
              <Icon size={16} /> {name}
            </Link>
          ))}
          <button onClick={() => logout()} className={`${link('', false)} w-full`}>
            <LogOut size={16} /> Abmelden
          </button>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-panel/60 px-4 py-3">
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menü">
            {menuOpen ? <X /> : <Menu />}
          </button>
          <div className="flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-1.5">
            <CoinsIcon size={16} className="text-amber-300" />
            <span className="font-mono font-semibold text-amber-300">{coins(balance)}</span>
            <span className="text-xs text-muted">NVC</span>
          </div>
          {event && (
            <span className="hidden items-center gap-1 rounded-full bg-accent-2/20 px-3 py-1 text-xs font-semibold text-accent-2 sm:flex" title={event.description}>
              <Zap size={12} /> {event.label}
            </span>
          )}
          {rain && (
            <span className="hidden items-center gap-1 rounded-full bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-300 sm:flex">
              <CloudRain size={12} /> Rain: {coins(rain.amount)} NVC – schreib im Chat!
            </span>
          )}
          {maintenance && <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs text-red-300">Wartungsmodus</span>}
          <div className="ml-auto flex items-center gap-3">
            <Notifications items={notifications} />
            <button onClick={() => setChatOpen(!chatOpen)} className="text-muted hover:text-accent" aria-label="Chat umschalten">
              <MessageSquare size={20} />
            </button>
            <Link href={`/profile/${user.username}`} className="flex items-center gap-2">
              <Avatar url={user.avatarUrl} name={user.username} size={32} />
              <span className="hidden text-sm sm:block">
                {user.username} <span className="text-muted">· Lvl {user.level}</span>
              </span>
            </Link>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
          {chatOpen && <Chat />}
        </div>
      </div>
    </div>
  );
}

function Notifications({ items }: { items: Notification[] }) {
  const [open, setOpen] = useState(false);
  const unread = items.filter((n) => !n.isRead).length;
  const toggle = () => {
    setOpen(!open);
    if (!open && unread) void readNotifications();
  };
  return (
    <div className="relative">
      <button onClick={toggle} className="relative text-muted hover:text-accent" aria-label="Benachrichtigungen">
        <Bell size={20} />
        {unread > 0 && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-line bg-panel p-3 shadow-2xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">Benachrichtigungen</span>
            {items.length > 0 && <button className="text-xs text-muted hover:text-red-300" onClick={() => clearNotifications()}>Alle löschen</button>}
          </div>
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {items.length === 0 && <p className="py-6 text-center text-sm text-muted">Nichts Neues.</p>}
            {items.map((n) => (
              <div key={n.id} className={`rounded-lg p-2 text-sm ${n.isRead ? 'bg-bg' : 'bg-accent/10'}`}>
                <p className="font-semibold">{n.title}</p>
                <p className="text-slate-300">{n.message}</p>
                <p className="mt-1 text-xs text-muted">{timeAgo(n.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
