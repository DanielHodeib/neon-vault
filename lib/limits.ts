// Daily stake limit (self-protection). Stricter limits apply at once; raising or removing one
// only after a cooling-off day, so it can't be switched off in the heat of a losing streak.
export const LIMIT_DELAY_MS = 24 * 3_600_000;

type Limit = { dailyLimit: bigint | null; dailyLimitNext: bigint | null; dailyLimitNextAt: Date | null };

/** The limit in force at `now` (a pending change counts once its time has come). */
export const effectiveLimit = (u: Limit, now = new Date()) => (u.dailyLimitNextAt && u.dailyLimitNextAt <= now ? u.dailyLimitNext : u.dailyLimit);

/** True while a looser limit is waiting for its time. */
export const limitPending = (u: Limit, now = new Date()) => !!u.dailyLimitNextAt && u.dailyLimitNextAt > now;

/** New limit fields after the user asks for `wanted` (null = no limit). */
export function changeLimit(u: Limit, wanted: bigint | null, now = new Date()): Limit {
  const current = effectiveLimit(u, now);
  // Saving the form again with the same pending value must not restart the waiting time.
  if (u.dailyLimitNextAt && u.dailyLimitNextAt > now && wanted === u.dailyLimitNext) return u;
  const stricter = wanted !== null && (current === null || wanted <= current);
  if (stricter || wanted === current) return { dailyLimit: wanted, dailyLimitNext: null, dailyLimitNextAt: null };
  return { dailyLimit: current, dailyLimitNext: wanted, dailyLimitNextAt: new Date(now.getTime() + LIMIT_DELAY_MS) };
}
