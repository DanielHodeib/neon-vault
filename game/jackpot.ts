import { z } from 'zod';

import { systemMessage } from '@/lib/events';
import { UserError } from '@/lib/hub';
import { cancelBet, payout, placeBet } from '@/lib/wallet';
import { JACKPOT_CLOSE_MS, JACKPOT_DRAW_MS, JACKPOT_FEE, JACKPOT_ROUND_MS } from '@/lib/wheel';
import { rand } from './rng';
import { amount, empty, handle, type Register } from './socket';

/** Index whose cumulative range [start, start + total) contains `roll` (0 ≤ roll < sum). */
export function pickWeighted(totals: number[], roll: number) {
  let acc = 0;
  for (let i = 0; i < totals.length; i++) {
    acc += totals[i];
    if (roll < acc) return i;
  }
  return totals.length - 1; // float rounding at the very top
}

type Winner = { userId: string; username: string; win: number; pot: number; chance: number };

const round = {
  id: 0,
  phase: 'open' as 'open' | 'drawing',
  endsAt: null as number | null, // null: waiting for a second player
  players: new Map<string, { username: string; total: number }>(),
  winner: null as Winner | null,
  history: [] as Winner[],
};

const potOf = () => [...round.players.values()].reduce((s, p) => s + p.total, 0);
const closed = () => round.phase !== 'open' || (round.endsAt !== null && round.endsAt - Date.now() < JACKPOT_CLOSE_MS);

const jackpotState = () => {
  const pot = potOf();
  return {
    phase: round.phase,
    endsAt: round.endsAt,
    pot,
    winner: round.winner,
    history: round.history,
    players: [...round.players].map(([userId, p]) => ({ userId, username: p.username, total: p.total, chance: (p.total / pot) * 100 })),
  };
};

export const registerJackpot: Register = (io, socket) => {
  const { user } = socket.data;
  const emit = () => io.to('jackpot').emit('jackpot:state', jackpotState());

  const draw = async () => {
    const entries = [...round.players];
    if (round.phase !== 'open' || !entries.length) return; // refunded on shutdown
    round.phase = 'drawing';
    const pot = potOf();
    const i = pickWeighted(entries.map(([, p]) => p.total), rand() * pot);
    const [userId, p] = entries[i];
    const win = Math.floor(pot * (1 - JACKPOT_FEE));
    round.winner = { userId, username: p.username, win, pot, chance: (p.total / pot) * 100 };
    round.history = [round.winner, ...round.history].slice(0, 10);
    emit();
    io.to('jackpot').emit('jackpot:result', round.winner);
    await payout(userId, win, 'jackpot').catch(console.error);
    if (win >= 50_000) systemMessage(`${p.username} gewinnt den Jackpot: ${win.toLocaleString('de-DE')} NVC!`);
    setTimeout(() => {
      Object.assign(round, { id: round.id + 1, phase: 'open', endsAt: null, players: new Map(), winner: null });
      emit();
    }, JACKPOT_DRAW_MS);
  };

  handle(socket, 'jackpot:join', empty, () => {
    void socket.join('jackpot');
    return { state: jackpotState() };
  });

  handle(
    socket,
    'jackpot:deposit',
    z.object({ amount }),
    async ({ amount }) => {
      if (closed()) throw new UserError('Einzahlungen sind geschlossen.');
      const id = round.id;
      await placeBet(user.id, amount, 'jackpot');
      if (closed() || round.id !== id) {
        // The draw started while we were debiting; give the stake back.
        await cancelBet(user.id, amount, 'jackpot');
        throw new UserError('Einzahlungen sind geschlossen.');
      }
      const p = round.players.get(user.id) ?? { username: user.username, total: 0 };
      p.total += amount;
      round.players.set(user.id, p);
      if (round.endsAt === null && round.players.size >= 2) {
        round.endsAt = Date.now() + JACKPOT_ROUND_MS;
        setTimeout(() => void draw().catch(console.error), JACKPOT_ROUND_MS);
      }
      emit();
    },
    { play: true },
  );
};

/** Shutdown: deposits of a round that has not been drawn yet go back. */
export async function refundJackpot() {
  if (round.phase === 'drawing') return; // winner already being paid
  const players = [...round.players];
  round.players.clear();
  round.phase = 'drawing'; // block deposits still in flight
  for (const [userId, p] of players) await cancelBet(userId, p.total, 'jackpot').catch(console.error);
}
