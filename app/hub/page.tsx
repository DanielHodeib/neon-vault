import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import MainHub from '@/components/Layout/MainHub';

export default async function HubPage() {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <main>
      <MainHub initialUsername={session.user.name ?? ''} />
    </main>
  );
}
