'use client';

import { Ban, Eye, Trash2 } from 'lucide-react';

type FriendSummary = {
  friendshipId: string;
  userId: string;
  username: string;
};

type FriendPresence = {
  online: boolean;
  activity: string;
};

function formatActivity(activity: string) {
  const normalized = String(activity ?? '').trim();
  if (!normalized) {
    return 'Offline';
  }

  if (normalized.toLowerCase() === 'hub') {
    return 'Hub';
  }

  return normalized;
}

function joinableActivity(activity: string) {
  const normalized = String(activity ?? '').trim().toLowerCase();
  if (normalized.includes('poker')) {
    return 'Poker';
  }
  if (normalized.includes('blackjack')) {
    return 'Blackjack';
  }
  if (normalized.includes('roulette')) {
    return 'Roulette';
  }
  if (normalized.includes('crash')) {
    return 'Crash';
  }
  if (normalized.includes('coinflip')) {
    return 'Coinflip';
  }
  return null;
}

export default function FriendsList({
  friends,
  friendsLoading,
  showOnlinePresence,
  presenceByUsername,
  onSendMoney,
  onOpenProfile,
  onRemoveFriend,
  onBlockUser,
  onJoinActivity,
}: {
  friends: FriendSummary[];
  friendsLoading: boolean;
  showOnlinePresence: boolean;
  presenceByUsername: Record<string, FriendPresence>;
  onSendMoney: (targetUserId: string, targetUsername: string) => void;
  onOpenProfile: (username: string) => void;
  onRemoveFriend: (friendshipId: string) => void;
  onBlockUser: (targetUserId: string) => void;
  onJoinActivity: (activity: string) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Friends</p>
      {friendsLoading ? <p className="text-sm text-slate-500">Loading...</p> : null}
      {!friendsLoading && friends.length === 0 ? (
        <p className="text-slate-500 italic text-sm p-4 text-center border border-dashed border-slate-800 rounded-lg">No accepted friends yet.</p>
      ) : null}
      {friends.length > 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900 divide-y divide-slate-800">
          {friends.map((friend) => {
            const displayName = (friend.username ?? '').trim() || 'Unknown Friend';
            const presence = presenceByUsername[displayName.toLowerCase()] ?? { online: false, activity: 'Offline' };
            const isOnline = showOnlinePresence && presence.online;
            const activityLabel = formatActivity(presence.activity);
            const joinGame = isOnline ? joinableActivity(presence.activity) : null;

            return (
              <div
                key={friend.friendshipId}
                onClick={() => onOpenProfile(displayName)}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-800/40 transition-colors"
              >
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => onOpenProfile(displayName)}
                    className="font-semibold text-slate-200 truncate hover:text-cyan-300 hover:underline"
                  >
                    {displayName}
                  </button>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">
                    {isOnline ? activityLabel : 'Offline'}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  {joinGame ? (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onJoinActivity(presence.activity);
                      }}
                      className="h-8 px-2.5 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold"
                      title={`Join ${joinGame}`}
                    >
                      Join {joinGame}
                    </button>
                  ) : null}
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onSendMoney(friend.userId, displayName);
                    }}
                    className="h-8 px-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                  >
                    Send
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenProfile(displayName);
                    }}
                    className="h-8 px-2.5 rounded-md bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 text-xs inline-flex items-center gap-1"
                  >
                    <Eye size={13} />
                    View
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveFriend(friend.friendshipId);
                    }}
                    className="h-8 w-8 rounded-md text-slate-500 hover:text-red-400 hover:bg-slate-800/80 inline-flex items-center justify-center"
                    title="Remove friend"
                    aria-label={`Remove ${displayName}`}
                  >
                    <Trash2 size={13} />
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onBlockUser(friend.userId);
                    }}
                    className="h-8 w-8 rounded-md text-slate-500 hover:text-red-400 hover:bg-slate-800/80 inline-flex items-center justify-center"
                    title="Block user"
                    aria-label={`Block ${displayName}`}
                  >
                    <Ban size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}