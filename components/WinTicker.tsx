'use client';

import { Trophy } from 'lucide-react';
import Link from 'next/link';

import { coins } from '@/lib/format';
import { GAME_BY_SLUG } from './gameCatalog';
import { useT } from './I18n';
import { useLive } from './SocketProvider';

/** Thin strip under the header: big wins scroll past live; a click opens the game. */
export function WinTicker() {
  const t = useT();
  const { wins } = useLive();
  if (!wins.length) return null;
  const items = wins.slice(0, 12);
  return (
    <div className="ticker relative hidden h-8 shrink-0 overflow-hidden border-b border-line bg-bg/60 text-xs sm:block" aria-label={t('Große Gewinne live')}>
      {/* Two copies side by side, moved by half their width: an endless loop without a jump. */}
      <div className="ticker-track flex w-max" style={{ animationDuration: `${Math.max(24, items.length * 7)}s` }}>
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
            {items.map((w, i) => {
              const game = GAME_BY_SLUG.get(w.game);
              const Icon = game?.icon ?? Trophy;
              return (
                <Link
                  key={w.id}
                  href={`/play/${w.game}`}
                  tabIndex={copy ? -1 : undefined}
                  className={`flex h-8 items-center gap-1.5 px-4 whitespace-nowrap text-muted hover:text-fg ${i === 0 && copy === 0 ? 'ticker-new' : ''}`}
                >
                  <Icon size={13} style={{ color: game?.tint }} />
                  <span className="font-medium text-fg">{w.username}</span>
                  <span className="num font-semibold text-gold">+{coins(w.amount)}</span>
                  <span className="text-faint">{t(game?.name ?? w.game)}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
