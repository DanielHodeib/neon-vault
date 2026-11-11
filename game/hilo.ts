import { z } from 'zod';

import { systemMessage } from '@/lib/events';
import { UserError } from '@/lib/hub';
import { HILO_MAX, HILO_SKIPS, hiloChance, hiloStep } from '@/lib/solo';
import { cancelBet, payout, placeBet } from '@/lib/wallet';
import { RANKS, rankValue, SUITS } from './cards';
import { randInt } from './rng';
import { amount, empty, handle, type Register } from './socket';

// `paid` is false while the stake is still being debited.
type Round = { bet: number; card: string; multiplier: number; steps: number; skips: number; history: string[]; paid: boolean };

const rounds = new Map<string, Round>();
export const drawCard = () => RANKS[randInt(RANKS.length)] + SUITS[randInt(SUITS.length)];

/** Outcome of one guess; pure so it can be tested. */
export function judge(card: string, next: string, guess: 'higher' | 'lower') {
  const a = rankValue(card);
  const b = rankValue(next);
  return guess === 'higher' ? b >= a : b <= a;
}

const view = (r: Round) => ({ bet: r.bet, card: r.card, multiplier: r.multiplier, steps: r.steps, skips: r.skips, history: r.history });

export const registerHilo: Register = (_io, socket) => {
  const { user } = socket.data;

  const active = () => {
    const round = rounds.get(user.id);
    if (!round?.paid) throw new UserError('Keine laufende Runde.');
    return round;
  };

  handle(socket, 'hilo:state', empty, () => {
    const round = rounds.get(user.id);
    return { round: round?.paid ? view(round) : null };
  });

  handle(
    socket,
    'hilo:start',
    z.object({ amount }),
    async ({ amount }) => {
      if (rounds.has(user.id)) throw new UserError('Du hast schon eine laufende Runde.');
      const card = drawCard();
      const round: Round = { bet: amount, card, multiplier: 1, steps: 0, skips: 0, history: [card], paid: false };
      rounds.set(user.id, round); // reserve before the await
      try {
        await placeBet(user.id, amount, 'hilo');
      } catch (err) {
        rounds.delete(user.id);
        throw err;
      }
      round.paid = true;
      return { round: view(round) };
    },
    { play: true },
  );

  handle(socket, 'hilo:guess', z.object({ guess: z.enum(['higher', 'lower']) }), ({ guess }) => {
    const round = active();
    const chance = hiloChance(rankValue(round.card), guess);
    if (chance >= 1) throw new UserError('Das gewinnt immer – wähle die andere Richtung oder tausche die Karte.');
    const next = drawCard();
    round.history = [...round.history, next].slice(-12);
    if (!judge(round.card, next, guess)) {
      rounds.delete(user.id);
      return { win: false, card: next, round: null };
    }
    round.card = next;
    round.steps++;
    round.multiplier = Math.min(HILO_MAX, Math.floor(round.multiplier * hiloStep(chance) * 100) / 100);
    return { win: true, card: next, round: view(round) };
  });

  handle(socket, 'hilo:skip', empty, () => {
    const round = active();
    if (round.skips >= HILO_SKIPS) throw new UserError('Keine Tausch-Karten mehr.');
    round.skips++;
    round.card = drawCard();
    round.history = [...round.history, round.card].slice(-12);
    return { round: view(round) };
  });

  handle(socket, 'hilo:cashout', empty, async () => {
    const round = active();
    if (!round.steps) throw new UserError('Rate zuerst mindestens einmal richtig.');
    rounds.delete(user.id); // before the await so it can't pay twice
    const win = Math.floor(round.bet * round.multiplier);
    await payout(user.id, win, 'hilo');
    if (win >= 50_000) systemMessage(`${user.username} gewinnt ${win.toLocaleString('de-DE')} NVC bei Hi-Lo (${round.multiplier}×)!`);
    return { payout: win, multiplier: round.multiplier };
  });
};

/** Shutdown: open rounds get their stake back. */
export async function refundHilo() {
  const open = [...rounds.entries()].filter(([, r]) => r.paid);
  rounds.clear();
  for (const [userId, r] of open) await cancelBet(userId, r.bet, 'hilo').catch(console.error);
}
