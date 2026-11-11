import { z } from 'zod';

import { systemMessage } from '@/lib/events';
import { PLINKO, PLINKO_ROWS } from '@/lib/solo';
import { payout, placeBet } from '@/lib/wallet';
import { randInt } from './rng';
import { amount, handle, type Register } from './socket';

export const registerPlinko: Register = (_io, socket) => {
  const { user } = socket.data;

  handle(
    socket,
    'plinko:drop',
    z.object({ amount, risk: z.enum(['low', 'medium', 'high']) }),
    async ({ amount, risk }) => {
      await placeBet(user.id, amount, 'plinko');
      const path = Array.from({ length: PLINKO_ROWS }, () => randInt(2));
      const slot = path.reduce((a, b) => a + b, 0);
      const multiplier = PLINKO[risk][slot];
      const won = Math.floor(amount * multiplier);
      await payout(user.id, won, 'plinko');
      if (won >= 50_000) systemMessage(`${user.username} trifft ${multiplier}× in Plinko: ${won.toLocaleString('de-DE')} NVC!`);
      return { path, slot, multiplier, payout: won };
    },
    { play: true },
  );
};
