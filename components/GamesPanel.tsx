'use client';

import { Search, Star, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { CATEGORIES, GAME_BY_SLUG, GAME_LIST, type GameEntry } from './gameCatalog';
import { useT } from './I18n';
import { useLive } from './SocketProvider';
import { usePref } from './usePref';

const list = (raw: string) => raw.split(',').filter((s) => GAME_BY_SLUG.has(s));

/** Favourite games (starred) and recently played ones, per browser. */
export function useGameShortcuts() {
  const [favRaw, setFav] = usePref('nv-fav-games', '');
  const [recentRaw, setRecent] = usePref('nv-recent-games', '');
  const favs = list(favRaw);
  const recent = list(recentRaw);
  return {
    favs,
    recent,
    isFav: (slug: string) => favs.includes(slug),
    toggleFav: (slug: string) => setFav((favs.includes(slug) ? favs.filter((s) => s !== slug) : [...favs, slug]).join(',')),
    visit: (slug: string) => recent[0] !== slug && setRecent([slug, ...recent.filter((s) => s !== slug)].slice(0, 6).join(',')),
  };
}

/** Players per game right now, from the presence list (activity = game name). */
export function usePlayerCounts() {
  const { online } = useLive();
  return useMemo(() => {
    const bySlug: Record<string, number> = {};
    for (const g of GAME_LIST) bySlug[g.slug] = online.filter((o) => o.activity === g.name).length;
    return bySlug;
  }, [online]);
}

export function GameTile({ game, players, fav, onFav, onPick, size = 'md' }: { game: GameEntry; players: number; fav: boolean; onFav: () => void; onPick?: () => void; size?: 'md' | 'lg' }) {
  const t = useT();
  const Icon = game.icon;
  return (
    <div className="group relative">
      <Link
        href={`/play/${game.slug}`}
        onClick={onPick}
        className={`panel relative flex h-full flex-col overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:border-line-strong ${size === 'lg' ? 'p-4 sm:p-5' : 'p-3'}`}
      >
        <span className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full opacity-20 blur-2xl transition group-hover:opacity-40" style={{ background: game.tint }} />
        <span className={`grid place-items-center rounded-lg transition group-hover:scale-110 ${size === 'lg' ? 'h-11 w-11' : 'h-9 w-9'}`} style={{ background: `${game.tint}1f`, color: game.tint }}>
          <Icon size={size === 'lg' ? 22 : 18} />
        </span>
        <span className={`font-semibold ${size === 'lg' ? 'mt-6 sm:mt-8' : 'mt-3 text-sm'}`}>{t(game.name)}</span>
        <span className={`text-muted ${size === 'lg' ? 'text-xs sm:text-sm' : 'line-clamp-1 text-[11px]'}`}>{t(game.text)}</span>
        <span className="mt-auto flex items-center gap-2 pt-2 text-[11px]">
          {players > 0 ? (
            <span className="flex items-center gap-1 text-win">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-win" />
              {t('{n} spielen', { n: players })}
            </span>
          ) : (
            <span className="text-faint">{t(CATEGORIES.find((c) => c.key === game.category)!.label)}</span>
          )}
          {game.isNew && <span className="ml-auto rounded bg-accent px-1.5 py-px text-[9px] font-bold tracking-wide text-accent-fg uppercase">{t('Neu')}</span>}
        </span>
      </Link>
      <button
        type="button"
        onClick={onFav}
        aria-pressed={fav}
        aria-label={fav ? t('Aus Favoriten entfernen') : t('Zu Favoriten')}
        className={`absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-md transition ${fav ? 'text-gold' : 'text-faint opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-fg'}`}
      >
        <Star size={15} fill={fav ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

/** Every game by category, with search and favourites; opens from the sidebar and the phone tab bar. */
export function GamesPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const { isFav, toggleFav } = useGameShortcuts();
  const players = usePlayerCounts();
  const q = query.trim().toLowerCase();
  const match = (g: GameEntry) => !q || [g.name, t(g.name), g.text, t(g.text), g.slug].some((s) => s.toLowerCase().includes(q));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sections = CATEGORIES.map((c) => ({ ...c, games: GAME_LIST.filter((g) => g.category === c.key && match(g)) })).filter((s) => s.games.length);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-[fade-in_.15s_ease]" onClick={onClose}>
      <div
        role="dialog"
        aria-label={t('Alle Spiele')}
        className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-2xl border-t border-line bg-surface shadow-2xl animate-[sheet-up_.22s_cubic-bezier(.2,.8,.2,1)] md:inset-x-auto md:top-[8vh] md:bottom-auto md:left-1/2 md:max-h-[84vh] md:w-[min(720px,92vw)] md:-translate-x-1/2 md:rounded-2xl md:border md:animate-[pop-in_.18s_ease]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line p-3">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Spiel suchen …')} className="input h-10 pl-9" />
          </div>
          <button onClick={onClose} className="btn-ghost h-10 w-10 px-0" aria-label={t('Schließen')}>
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-4">
          {sections.length === 0 && <p className="py-10 text-center text-sm text-faint">{t('Kein Spiel gefunden.')}</p>}
          {sections.map((s) => (
            <section key={s.key} className="mb-5 last:mb-0">
              <p className="mb-2 flex items-baseline gap-2">
                <span className="eyebrow">{t(s.label)}</span>
                <span className="text-[11px] text-faint">{t(s.hint)}</span>
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {s.games.map((g) => (
                  <GameTile key={g.slug} game={g} players={players[g.slug]} fav={isFav(g.slug)} onFav={() => toggleFav(g.slug)} onPick={onClose} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
