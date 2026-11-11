'use client';

import { useCallback, useState } from 'react';

import { coins } from '@/lib/format';
import { useJoin, useLive, useSocketEvent } from '../SocketProvider';
import { BetInput } from '../ui';

type Lobby = { id: string; userId: string; username: string; side: 'heads' | 'tails'; amount: number };
type Result = { lobby: Lobby; opponent: string; result: 'heads' | 'tails'; winner: string; prize: number };

const SIDE = { heads: '👑 Kopf', tails: '🔢 Zahl' };

export function Coinflip() {
  const { call, balance, me } = useLive();
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [amount, setAmount] = useState(500);
  const [side, setSide] = useState<'heads' | 'tails'>('heads');
  const [results, setResults] = useState<Result[]>([]);

  useJoin<{ lobbies: Lobby[] }>('coinflip:join', useCallback((r) => setLobbies(r.lobbies), []));
  useSocketEvent('coinflip:lobbies', setLobbies);
  useSocketEvent('coinflip:result', useCallback((r: Result) => setResults((rs) => [r, ...rs].slice(0, 10)), []));

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[320px_1fr]">
      <div className="card h-fit space-y-3">
        <h2 className="font-bold">Lobby erstellen</h2>
        <BetInput value={amount} onChange={setAmount} balance={balance} />
        <div className="grid grid-cols-2 gap-2">
          {(['heads', 'tails'] as const).map((s) => (
            <button key={s} className={side === s ? 'btn-primary' : 'btn-ghost'} onClick={() => setSide(s)}>{SIDE[s]}</button>
          ))}
        </div>
        <button className="btn-primary w-full" onClick={() => call('coinflip:create', { amount, side })}>Erstellen</button>
        <p className="text-xs text-muted">Gewinner bekommt den Pot minus 5 % Gebühr.</p>
      </div>

      <div className="space-y-4">
        <div className="card">
          <h2 className="mb-3 font-bold">Offene Lobbys</h2>
          {lobbies.length === 0 && <p className="text-sm text-muted">Keine offenen Lobbys – erstelle eine!</p>}
          <ul className="space-y-2">
            {lobbies.map((l) => (
              <li key={l.id} className="flex items-center justify-between rounded-lg bg-bg p-3">
                <span>
                  <b>{l.username}</b> · {SIDE[l.side]} · <span className="font-mono text-amber-300">{coins(l.amount)}</span>
                </span>
                {l.userId === me.id ? (
                  <button className="btn-ghost" onClick={() => call('coinflip:cancel', { id: l.id })}>Abbrechen</button>
                ) : (
                  <button className="btn-primary" onClick={() => call('coinflip:accept', { id: l.id })}>Annehmen</button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2 className="mb-3 font-bold">Letzte Flips</h2>
          <ul className="space-y-1 text-sm">
            {results.map((r, i) => (
              <li key={i}>
                {r.lobby.username} vs. {r.opponent} → {SIDE[r.result]} · <b className="text-emerald-300">{r.winner}</b> gewinnt {coins(r.prize)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
