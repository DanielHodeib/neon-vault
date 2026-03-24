'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

interface PresenceUser {
  username: string;
  activity: string;
  online: boolean;
}

interface FriendSummary {
  username: string;
}

export default function WelcomeLanding({
  isLoggedIn,
  sessionUsername,
}: {
  isLoggedIn: boolean;
  sessionUsername?: string;
}) {
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [acceptedFriends, setAcceptedFriends] = useState<FriendSummary[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const presenceResponse = await fetch('/api/presence', { cache: 'no-store' });
      if (presenceResponse.ok && !cancelled) {
        const payload = (await presenceResponse.json()) as { users?: PresenceUser[] };
        setPresenceUsers(payload.users ?? []);
      }

      if (!isLoggedIn) {
        return;
      }

      const friendsResponse = await fetch('/api/friends', { cache: 'no-store' });
      if (friendsResponse.ok && !cancelled) {
        const payload = (await friendsResponse.json()) as { accepted?: FriendSummary[] };
        setAcceptedFriends(payload.accepted ?? []);
      }
    };

    void load();
    const interval = window.setInterval(load, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isLoggedIn]);

  const onlineFriends = useMemo(() => {
    if (!isLoggedIn) {
      return [] as PresenceUser[];
    }

    const friendSet = new Set(acceptedFriends.map((entry) => entry.username));
    return presenceUsers.filter((entry) => friendSet.has(entry.username));
  }, [acceptedFriends, presenceUsers, isLoggedIn]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_rgba(2,6,23,1)_55%)] text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="rounded-2xl border border-slate-700/60 bg-slate-950/60 p-8 backdrop-blur">
          <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">NEON VAULT</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Welcome to the Vault</h1>
          <p className="mt-3 max-w-2xl text-slate-300">
            Real-time social casino with rooms, friends, and daily progression.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {isLoggedIn ? (
              <>
                <Link href="/hub" className="h-11 px-5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold inline-flex items-center">
                  Enter Hub
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="h-11 px-5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold inline-flex items-center">
                  Login
                </Link>
                <Link href="/register" className="h-11 px-5 rounded-lg border border-slate-600 hover:border-slate-400 text-slate-200 font-semibold inline-flex items-center">
                  Register
                </Link>
              </>
            )}
          </div>

          <p className="mt-4 text-xs text-slate-400">
            {isLoggedIn ? `Signed in as ${sessionUsername ?? 'Player'}` : 'Sign in to see your friend activity.'}
          </p>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-lg font-bold">Live Players</h2>
            <p className="text-xs text-slate-400 mt-1">Who is online right now and what they are playing.</p>
            <div className="mt-4 space-y-2 max-h-72 overflow-y-auto">
              {presenceUsers.length === 0 ? <p className="text-sm text-slate-500">No players online.</p> : null}
              {presenceUsers.map((entry) => (
                <div key={`${entry.username}-${entry.activity}`} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 flex items-center justify-between">
                  <span className="font-medium text-slate-200">{entry.username}</span>
                  <span className="text-xs uppercase text-emerald-300">{entry.activity}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
            <h2 className="text-lg font-bold">Friends Activity</h2>
            <p className="text-xs text-slate-400 mt-1">Quick overview of your friends online sessions.</p>
            <div className="mt-4 space-y-2 max-h-72 overflow-y-auto">
              {!isLoggedIn ? <p className="text-sm text-slate-500">Login to view your friends.</p> : null}
              {isLoggedIn && onlineFriends.length === 0 ? <p className="text-sm text-slate-500">No friends online right now.</p> : null}
              {onlineFriends.map((entry) => (
                <div key={`${entry.username}-${entry.activity}`} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 flex items-center justify-between">
                  <span className="font-medium text-slate-200">{entry.username}</span>
                  <span className="text-xs uppercase text-cyan-300">{entry.activity}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
