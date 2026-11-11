import { db } from './hub';

const GAME_KINDS = ['BET', 'WIN', 'CANCEL', 'REFUND', 'BUYIN', 'CASHOUT'];

/** Activity of the last `days` days for the admin dashboard, all from the ledger. */
export async function adminStats(days = 7) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [active, newUsers, byGame] = await Promise.all([
    db.ledgerEntry.groupBy({ by: ['userId'], where: { createdAt: { gte: since }, kind: { in: ['BET', 'BUYIN'] } } }),
    db.user.count({ where: { createdAt: { gte: since } } }),
    db.ledgerEntry.groupBy({ by: ['game', 'kind'], where: { createdAt: { gte: since }, kind: { in: GAME_KINDS }, game: { not: null } }, _sum: { amount: true }, _count: { _all: true } }),
  ]);

  const games = new Map<string, { rounds: number; staked: number; house: number }>();
  for (const r of byGame) {
    const g = games.get(r.game!) ?? { rounds: 0, staked: 0, house: 0 };
    const sum = Number(r._sum.amount ?? 0);
    if (r.kind === 'BET' || r.kind === 'BUYIN') {
      g.rounds += r._count._all;
      g.staked -= sum; // stakes are negative entries
    }
    if (r.kind === 'CANCEL') g.staked -= sum;
    g.house -= sum; // what players lost is what the house won
    games.set(r.game!, g);
  }
  const table = [...games].map(([game, g]) => ({ game, ...g })).sort((a, b) => b.rounds - a.rounds);
  return {
    activePlayers: active.length,
    newUsers,
    rounds: table.reduce((s, g) => s + g.rounds, 0),
    staked: table.reduce((s, g) => s + g.staked, 0),
    house: table.reduce((s, g) => s + g.house, 0),
    games: table,
  };
}
