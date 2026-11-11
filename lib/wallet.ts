import { db, emitToUser, hub, notify, UserError } from './hub';
import { levelOf } from './ranks';

// BET/WIN: a played round. CANCEL: a stake handed back unplayed (undoes the bet's XP and quest
// credit). REFUND: cashback. BUYIN/CASHOUT: poker chips, which are not bets themselves.
export type LedgerKind = 'BET' | 'WIN' | 'CANCEL' | 'REFUND' | 'BUYIN' | 'CASHOUT' | 'FAUCET' | 'QUEST' | 'TRANSFER' | 'RAIN' | 'ADMIN' | 'BONUS';

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
export const LEVEL_REWARD = 500; // NVC per level reached, times the level

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
  const xpPerBet = XP_PER_BET * (hub.event?.type === 'HAPPY_HOUR' ? 2 : 1);
  const xpGained = new Map<string, number>();
  const levelUps: { userId: string; level: number; reward: number }[] = [];
  const balances = await db.$transaction(async (tx) => {
    for (const e of entries) {
      if (!Number.isSafeInteger(e.amount)) throw new Error(`non-integer ledger amount ${e.amount}`);
      const amount = BigInt(e.amount);
      const xp = e.kind === 'BET' ? xpPerBet : e.kind === 'CANCEL' ? -xpPerBet : 0;
      xpGained.set(e.userId, (xpGained.get(e.userId) ?? 0) + xp);
      const { count } = await tx.user.updateMany({
        where: { id: e.userId, ...(amount < 0n ? { balance: { gte: -amount } } : {}) },
        data: { balance: { increment: amount }, xp: { increment: xp } },
      });
      if (count === 0) throw new UserError('Nicht genug Guthaben.');
      await tx.ledgerEntry.create({ data: { ...e, amount } });
    }
    const rows = await tx.user.findMany({ where: { id: { in: touched } }, select: { id: true, balance: true, xp: true } });
    // Level-up rewards, booked in the same transaction as the bet that earned the XP.
    for (const r of rows) {
      const gained = xpGained.get(r.id) ?? 0;
      for (let level = levelOf(r.xp - gained) + 1; gained > 0 && level <= levelOf(r.xp); level++) {
        const reward = level * LEVEL_REWARD;
        await tx.user.update({ where: { id: r.id }, data: { balance: { increment: reward } } });
        await tx.ledgerEntry.create({ data: { userId: r.id, amount: BigInt(reward), kind: 'BONUS', note: `Level ${level}` } });
        r.balance += BigInt(reward);
        levelUps.push({ userId: r.id, level, reward });
      }
    }
    return new Map(rows.map((r) => [r.id, Number(r.balance)]));
  });
  balances.forEach((balance, userId) => emitToUser(userId, 'balance', balance));
  for (const l of levelUps) void notify(l.userId, 'Level-Up!', `Level ${l.level} erreicht: +${l.reward.toLocaleString('de-DE')} NVC`).catch(console.error);
  return balances;
}

export async function placeBet(userId: string, amount: number, game: string, min = 1) {
  assertAmount(amount, min);
  await assertWithinLimit(userId, amount);
  await applyLedger([{ userId, amount: -amount, kind: 'BET', game }]);
}

/** Enforces the player's own daily stake limit (bets and poker buy-ins, minus cancelled stakes). */
export async function assertWithinLimit(userId: string, amount: number) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { dailyLimit: true } });
  if (user?.dailyLimit == null) return;
  const { _sum } = await db.ledgerEntry.aggregate({
    where: { userId, createdAt: { gte: startOfDay() }, kind: { in: ['BET', 'CANCEL', 'BUYIN'] } },
    _sum: { amount: true },
  });
  const left = Number(user.dailyLimit) + Number(_sum.amount ?? 0);
  if (amount > left) throw new UserError(`Dein Tageslimit ist erreicht – heute noch ${Math.max(0, left).toLocaleString('de-DE')} NVC möglich.`);
}

/** Credits a payout; 0 is a no-op so callers don't need to branch. */
export async function payout(userId: string, amount: number, game: string, kind: LedgerKind = 'WIN') {
  const coins = Math.floor(amount);
  if (coins <= 0) return;
  await applyLedger([{ userId, amount: coins, kind, game }]);
  // King of the Hill: remember the biggest single win while the event runs.
  if (kind === 'WIN' && hub.event?.type === 'KING' && coins > (hub.king?.win ?? 0)) hub.king = { userId, win: coins };
}

/** Gives back a stake that was never played (cancelled bet, closed table, shutdown). */
export const cancelBet = (userId: string, amount: number, game: string) => payout(userId, amount, game, 'CANCEL');

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
    where: { createdAt: { gte: since }, kind: { in: ['BET', 'WIN', 'CANCEL', 'REFUND', 'BUYIN', 'CASHOUT'] } },
    _sum: { amount: true },
  });
  const top = rows
    .map((r) => ({ userId: r.userId, profit: Number(r._sum.amount ?? 0) }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, take);
  const users = await db.user.findMany({ where: { id: { in: top.map((t) => t.userId) } }, select: { id: true, username: true } });
  return top.map((t) => ({ ...t, username: users.find((u) => u.id === t.userId)?.username ?? '?' }));
}
