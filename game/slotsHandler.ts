import { z } from 'zod';

import { systemMessage } from '@/lib/events';
import { hub, UserError } from '@/lib/hub';
import { payout, placeBet } from '@/lib/wallet';
import { MACHINES, spin } from './slots';
import { amount, handle, type Register } from './socket';

// shortcut: free spins live in memory and are lost on restart; move to the DB if that matters.
export const registerSlots: Register = (_io, socket) => {
  const { user } = socket.data;

  handle(
    socket,
    'slots:spin',
    z.object({ machine: z.string(), amount }),
    async ({ machine: key, amount }) => {
      const machine = MACHINES[key];
      if (!machine) throw new UserError('Unbekannter Automat.');

      const free = hub.freeSpins.get(user.id);
      const usingFree = free?.machine === key && free.spins > 0;
      const bet = usingFree ? free.bet : amount;
      if (usingFree) {
        free.spins--;
        if (free.spins === 0) hub.freeSpins.delete(user.id);
      } else {
        if (bet < machine.minBet) throw new UserError(`Mindesteinsatz: ${machine.minBet} NVC.`);
        await placeBet(user.id, bet, 'slots', machine.minBet);
      }

      const result = spin(machine);
      const win = Math.floor(bet * result.multiplier);
      if (result.freeSpins) {
        const left = hub.freeSpins.get(user.id)?.spins ?? 0;
        hub.freeSpins.set(user.id, { machine: key, bet, spins: left + result.freeSpins });
      }
      await payout(user.id, win, 'slots');
      if (win >= 50_000) systemMessage(`🎰 ${user.username} knackt ${win.toLocaleString('de-DE')} NVC an ${machine.name}!`);
      return { ...result, win, bet, freeSpinsLeft: hub.freeSpins.get(user.id)?.spins ?? 0 };
    },
    { play: true },
  );
};
