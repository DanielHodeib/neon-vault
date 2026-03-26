import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import MainHub from '@/components/Layout/MainHub';

type HubTab = 'crash' | 'crash-aviator' | 'slots' | 'blackjack' | 'roulette' | 'poker' | 'coinflip' | 'friends' | 'leaderboard' | 'quests' | 'settings' | 'admin';

const ALLOWED_HUB_TABS = new Set<HubTab>([
  'crash',
  'crash-aviator',
  'slots',
  'blackjack',
  'roulette',
  'poker',
  'coinflip',
  'friends',
  'leaderboard',
  'quests',
  'settings',
  'admin',
]);

function sanitizeHubTab(value: string | undefined): HubTab | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase() as HubTab;
  return ALLOWED_HUB_TABS.has(normalized) ? normalized : undefined;
}

export default async function HubPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const params = (await searchParams) ?? {};
  const gameParam = params.game;
  const selectedTab = sanitizeHubTab(typeof gameParam === 'string' ? gameParam : undefined);

  if (!session?.user) {
    redirect('/login');
  }

  return (
    <main>
      <MainHub initialUsername={session.user.name ?? ''} initialTab={selectedTab} />
    </main>
  );
}
