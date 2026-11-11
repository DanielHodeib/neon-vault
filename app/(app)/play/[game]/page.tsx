import { notFound } from 'next/navigation';

import { Blackjack } from '@/components/games/Blackjack';
import { Coinflip } from '@/components/games/Coinflip';
import { Crash } from '@/components/games/Crash';
import { Poker } from '@/components/games/Poker';
import { Roulette } from '@/components/games/Roulette';
import { Slots } from '@/components/games/Slots';

const GAMES = {
  crash: <Crash />,
  slots: <Slots />,
  blackjack: <Blackjack />,
  roulette: <Roulette />,
  poker: <Poker />,
  coinflip: <Coinflip />,
};

export default async function PlayPage({ params }: PageProps<'/play/[game]'>) {
  const { game } = await params;
  if (!(game in GAMES)) notFound();
  return GAMES[game as keyof typeof GAMES];
}
