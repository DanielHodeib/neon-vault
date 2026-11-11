'use client';

import { useEffect, useState } from 'react';

import { useLive } from '../SocketProvider';

type TableInfo = { id: string; players: number; seats: number };

/** Lobby for room-based games: list public tables, create one, or join by code. */
export function TableLobby({
  game,
  maxBots,
  onCreate,
  onJoin,
  extra,
}: {
  game: 'bj' | 'poker';
  maxBots: number;
  onCreate: (opts: { bots: number; isPrivate: boolean }) => void;
  onJoin: (id: string) => void;
  extra?: React.ReactNode;
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
    <div className="mx-auto grid max-w-4xl gap-4 md:grid-cols-2">
      <div className="card space-y-3">
        <h2 className="font-bold">Neuer Tisch</h2>
        <div>
          <label className="label">Bots: {bots}</label>
          <input type="range" min={0} max={maxBots} value={bots} onChange={(e) => setBots(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} /> Privat (nur mit Code)
        </label>
        {extra}
        <button className="btn-primary w-full" onClick={() => onCreate({ bots, isPrivate })}>Tisch erstellen</button>
        <div className="flex gap-2 pt-2">
          <input className="input" placeholder="Tisch-Code" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn-ghost" onClick={() => onJoin(code)} disabled={!code}>Beitreten</button>
        </div>
      </div>
      <div className="card">
        <h2 className="mb-3 font-bold">Offene Tische</h2>
        {tables.length === 0 && <p className="text-sm text-muted">Keine öffentlichen Tische.</p>}
        <ul className="space-y-2">
          {tables.map((t) => (
            <li key={t.id} className="flex items-center justify-between rounded-lg bg-bg p-3 text-sm">
              <span className="font-mono">#{t.id}</span>
              <span className="text-muted">{t.players} Spieler · {t.seats} Plätze</span>
              <button className="btn-primary" onClick={() => onJoin(t.id)}>Setzen</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function PlayingCard({ card }: { card: string }) {
  if (card === '??') return <span className="playing-card bg-gradient-to-br from-accent to-accent-2 text-transparent">?</span>;
  const suit = { S: '♠', H: '♥', D: '♦', C: '♣' }[card[1]];
  const red = card[1] === 'H' || card[1] === 'D';
  return <span className={`playing-card ${red ? 'text-red-600' : 'text-slate-900'}`}>{card[0] === 'T' ? '10' : card[0]}{suit}</span>;
}
