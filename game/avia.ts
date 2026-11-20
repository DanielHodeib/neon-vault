import { z } from 'zod';

import { aviaFlight, aviaPayout } from '@/lib/avia';
import { instantRound } from './instant';
import { randInt } from './rng';
import { amount, handle, type Register } from './socket';

// Avia Masters is decided in one go on the server; the browser only plays the flight back.
export const registerAvia: Register = (_io, socket) => {
  const { user } = socket.data;

  handle(
    socket,
    'avia:play',
    z.object({ amount }),
    ({ amount }) =>
      instantRound(user.id, 'avia', amount, () => {
        const flight = aviaFlight(randInt);
        return { ...flight, payout: aviaPayout(amount, flight) };
      }),
    { play: true },
  );
};
