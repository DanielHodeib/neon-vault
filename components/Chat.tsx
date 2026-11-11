'use client';

import { Send, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { suggest } from '@/lib/chatSuggest';
import { useJoin, useLive } from './SocketProvider';
import { RankTag, RoleBadge } from './ui';

export function Chat({ onClose }: { onClose: () => void }) {
  const { chat, online, call, me } = useLive();
  const [text, setText] = useState('');
  const [tab, setTab] = useState<'chat' | 'online'>('chat');
  const [pick, setPick] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [clearedAt, setClearedAt] = useState(0);
  const bottom = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [friends, setFriends] = useState<string[]>([]);
  useJoin<{ names: string[] }>('chat:names', useCallback((r) => setFriends(r.names), []));

  // Names to complete: friends, who is online and who wrote recently, without me.
  const names = useMemo(
    () => [...new Set([...friends, ...online.map((u) => u.username), ...chat.flatMap((m) => (m.userId ? [m.username] : []))])].filter((n) => n !== me.username).sort((a, b) => a.localeCompare(b)),
    [friends, online, chat, me.username],
  );
  const items = dismissed === text ? [] : suggest(text, names);
  const active = Math.min(pick, items.length - 1);
  const shown = chat.filter((m) => m.at > clearedAt);

  const change = (value: string) => {
    setText(value);
    setPick(0);
    setDismissed(null);
  };
  const choose = (i: number) => change(items[i].text);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!items.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setPick((active + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length);
    } else if (e.key === 'Tab' || (e.key === 'Enter' && items[active].text !== text)) {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setDismissed(text);
    }
  };

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [chat, tab, clearedAt]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const msg = text.trim();
    if (!msg) return;
    // Commands handled right here; everything else (incl. /tip) goes to the server.
    if (msg === '/clear') {
      setClearedAt(Date.now());
      return change('');
    }
    const dm = /^\/msg\s+(\S+)\s+(.+)$/i.exec(msg);
    if (dm) {
      if (await call('dm:send', { to: dm[1].replace(/^@/, ''), text: dm[2] })) change('');
      return;
    }
    const profile = /^\/profil\s+(\S+)$/i.exec(msg);
    if (profile) {
      router.push(`/profile/${encodeURIComponent(profile[1])}`);
      return change('');
    }
    if (await call('chat:send', { text })) change('');
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
          ? shown.map((m) =>
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
        <form onSubmit={send} className="relative flex shrink-0 gap-2 border-t border-line p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {items.length > 0 && (
            <ul id="chat-suggest" role="listbox" className="absolute inset-x-3 bottom-full z-20 mb-1 overflow-hidden rounded-lg border border-line-strong bg-raised py-1 shadow-xl">
              {items.map((it, i) => (
                <li key={it.key} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    // mousedown keeps the focus in the input
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setPick(i)}
                    onClick={() => choose(i)}
                    className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm ${i === active ? 'bg-accent/15 text-fg' : 'text-muted'}`}
                  >
                    <span className="shrink-0 font-medium text-fg">{it.label}</span>
                    {it.hint && <span className="truncate text-xs text-faint">{it.hint}</span>}
                  </button>
                </li>
              ))}
              <li className="border-t border-line px-3 pt-1.5 pb-1 text-[10px] text-faint">↑↓ wählen · Tab/Enter übernehmen · Esc schließen</li>
            </ul>
          )}
          <input
            className="input"
            value={text}
            maxLength={300}
            onChange={(e) => change(e.target.value)}
            onKeyDown={onKey}
            placeholder="Nachricht … ( / für Befehle, @ für Namen)"
            enterKeyHint="send"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="chat-suggest"
            aria-autocomplete="list"
          />
          <button className="btn-primary w-10 px-0" aria-label="Senden" disabled={!text.trim()}>
            <Send size={16} />
          </button>
        </form>
      )}
    </section>
  );
}
