import { auth } from '@/auth';
import WelcomeLanding from './WelcomeLanding';

export default async function Home() {
  const session = await auth();

  return (
    <main>
      <WelcomeLanding
        isLoggedIn={Boolean(session?.user)}
        sessionUsername={session?.user?.name ?? ''}
      />
    </main>
  );
}
