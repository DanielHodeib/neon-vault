import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import ProfileRealtimeBalance from './ProfileRealtimeBalance';

export default async function ProfilePage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect('/login');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      username: true,
      balance: true,
      xp: true,
      createdAt: true,
      settings: {
        select: {
          bio: true,
          theme: true,
        },
      },
    },
  });

  if (!user) {
    redirect('/login');
  }

  const favoriteGame = 'Crash (v1 placeholder)';

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/70 p-6 md:p-8">
        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Profile</p>
        <h1 className="mt-2 text-3xl md:text-4xl font-black tracking-tight">{user.username}</h1>
        <p className="mt-1 text-sm text-slate-400">Joined {new Date(user.createdAt).toLocaleDateString()}</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Realtime Balance</p>
            <ProfileRealtimeBalance initialBalance={user.balance} />
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Favorite Game</p>
            <p className="mt-2 text-xl font-semibold text-emerald-300">{favoriteGame}</p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Bio</p>
          <p className="mt-2 text-sm text-slate-300">{user.settings?.bio || 'No bio yet.'}</p>
          <p className="mt-3 text-xs text-slate-500">Theme: {user.settings?.theme ?? 'slate'} · XP: {user.xp}</p>
        </div>
      </div>
    </main>
  );
}
