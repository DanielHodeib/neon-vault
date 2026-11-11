import { z } from 'zod';

import { systemMessage } from '@/lib/events';
import { db, hub, UserError } from '@/lib/hub';
import { payout, placeBet } from '@/lib/wallet';
import { MACHINES, spin } from './slots';
import { amount, empty, handle, type Register } from './socket';

export const registerSlots: Register = (_io, socket) => {
  const { user } = socket.data;
  const freeSpins = () =>
    db.freeSpins.findUnique({ where: { userId: user.id } }).then((f) => (f?.spins ? { machine: f.machine, spins: f.spins, bet: Number(f.bet) } : null));

  handle(socket, 'slots:state', empty, async () => ({ freeSpins: await freeSpins() }));

  handle(
    socket,
    'slots:spin',
    z.object({ machine: z.string(), amount }),
    async ({ machine: key, amount }) => {
      const machine = MACHINES[key];
      if (!machine) throw new UserError('Unbekannter Automat.');

      const free = await freeSpins();
      let bet = amount;
      if (free?.machine === key) {
        // Conditional decrement: two parallel spins can't use the same free spin.
        const { count } = await db.freeSpins.updateMany({ where: { userId: user.id, spins: { gt: 0 } }, data: { spins: { decrement: 1 } } });
        if (!count) throw new UserError('Keine Free Spins mehr.');
        bet = Number(free.bet);
      } else {
        if (bet < machine.minBet) throw new UserError(`Mindesteinsatz: ${machine.minBet} NVC.`);
        await placeBet(user.id, bet, 'slots', machine.minBet);
      }

      const result = spin(machine, hub.event?.type === 'JACKPOT_RUSH');
      const win = Math.floor(bet * result.multiplier);
      if (result.freeSpins) {
        await db.freeSpins.upsert({
          where: { userId: user.id },
          create: { userId: user.id, machine: key, bet: BigInt(bet), spins: result.freeSpins },
          // Leftover spins keep their machine and stake, so a big scatter can't upgrade cheap spins.
          update: free ? { spins: { increment: result.freeSpins } } : { machine: key, bet: BigInt(bet), spins: result.freeSpins },
        });
      }
      await payout(user.id, win, 'slots');
      if (win >= 50_000) systemMessage(`${user.username} knackt ${win.toLocaleString('de-DE')} NVC an ${machine.name}!`);
      return { ...result, win, bet, freeSpins: await freeSpins() };
    },
    { play: true },
  );
};
