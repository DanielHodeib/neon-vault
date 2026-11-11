'use client';

import type { Role } from '@prisma/client';
import {
  ArrowUpDown,
  Bell,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  ChartColumn,
  Bomb,
  Dices,
  FerrisWheel,
  Flag,
  PiggyBank,
  Triangle,
  CircleDot,
  Club,
  Coins as CoinsIcon,
  Cherry,
  CloudRain,
  Gamepad2,
  Headphones,
  House,
  LogOut,
  Mail,
  Medal,
  Menu,
  MessageSquare,
  Rocket,
  Settings,
  Shield,
  ShoppingBag,
  Spade,
  Target,
  Trophy,
  UserRound,
  Users,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';

import { clearNotifications, readNotifications } from '@/app/actions/account';
import { logout } from '@/app/actions/auth';
import { coins, timeAgo } from '@/lib/format';
import { atLeast } from '@/lib/roles';
import { Chat } from './Chat';
import { useLive } from './SocketProvider';
import { Avatar, Logo } from './ui';
import { usePref } from './usePref';

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: number };

const GAMES: NavItem[] = [
  { href: '/play/crash', label: 'Crash', icon: Rocket },
  { href: '/play/slots', label: 'Slots', icon: Cherry },
  { href: '/play/blackjack', label: 'Blackjack', icon: Spade },
  { href: '/play/roulette', label: 'Roulette', icon: CircleDot },
  { href: '/play/poker', label: 'Poker', icon: Club },
  { href: '/play/coinflip', label: 'Coinflip', icon: CoinsIcon },
  { href: '/play/mines', label: 'Mines', icon: Bomb },
  { href: '/play/dice', label: 'Dice', icon: Dices },
  { href: '/play/plinko', label: 'Plinko', icon: Triangle },
  { href: '/play/hilo', label: 'Hi-Lo', icon: ArrowUpDown },
  { href: '/play/wheel', label: 'Glücksrad', icon: FerrisWheel },
  { href: '/play/jackpot', label: 'Jackpot', icon: PiggyBank },
  { href: '/play/race', label: 'Rennen', icon: Flag },
];

type Notification = { id: string; title: string; message: string; isRead: boolean; createdAt: string };
type User = { username: string; avatarUrl: string | null; frame: string | null; level: number; role: Role };

export function Shell({ user, notifications, maintenance, children }: { user: User; notifications: Notification[]; maintenance: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const { balance, event, rain, dmUnread } = useLive();
  // null = default (docked on wide screens, closed elsewhere)
  const [chat, setChat] = useState<boolean | null>(null);
  const [sheet, setSheet] = useState<'games' | 'more' | null>(null);
  // Laptop sidebar: full width or folded to an icon rail; groups can be closed one by one.
  const [folded, setFolded] = usePref('nv-sidebar-folded', '0');
  const [closedRaw, setClosed] = usePref('nv-nav-closed', '');
  const wide = folded !== '1';
  const closed = new Set(closedRaw.split(',').filter(Boolean));
  const toggleGroup = (title: string) => {
    const next = new Set(closed);
    if (!next.delete(title)) next.add(title);
    setClosed([...next].join(','));
  };

  const community: NavItem[] = [
    { href: '/friends', label: 'Freunde', icon: Users },
    { href: '/messages', label: 'Nachrichten', icon: Mail, badge: dmUnread },
    { href: '/tournament', label: 'Turnier', icon: Medal },
    { href: '/leaderboard', label: 'Bestenliste', icon: Trophy },
    { href: '/quests', label: 'Quests', icon: Target },
    { href: '/shop', label: 'Shop', icon: ShoppingBag },
  ];
  // Account links live in the avatar menu (and the phone "Mehr" sheet), not in the sidebar.
  const account: NavItem[] = [
    { href: '/stats', label: 'Statistik', icon: ChartColumn },
    { href: '/support', label: 'Support', icon: Headphones },
    { href: '/settings', label: 'Einstellungen', icon: Settings },
    ...(atLeast(user.role, 'SUPPORT') ? [{ href: '/admin', label: 'Admin', icon: Shield }] : []),
  ];

  const toggleChat = () => setChat((c) => !(c ?? window.matchMedia('(min-width: 80rem)').matches));
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Sidebar: icon rail on tablets, full on laptops, hidden on phones */}
      <aside className={`hidden w-[68px] shrink-0 flex-col border-r border-line bg-surface transition-[width] md:flex ${wide ? 'lg:w-60' : ''}`}>
        <Link href="/" className={`flex h-16 items-center justify-center border-b border-line px-4 ${wide ? 'lg:justify-start' : ''}`} title="Zur Lobby">
          <span className={wide ? 'lg:hidden' : ''}><Logo compact /></span>
          <span className={wide ? 'hidden lg:block' : 'hidden'}><Logo /></span>
        </Link>
        <nav className={`no-scrollbar flex-1 overflow-y-auto p-3 ${wide ? 'space-y-6 lg:space-y-4' : 'space-y-6'}`}>
          <NavGroup items={[{ href: '/', label: 'Lobby', icon: House }]} isActive={isActive} wide={wide} />
          {[
            ['Spiele', GAMES],
            ['Community', community],
          ].map(([title, items]) => (
            <NavGroup
              key={title as string}
              title={title as string}
              items={items as NavItem[]}
              isActive={isActive}
              wide={wide}
              tiles={title === 'Spiele'}
              open={!closed.has(title as string)}
              onToggle={() => toggleGroup(title as string)}
            />
          ))}
        </nav>
        <div className="hidden border-t border-line p-3 lg:block">
          <button
            onClick={() => setFolded(wide ? '1' : '0')}
            className={`flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-raised hover:text-fg ${wide ? 'lg:justify-start' : ''}`}
            title={wide ? 'Leiste einklappen' : 'Leiste ausklappen'}
          >
            {wide ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            <span className={wide ? 'hidden lg:inline' : 'hidden'}>Einklappen</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/80 px-3 backdrop-blur sm:gap-3 sm:px-5 md:h-16">
          <Link href="/" className="md:hidden"><Logo compact /></Link>
          <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-bg px-3 py-1.5">
            <CoinsIcon size={15} className="shrink-0 text-gold" />
            <span className="num truncate text-sm font-semibold text-gold">{coins(balance)}</span>
          </div>
          {event && (
            <span className="hidden items-center gap-1.5 rounded-full border border-accent/40 px-3 py-1 text-xs font-medium text-accent sm:flex" title={event.description}>
              <Zap size={12} /> {event.label}
            </span>
          )}
          {rain && (
            <span className="hidden items-center gap-1.5 rounded-full border border-sky-400/40 px-3 py-1 text-xs font-medium text-sky-300 sm:flex">
              <CloudRain size={12} /> Rain {coins(rain.amount)} – im Chat schreiben
            </span>
          )}
          {maintenance && <span className="hidden rounded-full bg-loss/15 px-3 py-1 text-xs text-loss sm:block">Wartungsmodus</span>}

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Notifications items={notifications} />
            <button onClick={toggleChat} className="btn-ghost hidden h-9 w-9 px-0 md:inline-flex" aria-label="Chat ein- oder ausblenden">
              <MessageSquare size={18} />
            </button>
            <UserMenu user={user} items={account} />
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto px-3 pt-4 pb-24 sm:px-5 sm:pt-6 md:pb-8 lg:px-8">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>

          <div
            className={`${chat === null ? 'hidden xl:flex' : chat ? 'flex' : 'hidden'} fixed inset-0 z-50 bg-bg md:left-auto md:w-96 md:border-l md:border-line xl:static xl:z-auto xl:w-80`}
          >
            <Chat onClose={() => setChat(false)} />
          </div>
        </div>
      </div>

      {/* Phone bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <TabButton icon={House} label="Lobby" href="/" active={pathname === '/'} />
        <TabButton icon={Gamepad2} label="Spiele" active={pathname.startsWith('/play')} onClick={() => setSheet('games')} />
        <TabButton icon={MessageSquare} label="Chat" active={!!chat} onClick={toggleChat} />
        <TabButton icon={Users} label="Freunde" href="/friends" active={isActive('/friends')} />
        <TabButton icon={Menu} label="Mehr" onClick={() => setSheet('more')} />
      </nav>

      {sheet && (
        <Sheet title={sheet === 'games' ? 'Spiele' : 'Menü'} onClose={() => setSheet(null)}>
          <div className="grid grid-cols-3 gap-2">
            {(sheet === 'games' ? GAMES : [...community, ...account]).map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={() => setSheet(null)} className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-xs ${isActive(href) ? 'border-accent text-fg' : 'border-line text-muted'}`}>
                <Icon size={22} />
                {label}
              </Link>
            ))}
            {sheet === 'more' && (
              <button onClick={() => logout()} className="flex flex-col items-center gap-2 rounded-xl border border-line p-4 text-xs text-muted">
                <LogOut size={22} /> Abmelden
              </button>
            )}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function NavGroup({
  title,
  items,
  isActive,
  wide,
  open = true,
  onToggle,
  tiles = false,
}: {
  title?: string;
  items: NavItem[];
  isActive: (href: string) => boolean;
  wide: boolean;
  open?: boolean;
  onToggle?: () => void;
  tiles?: boolean; // compact 3-column grid on the wide sidebar (used for the many games)
}) {
  // On the icon rail (tablet or folded) groups are always open; closing only hides labels there.
  return (
    <div>
      {title && (
        <button
          onClick={onToggle}
          aria-expanded={open}
          className={`eyebrow group mb-1 hidden w-full items-center justify-between rounded-md px-3 py-1 hover:text-muted ${wide ? 'lg:flex' : ''}`}
        >
          {title}
          <ChevronDown size={14} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
      )}
      {tiles && wide && open && (
        <div className="hidden grid-cols-3 gap-1 lg:grid">
          {items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              title={label}
              className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10.5px] leading-tight transition ${
                isActive(href) ? 'bg-raised text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg'
              }`}
            >
              <Icon size={18} className={isActive(href) ? 'text-accent' : ''} />
              <span className="w-full truncate text-center">{label}</span>
            </Link>
          ))}
        </div>
      )}
      <div className={`space-y-0.5 ${!open && wide ? 'lg:hidden' : ''} ${tiles && wide ? 'lg:hidden' : ''}`}>
        {items.map(({ href, label, icon: Icon, badge }) => (
          <Link
            key={href}
            href={href}
            title={label}
            className={`relative flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm transition ${wide ? 'lg:justify-start' : ''} ${
              isActive(href) ? 'bg-raised text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg'
            }`}
          >
            <Icon size={18} className={isActive(href) ? 'text-accent' : ''} />
            <span className={wide ? 'hidden lg:inline' : 'hidden'}>{label}</span>
            {!!badge && (
              <span className={`grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-fg ${wide ? 'absolute top-1 right-2 lg:static lg:ml-auto' : 'absolute top-1 right-2'}`}>
                {badge}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

function TabButton({ icon: Icon, label, href, active, onClick }: { icon: LucideIcon; label: string; href?: string; active?: boolean; onClick?: () => void }) {
  const cls = `flex flex-col items-center gap-1 py-2.5 text-[11px] ${active ? 'text-accent' : 'text-muted'}`;
  const body = (
    <>
      <Icon size={20} /> {label}
    </>
  );
  return href ? <Link href={href} className={cls}>{body}</Link> : <button onClick={onClick} className={cls}>{body}</button>;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 md:items-center md:justify-center" onClick={onClose}>
      <div className="w-full rounded-t-2xl border-t border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:max-w-md md:rounded-2xl md:border" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="btn-ghost h-8 w-8 px-0" aria-label="Schließen"><X size={18} /></button>
        </div>
        {children}
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
      <button onClick={toggle} className="btn-ghost relative h-9 w-9 px-0" aria-label="Benachrichtigungen">
        <Bell size={18} />
        {unread > 0 && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-accent" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="panel fixed inset-x-3 top-16 z-50 p-2 shadow-2xl shadow-black/50 sm:absolute sm:inset-x-auto sm:top-11 sm:right-0 sm:w-80">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-sm font-semibold">Benachrichtigungen</span>
              {items.length > 0 && <button className="text-xs text-muted hover:text-fg" onClick={() => clearNotifications()}>Alle löschen</button>}
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {items.length === 0 && <p className="py-8 text-center text-sm text-faint">Keine Benachrichtigungen</p>}
              {items.map((n) => (
                <div key={n.id} className="rounded-lg px-2 py-2.5 hover:bg-raised">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {!n.isRead && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                    {n.title}
                  </p>
                  <p className="text-sm text-muted">{n.message}</p>
                  <p className="mt-0.5 text-[11px] text-faint">{timeAgo(n.createdAt)}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Avatar button with the account menu: profile, stats, settings, support, admin, logout. */
function UserMenu({ user, items }: { user: User; items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
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
              <UserRound size={16} className="text-muted" /> Mein Profil
            </Link>
            {items.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={close} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-raised">
                <Icon size={16} className="text-muted" /> {label}
              </Link>
            ))}
            <div className="my-1 border-t border-line" />
            <button onClick={() => logout()} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-raised hover:text-fg">
              <LogOut size={16} /> Abmelden
            </button>
          </div>
        </>
      )}
    </div>
  );
}
