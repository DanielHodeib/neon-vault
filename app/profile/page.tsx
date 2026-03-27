import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import ProfileRealtimeBalance from './ProfileRealtimeBalance';
import ProfileEditClient from './ProfileEditClient';
import { getRankInfo } from '@/lib/ranks';

export default async function ProfilePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect('/login');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      username: true,
      balance: true,
      xp: true,
      role: true,
      createdAt: true,
      avatarUrl: true,
      bannerUrl: true,
      bio: true,
      settings: { select: { bio: true, theme: true, selectedRankTag: true } },
    },
  });

  if (!user) redirect('/login');

  const rank = getRankInfo(user.xp, user.balance);
  const level = rank.level;
  const rankColor = rank.color;
  const rankTag = rank.tag;
  const bio = user.bio ?? user.settings?.bio ?? '';

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-3xl pb-16">
        {/* Banner */}
        <div className="relative h-48 md:h-64 rounded-b-2xl overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900">
          {user.bannerUrl ? (
            <img src={user.bannerUrl} alt="Profile banner" className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full"
              style={{
                background: `radial-gradient(ellipse at 60% 40%, ${rankColor}33 0%, transparent 70%), linear-gradient(135deg, #0f172a 0%, #1e293b 100%)`,
              }}
            >
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: `repeating-linear-gradient(45deg, ${rankColor}22 0px, ${rankColor}22 1px, transparent 1px, transparent 12px)` }} />
            </div>
          )}
          {/* Rank glow overlay */}
          <div className="absolute inset-0" style={{ boxShadow: `inset 0 -60px 80px ${rankColor}22` }} />
        </div>

        {/* Avatar + name row */}
        <div className="relative px-6 md:px-8">
          {/* Avatar — floats half over banner */}
          <div className="absolute -top-12 left-6 md:left-8">
            <div
              className="h-24 w-24 rounded-full overflow-hidden border-4 shadow-2xl"
              style={{ borderColor: rankColor, boxShadow: `0 0 24px ${rankColor}88` }}
            >
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-3xl font-black"
                  style={{ background: `linear-gradient(135deg, ${rankColor}44, ${rankColor}22)`, color: rankColor }}
                >
                  {user.username[0].toUpperCase()}
                </div>
              )}
            </div>
          </div>

          {/* Edit button top-right */}
          <div className="flex justify-end pt-3">
            <ProfileEditClient
              initialAvatarUrl={user.avatarUrl ?? ''}
              initialBannerUrl={user.bannerUrl ?? ''}
              initialBio={bio}
            />
          </div>

          {/* Name / rank / bio */}
          <div className="mt-14">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">{user.username}</h1>
              <span
                className="inline-flex items-center h-6 px-2.5 rounded-md border text-[11px] font-black uppercase tracking-wide"
                style={{ color: rankColor, borderColor: `${rankColor}66`, background: `${rankColor}18`, textShadow: `0 0 8px ${rankColor}` }}
              >
                {rankTag.replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-slate-500 font-mono">Level {level}</span>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              {user.role !== 'USER' ? (
                <span className="mr-2 text-rose-300 font-semibold">[{user.role}]</span>
              ) : null}
              Joined {new Date(user.createdAt).toLocaleDateString()}
            </p>
            {bio ? (
              <p className="mt-3 text-sm text-slate-300 leading-relaxed max-w-xl">{bio}</p>
            ) : (
              <p className="mt-3 text-sm text-slate-600 italic">No bio yet.</p>
            )}
          </div>

          {/* Stats grid */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Realtime Balance</p>
              <ProfileRealtimeBalance initialBalance={user.balance} />
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">XP</p>
              <p className="mt-2 text-xl font-semibold" style={{ color: rankColor }}>{user.xp.toLocaleString()} XP</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
