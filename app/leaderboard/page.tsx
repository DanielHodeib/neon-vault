import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import LeaderboardPanel from '@/components/LeaderboardPanel';

export default async function LeaderboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <LeaderboardPanel />
      </div>
    </main>
  );
}
