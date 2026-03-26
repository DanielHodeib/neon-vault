import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import CrashGame from '@/components/games/CrashGame';

export default async function CrashPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <main className="h-screen w-full overflow-hidden bg-slate-950 p-4">
      <div className="h-full min-h-0 rounded-xl border border-slate-800 overflow-hidden">
        <CrashGame />
      </div>
    </main>
  );
}
