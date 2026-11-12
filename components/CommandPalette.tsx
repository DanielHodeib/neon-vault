'use client';

import { ChartColumn, CornerDownLeft, Headphones, House, Mail, Medal, Search, Settings, ShoppingBag, Swords, Target, Trophy, UserRound, Users, type LucideIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { searchPlayers } from '@/app/actions/social';
import { GAME_LIST } from './gameCatalog';
import { useT } from './I18n';

type Item = { key: string; label: string; hint: string; href: string; icon: LucideIcon; tint?: string };

const PAGES: Omit<Item, 'key'>[] = [
  { label: 'Lobby', hint: 'Seite', href: '/', icon: House },
  { label: 'Arena', hint: 'Duelle & Wetten', href: '/arena', icon: Swords },
  { label: 'Freunde', hint: 'Seite', href: '/friends', icon: Users },
  { label: 'Nachrichten', hint: 'Seite', href: '/messages', icon: Mail },
  { label: 'Turnier', hint: 'Seite', href: '/tournament', icon: Medal },
  { label: 'Bestenliste', hint: 'Seite', href: '/leaderboard', icon: Trophy },
  { label: 'Quests', hint: 'Seite', href: '/quests', icon: Target },
  { label: 'Shop', hint: 'Seite', href: '/shop', icon: ShoppingBag },
  { label: 'Statistik', hint: 'Seite', href: '/stats', icon: ChartColumn },
  { label: 'Einstellungen', hint: 'Seite', href: '/settings', icon: Settings },
  { label: 'Support', hint: 'Seite', href: '/support', icon: Headphones },
];

/** Ctrl+K / ⌘K: jump to any game, page or player. Invisible until needed. */
export function CommandPalette() {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [players, setPlayers] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('nv:palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('nv:palette', onOpen);
    };
  }, []);

  // Player names from the server, a moment after typing stops.
  useEffect(() => {
    if (!open || query.trim().length < 2) return;
    const id = setTimeout(() => void searchPlayers(query).then(setPlayers), 180);
    return () => clearTimeout(id);
  }, [open, query]);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = (s: string) => !q || s.toLowerCase().includes(q);
    const games: Item[] = GAME_LIST.filter((g) => hit(g.name) || hit(t(g.name)) || hit(g.slug)).map((g) => ({ key: g.slug, label: g.name, hint: 'Spiel', href: `/play/${g.slug}`, icon: g.icon, tint: g.tint }));
    const pages: Item[] = PAGES.filter((p) => hit(p.label) || hit(t(p.label))).map((p) => ({ ...p, key: p.href }));
    const people: Item[] = q.length >= 2 ? players.map((name) => ({ key: `u:${name}`, label: name, hint: 'Spieler', href: `/profile/${name}`, icon: UserRound })) : [];
    return [...games.slice(0, q ? 8 : 6), ...pages.slice(0, q ? 8 : 4), ...people];
  }, [query, players, t]);

  const close = () => {
    setOpen(false);
    setQuery('');
    setPlayers([]);
    setActive(0);
  };
  const go = (item: Item | undefined) => {
    if (!item) return;
    close();
    router.push(item.href);
  };
  const pick = Math.min(active, Math.max(0, items.length - 1));

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 p-3 backdrop-blur-sm animate-[fade-in_.12s_ease]" onClick={close}>
      <div role="dialog" aria-label={t('Schnellsuche')} className="pop-in mx-auto mt-[12vh] w-full max-w-lg overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search size={18} className="text-faint" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') go(items[pick]);
            }}
            placeholder={t('Spiel, Seite oder Spieler …')}
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-line px-1.5 text-[10px] text-faint">Esc</kbd>
        </div>
        <ul ref={list} className="max-h-[50vh] overflow-y-auto p-1.5" role="listbox">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-faint">{t('Nichts gefunden.')}</li>}
          {items.map((item, i) => {
            const Icon = item.icon;
            return (
              <li key={item.key} role="option" aria-selected={i === pick}>
                <button onMouseEnter={() => setActive(i)} onClick={() => go(item)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === pick ? 'bg-raised' : ''}`}>
                  <Icon size={17} style={item.tint ? { color: item.tint } : undefined} className={item.tint ? '' : 'text-muted'} />
                  <span className="flex-1">{item.hint === 'Spieler' ? item.label : t(item.label)}</span>
                  <span className="text-[11px] text-faint">{t(item.hint)}</span>
                  {i === pick && <CornerDownLeft size={13} className="text-faint" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** Header button that opens the palette; shows the shortcut on desktops. */
export function PaletteButton() {
  const t = useT();
  return (
    <button onClick={() => window.dispatchEvent(new Event('nv:palette'))} className="hidden h-9 items-center gap-2 rounded-lg border border-line bg-bg px-3 text-xs text-faint transition hover:border-line-strong hover:text-muted lg:flex" aria-label={t('Schnellsuche')}>
      <Search size={14} /> {t('Suchen')} <kbd className="rounded border border-line px-1 text-[10px]">⌘K</kbd>
    </button>
  );
}
