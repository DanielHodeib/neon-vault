'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

type AdminRole = 'USER' | 'BALLER' | 'VIP' | 'ADMIN';
type RankTag =
  | 'BALLER'
  | 'BRONZE'
  | 'IRON'
  | 'COPPER'
  | 'STEEL'
  | 'SILVER'
  | 'EMERALD'
  | 'GOLD'
  | 'PLATINUM'
  | 'DIAMOND'
  | 'RUBY'
  | 'MASTER'
  | 'ELITE'
  | 'HIGH_ROLLER'
  | 'TYCOON'
  | 'CASINO_LORD'
  | 'MILLIONAIRE'
  | 'MULTI_MILLIONAIRE'
  | 'BILLIONAIRE'
  | 'CASINO_EMPEROR'
  | 'NEON_OVERLORD';

const RANK_TAG_OPTIONS: RankTag[] = [
  'BALLER',
  'BRONZE',
  'IRON',
  'COPPER',
  'STEEL',
  'SILVER',
  'EMERALD',
  'GOLD',
  'PLATINUM',
  'DIAMOND',
  'RUBY',
  'MASTER',
  'ELITE',
  'HIGH_ROLLER',
  'TYCOON',
  'CASINO_LORD',
  'MILLIONAIRE',
  'MULTI_MILLIONAIRE',
  'BILLIONAIRE',
  'CASINO_EMPEROR',
  'NEON_OVERLORD',
];

interface AdminUser {
  id: string;
  username: string;
  role: AdminRole | string;
  balance: string;
  xp: number;
  clanTag: string | null;
  isBanned: boolean;
  selectedRankTag: RankTag | string;
}

export default function AdminPanel() {
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [rainAmount, setRainAmount] = useState('50000');
  const [rainDuration, setRainDuration] = useState('30');
  const [rainParticipants, setRainParticipants] = useState('5');
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, AdminRole>>({});
  const [balanceDrafts, setBalanceDrafts] = useState<Record<string, string>>({});
  const [usernameDrafts, setUsernameDrafts] = useState<Record<string, string>>({});
  const [xpDrafts, setXpDrafts] = useState<Record<string, string>>({});
  const [levelDrafts, setLevelDrafts] = useState<Record<string, string>>({});
  const [clanTagDrafts, setClanTagDrafts] = useState<Record<string, string>>({});
  const [selectedRankTagDrafts, setSelectedRankTagDrafts] = useState<Record<string, RankTag>>({});
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    void (async () => {
      try {
        const response = await fetch('/api/admin/me', { cache: 'no-store' });
        if (!isActive) {
          return;
        }
        if (!response.ok) {
          setHasAdminAccess(false);
          setAccessChecked(true);
          return;
        }

        const payload = (await response.json()) as { isAdmin?: boolean };
        setHasAdminAccess(Boolean(payload.isAdmin));
        setAccessChecked(true);
      } catch {
        if (!isActive) {
          return;
        }
        setHasAdminAccess(false);
        setAccessChecked(true);
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  const loadUsers = useCallback(async () => {
    if (!hasAdminAccess) {
      return;
    }
    setLoading(true);
    setNotice('');

    try {
      const query = new URLSearchParams();
      if (search.trim()) {
        query.set('q', search.trim());
      }

      const response = await fetch(`/api/admin/update?${query.toString()}`, { cache: 'no-store' });
      const payload = (await response.json()) as { error?: string; users?: AdminUser[] };

      if (!response.ok) {
        setNotice(payload.error ?? 'Failed to load users.');
        setLoading(false);
        return;
      }

      const nextUsers = payload.users ?? [];
      setUsers(nextUsers);

      setRoleDrafts((prev) => {
        const merged = { ...prev };
        for (const user of nextUsers) {
          const role = ['USER', 'BALLER', 'VIP', 'ADMIN'].includes(user.role) ? (user.role as AdminRole) : 'USER';
          if (!merged[user.id]) {
            merged[user.id] = role;
          }
        }
        return merged;
      });

      setBalanceDrafts((prev) => {
        const merged = { ...prev };
        for (const user of nextUsers) {
          if (!(user.id in merged)) {
            merged[user.id] = user.balance;
          }
        }
        return merged;
      });

      setUsernameDrafts((prev) => {
        const merged = { ...prev };
        for (const user of nextUsers) {
          if (!(user.id in merged)) {
            merged[user.id] = user.username;
          }
        }
        return merged;
      });

      setXpDrafts((prev) => {
        const merged = { ...prev };
        for (const user of nextUsers) {
          if (!(user.id in merged)) {
            merged[user.id] = String(user.xp);
          }
        }
        return merged;
      });

      setLevelDrafts((prev) => {
        const merged = { ...prev };
        for (const user of nextUsers) {
          if (!(user.id in merged)) {
            merged[user.id] = String(Math.floor(user.xp / 1000) + 1);
          }
        }
        return merged;
      });

      setClanTagDrafts((prev) => {
        const merged = { ...prev };
        for (const user of nextUsers) {
          if (!(user.id in merged)) {
            merged[user.id] = user.clanTag ?? '';
          }
        }
        return merged;
      });

      setSelectedRankTagDrafts((prev) => {
        const merged = { ...prev };
        for (const user of nextUsers) {
          const rankTag = RANK_TAG_OPTIONS.includes(user.selectedRankTag as RankTag)
            ? (user.selectedRankTag as RankTag)
            : 'BRONZE';
          if (!merged[user.id]) {
            merged[user.id] = rankTag;
          }
        }
        return merged;
      });
    } catch {
      setNotice('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [hasAdminAccess, search]);

  useEffect(() => {
    if (hasAdminAccess) {
      void loadUsers();
    }
  }, [hasAdminAccess, loadUsers]);

  const visibleUsers = useMemo(() => users, [users]);

  if (!accessChecked || !hasAdminAccess) {
    return null;
  }

  async function runAction(payload: object) {
    const response = await fetch('/api/admin/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as { error?: string; ok?: boolean };
    if (!response.ok) {
      throw new Error(result.error ?? 'Action failed.');
    }
  }

  const handleToggleBan = async (userId: string, isBanned: boolean) => {
    setBusyUserId(userId);
    setNotice('');

    try {
      await runAction({ action: 'toggle-ban', userId, isBanned: !isBanned });
      setNotice(isBanned ? 'User unbanned.' : 'User banned.');
      await loadUsers();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ban action failed.');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleSaveProfile = async (userId: string, currentIsBanned: boolean) => {
    setBusyUserId(userId);
    setNotice('');

    try {
      await runAction({
        action: 'update-user',
        userId,
        username: (usernameDrafts[userId] ?? '').trim(),
        role: roleDrafts[userId] ?? 'USER',
        balance: Number(balanceDrafts[userId] ?? 0),
        xp: Number(xpDrafts[userId] ?? 0),
        level: Number(levelDrafts[userId] ?? 1),
        clanTag: (clanTagDrafts[userId] ?? '').trim(),
        selectedRankTag: selectedRankTagDrafts[userId] ?? 'BRONZE',
        isBanned: currentIsBanned,
      });
      setNotice('User profile updated.');
      await loadUsers();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Profile update failed.');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleAnnouncement = async () => {
    const message = announcement.trim();
    if (!message) {
      setNotice('Announcement message is required.');
      return;
    }

    setNotice('');
    try {
      const response = await fetch('/api/admin/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      const payload = (await response.json()) as { error?: string; ok?: boolean };
      if (!response.ok) {
        setNotice(payload.error ?? 'Broadcast failed.');
        return;
      }

      setAnnouncement('');
      setNotice('Global announcement sent.');
    } catch {
      setNotice('Broadcast failed.');
    }
  };

  const handleStartRain = async () => {
    const amount = Math.floor(Number(rainAmount));
    const duration = Math.floor(Number(rainDuration));
    const participantsCount = Math.floor(Number(rainParticipants));

    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice('Rain amount must be greater than 0.');
      return;
    }

    if (!Number.isFinite(duration) || duration < 5 || duration > 600) {
      setNotice('Rain duration must be between 5 and 600 seconds.');
      return;
    }

    if (!Number.isFinite(participantsCount) || participantsCount < 1 || participantsCount > 200) {
      setNotice('Rain participants must be between 1 and 200.');
      return;
    }

    setNotice('');
    try {
      const response = await fetch('/api/admin/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rain: {
            amount,
            duration,
            participantsCount,
          },
        }),
      });

      const payload = (await response.json()) as { error?: string; ok?: boolean };
      if (!response.ok) {
        setNotice(payload.error ?? 'Failed to start rain.');
        return;
      }

      setNotice(`Rain started: ${amount} NVC / ${duration}s / ${participantsCount} users.`);
    } catch {
      setNotice('Failed to start rain.');
    }
  };

  const handleSetPassword = async (userId: string) => {
    const password = (passwordDrafts[userId] ?? '').trim();
    if (password.length < 8) {
      setNotice('Password must be at least 8 characters.');
      return;
    }

    setBusyUserId(userId);
    setNotice('');
    try {
      await runAction({ action: 'set-password', userId, newPassword: password });
      setPasswordDrafts((prev) => ({ ...prev, [userId]: '' }));
      setNotice('Password updated.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Password update failed.');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleQuickAction = async (userId: string, quickAction: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) {
      return;
    }

    setBusyUserId(userId);
    setNotice('');
    try {
      await runAction({ action: 'quick-action', userId, quickAction });
      setNotice('Quick action completed.');
      await loadUsers();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Quick action failed.');
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <h2 className="text-2xl font-bold text-slate-100">Admin Console</h2>
      <p className="text-sm text-slate-400 mt-1">Dev tools for Daniel ADMIN only.</p>

      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Global Announcement</p>
        <div className="flex gap-2">
          <input
            value={announcement}
            onChange={(event) => setAnnouncement(event.target.value.slice(0, 240))}
            placeholder="Message for all online users"
            className="h-10 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
          />
          <button
            onClick={handleAnnouncement}
            className="h-10 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
          >
            Broadcast
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Rain Control</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <input
            type="number"
            min={1}
            value={rainAmount}
            onChange={(event) => setRainAmount(event.target.value)}
            placeholder="Amount (NVC)"
            className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
          />
          <input
            type="number"
            min={5}
            max={600}
            value={rainDuration}
            onChange={(event) => setRainDuration(event.target.value)}
            placeholder="Duration (seconds)"
            className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
          />
          <input
            type="number"
            min={1}
            max={200}
            value={rainParticipants}
            onChange={(event) => setRainParticipants(event.target.value)}
            placeholder="Participants"
            className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
          />
          <button
            onClick={handleStartRain}
            className="h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold"
          >
            Start Rain
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search user by username"
            className="h-10 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
          />
          <button
            onClick={() => void loadUsers()}
            className="h-10 px-4 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold"
          >
            Refresh
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 divide-y divide-slate-800">
          {loading ? <p className="px-3 py-4 text-sm text-slate-500">Loading users...</p> : null}
          {!loading && visibleUsers.length === 0 ? <p className="px-3 py-4 text-sm text-slate-500">No users found.</p> : null}
          {!loading
            ? visibleUsers.map((user) => {
                const isBusy = busyUserId === user.id;
                const isExpanded = expandedUserId === user.id;
                const roleLabel = roleDrafts[user.id] ?? (['USER', 'BALLER', 'VIP', 'ADMIN'].includes(user.role) ? (user.role as AdminRole) : 'USER');
                return (
                  <div key={user.id} className="px-3 py-3 grid gap-3">
                    <button
                      type="button"
                      onClick={() => setExpandedUserId((current) => (current === user.id ? null : user.id))}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-left hover:border-slate-700"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-200 truncate">{user.username}</p>
                        <p className="text-xs text-slate-500">Role: {roleLabel}</p>
                      </div>
                      <div className="shrink-0 text-slate-500">
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </div>
                    </button>

                    {isExpanded ? (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-slate-500">
                            XP {user.xp} · Level {Math.floor(user.xp / 1000) + 1} · Balance {user.balance} · {user.isBanned ? 'BANNED' : 'ACTIVE'}
                          </p>
                          <button
                            onClick={() => void handleToggleBan(user.id, user.isBanned)}
                            disabled={isBusy}
                            className={`h-9 px-3 rounded-lg text-xs font-semibold ${
                              user.isBanned
                                ? 'bg-amber-600 hover:bg-amber-500 text-white'
                                : 'bg-red-600 hover:bg-red-500 text-white'
                            } disabled:opacity-60`}
                          >
                            {user.isBanned ? 'Unban' : 'Ban'}
                          </button>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          <input
                            value={usernameDrafts[user.id] ?? ''}
                            onChange={(event) =>
                              setUsernameDrafts((prev) => ({
                                ...prev,
                                [user.id]: event.target.value,
                              }))
                            }
                            className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-100"
                            placeholder="Username"
                          />

                          <select
                            value={roleDrafts[user.id] ?? 'USER'}
                            onChange={(event) =>
                              setRoleDrafts((prev) => ({
                                ...prev,
                                [user.id]: event.target.value as AdminRole,
                              }))
                            }
                            className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-100"
                          >
                            <option value="USER">USER</option>
                            <option value="BALLER">BALLER</option>
                            <option value="VIP">VIP</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>

                          <input
                            type="number"
                            value={balanceDrafts[user.id] ?? ''}
                            onChange={(event) =>
                              setBalanceDrafts((prev) => ({
                                ...prev,
                                [user.id]: event.target.value,
                              }))
                            }
                            className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-100"
                            placeholder="Balance"
                          />

                          <input
                            type="number"
                            value={xpDrafts[user.id] ?? ''}
                            onChange={(event) =>
                              setXpDrafts((prev) => ({
                                ...prev,
                                [user.id]: event.target.value,
                              }))
                            }
                            className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-100"
                            placeholder="XP"
                          />

                          <input
                            type="number"
                            min={1}
                            value={levelDrafts[user.id] ?? ''}
                            onChange={(event) =>
                              setLevelDrafts((prev) => ({
                                ...prev,
                                [user.id]: event.target.value,
                              }))
                            }
                            className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-100"
                            placeholder="Level"
                          />

                          <input
                            value={clanTagDrafts[user.id] ?? ''}
                            onChange={(event) =>
                              setClanTagDrafts((prev) => ({
                                ...prev,
                                [user.id]: event.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase(),
                              }))
                            }
                            className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-100"
                            placeholder="ClanTag"
                          />

                          <select
                            value={selectedRankTagDrafts[user.id] ?? 'BRONZE'}
                            onChange={(event) =>
                              setSelectedRankTagDrafts((prev) => ({
                                ...prev,
                                [user.id]: event.target.value as RankTag,
                              }))
                            }
                            className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-100"
                          >
                            {RANK_TAG_OPTIONS.map((tag) => (
                              <option key={tag} value={tag}>
                                {tag}
                              </option>
                            ))}
                          </select>

                          <button
                            onClick={() => void handleSaveProfile(user.id, user.isBanned)}
                            disabled={isBusy}
                            className="h-9 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-semibold"
                          >
                            Save Profile
                          </button>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                          <button
                            onClick={() => void handleQuickAction(user.id, 'add-balance-1000')}
                            disabled={isBusy}
                            className="h-9 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white text-xs font-semibold"
                          >
                            +1K Balance
                          </button>
                          <button
                            onClick={() => void handleQuickAction(user.id, 'add-balance-10000')}
                            disabled={isBusy}
                            className="h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-semibold"
                          >
                            +10K Balance
                          </button>
                          <button
                            onClick={() => void handleQuickAction(user.id, 'add-xp-1000')}
                            disabled={isBusy}
                            className="h-9 rounded-lg bg-indigo-700 hover:bg-indigo-600 disabled:opacity-60 text-white text-xs font-semibold"
                          >
                            +1K XP
                          </button>
                          <button
                            onClick={() => void handleQuickAction(user.id, 'add-xp-10000')}
                            disabled={isBusy}
                            className="h-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-semibold"
                          >
                            +10K XP
                          </button>
                          <button
                            onClick={() => void handleQuickAction(user.id, 'reset-daily')}
                            disabled={isBusy}
                            className="h-9 rounded-lg bg-amber-700 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-semibold"
                          >
                            Reset Daily
                          </button>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          <button
                            onClick={() => void handleQuickAction(user.id, 'reset-quests')}
                            disabled={isBusy}
                            className="h-9 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-60 text-white text-xs font-semibold"
                          >
                            Reset Quests
                          </button>
                          <button
                            onClick={() => void handleQuickAction(user.id, 'reset-social')}
                            disabled={isBusy}
                            className="h-9 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-60 text-white text-xs font-semibold"
                          >
                            Reset Social
                          </button>
                          <button
                            onClick={() =>
                              void handleQuickAction(
                                user.id,
                                'delete-user',
                                `Delete user ${user.username} permanently?`
                              )
                            }
                            disabled={isBusy}
                            className="h-9 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-60 text-white text-xs font-semibold"
                          >
                            Delete User
                          </button>
                          <div className="flex items-center gap-2">
                            <input
                              type="password"
                              value={passwordDrafts[user.id] ?? ''}
                              onChange={(event) =>
                                setPasswordDrafts((prev) => ({
                                  ...prev,
                                  [user.id]: event.target.value,
                                }))
                              }
                              className="h-9 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-100"
                              placeholder="New password (min 8)"
                            />
                            <button
                              onClick={() => void handleSetPassword(user.id)}
                              disabled={isBusy}
                              className="h-9 px-3 rounded-lg bg-fuchsia-700 hover:bg-fuchsia-600 disabled:opacity-60 text-white text-xs font-semibold"
                            >
                              Set PW
                            </button>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })
            : null}
        </div>
      </div>

      {notice ? <p className="mt-4 text-sm text-slate-400">{notice}</p> : null}
    </div>
  );
}
