import type { Server } from 'socket.io';
import { z } from 'zod';

import { systemMessage } from '@/lib/events';
import { UserError } from '@/lib/hub';
import { HORSES, RACE_BET_MS, RACE_RESULT_MS, RACE_RUN_MS, raceOdds } from '@/lib/race';
import { cancelBet, payout, placeBet } from '@/lib/wallet';
import { pickWeighted } from './jackpot';
import { rand, randInt } from './rng';
import { amount, empty, handle, type Register } from './socket';

type RaceBet = { horse: number; amount: number };
type Player = { username: string; bets: RaceBet[] };

/** Random field for a round: win chances (sum 1) and the odds paid on each. */
export function newField() {
  const weights = HORSES.map(() => 1 + rand() * 3);
  const sum = weights.reduce((s, w) => s + w, 0);
  return weights.map((w) => ({ chance: w / sum, odds: raceOdds(w / sum) }));
}

/** Finish times: the winner is first, the rest spread out behind it. */
export function finishTimes(winner: number) {
  const times = HORSES.map(() => RACE_RUN_MS * (0.86 + rand() * 0.14));
  times[winner] = RACE_RUN_MS * (0.8 + rand() * 0.04);
  return times.map(Math.round);
}

const table = {
  phase: 'betting' as 'betting' | 'racing' | 'result',
  endsAt: 0,
  field: newField(),
  winner: null as number | null,
  finish: null as number[] | null,
  seeds: HORSES.map(() => randInt(1000)),
  players: new Map<string, Player>(),
  history: [] as number[],
};

const raceState = () => ({
  phase: table.phase,
  endsAt: table.endsAt,
  field: table.field,
  seeds: table.seeds,
  // The finish order is only sent once betting has closed.
  winner: table.phase === 'betting' ? null : table.winner,
  finish: table.phase === 'betting' ? null : table.finish,
  history: table.history,
  players: [...table.players].map(([userId, p]) => ({ userId, username: p.username, bets: p.bets })),
});

export function startRace(io: Server) {
  const emit = () => io.to('race').emit('race:state', raceState());

  const betting = () => {
    Object.assign(table, {
      phase: 'betting',
      endsAt: Date.now() + RACE_BET_MS,
      field: newField(),
      winner: null,
      finish: null,
      seeds: HORSES.map(() => randInt(1000)),
      players: new Map(),
    });
    emit();
    setTimeout(run, RACE_BET_MS);
  };

  const run = () => {
    const winner = pickWeighted(table.field.map((h) => h.chance), rand());
    Object.assign(table, { phase: 'racing', endsAt: Date.now() + RACE_RUN_MS, winner, finish: finishTimes(winner) });
    emit();
    setTimeout(settle, RACE_RUN_MS);
  };

  const settle = async () => {
    const w = table.winner!;
    Object.assign(table, { phase: 'result', endsAt: Date.now() + RACE_RESULT_MS, history: [w, ...table.history].slice(0, 20) });
    emit();
    for (const [userId, p] of table.players) {
      const win = Math.floor(p.bets.reduce((sum, b) => sum + (b.horse === w ? b.amount * table.field[w].odds : 0), 0));
      await payout(userId, win, 'race').catch(console.error);
      if (win >= 50_000) systemMessage(`${p.username} gewinnt ${win.toLocaleString('de-DE')} NVC mit ${HORSES[w].name} beim Rennen!`);
    }
    setTimeout(betting, RACE_RESULT_MS);
  };

  betting();
}

export const registerRace: Register = (io, socket) => {
  const { user } = socket.data;

  handle(socket, 'race:join', empty, () => {
    void socket.join('race');
    return { state: raceState() };
  });

  handle(
    socket,
    'race:bet',
    z.object({ horse: z.number().int().min(0).max(HORSES.length - 1), amount }),
    async ({ horse, amount }) => {
      if (table.phase !== 'betting' || table.endsAt - Date.now() < 300) throw new UserError('Einsätze sind geschlossen.');
      await placeBet(user.id, amount, 'race');
      if (table.phase !== 'betting') {
        // The race started while we were debiting; give the stake back.
        await cancelBet(user.id, amount, 'race');
        throw new UserError('Einsätze sind geschlossen.');
      }
      const player: Player = table.players.get(user.id) ?? { username: user.username, bets: [] };
      player.bets.push({ horse, amount });
      table.players.set(user.id, player);
      io.to('race').emit('race:state', raceState());
    },
    { play: true },
  );
};

/** Shutdown: bets of a race that has not been settled yet go back. */
export async function refundRace() {
  if (table.phase === 'result') return; // settlement already paying out
  const players = [...table.players];
  table.players.clear();
  for (const [userId, p] of players) await cancelBet(userId, p.bets.reduce((s, b) => s + b.amount, 0), 'race').catch(console.error);
}
