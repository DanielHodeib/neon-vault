'use client';

import { Lock, Users } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { useLive } from '../SocketProvider';
import { Empty, PageHeader } from '../ui';

type TableInfo = { id: string; players: number; seats: number };

/** Lobby for room-based games: list public tables, create one, or join by code. */
export function TableLobby({
  title,
  subtitle,
  game,
  maxBots,
  onCreate,
  onJoin,
  extra,
}: {
  title: string;
  subtitle: string;
  game: 'bj' | 'poker';
  maxBots: number;
  onCreate: (opts: { bots: number; isPrivate: boolean }) => void;
  onJoin: (id: string) => void;
  extra?: ReactNode;
}) {
  const { call } = useLive();
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [bots, setBots] = useState(Math.min(2, maxBots));
  const [isPrivate, setPrivate] = useState(false);
  const [code, setCode] = useState('');

  useEffect(() => {
    const load = () => void call<{ tables: TableInfo[] }>(`${game}:lobby`).then((r) => r && setTables(r.tables));
    load();
    const t = setInterval(load, 5_000);
    return () => clearInterval(t);
  }, [call, game]);

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="grid items-start gap-4 md:grid-cols-2">
        <div className="card space-y-5">
          <h2 className="font-semibold">Neuer Tisch</h2>
          <div>
            <label className="label">Bots am Tisch</label>
            <div className="grid grid-cols-6 gap-1.5">
              {Array.from({ length: maxBots + 1 }, (_, n) => (
                <button key={n} onClick={() => setBots(n)} className={`num h-9 rounded-lg border text-sm ${bots === n ? 'border-accent bg-accent/10' : 'border-line text-muted'}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          {extra}
          <label className="flex items-center gap-2.5 text-sm text-muted">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
            Privat – nur mit Tisch-Code
          </label>
          <button className="btn-primary w-full" onClick={() => onCreate({ bots, isPrivate })}>Tisch erstellen</button>
          <div className="border-t border-line pt-5">
            <label className="label">Mit Code beitreten</label>
            <div className="flex gap-2">
              <input className="input num" placeholder="z. B. k3x9ab" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="off" />
              <button className="btn-secondary" onClick={() => onJoin(code)} disabled={!code}>Beitreten</button>
            </div>
          </div>
        </div>

        <div className="panel">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Offene Tische</h2>
          {tables.length === 0 ? (
            <Empty>Gerade kein öffentlicher Tisch offen.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {tables.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="num font-medium">#{t.id}</span>
                  <span className="flex items-center gap-1.5 text-muted"><Users size={14} /> {t.players} · {t.seats} Plätze</span>
                  <button className="btn-secondary h-8" onClick={() => onJoin(t.id)}>Setzen</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

export function TableBar({ id, isPrivate, info, onLeave, leaveLabel }: { id: string; isPrivate: boolean; info?: string; onLeave: () => void; leaveLabel: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-2 text-muted">
        {isPrivate && <Lock size={14} />} Tisch <span className="num text-fg">#{id}</span>
        {info && <span className="hidden sm:inline">· {info}</span>}
      </span>
      <button className="btn-secondary h-8" onClick={onLeave}>{leaveLabel}</button>
    </div>
  );
}

export function PlayingCard({ card }: { card: string }) {
  if (card === '??') return <span className="playing-card border-line-strong bg-raised bg-[repeating-linear-gradient(45deg,transparent_0_4px,rgba(255,255,255,.04)_4px_8px)]" />;
  const suit = { S: '♠', H: '♥', D: '♦', C: '♣' }[card[1]];
  const red = card[1] === 'H' || card[1] === 'D';
  return (
    <span className={`playing-card ${red ? 'text-red-600' : ''}`}>
      {card[0] === 'T' ? '10' : card[0]}
      {suit}
    </span>
  );
}

export const Felt = ({ children }: { children: ReactNode }) => (
  <div className="panel overflow-hidden bg-[radial-gradient(ellipse_at_top,#173a2c_0%,#0f2219_55%,#111317_100%)] p-3 sm:p-6">{children}</div>
);
