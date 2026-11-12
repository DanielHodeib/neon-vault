// Duels: two players, same game, same number of rounds; the higher total score takes the pot.
// Pure data, shared by game/duel.ts and the arena page.

export type DuelGame = 'slots' | 'plinko' | 'dice' | 'limbo';
export const DUEL_GAMES: Record<DuelGame, { name: string; score: string; icon: string }> = {
  slots: { name: 'Slots', score: 'Summe der Multiplikatoren', icon: '🎰' },
  plinko: { name: 'Plinko', score: 'Summe der Multiplikatoren', icon: '🔻' },
  dice: { name: 'Würfelduell', score: 'Summe der Würfe (0–100)', icon: '🎲' },
  limbo: { name: 'Limbo', score: 'Summe der Ergebnisse (max. 100× pro Runde)', icon: '🚀' },
};
export const DUEL_ROUNDS = [3, 5, 10] as const;
export const DUEL_FEE = 0.05; // the winner gets the pot minus 5 %, like coinflip duels
export const DUEL_MAX_OPEN = 3;
export const DUEL_EXPIRE_MS = 15 * 60_000;

export type DuelRound = { score: number; detail: string };
export type DuelPublic = {
  id: string;
  game: DuelGame;
  setting: string; // slot machine key or plinko risk
  rounds: number;
  stake: number;
  from: { id: string; name: string };
  to: { id: string; name: string } | null; // null = anyone may accept
  createdAt: number;
};
export type DuelResult = DuelPublic & {
  opponent: { id: string; name: string };
  a: DuelRound[]; // challenger
  b: DuelRound[]; // opponent
  winner: string | null; // user id, null = tie (both refunded)
  prize: number;
  at: number;
};

export const duelTotal = (rounds: DuelRound[]) => Math.round(rounds.reduce((s, r) => s + r.score, 0) * 100) / 100;
