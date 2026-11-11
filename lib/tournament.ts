import { systemMessage } from './events';
import { db, notify } from './hub';
import { applyLedger, startOfWeek } from './wallet';

// Weekly tournament, derived from the ledger like quests: nothing to count or reset.
// The category rotates every week; the top three get paid once the week is over.
const WEEK = 7 * 86_400_000;
export const TOURNAMENT_PRIZES = [100_000, 50_000, 25_000];
export const WIN_MIN = 200; // "wins" category: only wins of at least this much count

export const TOURNAMENT_KINDS = {
  profit: { label: 'Gewinner der Woche', description: 'Höchster Netto-Gewinn über alle Spiele.', unit: 'NVC Gewinn' },
  volume: { label: 'High-Roller-Woche', description: 'Wer setzt insgesamt am meisten ein?', unit: 'NVC eingesetzt' },
  wins: { label: 'Treffer-Jagd', description: `Die meisten Gewinne ab ${WIN_MIN} NVC.`, unit: 'Gewinne' },
} as const;
export type TournamentKind = keyof typeof TOURNAMENT_KINDS;

const ORDER: TournamentKind[] = ['profit', 'volume', 'wins'];
export const kindOf = (weekStart: Date) => ORDER[Math.round(weekStart.getTime() / WEEK) % ORDER.length];
/** Milliseconds until this week's tournament ends. */
export const msLeftThisWeek = () => startOfWeek().getTime() + WEEK - Date.now();
export const weekKey = (weekStart: Date) => weekStart.toISOString().slice(0, 10);
const prizeNote = (weekStart: Date, place: number) => `Turnier ${weekKey(weekStart)} Platz ${place}`;

/** Ranking of one week (scores > 0 only), best first. */
export async function standings(weekStart: Date, take = 10) {
  const range = { gte: weekStart, lt: new Date(weekStart.getTime() + WEEK) };
  const kind = kindOf(weekStart);
  let scores: { userId: string; score: number }[];
  if (kind === 'wins') {
    const rows = await db.ledgerEntry.groupBy({ by: ['userId'], where: { createdAt: range, kind: 'WIN', amount: { gte: WIN_MIN } }, _count: { _all: true } });
    scores = rows.map((r) => ({ userId: r.userId, score: r._count._all }));
  } else {
    const kinds = kind === 'profit' ? ['BET', 'WIN', 'CANCEL', 'REFUND', 'BUYIN', 'CASHOUT'] : ['BET', 'CANCEL'];
    const rows = await db.ledgerEntry.groupBy({ by: ['userId'], where: { createdAt: range, kind: { in: kinds } }, _sum: { amount: true } });
    const sign = kind === 'profit' ? 1 : -1; // volume: bets are negative entries
    scores = rows.map((r) => ({ userId: r.userId, score: sign * Number(r._sum.amount ?? 0) }));
  }
  const top = scores.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, take);
  const users = await db.user.findMany({ where: { id: { in: top.map((t) => t.userId) } }, select: { id: true, username: true } });
  return top.map((t) => ({ ...t, username: users.find((u) => u.id === t.userId)?.username ?? '?' }));
}

/** Winners of a finished week, read back from the prize bookings. */
export async function paidWinners(weekStart: Date) {
  const rows = await db.ledgerEntry.findMany({
    where: { kind: 'BONUS', note: { startsWith: `Turnier ${weekKey(weekStart)}` } },
    select: { amount: true, note: true, user: { select: { username: true } } },
  });
  return rows.map((r) => ({ username: r.user.username, prize: Number(r.amount), place: Number(r.note!.split(' ').at(-1)) })).sort((a, b) => a.place - b.place);
}

/** Pays last week's top three once. Only the server's scheduler calls this, so it never runs twice at once. */
export async function settleLastWeek(now = new Date()) {
  const last = new Date(startOfWeek(now).getTime() - WEEK);
  if ((await paidWinners(last)).length) return;
  const top = (await standings(last, TOURNAMENT_PRIZES.length));
  if (!top.length) return;
  await applyLedger(top.map((t, i) => ({ userId: t.userId, amount: TOURNAMENT_PRIZES[i], kind: 'BONUS' as const, note: prizeNote(last, i + 1) })));
  const { label } = TOURNAMENT_KINDS[kindOf(last)];
  systemMessage(`🏆 ${label} vorbei! ${top.map((t, i) => `${i + 1}. ${t.username}`).join(' · ')}`);
  await Promise.all(top.map((t, i) => notify(t.userId, 'Turnier', `Platz ${i + 1} in „${label}“: +${TOURNAMENT_PRIZES[i].toLocaleString('de-DE')} NVC`)));
}

export function startTournaments() {
  const run = () => void settleLastWeek().catch((err) => console.error('[tournament]', err));
  run();
  setInterval(run, 10 * 60_000).unref();
}
