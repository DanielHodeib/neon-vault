import { z } from 'zod';

import { PLINKO, PLINKO_ROWS } from '@/lib/solo';
import { instantRound } from './instant';
import { randInt } from './rng';
import { amount, handle, type Register } from './socket';

export const registerPlinko: Register = (_io, socket) => {
  const { user } = socket.data;

  handle(
    socket,
    'plinko:drop',
    z.object({ amount, risk: z.enum(['low', 'medium', 'high']) }),
    ({ amount, risk }) =>
      instantRound(user.id, 'plinko', amount, () => {
        const path = Array.from({ length: PLINKO_ROWS }, () => randInt(2));
        const slot = path.reduce((a, b) => a + b, 0);
        const multiplier = PLINKO[risk][slot];
        return { path, slot, multiplier, payout: Math.floor(amount * multiplier) };
      }),
    { play: true },
  );
};
