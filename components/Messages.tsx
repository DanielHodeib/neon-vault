'use client';

import { ArrowLeft, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { timeAgo } from '@/lib/format';
import { useJoin, useLive, useSocketEvent } from './SocketProvider';
import { Empty } from './ui';

type Thread = { username: string; text: string; at: number; mine: boolean; unread: number };
type Message = { id: string; mine: boolean; text: string; at: number };
type Incoming = { id: string; from: string; to: string; text: string; at: number };

export function Messages({ initial }: { initial: string | null }) {
  const { call, me, setDmUnread } = useLive();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [friends, setFriends] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(initial);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const bottom = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(() => {
    void call<{ threads: Thread[] }>('dm:threads').then((r) => {
      if (!r) return;
      setThreads(r.threads);
      setDmUnread(r.threads.reduce((n, t) => n + t.unread, 0));
    });
  }, [call, setDmUnread]);
  useJoin<{ names: string[] }>('chat:names', useCallback((r) => setFriends(r.names), []));
  useEffect(loadThreads, [loadThreads]);

  useEffect(() => {
    if (!open) return;
    void call<{ messages: Message[] }>('dm:history', { with: open }).then((r) => {
      if (!r) return;
      setMessages(r.messages);
      loadThreads(); // unread count changed
    });
  }, [open, call, loadThreads]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' }); // newer browsers return a Promise here; an effect must not
  }, [messages]);

  useSocketEvent(
    'dm',
    useCallback(
      (m: Incoming) => {
        const other = m.from === me.username ? m.to : m.from;
        if (other === open) {
          setMessages((ms) => (ms.some((x) => x.id === m.id) ? ms : [...ms, { id: m.id, mine: m.from === me.username, text: m.text, at: m.at }]));
          if (m.from !== me.username) void call('dm:read', { with: other });
        }
        setThreads((ts) => {
          const rest = ts.filter((t) => t.username !== other);
          const old = ts.find((t) => t.username === other);
          const unread = other === open || m.from === me.username ? 0 : (old?.unread ?? 0) + 1;
          return [{ username: other, text: m.text, at: m.at, mine: m.from === me.username, unread }, ...rest];
        });
      },
      [me.username, open, call],
    ),
  );

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!open || !text.trim()) return;
    if (await call('dm:send', { to: open, text })) setText('');
  };

  // Friends you have not written with yet, to start a conversation.
  const fresh = friends.filter((f) => !threads.some((t) => t.username === f));

  const list = (
    <div className={`panel min-h-0 overflow-y-auto ${open ? 'hidden md:block' : ''}`}>
      {threads.length === 0 && fresh.length === 0 && <Empty>Noch keine Freunde – füge welche unter „Freunde“ hinzu.</Empty>}
      <ul className="divide-y divide-line">
        {threads.map((t) => (
          <li key={t.username}>
            <button onClick={() => setOpen(t.username)} className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-raised ${open === t.username ? 'bg-raised' : ''}`}>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{t.username}</span>
                  <span className="shrink-0 text-[11px] text-faint">{timeAgo(t.at)}</span>
                </span>
                <span className="block truncate text-xs text-muted">{t.mine && 'Du: '}{t.text}</span>
              </span>
              {t.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-accent-fg">{t.unread}</span>}
            </button>
          </li>
        ))}
      </ul>
      {fresh.length > 0 && (
        <div className="border-t border-line p-3">
          <p className="eyebrow mb-2">Neue Unterhaltung</p>
          <div className="flex flex-wrap gap-1.5">
            {fresh.map((f) => (
              <button key={f} className="chip" onClick={() => setOpen(f)}>{f}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const conversation = open ? (
    <div className="panel flex min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <button className="btn-ghost h-8 w-8 px-0 md:hidden" onClick={() => setOpen(null)} aria-label="Zurück"><ArrowLeft size={18} /></button>
        <span className="text-sm font-semibold">{open}</span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && <Empty>Schreib die erste Nachricht.</Empty>}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : ''}`}>
            <p className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm break-words ${m.mine ? 'rounded-br-sm bg-accent text-accent-fg' : 'rounded-bl-sm bg-raised'}`} title={new Date(m.at).toLocaleString('de-DE')}>
              {m.text}
            </p>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <form onSubmit={send} className="flex shrink-0 gap-2 border-t border-line p-3">
        <input className="input" value={text} maxLength={500} onChange={(e) => setText(e.target.value)} placeholder={`Nachricht an ${open} …`} autoFocus />
        <button className="btn-primary w-10 px-0" aria-label="Senden" disabled={!text.trim()}><Send size={16} /></button>
      </form>
    </div>
  ) : (
    <div className="panel hidden place-items-center md:grid"><Empty>Wähle links eine Unterhaltung.</Empty></div>
  );

  return (
    <div className="grid h-[calc(100dvh-14rem)] min-h-96 gap-3 md:grid-cols-[280px_minmax(0,1fr)]">
      {list}
      {conversation}
    </div>
  );
}
