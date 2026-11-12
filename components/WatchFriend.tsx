'use client';

import { ArrowLeft, Eye } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { coins, GAME_NAMES } from '@/lib/format';
import { REACTIONS } from '@/lib/games';
import { GAME_BY_SLUG } from './gameCatalog';
import { useT } from './I18n';
import { useLive, useSocketEvent } from './SocketProvider';
import { Empty } from './ui';

type Round = { id: string; game: string; bet: number | null; won: number; multiplier: number | null; detail: string; lost: boolean; at: number };

/** Live feed of a friend's rounds, with cheers. Server checks the friendship. */
export function WatchFriend({ username }: { username: string }) {
  const t = useT();
  const { socket, online, call } = useLive();
  const [ok, setOk] = useState<boolean | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const friend = online.find((o) => o.username === username);

  useEffect(() => {
    if (!socket) return;
    const join = () => void call<{ activity: string | null }>('watch:join', { username }).then((r) => setOk(!!r));
    if (socket.connected) join();
    socket.on('connect', join);
    return () => {
      socket.off('connect', join);
      socket.emit('watch:leave', {});
    };
  }, [socket, call, username]);
  useSocketEvent('watch:round', (r: Round) => setRounds((list) => [r, ...list].slice(0, 30)));

  const last = rounds[0];
  const stats = rounds.reduce((s, r) => ({ bet: s.bet + (r.bet ?? 0), won: s.won + r.won }), { bet: 0, won: 0 });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/friends" className="btn-ghost h-9 w-9 px-0" aria-label={t('Zurück')}>
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Eye size={20} className="text-accent" /> {t('Du schaust {name} zu', { name: username })}
          </h1>
          <p className="text-sm text-muted">
            {friend ? (
              <>
                <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-win" />
                {t(friend.activity)}
              </>
            ) : (
              t('gerade offline')
            )}
          </p>
        </div>
      </div>

      {ok === false ? (
        <section className="panel">
          <Empty>{t('Zuschauen geht nur bei Freunden.')}</Empty>
        </section>
      ) : (
        <>
          <section className="panel relative overflow-hidden p-6 text-center">
            {last ? (
              <div key={last.id} className="pop-in">
                <p className="text-sm text-muted">
                  {GAME_BY_SLUG.get(last.game) && (() => {
                    const Icon = GAME_BY_SLUG.get(last.game)!.icon;
                    return <Icon size={14} className="mr-1 inline" style={{ color: GAME_BY_SLUG.get(last.game)!.tint }} />;
                  })()}
                  {t(GAME_NAMES[last.game] ?? last.game)} {last.detail && `· ${last.detail}`}
                </p>
                <p className={`num mt-2 text-5xl font-black ${last.lost ? 'text-loss' : 'text-win'}`}>{last.lost ? `−${coins(last.bet ?? 0)}` : `+${coins(last.won)}`}</p>
                {last.multiplier !== null && <p className="num mt-1 text-sm text-muted">{last.multiplier}×</p>}
              </div>
            ) : (
              <p className="py-6 text-sm text-muted">{t('Warte auf die nächste Runde …')}</p>
            )}
            <div className="mt-5 flex justify-center gap-1" role="group" aria-label={t('Anfeuern')}>
              {REACTIONS.map((e) => (
                <button key={e} onClick={() => socket?.emit('watch:cheer', { emoji: e })} className="grid h-10 w-10 place-items-center rounded-full text-xl transition hover:scale-125 hover:bg-raised active:scale-95" aria-label={e}>
                  {e}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-faint">{t('Deine Emojis landen direkt bei {name}.', { name: username })}</p>
          </section>

          {rounds.length > 0 && (
            <section className="panel">
              <div className="flex items-center justify-between border-b border-line px-4 py-3 text-sm">
                <span className="font-semibold">{t('Seit du zuschaust')}</span>
                <span className={`num ${stats.won - stats.bet >= 0 ? 'text-win' : 'text-loss'}`}>
                  {stats.won - stats.bet >= 0 ? '+' : '−'}
                  {coins(Math.abs(stats.won - stats.bet))}
                </span>
              </div>
              <ul className="divide-y divide-line text-sm">
                {rounds.map((r) => (
                  <li key={r.id} className="pop-in flex items-center justify-between gap-3 px-4 py-2">
                    <span className="min-w-0 truncate">
                      {t(GAME_NAMES[r.game] ?? r.game)} <span className="text-faint">{r.detail}</span>
                    </span>
                    <span className={`num shrink-0 ${r.lost ? 'text-muted' : 'text-win'}`}>{r.lost ? `−${coins(r.bet ?? 0)}` : `+${coins(r.won)}`}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
