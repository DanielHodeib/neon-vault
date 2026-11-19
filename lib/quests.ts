import { db, notify, UserError } from './hub';
import { applyLedger, startOfDay, startOfWeek } from './wallet';

// What a quest measures. Progress is always derived from the ledger, so nothing is reset or incremented.
type Metric =
  | { m: 'bets'; games?: string[] } // stakes
  | { m: 'wins'; games?: string[] } // won rounds
  | { m: 'volume' } // NVC staked in total
  | { m: 'maxwin' } // biggest single payout
  | { m: 'games' }; // different games played

type Def = { key: string; title: string; description: string; target: number; reward: number; metric: Metric };
export type Quest = Def & { weekly: boolean };

const ARCADE = ['limbo', 'keno', 'tower', 'baccarat', 'scratch', 'vpoker'];
const d = (key: string, title: string, description: string, target: number, reward: number, metric: Metric): Def => ({ key, title, description, target, reward, metric });

// Each period shows a few quests out of its pool; the choice rotates (see pick()).
export const DAILY_POOL: Def[] = [
  d('d_bets_10', 'Warmspielen', '10 Einsätze ab 100 NVC.', 10, 3_000, { m: 'bets' }),
  d('d_bets_25', 'Dauerbrenner', '25 Einsätze ab 100 NVC.', 25, 5_000, { m: 'bets' }),
  d('d_wins_4', 'Glückssträhne', 'Gewinne 4 Runden (ab 100 NVC).', 4, 3_500, { m: 'wins' }),
  d('d_wins_8', 'Siegesserie', 'Gewinne 8 Runden (ab 100 NVC).', 8, 5_500, { m: 'wins' }),
  d('d_slots_30', 'Slots-Grinder', '30 Slots-Spins ab 100 NVC.', 30, 4_000, { m: 'bets', games: ['slots'] }),
  d('d_slots_wins_3', 'Walzen-Glück', 'Gewinne 3 Slots-Runden.', 3, 3_500, { m: 'wins', games: ['slots'] }),
  d('d_arcade_12', 'Neugierig', '12 Runden in Limbo, Keno, Tower, Baccarat, Rubbellos oder Video Poker.', 12, 4_000, { m: 'bets', games: ARCADE }),
  d('d_crash_5', 'Raketenstart', '5 Einsätze beim Crash.', 5, 3_000, { m: 'bets', games: ['crash'] }),
  d('d_crash_wins_2', 'Rechtzeitig raus', 'Steig 2× beim Crash aus und gewinne.', 2, 3_500, { m: 'wins', games: ['crash'] }),
  d('d_roulette_8', 'Roulette-König', '8 Roulette-Einsätze.', 8, 3_000, { m: 'bets', games: ['roulette'] }),
  d('d_blackjack_6', 'Kartenhai', '6 Blackjack-Hände.', 6, 3_500, { m: 'bets', games: ['blackjack'] }),
  d('d_plinko_15', 'Kugelregen', '15 Plinko-Bälle.', 15, 3_500, { m: 'bets', games: ['plinko'] }),
  d('d_dice_15', 'Würfelwurf', '15 Dice-Würfe.', 15, 3_000, { m: 'bets', games: ['dice'] }),
  d('d_mines_5', 'Minenräumer', '5 Mines-Runden.', 5, 3_000, { m: 'bets', games: ['mines'] }),
  d('d_coinflip_8', 'Kopf oder Zahl', '8 Coinflips.', 8, 3_000, { m: 'bets', games: ['coinflip'] }),
  d('d_hilo_8', 'Höher oder tiefer', '8 Hi-Lo-Runden.', 8, 3_000, { m: 'bets', games: ['hilo'] }),
  d('d_volume_10k', 'Mutiger Einsatz', 'Setze insgesamt 10.000 NVC ein.', 10_000, 4_000, { m: 'volume' }),
  d('d_volume_30k', 'High Roller', 'Setze insgesamt 30.000 NVC ein.', 30_000, 6_000, { m: 'volume' }),
  d('d_maxwin_2k', 'Volltreffer', 'Ein einzelner Gewinn von mindestens 2.000 NVC.', 2_000, 5_000, { m: 'maxwin' }),
  d('d_games_4', 'Abwechslung', 'Spiele 4 verschiedene Spiele (Einsatz ab 100 NVC).', 4, 4_500, { m: 'games' }),
  d('d_games_6', 'Allrounder', 'Spiele 6 verschiedene Spiele (Einsatz ab 100 NVC).', 6, 6_000, { m: 'games' }),
];

export const WEEKLY_POOL: Def[] = [
  d('w_bets_150', 'Vielspieler', '150 Einsätze ab 100 NVC.', 150, 30_000, { m: 'bets' }),
  d('w_bets_300', 'Marathon', '300 Einsätze ab 100 NVC.', 300, 45_000, { m: 'bets' }),
  d('w_wins_35', 'Streak-Hunter', 'Gewinne 35 Runden (ab 100 NVC).', 35, 35_000, { m: 'wins' }),
  d('w_wins_70', 'Unaufhaltsam', 'Gewinne 70 Runden (ab 100 NVC).', 70, 50_000, { m: 'wins' }),
  d('w_slots_180', 'Mega-Reeler', '180 Slots-Spins ab 100 NVC.', 180, 40_000, { m: 'bets', games: ['slots'] }),
  d('w_slots_wins_25', 'Jackpot-Jäger', 'Gewinne 25 Slots-Runden.', 25, 35_000, { m: 'wins', games: ['slots'] }),
  d('w_duels_3', 'Duellmeister', 'Gewinne 3 Duelle in der Arena.', 3, 40_000, { m: 'wins', games: ['duel'] }),
  d('w_markets_3', 'Wettprofi', 'Setze auf 3 Arena-Wetten.', 3, 30_000, { m: 'bets', games: ['market'] }),
  d('w_crash_wins_15', 'Crash-Profi', 'Gewinne 15 Runden beim Crash.', 15, 35_000, { m: 'wins', games: ['crash'] }),
  d('w_arcade_80', 'Arcade-Fan', '80 Arcade-Runden (Limbo, Keno, Tower, Baccarat, Rubbellos, Video Poker).', 80, 40_000, { m: 'bets', games: ARCADE }),
  d('w_volume_200k', 'Großeinsatz', 'Setze insgesamt 200.000 NVC ein.', 200_000, 35_000, { m: 'volume' }),
  d('w_volume_500k', 'Wal', 'Setze insgesamt 500.000 NVC ein.', 500_000, 55_000, { m: 'volume' }),
  d('w_maxwin_20k', 'Der große Wurf', 'Ein einzelner Gewinn von mindestens 20.000 NVC.', 20_000, 45_000, { m: 'maxwin' }),
  d('w_games_10', 'Entdecker', 'Spiele 10 verschiedene Spiele (Einsatz ab 100 NVC).', 10, 40_000, { m: 'games' }),
];

export const DAILY_COUNT = 5;
export const WEEKLY_COUNT = 4;
/** Reward for finishing every quest of the period. */
export const DAILY_BONUS = 5_000;
export const WEEKLY_BONUS = 30_000;
/** All quests ever offered (the economy test adds up the best case). */
export const QUESTS = [...DAILY_POOL.map((q) => ({ ...q, weekly: false })), ...WEEKLY_POOL.map((q) => ({ ...q, weekly: true }))];

/** Only stakes from this size count for quests, so 1-NVC spam can't farm the rewards. */
export const QUEST_MIN_STAKE = 100;

function shuffled<T>(items: T[], seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0; // mulberry32
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The `count` quests of period number `index` (day or week). The pool is shuffled once per cycle and handed out
 * in slices, so a quest doesn't come back before the whole cycle is through, and everyone gets the same ones.
 */
export function pick(pool: Def[], count: number, index: number) {
  const cycleLen = Math.floor(pool.length / count);
  const cycle = Math.floor(index / cycleLen);
  const start = (index % cycleLen) * count;
  return shuffled(pool, cycle * 2654435761).slice(start, start + count);
}

export const dayIndex = (day: Date) => Math.floor(day.getTime() / 86_400_000);
export const weekIndex = (week: Date) => Math.floor(week.getTime() / (7 * 86_400_000));

type Row = { amount: bigint; kind: string; game: string | null; createdAt: Date };

/** Progress of one metric over the ledger rows of a period. Cancelled bets are taken off, so bet-and-cancel can't farm. */
function progressOf(metric: Metric, rows: Row[], since: Date) {
  const inGames = (r: Row) => !('games' in metric) || !metric.games || (r.game !== null && metric.games.includes(r.game));
  const mine = rows.filter((r) => r.createdAt >= since);
  const bets = (r: Row) => r.kind === 'BET' && r.amount <= -BigInt(QUEST_MIN_STAKE);
  const back = (r: Row) => r.kind === 'CANCEL' && r.amount >= BigInt(QUEST_MIN_STAKE);
  switch (metric.m) {
    case 'bets':
      return Math.max(0, mine.filter((r) => inGames(r) && bets(r)).length - mine.filter((r) => inGames(r) && back(r)).length);
    case 'wins':
      // Duels and market wins are paid in any size; for everything else the payout has to be a real one.
      return mine.filter((r) => r.kind === 'WIN' && inGames(r) && (r.game === 'duel' || r.amount >= BigInt(QUEST_MIN_STAKE))).length;
    case 'volume':
      return Math.max(0, mine.filter(bets).reduce((s, r) => s - Number(r.amount), 0) - mine.filter(back).reduce((s, r) => s + Number(r.amount), 0));
    case 'maxwin':
      return mine.filter((r) => r.kind === 'WIN').reduce((m, r) => Math.max(m, Number(r.amount)), 0);
    case 'games':
      return new Set(mine.filter((r) => bets(r) && r.game).map((r) => r.game)).size;
  }
}

/** Today's and this week's quests with progress; each period ends with a bonus for finishing all of them. */
export async function questStatus(userId: string) {
  const day = startOfDay();
  const week = startOfWeek();
  const [rows, claims] = await Promise.all([
    db.ledgerEntry.findMany({ where: { userId, createdAt: { gte: week }, kind: { in: ['BET', 'CANCEL', 'WIN'] } }, select: { amount: true, kind: true, game: true, createdAt: true } }),
    db.questClaim.findMany({ where: { userId, periodStart: { in: [day, week] } } }),
  ]);
  const claimed = (key: string, periodStart: Date) => claims.some((c) => c.questKey === key && c.periodStart.getTime() === periodStart.getTime());
  const period = (defs: Def[], weekly: boolean, bonusKey: string, bonus: number, bonusTitle: string): (Def & { weekly: boolean; progress: number; claimed: boolean; periodStart: Date })[] => {
    const periodStart = weekly ? week : day;
    const list = defs.map((q) => ({ ...q, weekly, progress: Math.min(progressOf(q.metric, rows, periodStart), q.target), claimed: claimed(q.key, periodStart), periodStart }));
    const all = list.filter((q) => q.claimed).length;
    const bonusQuest = { key: bonusKey, title: bonusTitle, description: weekly ? 'Hol alle Wochen-Quests ab.' : 'Hol alle Tages-Quests ab.', target: defs.length, reward: bonus, metric: { m: 'bets' as const }, weekly, progress: all, claimed: claimed(bonusKey, periodStart), periodStart };
    return [...list, bonusQuest];
  };
  return [
    ...period(pick(DAILY_POOL, DAILY_COUNT, dayIndex(day)), false, 'daily_all', DAILY_BONUS, 'Tages-Bonus'),
    ...period(pick(WEEKLY_POOL, WEEKLY_COUNT, weekIndex(week)), true, 'weekly_all', WEEKLY_BONUS, 'Wochen-Bonus'),
  ];
}

export async function claimQuest(userId: string, key: string) {
  const quest = (await questStatus(userId)).find((q) => q.key === key);
  if (!quest) throw new UserError('Unbekannte Quest.');
  if (quest.claimed) throw new UserError('Bereits abgeholt.');
  if (quest.progress < quest.target) throw new UserError('Quest noch nicht erfüllt.');
  // The composite primary key makes a double claim fail even under a race.
  await db.questClaim.create({ data: { userId, questKey: key, periodStart: quest.periodStart } });
  await applyLedger([{ userId, amount: quest.reward, kind: 'QUEST', note: quest.title }]);
  await notify(userId, 'Quest abgeschlossen', `${quest.title}: +${quest.reward} NVC`, { link: '/quests' });
}
