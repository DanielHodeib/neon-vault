import { z } from 'zod';

import { systemMessage } from '@/lib/events';
import { UserError } from '@/lib/hub';
import { MINES_MAX, MINES_MIN, MINES_TILES, minesMultiplier } from '@/lib/solo';
import { cancelBet, payout, placeBet } from '@/lib/wallet';
import { shuffle } from './rng';
import { amount, empty, handle, type Register } from './socket';

// `paid` is false while the stake is still being debited.
type Round = { bet: number; mines: number; bombs: Set<number>; revealed: Set<number>; paid: boolean };

const rounds = new Map<string, Round>();

const view = (r: Round) => ({ bet: r.bet, mines: r.mines, revealed: [...r.revealed], multiplier: minesMultiplier(r.mines, r.revealed.size) });

export const registerMines: Register = (_io, socket) => {
  const { user } = socket.data;

  const active = () => {
    const round = rounds.get(user.id);
    if (!round?.paid) throw new UserError('Keine laufende Runde.');
    return round;
  };

  const cashOut = async (round: Round) => {
    rounds.delete(user.id); // before the await so it can't pay twice
    const multiplier = minesMultiplier(round.mines, round.revealed.size);
    const win = Math.floor(round.bet * multiplier);
    await payout(user.id, win, 'mines');
    if (win >= 50_000) systemMessage(`${user.username} räumt ${win.toLocaleString('de-DE')} NVC in Mines ab (${multiplier}×)!`);
    return { multiplier, payout: win, bombs: [...round.bombs] };
  };

  handle(socket, 'mines:state', empty, () => {
    const round = rounds.get(user.id);
    return { round: round?.paid ? view(round) : null };
  });

  handle(
    socket,
    'mines:start',
    z.object({ amount, mines: z.number().int().min(MINES_MIN).max(MINES_MAX) }),
    async ({ amount, mines }) => {
      if (rounds.has(user.id)) throw new UserError('Du hast schon eine laufende Runde.');
      const bombs = new Set(shuffle([...Array(MINES_TILES).keys()]).slice(0, mines));
      const round: Round = { bet: amount, mines, bombs, revealed: new Set(), paid: false };
      rounds.set(user.id, round); // reserve the slot before the await
      try {
        await placeBet(user.id, amount, 'mines');
      } catch (err) {
        rounds.delete(user.id);
        throw err;
      }
      round.paid = true;
      return { round: view(round) };
    },
    { play: true },
  );

  handle(socket, 'mines:reveal', z.object({ tile: z.number().int().min(0).max(MINES_TILES - 1) }), async ({ tile }) => {
    const round = active();
    if (round.revealed.has(tile)) throw new UserError('Feld ist schon aufgedeckt.');
    if (round.bombs.has(tile)) {
      rounds.delete(user.id);
      return { bomb: true, tile, bombs: [...round.bombs], payout: 0 };
    }
    round.revealed.add(tile);
    if (round.revealed.size === MINES_TILES - round.mines) return { bomb: false, tile, done: true, ...(await cashOut(round)) };
    return { bomb: false, tile, multiplier: minesMultiplier(round.mines, round.revealed.size) };
  });

  handle(socket, 'mines:cashout', empty, async () => {
    const round = active();
    if (!round.revealed.size) throw new UserError('Deck zuerst mindestens ein Feld auf.');
    return cashOut(round);
  });
};

/** Shutdown: open rounds get their stake back. */
export async function refundMines() {
  const open = [...rounds.entries()].filter(([, r]) => r.paid);
  rounds.clear();
  for (const [userId, r] of open) await cancelBet(userId, r.bet, 'mines').catch(console.error);
}
