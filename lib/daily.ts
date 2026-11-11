import { randomInt } from 'node:crypto';

import { DAILY_SEGMENTS, streakMultiplier } from './games';
import { db, UserError } from './hub';
import { applyLedger, startOfDay } from './wallet';

const KEY = 'faucet'; // same claim key as the old faucet, so existing streaks carry over
const DAY = 86_400_000;
const XP_PER_SPIN = 120;

/** Number of consecutive claimed days ending at `day` (0 if `day` itself is not claimed). */
export function streakEnding(claimDays: number[], day: number) {
  const claimed = new Set(claimDays);
  let n = 0;
  while (claimed.has(day - n * DAY)) n++;
  return n;
}

export function pickSegment(roll = randomInt) {
  let r = roll(DAILY_SEGMENTS.reduce((sum, s) => sum + s.weight, 0));
  return DAILY_SEGMENTS.findIndex((s) => (r -= s.weight) < 0);
}

export async function dailyStatus(userId: string) {
  const today = startOfDay().getTime();
  // shortcut: only the last 60 days are read; the multiplier caps at day 10 anyway.
  const claims = await db.questClaim.findMany({
    where: { userId, questKey: KEY, periodStart: { gte: new Date(today - 60 * DAY) } },
    select: { periodStart: true },
  });
  const days = claims.map((c) => c.periodStart.getTime());
  const claimedToday = days.includes(today);
  const streak = claimedToday ? streakEnding(days, today) : streakEnding(days, today - DAY) + 1;
  return { claimedToday, streak, multiplier: streakMultiplier(streak) };
}

export async function spinDaily(userId: string) {
  // The claim's primary key makes a second spin on the same day fail, even under a race.
  const claimed = await db.questClaim.create({ data: { userId, questKey: KEY, periodStart: startOfDay() } }).catch(() => null);
  if (!claimed) throw new UserError('Heute schon gedreht – morgen wieder!');
  const { streak, multiplier } = await dailyStatus(userId);
  const index = pickSegment();
  const reward = Math.round(DAILY_SEGMENTS[index].value * multiplier);
  await applyLedger([{ userId, amount: reward, kind: 'FAUCET', note: `Daily Spin · Tag ${streak}` }]);
  await db.user.update({ where: { id: userId }, data: { xp: { increment: XP_PER_SPIN } } });
  return { index, reward, streak, multiplier };
}
