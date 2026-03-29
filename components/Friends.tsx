'use client';

import { Activity, ChevronDown, ChevronRight, Send, ArrowDownLeft, ArrowUpRight, MessageCircle, Plus, Check, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

import FriendsList from '@/components/FriendsList';
import { formatUserBalance } from '@/lib/formatMoney';
import { getRoleBadge } from '@/lib/roleBadge';

type FriendSummary = {
  friendshipId: string;
  userId: string;
  username: string;
  role?: string;
};

type BlockSummary = {
  blockId: string;
  userId: string;
  username: string;
  role?: string;
};

type PublicProfileData = {
  userId: string;
  username: string;
  role?: string;
  level: number;
  rank: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  balance: number | null;
  xp: number;
  favoriteGame: string;
  bio: string;
  theme: string;
  publicProfile: boolean;
  privacyShowBalance?: boolean;
  publicGameHistory?: boolean;
  isFriend: boolean;
  isSelf?: boolean;
  canShowBalance: boolean;
  createdAt: string;
  joinDate?: string;
  friendsCount: number;
};

type FriendPresence = {
  online: boolean;
  activity: string;
};

type OnlinePlayerSummary = {
  userId?: string | null;
  username: string;
  role?: string | null;
  online?: boolean;
  activity?: string;
};

type Transaction = {
  id: string;
  direction: 'in' | 'out';
  amount: string;
  senderUsername: string;
  senderRole?: string;
  receiverUsername: string;
  receiverRole?: string;
  message: string;
  timestamp: string;
  createdAt: string;
};

export default function Friends({
  friendRealtimeNotice,
  friendSearch,
  friendNotice,
  friendsAccepted,
  pendingIncoming,
  pendingOutgoing,
  blockedUsers,
  friendsLoading,
  uniqueOnlineUsers,
  uniqueOnlinePlayers,
  showOnlinePresence,
  presenceByUsername,
  selectedProfile,
  profileLoading,
  incomingOpen,
  outgoingOpen,
  blockedOpen,
  setFriendSearch,
  setIncomingOpen,
  setOutgoingOpen,
  setBlockedOpen,
  onSendFriendRequest,
  onRespondFriendRequest,
  onRemoveFriendship,
  onBlockUser,
  onUnblockUser,
  onSendMoneyToFriend,
  onOpenProfile,
  onJoinFriendGame,
  onQuickAddOnlinePlayer,
}: {
  friendRealtimeNotice: string;
  friendSearch: string;
  friendNotice: string;
  friendsAccepted: FriendSummary[];
  pendingIncoming: FriendSummary[];
  pendingOutgoing: FriendSummary[];
  blockedUsers: BlockSummary[];
  friendsLoading: boolean;
  uniqueOnlineUsers: string[];
  uniqueOnlinePlayers: OnlinePlayerSummary[];
  showOnlinePresence: boolean;
  presenceByUsername: Record<string, FriendPresence>;
  selectedProfile: PublicProfileData | null;
  profileLoading: boolean;
  incomingOpen: boolean;
  outgoingOpen: boolean;
  blockedOpen: boolean;
  setFriendSearch: (value: string) => void;
  setIncomingOpen: (next: boolean | ((current: boolean) => boolean)) => void;
  setOutgoingOpen: (next: boolean | ((current: boolean) => boolean)) => void;
  setBlockedOpen: (next: boolean | ((current: boolean) => boolean)) => void;
  onSendFriendRequest: () => void;
  onRespondFriendRequest: (friendshipId: string, action: 'accept' | 'decline') => void;
  onRemoveFriendship: (friendshipId: string) => void;
  onBlockUser: (targetUserId: string) => void;
  onUnblockUser: (blockId: string) => void;
  onSendMoneyToFriend: (targetUserId: string, targetUsername: string, targetRole?: string) => void;
  onOpenProfile: (targetUserId: string | null, targetUsername: string) => void;
  onJoinFriendGame: (activity: string) => void;
  onQuickAddOnlinePlayer: (targetUserId: string, targetUsername: string) => Promise<{ ok: boolean }>;
}) {
  const [transactionsOpen, setTransactionsOpen] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [addingOnlineUsers, setAddingOnlineUsers] = useState<Record<string, boolean>>({});
  const [localPendingByUsername, setLocalPendingByUsername] = useState<Record<string, boolean>>({});

  const acceptedByUsername = new Set(friendsAccepted.map((entry) => entry.username.trim().toLowerCase()));
  const pendingByUsername = new Set(pendingOutgoing.map((entry) => entry.username.trim().toLowerCase()));

  const loadTransactions = async () => {
    setTransactionsLoading(true);
    try {
      const response = await fetch('/api/friends/transactions?limit=20');
      const payload = (await response.json()) as { ok?: boolean; transactions?: Transaction[]; error?: string };
      if (payload.ok && Array.isArray(payload.transactions)) {
        setTransactions(payload.transactions);
      }
    } catch (error) {
      console.error('Failed to load transactions:', error);
    } finally {
      setTransactionsLoading(false);
    }
  };

  const handleTransactionsOpen = async () => {
    const shouldOpen = !transactionsOpen;
    setTransactionsOpen(shouldOpen);
    if (shouldOpen && transactions.length === 0) {
      await loadTransactions();
    }
  };

  return (
    <div className="flex-1 min-h-0 min-w-0 p-6 overflow-y-auto">
      <h2 className="text-2xl font-bold text-slate-100">Friends & Presence</h2>
      <p className="text-sm text-slate-400 mt-1">Send requests, accept invites, and track online status in real time.</p>
      {friendRealtimeNotice ? <p className="mt-2 text-sm font-semibold text-cyan-300">{friendRealtimeNotice}</p> : null}

      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
        <label className="block text-xs uppercase tracking-wide text-slate-500 mb-2">Find Player</label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Username..."
            value={friendSearch}
            onChange={(event) => setFriendSearch(event.target.value)}
            className="h-11 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
          />
          <button onClick={onSendFriendRequest} className="h-11 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold">
            Add
          </button>
        </div>
        {friendNotice ? <p className="mt-2 text-xs text-slate-400">{friendNotice}</p> : null}
      </div>

      <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <FriendsList
          friends={friendsAccepted}
          friendsLoading={friendsLoading}
          showOnlinePresence={showOnlinePresence}
          presenceByUsername={presenceByUsername}
          onSendMoney={onSendMoneyToFriend}
          onOpenProfile={onOpenProfile}
          onRemoveFriend={onRemoveFriendship}
          onBlockUser={onBlockUser}
          onJoinActivity={onJoinFriendGame}
        />

        <div className="space-y-4">
          <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <button type="button" onClick={() => setIncomingOpen((current) => !current)} className="w-full flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Incoming Requests</span>
              <span className="inline-flex items-center gap-2">
                <span className="h-5 min-w-5 px-1 rounded-full bg-slate-800 border border-slate-700 text-[11px] text-slate-300 inline-flex items-center justify-center">
                  {pendingIncoming.length}
                </span>
                {incomingOpen ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
              </span>
            </button>
            {incomingOpen ? (
              pendingIncoming.length === 0 ? (
                <p className="mt-3 text-slate-500 italic text-sm p-3 text-center border border-dashed border-slate-800 rounded-lg">No incoming requests.</p>
              ) : (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 divide-y divide-slate-800">
                  {pendingIncoming.map((request) => (
                    <div key={request.friendshipId} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-slate-200 truncate">{request.username}</span>
                        {getRoleBadge(request.role) ? <span className={getRoleBadge(request.role)!.className}>{getRoleBadge(request.role)!.label}</span> : null}
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          onClick={() => onRespondFriendRequest(request.friendshipId, 'accept')}
                          className="h-8 px-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => onRespondFriendRequest(request.friendshipId, 'decline')}
                          className="h-8 px-2.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <button type="button" onClick={() => setOutgoingOpen((current) => !current)} className="w-full flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Outgoing Requests</span>
              <span className="inline-flex items-center gap-2">
                <span className="h-5 min-w-5 px-1 rounded-full bg-slate-800 border border-slate-700 text-[11px] text-slate-300 inline-flex items-center justify-center">
                  {pendingOutgoing.length}
                </span>
                {outgoingOpen ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
              </span>
            </button>
            {outgoingOpen ? (
              pendingOutgoing.length === 0 ? (
                <p className="mt-3 text-slate-500 italic text-sm p-3 text-center border border-dashed border-slate-800 rounded-lg">No pending requests.</p>
              ) : (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 divide-y divide-slate-800">
                  {pendingOutgoing.map((request) => (
                    <div key={request.friendshipId} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-slate-200 truncate">{request.username}</span>
                        {getRoleBadge(request.role) ? <span className={getRoleBadge(request.role)!.className}>{getRoleBadge(request.role)!.label}</span> : null}
                      </div>
                      <span className="text-xs uppercase tracking-wide text-amber-400">Pending</span>
                      <button
                        onClick={() => onRemoveFriendship(request.friendshipId)}
                        className="ml-auto h-8 px-2.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <button type="button" onClick={() => setBlockedOpen((current) => !current)} className="w-full flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Blocked Users</span>
              <span className="inline-flex items-center gap-2">
                <span className="h-5 min-w-5 px-1 rounded-full bg-slate-800 border border-slate-700 text-[11px] text-slate-300 inline-flex items-center justify-center">
                  {blockedUsers.length}
                </span>
                {blockedOpen ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
              </span>
            </button>
            {blockedOpen ? (
              blockedUsers.length === 0 ? (
                <p className="mt-3 text-slate-500 italic text-sm p-3 text-center border border-dashed border-slate-800 rounded-lg">No blocked users.</p>
              ) : (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 divide-y divide-slate-800">
                  {blockedUsers.map((blocked) => (
                    <div key={blocked.blockId} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-slate-200 truncate">{blocked.username}</span>
                        {getRoleBadge(blocked.role) ? <span className={getRoleBadge(blocked.role)!.className}>{getRoleBadge(blocked.role)!.label}</span> : null}
                      </div>
                      <button
                        onClick={() => onUnblockUser(blocked.blockId)}
                        className="ml-auto h-8 px-2.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                      >
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <button type="button" onClick={handleTransactionsOpen} className="w-full flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Transaction History</span>
              <span className="inline-flex items-center gap-2">
                <span className="h-5 min-w-5 px-1 rounded-full bg-slate-800 border border-slate-700 text-[11px] text-slate-300 inline-flex items-center justify-center">
                  {transactions.length}
                </span>
                {transactionsOpen ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
              </span>
            </button>
            {transactionsOpen ? (
              transactionsLoading ? (
                <div className="mt-3 text-center text-slate-400 text-sm">Loading transactions...</div>
              ) : transactions.length === 0 ? (
                <p className="mt-3 text-slate-500 italic text-sm p-3 text-center border border-dashed border-slate-800 rounded-lg">No transactions yet.</p>
              ) : (
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 divide-y divide-slate-800">
                  {transactions.map((tx) => {
                    const isOutgoing = tx.direction === 'out';
                    const amount = parseFloat(tx.amount);
                    const formattedAmount = amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
                    const displayName = isOutgoing ? tx.receiverUsername : tx.senderUsername;
                    const displayRole = isOutgoing ? tx.receiverRole : tx.senderRole;
                    const displayRoleBadge = getRoleBadge(displayRole);
                    const displayDate = new Date(tx.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });

                    return (
                      <button
                        key={tx.id}
                        onClick={() => setSelectedTransaction(tx)}
                        className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-slate-800/50 transition-colors"
                      >
                        <div className={`p-2 rounded-lg ${isOutgoing ? 'bg-red-950/40' : 'bg-emerald-950/40'}`}>
                          {isOutgoing ? (
                            <ArrowUpRight size={16} className="text-red-400" />
                          ) : (
                            <ArrowDownLeft size={16} className="text-emerald-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="text-sm font-medium text-slate-200 truncate">{displayName}</p>
                            {displayRoleBadge ? <span className={displayRoleBadge.className}>{displayRoleBadge.label}</span> : null}
                          </div>
                          <p className="text-xs text-slate-500">{displayDate}</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-semibold ${isOutgoing ? 'text-red-400' : 'text-emerald-400'}`}>
                            {isOutgoing ? '-' : '+'}
                            {formattedAmount}
                          </p>
                          {tx.message && <MessageCircle size={14} className="text-cyan-400 mx-auto mt-1" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )
            ) : null}
          </section>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">All Online Players</p>
        {uniqueOnlinePlayers.length === 0 ? (
          <p className="text-slate-500 italic text-sm p-4 text-center border border-dashed border-slate-800 rounded-lg">No players online right now.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {uniqueOnlinePlayers.map((user) => {
              const normalized = user.username.trim().toLowerCase();
              const isFriend = acceptedByUsername.has(normalized);
              const isPending = pendingByUsername.has(normalized) || Boolean(localPendingByUsername[normalized]);
              const isAdding = Boolean(addingOnlineUsers[normalized]);
              const roleBadge = getRoleBadge(user.role);

              return (
                <div
                  key={user.username}
                  className="flex items-center justify-between p-4 bg-slate-900 rounded-lg border border-slate-800 text-left hover:border-cyan-500/40 hover:bg-slate-800/80 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => onOpenProfile(user.userId ?? null, user.username)}
                    className="min-w-0 pr-3 text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-slate-200 truncate">{user.username}</span>
                      {roleBadge ? <span className={roleBadge.className}>{roleBadge.label}</span> : null}
                    </div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500 mt-1">{user.activity || 'Hub'}</p>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />

                    {isFriend ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                        <Check size={12} /> Friends
                      </span>
                    ) : isPending ? (
                      <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
                        Pending
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={!user.userId || isAdding}
                        onClick={async () => {
                          if (!user.userId) {
                            return;
                          }

                          setAddingOnlineUsers((current) => ({ ...current, [normalized]: true }));
                          const result = await onQuickAddOnlinePlayer(user.userId, user.username);
                          setAddingOnlineUsers((current) => ({ ...current, [normalized]: false }));

                          if (result.ok) {
                            setLocalPendingByUsername((current) => ({ ...current, [normalized]: true }));
                          }
                        }}
                        className="h-8 px-2.5 rounded-md border border-cyan-500/50 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 text-xs font-semibold inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isAdding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                        Add Friend
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedTransaction ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl border border-cyan-700/40 bg-gradient-to-br from-slate-950/90 to-slate-900/90 p-6 shadow-2xl shadow-cyan-500/20">
            <button
              onClick={() => setSelectedTransaction(null)}
              className="absolute right-4 top-4 p-2 text-slate-400 hover:text-cyan-300 transition-colors"
              aria-label="Close modal"
            >
              ✕
            </button>

            <div className="mb-6">
              <h2 className="text-2xl font-bold text-cyan-300">Transaction Details</h2>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-2">Amount</p>
                <p className={`text-3xl font-bold ${selectedTransaction.direction === 'out' ? 'text-red-400' : 'text-emerald-400'}`}>
                  {selectedTransaction.direction === 'out' ? '-' : '+'}
                  {parseFloat(selectedTransaction.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })} NVC
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">From</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-200">{selectedTransaction.senderUsername}</p>
                    {getRoleBadge(selectedTransaction.senderRole) ? (
                      <span className={getRoleBadge(selectedTransaction.senderRole)!.className}>{getRoleBadge(selectedTransaction.senderRole)!.label}</span>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">To</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-200">{selectedTransaction.receiverUsername}</p>
                    {getRoleBadge(selectedTransaction.receiverRole) ? (
                      <span className={getRoleBadge(selectedTransaction.receiverRole)!.className}>{getRoleBadge(selectedTransaction.receiverRole)!.label}</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Date</p>
                <p className="text-sm text-slate-300">
                  {new Date(selectedTransaction.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>

              {selectedTransaction.message && (
                <div className="rounded-lg border border-cyan-600/40 bg-slate-900/50 p-3">
                  <p className="text-xs uppercase tracking-wide text-cyan-400 mb-1">Message</p>
                  <p className="text-sm text-slate-200">{selectedTransaction.message}</p>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedTransaction(null)}
              className="mt-6 w-full h-10 rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-gray-900 font-bold shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50 transition-all"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}