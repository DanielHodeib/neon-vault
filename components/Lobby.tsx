'use client';

import { CloudRain, Crown, Flame, History, Play, Star, Users, Zap } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { coins } from '@/lib/format';
import { CATEGORIES, GAME_BY_SLUG, GAME_LIST, type GameEntry } from './gameCatalog';
import { GameTile, useGameShortcuts, usePlayerCounts } from './GamesPanel';
import { useT } from './I18n';
import { useLive } from './SocketProvider';

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Live status chips for the lobby hero: players online, running event, rain, King of Today, continue button. */
export function LobbyLive({ king }: { king: { username: string; profit: number } | null }) {
  const t = useT();
  const { online, event, rain } = useLive();
  const { recent } = useGameShortcuts();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!event) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [event]);
  const last = recent[0] ? GAME_BY_SLUG.get(recent[0]) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="chip-live">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-win" />
          <Users size={13} /> {t('{n} online', { n: online.length })}
        </span>
        {event && (
          <span className="chip-live border-accent/40 text-accent" title={t(event.description)}>
            <Zap size={13} /> {t(event.label)} <span className="num opacity-80">{clock(event.endsAt - now)}</span>
          </span>
        )}
        {rain && (
          <span className="chip-live border-sky-400/40 text-sky-300">
            <CloudRain size={13} /> Rain {coins(rain.amount)}
          </span>
        )}
        {king && (
          <Link href={`/profile/${king.username}`} className="chip-live border-gold/40 text-gold hover:bg-gold/10">
            <Crown size={13} /> {king.username} <span className="num opacity-80">+{coins(king.profit)}</span>
          </Link>
        )}
      </div>
      {last && (
        <Link href={`/play/${last.slug}`} className="btn-primary h-11 w-fit gap-2 px-5">
          <Play size={16} fill="currentColor" /> {t('Weiterspielen: {game}', { game: t(last.name) })}
        </Link>
      )}
    </div>
  );
}

function Row({ icon: Icon, title, games, players, isFav, toggleFav }: { icon: typeof Star; title: string; games: GameEntry[]; players: Record<string, number>; isFav: (s: string) => boolean; toggleFav: (s: string) => void }) {
  const t = useT();
  if (!games.length) return null;
  return (
    <section>
      <h2 className="eyebrow mb-3 flex items-center gap-1.5">
        <Icon size={13} /> {t(title)}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {games.map((g) => (
          <GameTile key={g.slug} game={g} players={players[g.slug]} fav={isFav(g.slug)} onFav={() => toggleFav(g.slug)} />
        ))}
      </div>
    </section>
  );
}

/** Lobby game area: continue, hot right now, favourites, then every game by category. */
export function LobbyGames() {
  const t = useT();
  const { favs, recent, isFav, toggleFav } = useGameShortcuts();
  const players = usePlayerCounts();
  const pick = (slugs: string[]) => slugs.map((s) => GAME_BY_SLUG.get(s)!).filter(Boolean);
  const hot = GAME_LIST.filter((g) => players[g.slug] > 0).sort((a, b) => players[b.slug] - players[a.slug]).slice(0, 4);
  const shared = { players, isFav, toggleFav };

  return (
    <div className="space-y-8">
      <Row icon={Flame} title="Gerade heiß" games={hot} {...shared} />
      <Row icon={Star} title="Favoriten" games={pick(favs)} {...shared} />
      <Row icon={History} title="Zuletzt gespielt" games={pick(recent.filter((s) => !favs.includes(s)).slice(0, 4))} {...shared} />
      {CATEGORIES.map((c) => (
        <section key={c.key}>
          <h2 className="mb-3 flex items-baseline gap-2">
            <span className="eyebrow">{t(c.label)}</span>
            <span className="text-xs text-faint">{t(c.hint)}</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {GAME_LIST.filter((g) => g.category === c.key).map((g) => (
              <GameTile key={g.slug} game={g} size="lg" players={players[g.slug]} fav={isFav(g.slug)} onFav={() => toggleFav(g.slug)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
