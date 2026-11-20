import { cancelBet, payout, placeBet } from '@/lib/wallet';

/**
 * One-shot round (Dice, Plinko, Keno, Limbo, Avia, Scratch, Baccarat): stake in, outcome, payout out.
 * `decide` is pure and returns the reply plus `payout`; `refund: true` hands the stake back as a cancelled bet (a push).
 * Should `decide` throw after the stake was taken, the stake goes back instead of being lost.
 */
export async function instantRound<R extends object>(
  userId: string,
  game: string,
  amount: number,
  decide: () => R & { payout: number; refund?: boolean },
): Promise<Omit<R & { payout: number }, 'refund'>> {
  await placeBet(userId, amount, game);
  let outcome: R & { payout: number; refund?: boolean };
  try {
    outcome = decide();
  } catch (err) {
    await cancelBet(userId, amount, game);
    throw err;
  }
  const { refund, ...reply } = outcome;
  await (refund ? cancelBet : payout)(userId, reply.payout, game);
  return reply;
}
