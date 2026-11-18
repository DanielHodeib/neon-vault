// Clans: shared limits for the server actions and the page.
export const CLAN_COST = 25_000; // NVC to found one (keeps them from being spammed)
export const CLAN_MAX_MEMBERS = 20;
export const CLAN_NAME = /^[\p{L}\p{N} _.-]{3,20}$/u;
export const CLAN_TAG = /^[A-Z0-9]{2,5}$/;

// ── Levels and perks: a clan levels up with the XP of its members ───────────────────────────────
/** Total member XP needed for level 1…5. */
export const CLAN_LEVEL_XP = [0, 20_000, 60_000, 150_000, 300_000];
export const clanLevel = (xp: number) => CLAN_LEVEL_XP.filter((n) => xp >= n).length;

/** What each level gives (index = level − 1). `goalBonus` raises the weekly goal rewards, `shopDiscount` is on every shop item. */
export const CLAN_PERKS = [
  { maxMembers: 20, goalBonus: 0, shopDiscount: 0 },
  { maxMembers: 20, goalBonus: 0.1, shopDiscount: 0 },
  { maxMembers: 25, goalBonus: 0.1, shopDiscount: 0.05 },
  { maxMembers: 25, goalBonus: 0.2, shopDiscount: 0.05 },
  { maxMembers: 30, goalBonus: 0.3, shopDiscount: 0.1 },
] as const;
export const perksOf = (level: number) => CLAN_PERKS[Math.min(Math.max(level, 1), CLAN_PERKS.length) - 1];

// ── Weekly goals: the clan's stakes (single stakes ≥ 100) this week; every member can claim each reached goal once ──
export const CLAN_GOALS = [
  { tier: 1, volume: 25_000, reward: 300 },
  { tier: 2, volume: 100_000, reward: 1_000 },
  { tier: 3, volume: 400_000, reward: 3_000 },
] as const;
/** A member has to have played themselves (stakes this week) to claim, so joining a finished clan pays nothing. */
export const CLAN_MIN_OWN_VOLUME = 1_000;
export const goalReward = (tier: number, level: number) => Math.floor((CLAN_GOALS.find((g) => g.tier === tier)?.reward ?? 0) * (1 + perksOf(level).goalBonus));
export const shopPrice = (price: number, level: number) => Math.round(price * (1 - perksOf(level).shopDiscount));
