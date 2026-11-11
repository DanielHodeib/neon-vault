import { db, emitToUser, hub, notify, UserError } from './hub';
import { levelOf } from './ranks';

// BET/WIN: a played round. CANCEL: a stake handed back unplayed (undoes the bet's XP and quest
// credit). REFUND: cashback. BUYIN/CASHOUT: poker chips, which are not bets themselves. SHOP: cosmetics.
export type LedgerKind = 'BET' | 'WIN' | 'CANCEL' | 'REFUND' | 'BUYIN' | 'CASHOUT' | 'FAUCET' | 'QUEST' | 'TRANSFER' | 'RAIN' | 'ADMIN' | 'BONUS' | 'SHOP';

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

// Bookings still running. Shutdown waits for them, so a stake debited while the server stops
// is in its game's state (and gets refunded) instead of being lost.
const inflight = new Set<Promise<unknown>>();

export async function settleInflight() {
  await Promise.allSettled([...inflight]);
  await new Promise((r) => setTimeout(r, 50)); // let the callers' code after the await run too
}

/**
 * The only way balances change. All entries apply atomically; a debit that
 * would go below zero aborts everything. Returns the new balances.
 */
export function applyLedger(entries: Entry[]) {
  const booking = book(entries);
  inflight.add(booking);
  booking.finally(() => inflight.delete(booking)).catch(() => {});
  return booking;
}

async function book(entries: Entry[]) {
  const touched = [...new Set(entries.map((e) => e.userId))];
  // Happy Hour adds XP on wins (not bets), so bet-and-cancel can't keep the bonus.
  const happyHour = hub.event?.type === 'HAPPY_HOUR';
  const xpGained = new Map<string, number>();
  const levelUps: { userId: string; level: number; reward: number }[] = [];
  const balances = await db.$transaction(async (tx) => {
    for (const e of entries) {
      if (!Number.isSafeInteger(e.amount)) throw new Error(`non-integer ledger amount ${e.amount}`);
      const amount = BigInt(e.amount);
      const xp = e.kind === 'BET' ? XP_PER_BET : e.kind === 'CANCEL' ? -XP_PER_BET : e.kind === 'WIN' && happyHour ? XP_PER_BET : 0;
      if (amount < 0n && (e.kind === 'BET' || e.kind === 'BUYIN')) await checkLimit(tx, e.userId, -amount);
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
        // Each level pays once, even if cancelled bets push the XP back below it.
        if (await tx.ledgerEntry.findFirst({ where: { userId: r.id, kind: 'BONUS', note: `Level ${level}` }, select: { id: true } })) continue;
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
  await applyLedger([{ userId, amount: -amount, kind: 'BET', game }]);
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * The player's own daily stake limit (bets and poker buy-ins, minus cancelled stakes). Runs inside
 * the debit transaction, so parallel bets can't all slip under it.
 */
async function checkLimit(tx: Tx, userId: string, amount: bigint) {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { dailyLimit: true } });
  if (user?.dailyLimit == null) return;
  const { _sum } = await tx.ledgerEntry.aggregate({
    where: { userId, createdAt: { gte: startOfDay() }, kind: { in: ['BET', 'CANCEL', 'BUYIN'] } },
    _sum: { amount: true },
  });
  const left = user.dailyLimit + (_sum.amount ?? 0n);
  if (amount > left) throw new UserError(`Dein Tageslimit ist erreicht – heute noch ${(left > 0n ? left : 0n).toLocaleString('de-DE')} NVC möglich.`);
}

/** Credits a payout; 0 is a no-op so callers don't need to branch. */
export async function payout(userId: string, amount: number, game: string, kind: LedgerKind = 'WIN') {
  const coins = Math.floor(amount);
  if (coins <= 0) return;
  await applyLedger([{ userId, amount: coins, kind, game }]);
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
