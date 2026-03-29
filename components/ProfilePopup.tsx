'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { UserPlus, Send, X } from 'lucide-react';
import Image from 'next/image';

import { formatUserBalance } from '@/lib/formatMoney';
import { getRoleBadge } from '@/lib/roleBadge';

type ProfilePopupData = {
  userId: string;
  username: string;
  role?: string;
  level: number;
  rank: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bio?: string;
  favoriteGame?: string;
  joinDate?: string;
  balance: number | null;
  canShowBalance: boolean;
  isFriend?: boolean;
  isSelf?: boolean;
  xp?: number;
};

type Props = {
  open: boolean;
  loading: boolean;
  profile: ProfilePopupData | null;
  onClose: () => void;
  onAddFriend?: (profile: ProfilePopupData) => void;
  onSendMoney?: (profile: ProfilePopupData) => void;
};

const modalEase: [number, number, number, number] = [0.2, 0.6, 0.35, 1];

function favoriteGameTone(gameRaw: string) {
  const game = gameRaw.trim().toLowerCase();
  if (game.includes('blackjack')) {
    return 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.25)]';
  }
  if (game.includes('poker')) {
    return 'border-cyan-400/50 bg-cyan-500/15 text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.25)]';
  }
  if (game.includes('roulette')) {
    return 'border-rose-400/50 bg-rose-500/15 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.25)]';
  }
  if (game.includes('crash')) {
    return 'border-amber-400/50 bg-amber-500/15 text-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.25)]';
  }
  if (game.includes('coinflip')) {
    return 'border-violet-400/50 bg-violet-500/15 text-violet-300 shadow-[0_0_20px_rgba(167,139,250,0.25)]';
  }
  return 'border-slate-600 bg-slate-800/60 text-slate-200';
}

function computeLevelProgress(level: number, xp: number) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const safeXp = Math.max(0, Math.floor(Number(xp) || 0));
  const levelBase = (safeLevel - 1) * 1000;
  const currentProgress = Math.max(0, safeXp - levelBase);
  return Math.min(100, Math.round((currentProgress / 1000) * 100));
}

export default function ProfilePopup({ open, loading, profile, onClose, onAddFriend, onSendMoney }: Props) {
  const roleBadge = getRoleBadge(profile?.role);
  const favorite = (profile?.favoriteGame ?? 'Unknown').trim() || 'Unknown';
  const progress = computeLevelProgress(profile?.level ?? 1, profile?.xp ?? 0);
  const joinedLabel = profile?.joinDate ? new Date(profile.joinDate).toLocaleDateString() : 'Unknown';

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="profile-overlay"
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-lg p-4 sm:p-6 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="relative w-full max-w-3xl rounded-3xl border border-slate-700/80 bg-slate-950/95 shadow-[0_0_60px_rgba(34,211,238,0.14)] overflow-hidden"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ duration: 0.3, ease: modalEase }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 z-20 h-9 w-9 rounded-full border border-slate-600 bg-black/55 text-slate-200 hover:text-cyan-300 hover:border-cyan-400/50 transition"
              aria-label="Close Profile"
            >
              <X size={16} className="mx-auto" />
            </button>

            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.3, ease: modalEase }}
              className="relative h-40 w-full overflow-hidden"
            >
              {profile?.bannerUrl ? (
                <Image
                  src={profile.bannerUrl}
                  alt={`${profile.username} banner`}
                  fill
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.2),transparent_45%),radial-gradient(circle_at_80%_10%,rgba(16,185,129,0.18),transparent_40%),linear-gradient(135deg,rgba(15,23,42,1),rgba(2,6,23,1))]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.3, ease: modalEase }}
              className="absolute left-8 top-[116px]"
            >
              <div className="relative h-24 w-24 rounded-full border-4 border-cyan-400/85 bg-slate-900 shadow-[0_0_25px_rgba(34,211,238,0.35)] overflow-hidden">
                {profile?.avatarUrl ? (
                  <Image
                    src={profile.avatarUrl}
                    alt={`${profile.username} avatar`}
                    fill
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-[radial-gradient(circle_at_35%_25%,rgba(34,211,238,0.35),transparent_35%),linear-gradient(145deg,rgba(15,23,42,1),rgba(30,41,59,1))]" />
                )}
              </div>
            </motion.div>

            <div className="px-6 pb-6 pt-14 sm:px-8 sm:pb-8 sm:pt-16">
              {loading ? <p className="text-sm text-slate-400">Loading profile...</p> : null}
              {!loading && !profile ? <p className="text-sm text-slate-400">Profile not available.</p> : null}

              {profile ? (
                <div className="space-y-4">
                  <motion.div
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3, duration: 0.22, ease: modalEase }}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <h3 className="text-2xl font-black tracking-wide text-cyan-300">{profile.username}</h3>
                    <span className="text-xs uppercase tracking-[0.22em] text-slate-400">[{profile.rank}]</span>
                    {roleBadge ? <span className={roleBadge.className}>{roleBadge.label}</span> : null}
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.35, duration: 0.22, ease: modalEase }}
                    className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
                  >
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-2">Bio</p>
                    <p className="text-sm text-gray-300 leading-relaxed">{profile.bio?.trim() || 'No bio yet.'}</p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4, duration: 0.22, ease: modalEase }}
                    className="inline-flex"
                  >
                    <motion.span
                      className={`inline-flex items-center rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] ${favoriteGameTone(favorite)}`}
                      initial={{ scale: 1 }}
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ delay: 0.45, duration: 0.45, ease: 'easeOut' }}
                    >
                      Favorite Game: {favorite}
                    </motion.span>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.45, duration: 0.22, ease: modalEase }}
                    className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
                  >
                    <div className="grid gap-3 sm:grid-cols-3 text-sm text-slate-200">
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Level</p>
                        <p className="font-semibold">{profile.level}</p>
                        <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full bg-cyan-500" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Join Date</p>
                        <p className="font-semibold">{joinedLabel}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide text-slate-500">Balance</p>
                        <p className="font-semibold text-cyan-300">
                          {profile.canShowBalance && profile.balance !== null
                            ? `${formatUserBalance(profile.balance, false)} NVC`
                            : 'Private'}
                        </p>
                      </div>
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.5, duration: 0.22, ease: modalEase }}
                    className="flex flex-wrap items-center gap-2 pt-1"
                  >
                    {!profile.isSelf && !profile.isFriend && onAddFriend ? (
                      <button
                        type="button"
                        onClick={() => onAddFriend(profile)}
                        className="h-10 px-4 rounded-lg border border-emerald-500/50 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-semibold uppercase tracking-wide inline-flex items-center gap-1.5"
                      >
                        <UserPlus size={14} /> Add Friend
                      </button>
                    ) : null}
                    {!profile.isSelf && onSendMoney ? (
                      <button
                        type="button"
                        onClick={() => onSendMoney(profile)}
                        className="h-10 px-4 rounded-lg border border-cyan-500/50 bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 text-xs font-semibold uppercase tracking-wide inline-flex items-center gap-1.5"
                      >
                        <Send size={14} /> Send Money
                      </button>
                    ) : null}
                  </motion.div>
                </div>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
