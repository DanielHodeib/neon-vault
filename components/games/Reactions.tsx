'use client';

import { useState, type ReactNode } from 'react';

import { REACTIONS, type ReactionRoom } from '@/lib/games';
import { useT } from '@/components/I18n';
import { useLive, useSocketEvent } from '../SocketProvider';

type Floating = { id: string; emoji: string; username: string; left: number };

/** Wraps a live game's board: emojis sent by anyone in the room float up over it; a bar below sends your own. */
export function Reactions({ room, children }: { room: ReactionRoom; children: ReactNode }) {
  const t = useT();
  const { socket, me } = useLive();
  const [floating, setFloating] = useState<Floating[]>([]);

  useSocketEvent('react', (r: { id: string; room: string; emoji: string; username: string }) => {
    if (r.room !== room) return;
    // Spread them over the board by their id, so a burst doesn't stack in one spot.
    const left = 10 + (parseInt(r.id.slice(-4), 36) % 80);
    setFloating((f) => [...f.slice(-14), { ...r, left }]);
    setTimeout(() => setFloating((f) => f.filter((x) => x.id !== r.id)), 2600);
  });

  return (
    <div>
      <div className="relative">
        {children}
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
          {floating.map((f) => (
            <span key={f.id} className="reaction-float absolute bottom-2 flex flex-col items-center" style={{ left: `${f.left}%` }}>
              <span className="text-3xl drop-shadow-lg">{f.emoji}</span>
              <span className={`rounded-full bg-black/60 px-1.5 text-[10px] ${f.username === me.username ? 'text-accent' : 'text-white/80'}`}>{f.username}</span>
            </span>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-center gap-1" role="group" aria-label={t('Reaktionen')}>
        {REACTIONS.map((e) => (
          <button key={e} onClick={() => socket?.emit('react', { room, emoji: e })} className="grid h-9 w-9 place-items-center rounded-full text-lg transition hover:scale-125 hover:bg-raised active:scale-95" aria-label={e}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Small round badge with the player's initial, coloured from the name (same name, same colour). */
export function NameDot({ name }: { name: string }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-black/80" style={{ background: `hsl(${h} 70% 62%)` }} aria-hidden>
      {name[0]?.toUpperCase()}
    </span>
  );
}
