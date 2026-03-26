import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import CyberAviator from '@/components/games/CyberAviator';

export default async function CrashAviatorPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <main className="h-screen w-full overflow-hidden bg-slate-950 p-4">
      <div className="h-full min-h-0 rounded-xl border border-slate-800 overflow-hidden">
        <CyberAviator />
      </div>
    </main>
  );
}
