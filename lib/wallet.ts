import { db, emitToUser, UserError } from './hub';

export type LedgerKind = 'BET' | 'WIN' | 'REFUND' | 'FAUCET' | 'QUEST' | 'TRANSFER' | 'RAIN' | 'ADMIN';

export type Entry = {
  userId: string;
  amount: number; // signed, whole coins
  kind: LedgerKind;
  game?: string;
  note?: string;
  counterpartyId?: string;
};

export const MAX_AMOUNT = 1_000_000_000_000;
const XP_PER_BET = 10;

export function assertAmount(amount: number, min = 1) {
  if (!Number.isSafeInteger(amount) || amount < min || amount > MAX_AMOUNT) {
    throw new UserError(`Ungültiger Betrag (min. ${min}).`);
  }
}

/**
 * The only way balances change. All entries apply atomically; a debit that
 * would go below zero aborts everything. Returns the new balances.
 */
export async function applyLedger(entries: Entry[]) {
  const touched = [...new Set(entries.map((e) => e.userId))];
  const balances = await db.$transaction(async (tx) => {
    for (const e of entries) {
      if (!Number.isSafeInteger(e.amount)) throw new Error(`non-integer ledger amount ${e.amount}`);
      const amount = BigInt(e.amount);
      const xp = e.kind === 'BET' ? XP_PER_BET : 0;
      const { count } = await tx.user.updateMany({
        where: { id: e.userId, ...(amount < 0n ? { balance: { gte: -amount } } : {}) },
        data: { balance: { increment: amount }, xp: { increment: xp } },
      });
      if (count === 0) throw new UserError('Nicht genug Guthaben.');
      await tx.ledgerEntry.create({ data: { ...e, amount } });
    }
    const rows = await tx.user.findMany({ where: { id: { in: touched } }, select: { id: true, balance: true } });
    return new Map(rows.map((r) => [r.id, Number(r.balance)]));
  });
  balances.forEach((balance, userId) => emitToUser(userId, 'balance', balance));
  return balances;
}

export async function placeBet(userId: string, amount: number, game: string, min = 1) {
  assertAmount(amount, min);
  await applyLedger([{ userId, amount: -amount, kind: 'BET', game }]);
}

/** Credits a payout; 0 is a no-op so callers don't need to branch. */
export async function payout(userId: string, amount: number, game: string, kind: LedgerKind = 'WIN') {
  const coins = Math.floor(amount);
  if (coins > 0) await applyLedger([{ userId, amount: coins, kind, game }]);
}

export const startOfDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export function startOfWeek(d = new Date()) {
  const day = startOfDay(d);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day;
}

/** Net game result per user since `since` (wins + refunds − bets). */
export async function netProfitSince(since: Date, take = 10) {
  const rows = await db.ledgerEntry.groupBy({
    by: ['userId'],
    where: { createdAt: { gte: since }, kind: { in: ['BET', 'WIN', 'REFUND'] } },
    _sum: { amount: true },
  });
  const top = rows
    .map((r) => ({ userId: r.userId, profit: Number(r._sum.amount ?? 0) }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, take);
  const users = await db.user.findMany({ where: { id: { in: top.map((t) => t.userId) } }, select: { id: true, username: true } });
  return top.map((t) => ({ ...t, username: users.find((u) => u.id === t.userId)?.username ?? '?' }));
}
