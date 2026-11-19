import { z } from 'zod';

import { aviaFlight, aviaPayout } from '@/lib/avia';
import { payout, placeBet } from '@/lib/wallet';
import { randInt } from './rng';
import { amount, handle, type Register } from './socket';

// Avia Masters is decided in one go on the server; the browser only plays the flight back.
export const registerAvia: Register = (_io, socket) => {
  const { user } = socket.data;

  handle(
    socket,
    'avia:play',
    z.object({ amount }),
    async ({ amount }) => {
      await placeBet(user.id, amount, 'avia');
      const flight = aviaFlight(randInt);
      const won = aviaPayout(amount, flight);
      await payout(user.id, won, 'avia');
      return { ...flight, payout: won };
    },
    { play: true },
  );
};
