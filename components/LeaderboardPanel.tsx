'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

import { formatUserBalance } from '@/lib/formatMoney';

interface LeaderboardEntry {
  username: string;
  balance: number | string;
  xp: number;
}

interface DailyLeaderboardEntry {
  rank: number;
  username: string;
  netProfit: number;
  isKing: boolean;
}

function getSocketUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SOCKET_URL ?? process.env.NEXT_PUBLIC_GAME_SERVER_URL;

  if (typeof window === 'undefined') {
    return fromEnv ?? 'http://localhost:5000';
  }

  if (fromEnv === 'same-origin') {
    return window.location.origin;
  }

  if (!fromEnv) {
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    const isPrivateIp = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
    if (isLocalHost || isPrivateIp) {
      return `${window.location.protocol}//${window.location.hostname}:5000`;
    }
    return window.location.origin;
  }

  try {
    return new URL(fromEnv).toString().replace(/\/$/, '');
  } catch {
    return window.location.origin;
  }
}

export default function LeaderboardPanel() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [dailyEntries, setDailyEntries] = useState<DailyLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/leaderboard', { cache: 'no-store' });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { leaderboard?: LeaderboardEntry[] };
      setEntries(payload.leaderboard ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDailyLeaderboard = useCallback(async () => {
    try {
      const response = await fetch('/api/leaderboard/daily', { cache: 'no-store' });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        dailyLeaderboard?: DailyLeaderboardEntry[];
      };

      setDailyEntries(payload.dailyLeaderboard ?? []);
    } catch {
      // Keep previous daily entries on fetch errors.
    }
  }, []);

  useEffect(() => {
    void fetchLeaderboard();
    void fetchDailyLeaderboard();

    const socket = io(getSocketUrl(), {
      path: '/socket.io',
      transports: ['websocket'],
    });

    socket.on('leaderboard_refresh', () => {
      void fetchLeaderboard();
      void fetchDailyLeaderboard();
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchDailyLeaderboard, fetchLeaderboard]);

  const topThree = useMemo(() => entries.slice(0, 3), [entries]);

  return (
    <div className="h-full min-h-0 p-6 overflow-y-auto">
      <h2 className="text-2xl font-bold text-slate-100">Leaderboard</h2>
      <p className="mt-1 text-sm text-slate-400">Top 50 by balance (live).</p>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {topThree.map((entry, index) => (
          <div key={entry.username} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">#{index + 1}</p>
            <p className="mt-1 text-lg font-semibold text-slate-100">{entry.username}</p>
            <p className="mt-1 font-mono text-cyan-300">{formatUserBalance(entry.balance, true)} NVC</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 overflow-hidden">
        <div className="px-4 py-2 text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
          Daily High Score (Top 5)
        </div>
        {dailyEntries.length === 0 ? <p className="px-4 py-3 text-sm text-slate-500">No daily results yet.</p> : null}
        {dailyEntries.map((entry) => (
          <div key={`${entry.username}-${entry.rank}`} className="grid grid-cols-[56px_1fr_140px] gap-2 px-4 py-2 text-sm border-b border-slate-800/50 last:border-b-0">
            <span className="text-slate-400">#{entry.rank}</span>
            <span className="text-slate-200 font-medium">{entry.isKing ? '👑 ' : ''}{entry.username}</span>
            <span className="font-mono text-emerald-300">{entry.netProfit}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 overflow-hidden">
        <div className="grid grid-cols-[70px_1fr_150px_100px] gap-2 px-4 py-2 text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-800">
          <span>Rank</span>
          <span>User</span>
          <span>Balance</span>
          <span>XP</span>
        </div>
        {loading && entries.length === 0 ? <p className="px-4 py-3 text-sm text-slate-500">Loading...</p> : null}
        {entries.map((entry, index) => (
          <div key={`${entry.username}-${index}`} className="grid grid-cols-[70px_1fr_150px_100px] gap-2 px-4 py-2 text-sm border-b border-slate-800/50 last:border-b-0">
            <span className="text-slate-400">#{index + 1}</span>
            <span className="text-slate-200 font-medium">{entry.username}</span>
            <span className="font-mono text-cyan-300">{formatUserBalance(entry.balance, true)}</span>
            <span className="text-slate-400">{entry.xp}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
