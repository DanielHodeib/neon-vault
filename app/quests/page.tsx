import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import QuestsPanel from '@/components/QuestsPanel';

export default async function QuestsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/login');
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <QuestsPanel />
      </div>
    </main>
  );
}
