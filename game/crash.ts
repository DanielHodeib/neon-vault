import type { Server } from 'socket.io';
import { z } from 'zod';

import { cashback, systemMessage, winBoost } from '@/lib/events';
import { multiplierAt } from '@/lib/games';
import { UserError } from '@/lib/hub';
import { payout, placeBet } from '@/lib/wallet';
import { rand } from './rng';
import { amount, empty, handle, type Register } from './socket';

const WAIT_MS = 7000;
const AFTER_CRASH_MS = 4000;
const TICK_MS = 100;
const MAX_POINT = 1000;

/** 1 % of rounds bust at 1.00×; otherwise P(point ≥ x) = 0.99 / x. */
export const crashPointFrom = (r: number) => Math.min(MAX_POINT, Math.max(1, Math.floor(99 / (1 - r)) / 100));


// `paid` is false while the stake is still being debited.
type Bet = { userId: string; username: string; amount: number; auto: number | null; cashedAt: number | null; paid: boolean };

const round = {
  id: 0,
  phase: 'waiting' as 'waiting' | 'running' | 'crashed',
  point: 1,
  startsAt: 0,
  startedAt: 0,
  multiplier: 1,
  bets: new Map<string, Bet>(),
  history: [] as number[],
};

export const crashState = () => ({
  id: round.id,
  phase: round.phase,
  startsAt: round.startsAt,
  startedAt: round.startedAt,
  multiplier: round.multiplier,
  point: round.phase === 'crashed' ? round.point : null,
  history: round.history,
  bets: [...round.bets.values()].map(({ userId, username, amount, cashedAt }) => ({ userId, username, amount, cashedAt })),
});

async function cashOut(io: Server, bet: Bet, at: number) {
  bet.cashedAt = at; // set before the await so a second cashout can't pay twice
  io.to('crash').emit('crash:state', crashState());
  const win = Math.floor(bet.amount * at * winBoost('crash'));
  await payout(bet.userId, win, 'crash');
  if (win >= 50_000) systemMessage(`${bet.username} hat bei ${at.toFixed(2)}× ${win.toLocaleString('de-DE')} NVC in Crash gewonnen!`);
  return win;
}

export function startCrash(io: Server) {
  const newRound = () => {
    Object.assign(round, { id: round.id + 1, phase: 'waiting', point: crashPointFrom(rand()), startsAt: Date.now() + WAIT_MS, multiplier: 1, bets: new Map() });
    io.to('crash').emit('crash:state', crashState());
    setTimeout(run, WAIT_MS);
  };

  const run = () => {
    Object.assign(round, { phase: 'running', startedAt: Date.now() });
    io.to('crash').emit('crash:state', crashState());
    const timer = setInterval(() => {
      round.multiplier = Math.min(multiplierAt(Date.now() - round.startedAt), round.point);
      for (const bet of round.bets.values()) {
        if (bet.paid && !bet.cashedAt && bet.auto && round.multiplier >= bet.auto && bet.auto <= round.point) void cashOut(io, bet, bet.auto).catch(console.error);
      }
      if (round.multiplier >= round.point) {
        clearInterval(timer);
        crash();
      } else io.to('crash').emit('crash:tick', round.multiplier);
    }, TICK_MS);
  };

  const crash = () => {
    round.phase = 'crashed';
    round.history = [round.point, ...round.history].slice(0, 20);
    io.to('crash').emit('crash:state', crashState());
    for (const bet of round.bets.values()) if (bet.paid && !bet.cashedAt) void cashback(bet.userId, bet.amount, 'crash').catch(console.error);
    setTimeout(newRound, AFTER_CRASH_MS);
  };

  newRound();
}

export const registerCrash: Register = (io, socket) => {
  const { user } = socket.data;

  handle(socket, 'crash:join', empty, () => {
    void socket.join('crash');
    return { state: crashState() };
  });

  handle(
    socket,
    'crash:bet',
    z.object({ amount, auto: z.number().min(1.01).max(MAX_POINT).nullable().optional() }),
    async ({ amount, auto }) => {
      if (round.phase !== 'waiting') throw new UserError('Runde läuft bereits – warte auf die nächste.');
      if (round.bets.has(user.id)) throw new UserError('Du hast in dieser Runde schon gesetzt.');
      const bet: Bet = { userId: user.id, username: user.username, amount, auto: auto ?? null, cashedAt: null, paid: false };
      round.bets.set(user.id, bet); // reserve the slot before the await
      try {
        await placeBet(user.id, amount, 'crash');
        bet.paid = true;
      } catch (err) {
        round.bets.delete(user.id);
        throw err;
      }
      io.to('crash').emit('crash:state', crashState());
    },
    { play: true },
  );

  handle(socket, 'crash:cancel', empty, async () => {
    const bet = round.bets.get(user.id);
    if (!bet?.paid || round.phase !== 'waiting') throw new UserError('Nichts zu stornieren.');
    round.bets.delete(user.id);
    await payout(user.id, bet.amount, 'crash', 'REFUND');
    io.to('crash').emit('crash:state', crashState());
  });

  handle(socket, 'crash:cashout', empty, async () => {
    const bet = round.bets.get(user.id);
    if (round.phase !== 'running' || !bet?.paid || bet.cashedAt) throw new UserError('Kein aktiver Einsatz.');
    return { win: await cashOut(io, bet, round.multiplier) };
  });
};
