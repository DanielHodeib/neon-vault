import { z } from 'zod';

import { eventParam, systemMessage } from '@/lib/events';
import { db, UserError } from '@/lib/hub';
import { payout, placeBet } from '@/lib/wallet';
import { MACHINES, pickSpecial, spin } from './slots';
import { amount, empty, handle, type Register } from './socket';

export const registerSlots: Register = (_io, socket) => {
  const { user } = socket.data;
  const freeSpins = () =>
    db.freeSpins
      .findUnique({ where: { userId: user.id } })
      .then((f) => (f?.spins ? { machine: f.machine, spins: f.spins, bet: Number(f.bet), special: f.special } : null));

  handle(socket, 'slots:state', empty, async () => ({ freeSpins: await freeSpins() }));

  handle(
    socket,
    'slots:spin',
    z.object({ machine: z.string(), amount }),
    async ({ machine: key, amount }) => {
      const machine = Object.hasOwn(MACHINES, key) ? MACHINES[key] : undefined;
      if (!machine) throw new UserError('Unbekannter Automat.');

      const free = await freeSpins();
      const isFree = free?.machine === key;
      let bet = amount;
      if (isFree) {
        // Conditional decrement: two parallel spins can't use the same free spin.
        const { count } = await db.freeSpins.updateMany({ where: { userId: user.id, spins: { gt: 0 } }, data: { spins: { decrement: 1 } } });
        if (!count) throw new UserError('Keine Free Spins mehr.');
        bet = Number(free.bet);
      } else {
        if (bet < machine.minBet) throw new UserError(`Mindesteinsatz: ${machine.minBet} NVC.`);
        await placeBet(user.id, bet, 'slots', machine.minBet);
      }

      // Old rows from before expanding symbols existed get one picked now.
      const special = isFree ? (free.special ?? (machine.freeSpins?.expanding ? pickSpecial(machine) : undefined)) : undefined;
      if (isFree && special && !free.special) await db.freeSpins.updateMany({ where: { userId: user.id }, data: { special } });
      const result = spin(machine, { free: isFree, special, rush: eventParam('JACKPOT_RUSH', 'factor') ?? 1 });
      const win = Math.floor(bet * result.multiplier);
      if (result.freeSpins) {
        const round = result.special ?? special ?? null;
        await db.freeSpins.upsert({
          where: { userId: user.id },
          create: { userId: user.id, machine: key, bet: BigInt(bet), spins: result.freeSpins, special: round },
          // Leftover spins keep their machine, stake and symbol, so a big scatter can't upgrade cheap spins.
          update: free ? { spins: { increment: result.freeSpins } } : { machine: key, bet: BigInt(bet), spins: result.freeSpins, special: round },
        });
      }
      await payout(user.id, win, 'slots');
      if (win >= 50_000) systemMessage(`${user.username} knackt ${win.toLocaleString('de-DE')} NVC an ${machine.name}!`);
      return { ...result, freeWon: result.freeSpins, win, bet, free: isFree, special: isFree ? special : result.special, freeSpins: await freeSpins() };
    },
    { play: true },
  );
};
