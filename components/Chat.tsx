'use client';

import { Send, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { useLive } from './SocketProvider';
import { RankTag, RoleBadge } from './ui';

export function Chat({ onClose }: { onClose: () => void }) {
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
    <section className="flex w-full flex-col pt-[env(safe-area-inset-top)] xl:bg-surface">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2 md:h-16">
        {(['chat', 'online'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={tab === t ? 'chip-active' : 'chip border-transparent'}>
            {t === 'chat' ? 'Chat' : `Online · ${online.length}`}
          </button>
        ))}
        <button onClick={onClose} className="btn-ghost ml-auto h-8 w-8 px-0 xl:hidden" aria-label="Chat schließen">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {tab === 'chat'
          ? chat.map((m) =>
              m.userId ? (
                <div key={m.id}>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {m.clanTag && <span className="text-xs text-faint">[{m.clanTag}]</span>}
                    <Link href={`/profile/${m.username}`} className="text-[13px] font-semibold hover:underline" style={{ color: m.color ?? undefined }}>
                      {m.username}
                    </Link>
                    <RoleBadge role={m.role} />
                    <RankTag rank={m.rank} />
                  </div>
                  <p className={`mt-0.5 break-words text-fg/90 ${m.text.includes(`@${me.username}`) ? 'rounded bg-accent/10 px-1.5 py-0.5' : ''}`}>{m.text}</p>
                </div>
              ) : (
                <p key={m.id} className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-muted">{m.text}</p>
              ),
            )
          : online.map((u) => (
              <Link key={u.id} href={`/profile/${u.username}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-raised">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-win" /> {u.username}
                </span>
                <span className="text-xs text-faint">{u.activity}</span>
              </Link>
            ))}
        <div ref={bottom} />
      </div>

      {tab === 'chat' && (
        <form onSubmit={send} className="flex shrink-0 gap-2 border-t border-line p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <input className="input" value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="Nachricht schreiben …" enterKeyHint="send" />
          <button className="btn-primary w-10 px-0" aria-label="Senden" disabled={!text.trim()}>
            <Send size={16} />
          </button>
        </form>
      )}
    </section>
  );
}
