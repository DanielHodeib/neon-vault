'use client';

import { Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ClanMsg } from '@/game/clanChat';
import { useT } from './I18n';
import { useJoin, useLive, useSocketEvent } from './SocketProvider';

/** Private chat of the clan; history of the last messages loads on join. */
export function ClanChat() {
  const t = useT();
  const { call, me } = useLive();
  const [msgs, setMsgs] = useState<ClanMsg[]>([]);
  const [text, setText] = useState('');
  const bottom = useRef<HTMLDivElement>(null);

  useJoin<{ messages: ClanMsg[] }>('clan:join', useCallback((r) => setMsgs(r.messages), []));
  useSocketEvent('clan:msg', (m: ClanMsg) => setMsgs((l) => [...l.slice(-59), m]));
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [msgs]);

  const send = async () => {
    const value = text.trim();
    if (!value) return;
    setText('');
    if (!(await call('clan:send', { text: value }))) setText(value);
  };

  return (
    <section className="panel flex h-[28rem] flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm">
        {msgs.length === 0 && <p className="py-8 text-center text-faint">{t('Noch nichts geschrieben – sag Hallo!')}</p>}
        {msgs.map((m) => (
          <p key={m.id} className="chat-in break-words">
            <span className={`font-semibold ${m.userId === me.id ? 'text-accent' : ''}`}>{m.username}</span>
            <span className="mx-1.5 text-[10px] text-faint">{new Date(m.at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>
            <span className="text-fg/90">{m.text}</span>
          </p>
        ))}
        <div ref={bottom} />
      </div>
      <form
        className="flex gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={t('Nachricht an den Clan …')} aria-label={t('Nachricht an den Clan …')} />
        <button className="btn-primary w-11 px-0" aria-label={t('Senden')} disabled={!text.trim()}>
          <Send size={16} />
        </button>
      </form>
    </section>
  );
}
