'use client';

import { useState } from 'react';

import LeaderboardPanel from '@/components/LeaderboardPanel';

export default function HomeLeaderboardModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center rounded-lg border border-slate-700 bg-slate-900 px-4 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800"
      >
        View Leaderboard
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm p-4 md:p-8">
          <div className="mx-auto h-full max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-cyan-500/35 bg-slate-900 shadow-[0_0_45px_rgba(34,211,238,0.22)]">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3 bg-slate-950">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Live Rankings</p>
                <h3 className="text-lg font-bold text-slate-100">Leaderboard</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="h-[calc(92vh-64px)] overflow-y-auto">
              <LeaderboardPanel />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
