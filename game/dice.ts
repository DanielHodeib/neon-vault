import { z } from 'zod';

import { systemMessage } from '@/lib/events';
import { DICE_MAX, DICE_MIN, diceChance, diceMultiplier } from '@/lib/solo';
import { payout, placeBet } from '@/lib/wallet';
import { randInt } from './rng';
import { amount, handle, type Register } from './socket';

export const registerDice: Register = (_io, socket) => {
  const { user } = socket.data;

  handle(
    socket,
    'dice:roll',
    z.object({ amount, target: z.number().int().min(DICE_MIN).max(DICE_MAX), side: z.enum(['under', 'over']) }),
    async ({ amount, target, side }) => {
      await placeBet(user.id, amount, 'dice');
      const roll = randInt(10_000) / 100;
      // under: [0, target) and over: [target, 100) cover exactly the advertised chance
      const win = side === 'under' ? roll < target : roll >= target;
      const multiplier = diceMultiplier(diceChance(target, side));
      const won = win ? Math.floor(amount * multiplier) : 0;
      await payout(user.id, won, 'dice');
      if (won >= 50_000) systemMessage(`${user.username} gewinnt ${won.toLocaleString('de-DE')} NVC beim Dice (${multiplier}×)!`);
      return { roll, win, multiplier, payout: won };
    },
    { play: true },
  );
};
