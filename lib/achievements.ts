import { GAME_NAMES } from './format';

export type PlayerStats = { bets: number; biggestWin: number; level: number; friends: number; gamesPlayed: number };

const ALL_GAMES = Object.keys(GAME_NAMES).length;

/** Badges derived from stats the ledger already has, so there is nothing to store or backfill. */
export const achievements = (s: PlayerStats) => [
  { key: 'first-bet', title: 'Erster Einsatz', description: 'Die erste Runde gespielt.', done: s.bets >= 1 },
  { key: 'bets-100', title: 'Stammgast', description: '100 Einsätze.', done: s.bets >= 100 },
  { key: 'bets-1000', title: 'Dauerbrenner', description: '1.000 Einsätze.', done: s.bets >= 1_000 },
  { key: 'win-10k', title: 'Großer Fang', description: 'Ein Einzelgewinn ab 10.000 NVC.', done: s.biggestWin >= 10_000 },
  { key: 'win-100k', title: 'Volltreffer', description: 'Ein Einzelgewinn ab 100.000 NVC.', done: s.biggestWin >= 100_000 },
  { key: 'level-10', title: 'Aufsteiger', description: 'Level 10 erreicht.', done: s.level >= 10 },
  { key: 'friends-5', title: 'Gesellig', description: '5 Freunde.', done: s.friends >= 5 },
  { key: 'all-games', title: 'Allrounder', description: `Alle ${ALL_GAMES} Spiele ausprobiert.`, done: s.gamesPlayed >= ALL_GAMES },
];
