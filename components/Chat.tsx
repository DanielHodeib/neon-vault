'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { useLive } from './SocketProvider';
import { RankTag, RoleBadge } from './ui';

export function Chat() {
  const { chat, online, call, me } = useLive();
  const [text, setText] = useState('');
  const [tab, setTab] = useState<'chat' | 'online'>('chat');
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [chat, tab]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (await call('chat:send', { text })) setText('');
  };

  return (
    <aside className="hidden w-80 shrink-0 flex-col border-l border-line bg-panel/60 lg:flex">
      <div className="flex border-b border-line text-sm">
        {(['chat', 'online'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 py-3 font-semibold ${tab === t ? 'border-b-2 border-accent text-accent' : 'text-muted'}`}>
            {t === 'chat' ? 'Chat' : `Online (${online.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {tab === 'chat'
          ? chat.map((m) => (
              <div key={m.id} className={m.userId ? '' : 'rounded-lg bg-accent-2/10 p-2 text-accent-2'}>
                {m.userId && (
                  <div className="flex flex-wrap items-center gap-1">
                    <RoleBadge role={m.role} />
                    <RankTag rank={m.rank} />
                    {m.clanTag && <span className="text-xs text-muted">[{m.clanTag}]</span>}
                    <Link href={`/profile/${m.username}`} className="font-semibold hover:underline" style={{ color: m.color ?? undefined }}>
                      {m.username}
                    </Link>
                  </div>
                )}
                <p className={`break-words ${m.text.includes(`@${me.username}`) ? 'rounded bg-amber-400/10 px-1' : ''}`}>{m.text}</p>
              </div>
            ))
          : online.map((u) => (
              <Link key={u.id} href={`/profile/${u.username}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/5">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" /> {u.username}
                </span>
                <span className="text-xs text-muted">{u.activity}</span>
              </Link>
            ))}
        <div ref={bottom} />
      </div>

      {tab === 'chat' && (
        <form onSubmit={send} className="border-t border-line p-3">
          <input className="input" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="Nachricht … (@name erwähnt)" />
        </form>
      )}
    </aside>
  );
}
