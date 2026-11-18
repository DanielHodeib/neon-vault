import { db } from './hub';
import { levelOf } from './ranks';
import type { PlayerStats } from './achievements';
import { GAME_NAMES } from './format';

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
    gamesPlayed: [...games.entries()].filter(([game, g]) => g.staked > 0 && game in GAME_NAMES).length,
    duelWins: rows.find((r) => r.game === 'duel' && r.kind === 'WIN')?._count ?? 0,
    marketWins: rows.find((r) => r.game === 'market' && r.kind === 'WIN')?._count ?? 0,
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

// ── History page: everything derived from the ledger ─────────────────────────────────────────────
export const HISTORY_DAYS = 30;
export type LedgerRow = { id: string; amount: number; kind: string; game: string | null; note: string | null; at: number };
const slotOf = (h: number) => Math.floor(h / 6); // 0 night, 1 morning, 2 afternoon, 3 evening
const VIENNA = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Vienna', hour: 'numeric', hourCycle: 'h23', weekday: 'short' });
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export async function history(userId: string) {
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
  const [rows, recent, biggestStake] = await Promise.all([
    db.ledgerEntry.findMany({ where: { userId, createdAt: { gte: since }, kind: { in: GAME_KINDS } }, select: { amount: true, createdAt: true, kind: true, game: true } }),
    db.ledgerEntry.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 80, select: { id: true, amount: true, kind: true, game: true, note: true, createdAt: true } }),
    db.ledgerEntry.aggregate({ where: { userId, kind: 'BET' }, _min: { amount: true } }),
  ]);
  // Per day (oldest first): net result of the day and the running total over the period.
  const perDay = new Map<string, number>();
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) perDay.set(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10), 0);
  // heat[weekday][slot] = net result
  const heat = Array.from({ length: 7 }, () => [0, 0, 0, 0]);
  const rounds = Array.from({ length: 7 }, () => [0, 0, 0, 0]);
  for (const r of rows) {
    const day = r.createdAt.toISOString().slice(0, 10);
    const amount = Number(r.amount);
    if (perDay.has(day)) perDay.set(day, perDay.get(day)! + amount);
    const parts = Object.fromEntries(VIENNA.formatToParts(r.createdAt).map((p) => [p.type, p.value]));
    const wd = WEEKDAYS.indexOf(parts.weekday);
    if (wd < 0) continue;
    heat[wd][slotOf(Number(parts.hour))] += amount;
    if (r.kind === 'BET') rounds[wd][slotOf(Number(parts.hour))]++;
  }
  let run = 0;
  const curve = [...perDay].map(([day, net]) => ({ day, net, total: (run += net) }));
  const ledger: LedgerRow[] = recent.map((r) => ({ id: r.id, amount: Number(r.amount), kind: r.kind, game: r.game, note: r.note, at: r.createdAt.getTime() }));
  return { curve, heat, rounds, ledger, biggestStake: Math.abs(Number(biggestStake._min.amount ?? 0)) };
}
