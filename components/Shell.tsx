'use client';

import { ChevronDown, PanelLeftClose, PanelLeftOpen, ChartColumn, Coins as CoinsIcon, CloudRain, Gamepad2, Headphones, House, LogOut, Mail, Medal, Menu, MessageSquare, Settings, Shield, ShoppingBag, Swords, Target, Trophy, Users, X, Zap, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { logout } from '@/app/actions/auth';
import { coins } from '@/lib/format';
import { atLeast } from '@/lib/roles';
import { Chat } from './Chat';
import { useT } from './I18n';
import { useLive } from './SocketProvider';
import { Logo } from './ui';
import { usePref } from './usePref';
import { DEFAULT_SHORTCUTS, GAME_BY_SLUG, GAME_LIST } from './gameCatalog';
import { GamesPanel, useGameShortcuts, usePlayerCounts } from './GamesPanel';
import { WinTicker } from './WinTicker';
import { InstallPrompt } from './InstallPrompt';
import { SoundMenu } from './SoundMenu';
import { CommandPalette, PaletteButton } from './CommandPalette';
import { NavItem, Notification, User } from './shellTypes';
import { Notifications } from './Notifications';
import { UserMenu } from './UserMenu';
import { CountdownBanner } from './CountdownBanner';
import { BalanceValue } from './BalanceValue';

export function Shell({ user, notifications, maintenance, children }: { user: User; notifications: Notification[]; maintenance: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const { balance, event, rain, dmUnread, watchers } = useLive();
  const t = useT();
  // null = default (docked on wide screens, closed elsewhere)
  const [chat, setChat] = useState<boolean | null>(null);
  const [sheet, setSheet] = useState<'games' | 'more' | null>(null);
  const shortcuts = useGameShortcuts();
  const players = usePlayerCounts();
  // Remember the game being played for the "recently played" shortcuts.
  const playing = pathname.startsWith('/play/') ? pathname.split('/')[2] : null;
  const { visit } = shortcuts;
  useEffect(() => {
    if (playing && GAME_BY_SLUG.has(playing)) visit(playing);
  }, [playing, visit]);
  // Sidebar shortcuts: favourites first, then recently played, filled up with popular games.
  const shortcutSlugs = [...new Set([...shortcuts.favs, ...shortcuts.recent, ...DEFAULT_SHORTCUTS])].slice(0, 5);
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
    { href: '/arena', label: 'Arena', icon: Swords },
    { href: '/messages', label: 'Nachrichten', icon: Mail, badge: dmUnread },
    { href: '/tournament', label: 'Turnier', icon: Medal },
    { href: '/leaderboard', label: 'Bestenliste', icon: Trophy },
    { href: '/clans', label: 'Clans', icon: Shield },
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
        <Link href="/" className={`flex h-16 items-center justify-center border-b border-line px-4 ${wide ? 'lg:justify-start' : ''}`} title={t('Zur Lobby')}>
          <span className={wide ? 'lg:hidden' : ''}><Logo compact /></span>
          <span className={wide ? 'hidden lg:block' : 'hidden'}><Logo /></span>
        </Link>
        <nav className={`no-scrollbar flex-1 overflow-y-auto p-3 ${wide ? 'space-y-6 lg:space-y-4' : 'space-y-6'}`}>
          <NavGroup items={[{ href: '/', label: 'Lobby', icon: House }]} isActive={isActive} wide={wide} />
          <div>
            <div className={`mb-1 hidden items-center justify-between px-3 ${wide ? 'lg:flex' : ''}`}>
              <span className="eyebrow">{t('Spiele')}</span>
              <button onClick={() => setSheet('games')} className="text-[11px] text-muted hover:text-accent">{t('Alle')} · {GAME_LIST.length}</button>
            </div>
            <div className="space-y-0.5">
              {shortcutSlugs.map((slug) => {
                const g = GAME_BY_SLUG.get(slug)!;
                const Icon = g.icon;
                const active = isActive(`/play/${slug}`);
                return (
                  <Link
                    key={slug}
                    href={`/play/${slug}`}
                    title={t(g.name)}
                    className={`relative flex items-center justify-center gap-3 rounded-lg px-3 py-1.5 text-sm transition ${wide ? 'lg:justify-start' : ''} ${active ? 'bg-raised text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg'}`}
                  >
                    <Icon size={17} style={{ color: g.tint }} />
                    <span className={wide ? 'hidden truncate lg:inline' : 'hidden'}>{t(g.name)}</span>
                    {shortcuts.isFav(slug) && <span className={wide ? 'hidden text-[10px] text-gold lg:inline' : 'hidden'}>★</span>}
                    {players[slug] > 0 && (
                      <span className={`num text-[10px] text-win ${wide ? 'absolute top-0.5 right-1 lg:static lg:ml-auto' : 'absolute top-0.5 right-1'}`}>{players[slug]}</span>
                    )}
                  </Link>
                );
              })}
              <button
                onClick={() => setSheet('games')}
                title={t('Alle Spiele')}
                className={`flex w-full items-center justify-center gap-3 rounded-lg border border-dashed border-line px-3 py-1.5 text-sm text-muted transition hover:border-accent/60 hover:text-fg ${wide ? 'lg:justify-start' : ''}`}
              >
                <Gamepad2 size={17} />
                <span className={wide ? 'hidden lg:inline' : 'hidden'}>{t('Alle Spiele')}</span>
              </button>
            </div>
          </div>
          <NavGroup title="Community" items={community} isActive={isActive} wide={wide} open={!closed.has('Community')} onToggle={() => toggleGroup('Community')} />
        </nav>
        <div className="hidden border-t border-line p-3 lg:block">
          <button
            onClick={() => setFolded(wide ? '1' : '0')}
            className={`flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-raised hover:text-fg ${wide ? 'lg:justify-start' : ''}`}
            title={wide ? t('Leiste einklappen') : t('Leiste ausklappen')}
          >
            {wide ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            <span className={wide ? 'hidden lg:inline' : 'hidden'}>{t('Einklappen')}</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface/80 px-3 backdrop-blur sm:gap-3 sm:px-5 md:h-16">
          <Link href="/" className="md:hidden"><Logo compact /></Link>
          <div className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-bg px-3 py-1.5">
            <CoinsIcon size={15} className="shrink-0 text-gold" />
            <BalanceValue value={balance} />
          </div>
          {event && (
            <span className="hidden items-center gap-1.5 rounded-full border border-accent/40 px-3 py-1 text-xs font-medium text-accent sm:flex" title={t(event.description)}>
              <Zap size={12} /> {t(event.label)}
            </span>
          )}
          {rain && (
            <span className="hidden items-center gap-1.5 rounded-full border border-sky-400/40 px-3 py-1 text-xs font-medium text-sky-300 sm:flex">
              <CloudRain size={12} /> Rain {coins(rain.amount)} – {t('im Chat schreiben')}
            </span>
          )}
          {maintenance && <span className="hidden rounded-full bg-loss/15 px-3 py-1 text-xs text-loss sm:block">{t('Wartungsmodus')}</span>}
          {watchers > 0 && (
            <span className="pop-in rounded-full border border-line px-2.5 py-1 text-xs text-muted" title={t('{n} Freunde schauen dir gerade zu', { n: watchers })}>
              👀 <span className="num">{watchers}</span>
            </span>
          )}

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <PaletteButton />
            <SoundMenu />
            <Notifications items={notifications} />
            <button onClick={toggleChat} className="btn-ghost hidden h-9 w-9 px-0 md:inline-flex" aria-label={t('Chat ein- oder ausblenden')}>
              <MessageSquare size={18} />
            </button>
            <UserMenu user={user} items={account} />
          </div>
        </header>

        <WinTicker />
        <CountdownBanner />
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto px-3 pt-4 pb-24 sm:px-5 sm:pt-6 md:pb-8 lg:px-8">
            {/* keyed by page: every navigation fades the new page in */}
            <div key={pathname} className="page-in mx-auto max-w-6xl">
              {children}
            </div>
          </main>

          <div
            className={`${chat === null ? 'hidden xl:flex' : chat ? 'flex' : 'hidden'} fixed inset-0 z-50 bg-bg md:left-auto md:w-96 md:border-l md:border-line xl:static xl:z-auto xl:w-80`}
          >
            <Chat onClose={() => setChat(false)} />
          </div>
        </div>
      </div>

      <InstallPrompt />
      <CommandPalette />

      {/* Phone bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <TabButton icon={House} label="Lobby" href="/" active={pathname === '/'} />
        <TabButton icon={Gamepad2} label="Spiele" active={pathname.startsWith('/play')} onClick={() => setSheet('games')} />
        <TabButton icon={MessageSquare} label="Chat" active={!!chat} onClick={toggleChat} />
        <TabButton icon={Users} label="Freunde" href="/friends" active={isActive('/friends')} />
        <TabButton icon={Menu} label="Mehr" onClick={() => setSheet('more')} dot={dmUnread > 0} />
      </nav>

      {sheet === 'games' && <GamesPanel onClose={() => setSheet(null)} />}
      {sheet === 'more' && (
        <Sheet title={t('Menü')} onClose={() => setSheet(null)}>
          <div className="grid grid-cols-3 gap-2">
            {[...community, ...account].map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} onClick={() => setSheet(null)} className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-xs ${isActive(href) ? 'border-accent text-fg' : 'border-line text-muted'}`}>
                <Icon size={22} />
                {t(label)}
              </Link>
            ))}
            <button onClick={() => logout()} className="flex flex-col items-center gap-2 rounded-xl border border-line p-4 text-xs text-muted">
              <LogOut size={22} /> {t('Abmelden')}
            </button>
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
}: {
  title?: string;
  items: NavItem[];
  isActive: (href: string) => boolean;
  wide: boolean;
  open?: boolean;
  onToggle?: () => void;
}) {
  // On the icon rail (tablet or folded) groups are always open; closing only hides labels there.
  const t = useT();
  return (
    <div>
      {title && (
        <button
          onClick={onToggle}
          aria-expanded={open}
          className={`eyebrow group mb-1 hidden w-full items-center justify-between rounded-md px-3 py-1 hover:text-muted ${wide ? 'lg:flex' : ''}`}
        >
          {t(title)}
          <ChevronDown size={14} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
      )}
      <div className={`space-y-0.5 ${!open && wide ? 'lg:hidden' : ''}`}>
        {items.map(({ href, label, icon: Icon, badge }) => (
          <Link
            key={href}
            href={href}
            title={t(label)}
            className={`relative flex items-center justify-center gap-3 rounded-lg px-3 py-1.5 text-sm transition ${wide ? 'lg:justify-start' : ''} ${
              isActive(href) ? 'bg-raised text-fg' : 'text-muted hover:bg-raised/60 hover:text-fg'
            }`}
          >
            <Icon size={18} className={isActive(href) ? 'text-accent' : ''} />
            <span className={wide ? 'hidden lg:inline' : 'hidden'}>{t(label)}</span>
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

function TabButton({ icon: Icon, label, href, active, onClick, dot }: { icon: LucideIcon; label: string; href?: string; active?: boolean; onClick?: () => void; dot?: boolean }) {
  const t = useT();
  const cls = `relative flex flex-col items-center gap-1 py-2.5 text-[11px] transition active:scale-90 ${active ? 'text-accent' : 'text-muted'}`;
  const body = (
    <>
      {/* bar above the active tab */}
      <span className={`absolute top-0 h-0.5 w-8 rounded-full bg-accent transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`} />
      <span className="relative">
        <Icon size={20} />
        {dot && <span className="absolute -top-0.5 -right-1 h-2 w-2 rounded-full bg-accent ring-2 ring-surface" />}
      </span>
      {t(label)}
    </>
  );
  return href ? <Link href={href} className={cls}>{body}</Link> : <button onClick={onClick} className={cls}>{body}</button>;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60 md:items-center md:justify-center" onClick={onClose}>
      <div className="w-full rounded-t-2xl border-t border-line bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:max-w-md md:rounded-2xl md:border" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">{t(title)}</h2>
          <button onClick={onClose} className="btn-ghost h-8 w-8 px-0" aria-label={t('Schließen')}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
