import { TICKER_MIN } from './games';
import { broadcast, db, hub, type BigWin } from './hub';

// Live ticker of big wins (header strip) and the full-screen moment for huge ones.
const KEEP = 20;
const SPOILER_DELAY_MS = 4_000;

/** Called after every game payout; cheap for small wins (no query). */
export async function announceWin(userId: string, game: string, amount: number) {
  if (amount < TICKER_MIN) return;
  const user = await db.user.findUnique({ where: { id: userId }, select: { username: true } });
  if (!user) return;
  const win: BigWin = { id: `${Date.now()}-${userId}`, username: user.username, game, amount, at: Date.now() };
  // A moment later: the winner's own reels, ball or wheel must not be spoiled by the ticker.
  setTimeout(() => {
    hub.bigWins = [win, ...(hub.bigWins ?? [])].slice(0, KEEP);
    broadcast('bigwin', win);
  }, SPOILER_DELAY_MS).unref();
}

/** Server start: fill the ticker from the journal so it isn't empty after a restart. */
export async function loadBigWins() {
  const rows = await db.ledgerEntry.findMany({
    where: { kind: 'WIN', amount: { gte: TICKER_MIN }, game: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: KEEP,
    select: { id: true, amount: true, game: true, createdAt: true, user: { select: { username: true } } },
  });
  hub.bigWins = rows.map((r) => ({ id: r.id, username: r.user.username, game: r.game!, amount: Number(r.amount), at: r.createdAt.getTime() }));
}
