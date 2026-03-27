'use client';

import { Activity, ChevronDown, ChevronRight } from 'lucide-react';

import FriendsList from '@/components/FriendsList';
import { formatUserBalance } from '@/lib/formatMoney';

type FriendSummary = {
  friendshipId: string;
  userId: string;
  username: string;
};

type BlockSummary = {
  blockId: string;
  userId: string;
  username: string;
};

type PublicProfileData = {
  username: string;
  balance: number;
  xp: number;
  favoriteGame: string;
  bio: string;
  theme: string;
  publicProfile: boolean;
  isFriend: boolean;
  createdAt: string;
  friendsCount: number;
};

type FriendPresence = {
  online: boolean;
  activity: string;
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
  onSendMoneyToFriend: (targetUserId: string, targetUsername: string) => void;
  onOpenProfile: (targetUsername: string) => void;
  onJoinFriendGame: (activity: string) => void;
}) {
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
                      <span className="font-medium text-slate-200 truncate">{request.username}</span>
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
                      <span className="font-medium text-slate-200 truncate">{request.username}</span>
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
                      <span className="font-medium text-slate-200 truncate">{blocked.username}</span>
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
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">All Online Players</p>
        {uniqueOnlineUsers.length === 0 ? (
          <p className="text-slate-500 italic text-sm p-4 text-center border border-dashed border-slate-800 rounded-lg">No players online right now.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {uniqueOnlineUsers.map((user) => (
              <button
                key={user}
                type="button"
                onClick={() => onOpenProfile(user)}
                className="flex items-center justify-between p-4 bg-slate-900 rounded-lg border border-slate-800 text-left hover:border-cyan-500/40 hover:bg-slate-800/80 transition-colors"
              >
                <span className="font-medium text-slate-200 truncate">{user}</span>
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 rounded-xl border border-cyan-700/30 bg-gradient-to-br from-slate-950/80 to-slate-900/80 p-4 shadow-[0_0_30px_rgba(6,182,212,0.12)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-cyan-300" />
            <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Friend Profile Preview</p>
          </div>
          {profileLoading ? <span className="text-xs text-slate-400">Loading...</span> : null}
        </div>

        {!selectedProfile && !profileLoading ? (
          <p className="text-slate-500 italic text-sm p-4 text-center border border-dashed border-slate-800 rounded-lg mt-3">
            Select a friend and click View Profile.
          </p>
        ) : null}

        {selectedProfile ? (
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/90 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-slate-100">{selectedProfile.username}</p>
              <span className="text-xs uppercase tracking-wide text-cyan-300">{selectedProfile.theme}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Balance {formatUserBalance(selectedProfile.balance, false)} NVC · XP {selectedProfile.xp} · Friends {selectedProfile.friendsCount}
            </p>
            <p className="mt-1 text-xs text-cyan-300">Favorite: {selectedProfile.favoriteGame}</p>
            <p className="mt-2 text-sm text-slate-300">{selectedProfile.bio || 'No bio yet.'}</p>
            <p className="mt-2 text-[11px] text-slate-500">Joined {new Date(selectedProfile.createdAt).toLocaleDateString()}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}