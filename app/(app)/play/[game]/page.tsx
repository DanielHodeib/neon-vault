import { notFound } from 'next/navigation';

import { Blackjack } from '@/components/games/Blackjack';
import { Coinflip } from '@/components/games/Coinflip';
import { Crash } from '@/components/games/Crash';
import { Dice } from '@/components/games/Dice';
import { HiLo } from '@/components/games/HiLo';
import { Jackpot } from '@/components/games/Jackpot';
import { Mines } from '@/components/games/Mines';
import { Plinko } from '@/components/games/Plinko';
import { Poker } from '@/components/games/Poker';
import { Race } from '@/components/games/Race';
import { Roulette } from '@/components/games/Roulette';
import { Slots } from '@/components/games/Slots';
import { Wheel } from '@/components/games/Wheel';
import { Keno } from '@/components/games/Keno';
import { Scratch } from '@/components/games/Scratch';
import { Tower } from '@/components/games/Tower';
import { VideoPoker } from '@/components/games/VideoPoker';

const GAMES = {
  crash: <Crash />,
  slots: <Slots />,
  blackjack: <Blackjack />,
  roulette: <Roulette />,
  poker: <Poker />,
  coinflip: <Coinflip />,
  mines: <Mines />,
  dice: <Dice />,
  plinko: <Plinko />,
  hilo: <HiLo />,
  wheel: <Wheel />,
  jackpot: <Jackpot />,
  race: <Race />,
  scratch: <Scratch />,
  tower: <Tower />,
  keno: <Keno />,
  vpoker: <VideoPoker />,
};

export default async function PlayPage({ params }: PageProps<'/play/[game]'>) {
  const { game } = await params;
  if (!(game in GAMES)) notFound();
  return GAMES[game as keyof typeof GAMES];
}
