'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';

import { formatMoney } from '@/lib/formatMoney';
import { useCasinoStore } from '@/store/useCasinoStore';

type QuestState = {
  date: string;
  objectives: Array<{
    id: string;
    label: string;
    progress: number;
    target: number;
    complete: boolean;
  }>;
  claimed: boolean;
  complete: boolean;
  reward: number;
  xpReward: number;
};

type QuestsPayload = {
  daily: QuestState;
  weekly: QuestState;
};

const PERIODS: Array<{
  key: 'daily' | 'weekly';
  title: string;
  description: string;
}> = [
  {
    key: 'daily',
    title: 'Daily Triple Quest',
    description: 'Bets + wins + slots spins in one daily bundle.',
  },
  {
    key: 'weekly',
    title: 'Weekly Grind Pack',
    description: 'Long-term progression quests with big XP payout.',
  },
];

export default function QuestsPanel() {
  const syncBalanceFromServer = useCasinoStore((state) => state.syncBalanceFromServer);
  const [quests, setQuests] = useState<QuestsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState<'daily' | 'weekly' | null>(null);
  const [notice, setNotice] = useState('');
  const [activePeriod, setActivePeriod] = useState<'daily' | 'weekly'>('daily');

  const loadQuests = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setNotice('');

    try {
      const response = await fetch('/api/quests', { cache: 'no-store' });
      const payload = (await response.json()) as QuestsPayload & { error?: string };

      if (!response.ok || !payload.daily || !payload.weekly) {
        setNotice(payload.error ?? 'Could not load quests right now.');
        return;
      }

      setQuests({ daily: payload.daily, weekly: payload.weekly });
    } catch (error) {
      console.error('Failed to load quests:', error);
      setNotice('Could not load quests right now.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadQuests();
  }, [loadQuests]);

  const claimReward = useCallback(
    async (period: 'daily' | 'weekly') => {
      setClaiming(period);
      setNotice('');

      try {
        const response = await fetch('/api/quests/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ period }),
        });

        const payload = (await response.json()) as {
          error?: string;
          reward?: number;
          xpReward?: number;
        };

        if (!response.ok) {
          setNotice(payload.error ?? 'Quest claim failed.');
          return;
        }

        await syncBalanceFromServer();
        await loadQuests(true);
        toast.success(`${period === 'daily' ? 'Daily' : 'Weekly'} quest claimed: +${payload.reward ?? 0} NVC`);
      } catch (error) {
        console.error('Failed to claim quest reward:', error);
        setNotice('Quest claim failed.');
      } finally {
        setClaiming(null);
      }
    },
    [loadQuests, syncBalanceFromServer]
  );

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Quests</h2>
          <p className="text-sm text-slate-400 mt-1">Dedicated daily and weekly progression. Slots rounds count automatically.</p>
        </div>
        <button
          onClick={() => void loadQuests(true)}
          disabled={loading || refreshing}
          className="h-10 px-4 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed text-xs font-semibold uppercase tracking-wide text-slate-200"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {loading ? <p className="mt-4 text-sm text-slate-500">Loading quests...</p> : null}
      {notice ? <p className="mt-4 text-sm text-amber-300">{notice}</p> : null}

      <div className="mt-5 flex gap-2">
        {PERIODS.map((period) => (
          <button
            key={period.key}
            type="button"
            onClick={() => setActivePeriod(period.key)}
            className={`h-10 rounded-lg border px-4 text-xs font-bold uppercase tracking-wide transition ${
              activePeriod === period.key
                ? 'border-cyan-500/60 bg-cyan-500/20 text-cyan-200'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {period.key}
          </button>
        ))}
      </div>

      {(() => {
        const period = PERIODS.find((entry) => entry.key === activePeriod) ?? PERIODS[0];
        const quest = quests?.[period.key];
        const canClaim = Boolean(quest?.complete && !quest?.claimed);
        const objectiveProgress = quest?.objectives.length
          ? Math.round((quest.objectives.filter((objective) => objective.complete).length / quest.objectives.length) * 100)
          : 0;

        return (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-400">{period.key}</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-100">{period.title}</h3>
                <p className="mt-1 text-sm text-slate-400">{period.description}</p>
              </div>
              <button
                onClick={() => void claimReward(period.key)}
                disabled={!canClaim || claiming === period.key}
                className="h-9 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-xs font-semibold"
              >
                {quest?.claimed ? 'Claimed' : claiming === period.key ? 'Claiming...' : 'Claim'}
              </button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-200">
                Reward Badge: {formatMoney(quest?.reward ?? 0)} NVC
              </div>
              <div className="rounded-lg border border-fuchsia-500/35 bg-fuchsia-500/10 px-3 py-2 text-xs font-semibold text-fuchsia-200">XP Badge: +{quest?.xpReward ?? 0}</div>
            </div>

            <div className="mt-3 space-y-2">
              {(quest?.objectives ?? []).map((objective) => {
                const ratio = objective.target > 0 ? Math.min(100, Math.round((objective.progress / objective.target) * 100)) : 0;
                return (
                  <div key={objective.id} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-300">{objective.label}</span>
                      <span className={objective.complete ? 'text-emerald-300' : 'text-slate-400'}>
                        {objective.progress}/{objective.target}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className={`h-full ${objective.complete ? 'bg-emerald-500' : 'bg-cyan-500'}`} style={{ width: `${ratio}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden">
              <div className={`h-full ${quest?.complete ? 'bg-emerald-500' : 'bg-cyan-500'}`} style={{ width: `${objectiveProgress}%` }} />
            </div>
            <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-500">
              {quest?.claimed
                ? 'Reward claimed'
                : quest?.complete
                  ? 'Ready to claim'
                  : `${quest?.objectives.filter((objective) => !objective.complete).length ?? 0} objectives remaining`}
            </p>
          </div>
        );
      })()}
    </div>
  );
}
