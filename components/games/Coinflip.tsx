'use client';

import { useCallback, useState } from 'react';

import { coins } from '@/lib/format';
import { useJoin, useLive, useSocketEvent } from '../SocketProvider';
import { BetInput, Empty } from '../ui';
import { GameFrame } from './GameFrame';

type Side = 'heads' | 'tails';
type Lobby = { id: string; userId: string; username: string; side: Side; amount: number };
type Result = { lobby: Lobby; opponent: string; result: Side; winner: string; prize: number };

const SIDE: Record<Side, string> = { heads: 'Kopf', tails: 'Zahl' };

export function Coinflip() {
  const { call, balance, me } = useLive();
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [amount, setAmount] = useState(500);
  const [side, setSide] = useState<Side>('heads');
  const [results, setResults] = useState<Result[]>([]);

  useJoin<{ lobbies: Lobby[] }>('coinflip:join', useCallback((r) => setLobbies(r.lobbies), []));
  useSocketEvent('coinflip:lobbies', setLobbies);
  useSocketEvent('coinflip:result', useCallback((r: Result) => setResults((rs) => [r, ...rs].slice(0, 10)), []));

  const stage = (
    <div className="panel">
      <p className="border-b border-line px-4 py-3 text-sm font-semibold">Offene Duelle</p>
      {lobbies.length === 0 ? (
        <Empty>Keine offenen Duelle – erstelle das erste.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {lobbies.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-gold/40 text-xs font-semibold text-gold">{SIDE[l.side][0]}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{l.username}</span>
                <span className="text-xs text-muted">setzt auf {SIDE[l.side]}</span>
              </span>
              <span className="num text-sm text-gold">{coins(l.amount)}</span>
              {l.userId === me.id ? (
                <button className="btn-secondary h-8" onClick={() => call('coinflip:cancel', { id: l.id })}>Abbrechen</button>
              ) : (
                <button className="btn-primary h-8" onClick={() => call('coinflip:accept', { id: l.id })}>Annehmen</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const controls = (
    <div className="card space-y-4">
      <h2 className="font-semibold">Duell erstellen</h2>
      <BetInput value={amount} onChange={setAmount} balance={balance} />
      <div className="grid grid-cols-2 gap-2">
        {(['heads', 'tails'] as const).map((s) => (
          <button key={s} className={side === s ? 'btn-primary' : 'btn-secondary'} onClick={() => setSide(s)}>{SIDE[s]}</button>
        ))}
      </div>
      <button className="btn-primary h-12 w-full" onClick={() => call('coinflip:create', { amount, side })}>Duell eröffnen</button>
      <p className="text-xs text-faint">Der Gewinner bekommt den Pot abzüglich 5 % Gebühr.</p>
    </div>
  );

  const extra = results.length > 0 && (
    <div className="panel">
      <p className="border-b border-line px-4 py-3 text-sm font-semibold">Letzte Würfe</p>
      <ul className="divide-y divide-line text-sm">
        {results.map((r, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
            <span className="text-muted">{r.lobby.username} vs. {r.opponent} · {SIDE[r.result]}</span>
            <span><span className="font-medium">{r.winner}</span> <span className="num text-win">+{coins(r.prize)}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );

  return <GameFrame title="Coinflip" subtitle="Kopf oder Zahl, Spieler gegen Spieler." stage={stage} controls={controls} extra={extra} />;
}
