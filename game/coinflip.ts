import { z } from 'zod';

import { bounty, cashback, eventActive, systemMessage, winBoost } from '@/lib/events';
import { COINFLIP_SOLO_PAYOUT } from '@/lib/games';
import { UserError } from '@/lib/hub';
import { cancelBet, payout, placeBet } from '@/lib/wallet';
import { id as newId, randInt } from './rng';
import { amount, empty, handle, type Register } from './socket';

const HOUSE_FEE = 0.05;
const MAX_OPEN_PER_USER = 5;

type Side = 'heads' | 'tails';
type Lobby = { id: string; userId: string; username: string; side: Side; amount: number; createdAt: number };

const lobbies = new Map<string, Lobby>();
const list = () => [...lobbies.values()].sort((a, b) => b.createdAt - a.createdAt);

export const registerCoinflip: Register = (io, socket) => {
  const { user } = socket.data;
  const emit = () => io.to('coinflip').emit('coinflip:lobbies', list());

  handle(socket, 'coinflip:join', empty, () => {
    void socket.join('coinflip');
    return { lobbies: list() };
  });

  handle(
    socket,
    'coinflip:solo',
    z.object({ amount, side: z.enum(['heads', 'tails']) }),
    async ({ amount, side }) => {
      await placeBet(user.id, amount, 'coinflip');
      const result: Side = randInt(2) === 0 ? 'heads' : 'tails';
      const win = result === side ? Math.floor(amount * COINFLIP_SOLO_PAYOUT) : 0;
      await payout(user.id, win, 'coinflip');
      if (win >= 50_000) systemMessage(`${user.username} gewinnt ${win.toLocaleString('de-DE')} NVC im Coinflip!`);
      return { result, win };
    },
    { play: true },
  );

  handle(
    socket,
    'coinflip:create',
    z.object({ amount, side: z.enum(['heads', 'tails']) }),
    async ({ amount, side }) => {
      if (list().filter((l) => l.userId === user.id).length >= MAX_OPEN_PER_USER) throw new UserError(`Maximal ${MAX_OPEN_PER_USER} offene Lobbys.`);
      await placeBet(user.id, amount, 'coinflip');
      const lobbyId = newId();
      lobbies.set(lobbyId, { id: lobbyId, userId: user.id, username: user.username, side, amount, createdAt: Date.now() });
      emit();
    },
    { play: true },
  );

  handle(socket, 'coinflip:cancel', z.object({ id: z.string() }), async ({ id }) => {
    const lobby = lobbies.get(id);
    if (!lobby || lobby.userId !== user.id) throw new UserError('Lobby nicht gefunden.');
    lobbies.delete(id);
    emit();
    await cancelBet(user.id, lobby.amount, 'coinflip');
  });

  handle(
    socket,
    'coinflip:accept',
    z.object({ id: z.string() }),
    async ({ id }) => {
      const lobby = lobbies.get(id);
      if (!lobby) throw new UserError('Lobby ist schon weg.');
      if (lobby.userId === user.id) throw new UserError('Du kannst nicht gegen dich selbst spielen.');
      lobbies.delete(id); // claim it before the await
      try {
        await placeBet(user.id, lobby.amount, 'coinflip');
      } catch (err) {
        lobbies.set(id, lobby);
        throw err;
      }
      const result: Side = randInt(2) === 0 ? 'heads' : 'tails';
      const creatorWins = result === lobby.side;
      const [winner, loser] = creatorWins ? [lobby.userId, user.id] : [user.id, lobby.userId];
      const winnerName = creatorWins ? lobby.username : user.username;
      const fee = eventActive('DUEL') ? 0 : HOUSE_FEE;
      const prize = Math.floor(lobby.amount * 2 * (1 - fee) * winBoost('coinflip'));
      await payout(winner, prize, 'coinflip');
      await cashback(loser, lobby.amount, 'coinflip');
      await bounty(winner, loser, winnerName).catch(console.error);
      emit();
      io.to('coinflip').emit('coinflip:result', { lobby, opponent: user.username, result, winner: winnerName, prize });
      if (prize >= 50_000) systemMessage(`${winnerName} gewinnt ${prize.toLocaleString('de-DE')} NVC im Coinflip!`);
    },
    { play: true },
  );
};

/** Shutdown: open lobbies are cancelled and refunded. */
export async function refundCoinflip() {
  const open = [...lobbies.values()];
  lobbies.clear();
  for (const l of open) await cancelBet(l.userId, l.amount, 'coinflip').catch(console.error);
}
