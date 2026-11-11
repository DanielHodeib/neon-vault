import { db } from './hub';
import { levelOf } from './ranks';
import type { PlayerStats } from './achievements';

const GAME_KINDS = ['BET', 'WIN', 'CANCEL', 'REFUND', 'BUYIN', 'CASHOUT'];

/** Per-game totals and the numbers achievements need, all from the ledger. */
export async function playerStats(userId: string) {
  const [rows, biggest, friends, user] = await Promise.all([
    db.ledgerEntry.groupBy({ by: ['game', 'kind'], where: { userId, kind: { in: GAME_KINDS }, game: { not: null } }, _sum: { amount: true }, _count: true }),
    db.ledgerEntry.aggregate({ where: { userId, kind: 'WIN' }, _max: { amount: true } }),
    db.friendship.count({ where: { accepted: true, OR: [{ fromId: userId }, { toId: userId }] } }),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { xp: true } }),
  ]);
  const games = new Map<string, { rounds: number; staked: number; net: number }>();
  for (const r of rows) {
    const g = games.get(r.game!) ?? { rounds: 0, staked: 0, net: 0 };
    const sum = Number(r._sum.amount ?? 0);
    g.net += sum;
    if (r.kind === 'BET' || r.kind === 'BUYIN') g.staked -= sum;
    if (r.kind === 'CANCEL') g.staked -= sum;
    if (r.kind === 'BET') g.rounds += r._count;
    if (r.kind === 'CANCEL') g.rounds -= r._count;
    games.set(r.game!, g);
  }
  const stats: PlayerStats = {
    bets: [...games.values()].reduce((s, g) => s + g.rounds, 0),
    biggestWin: Number(biggest._max.amount ?? 0),
    level: levelOf(user.xp),
    friends,
    gamesPlayed: [...games.values()].filter((g) => g.staked > 0).length,
  };
  return { games, stats };
}

/** Per day for the last `days` days (oldest first): net result, rounds, stakes, payouts, most played game. */
export async function dailyNet(userId: string, days = 14) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db.ledgerEntry.findMany({
    where: { userId, createdAt: { gte: since }, kind: { in: GAME_KINDS } },
    select: { amount: true, createdAt: true, kind: true, game: true },
  });
  type Day = { day: string; net: number; rounds: number; staked: number; won: number; games: Map<string, number> };
  const byDay = new Map<string, Day>();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    byDay.set(day, { day, net: 0, rounds: 0, staked: 0, won: 0, games: new Map() });
  }
  for (const r of rows) {
    const d = byDay.get(r.createdAt.toISOString().slice(0, 10));
    if (!d) continue;
    const amount = Number(r.amount);
    d.net += amount;
    if (r.kind === 'BET' || r.kind === 'BUYIN') {
      d.rounds += r.kind === 'BET' ? 1 : 0;
      d.staked -= amount;
      if (r.game) d.games.set(r.game, (d.games.get(r.game) ?? 0) + 1);
    } else if (r.kind === 'CANCEL') d.staked -= amount;
    else d.won += amount; // WIN, REFUND, CASHOUT
  }
  return [...byDay.values()].map(({ games, ...d }) => ({ ...d, topGame: [...games].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null }));
}
