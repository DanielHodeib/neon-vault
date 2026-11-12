import type { Server } from 'socket.io';
import { z } from 'zod';

import { systemMessage } from '@/lib/events';
import { UserError } from '@/lib/hub';
import { cancelBet, payout, placeBet } from '@/lib/wallet';
import { WHEEL_BET_MS, WHEEL_BONUS_MS, WHEEL_BONUS_SEGMENTS, WHEEL_BONUS_TRIGGER, WHEEL_MULTIPLIERS, WHEEL_RESULT_MS, WHEEL_SEGMENTS, WHEEL_SPIN_MS } from '@/lib/wheel';
import { randInt } from './rng';
import { amount, empty, handle, type Register } from './socket';

const betSchema = z.object({ multiplier: z.number().refine((m) => WHEEL_MULTIPLIERS.includes(m)), amount });
type WheelBet = z.infer<typeof betSchema>;
type Player = { username: string; bets: WheelBet[] };

const table = {
  phase: 'betting' as 'betting' | 'spinning' | 'bonus' | 'result',
  endsAt: 0,
  index: null as number | null,
  bonusIndex: null as number | null, // segment of the bonus wheel, only after a 30× hit
  players: new Map<string, Player>(),
  history: [] as number[],
};

const wheelState = () => ({
  phase: table.phase,
  endsAt: table.endsAt,
  index: table.phase === 'betting' ? null : table.index,
  bonusIndex: table.phase === 'bonus' || table.phase === 'result' ? table.bonusIndex : null,
  history: table.history,
  players: [...table.players].map(([userId, p]) => ({ userId, username: p.username, bets: p.bets })),
});

export function startWheel(io: Server) {
  const emit = () => io.to('wheel').emit('wheel:state', wheelState());

  const betting = () => {
    Object.assign(table, { phase: 'betting', endsAt: Date.now() + WHEEL_BET_MS, index: null, bonusIndex: null, players: new Map() });
    emit();
    setTimeout(spin, WHEEL_BET_MS);
  };

  const spin = () => {
    Object.assign(table, { phase: 'spinning', endsAt: Date.now() + WHEEL_SPIN_MS, index: randInt(WHEEL_SEGMENTS.length) });
    emit();
    setTimeout(() => (WHEEL_SEGMENTS[table.index!] === WHEEL_BONUS_TRIGGER ? bonus() : settle()), WHEEL_SPIN_MS);
  };

  // Gold hit: the bonus wheel spins for everyone, then the 30× bets are paid with its multiplier.
  const bonus = () => {
    Object.assign(table, { phase: 'bonus', endsAt: Date.now() + WHEEL_BONUS_MS, bonusIndex: randInt(WHEEL_BONUS_SEGMENTS.length) });
    emit();
    setTimeout(settle, WHEEL_BONUS_MS);
  };

  const settle = async () => {
    const m = WHEEL_SEGMENTS[table.index!];
    Object.assign(table, { phase: 'result', endsAt: Date.now() + WHEEL_RESULT_MS, history: [m, ...table.history].slice(0, 20) });
    emit();
    for (const [userId, p] of table.players) {
      const pays = m === WHEEL_BONUS_TRIGGER && table.bonusIndex !== null ? WHEEL_BONUS_SEGMENTS[table.bonusIndex] : m;
      const win = Math.floor(p.bets.reduce((sum, b) => sum + (b.multiplier === m ? b.amount * pays : 0), 0));
      await payout(userId, win, 'wheel').catch(console.error);
      if (win >= 50_000) systemMessage(`${p.username} gewinnt ${win.toLocaleString('de-DE')} NVC am Glücksrad auf ${String(pays).replace('.', ',')}x!`);
    }
    setTimeout(betting, WHEEL_RESULT_MS);
  };

  betting();
}

export const registerWheel: Register = (io, socket) => {
  const { user } = socket.data;

  handle(socket, 'wheel:join', empty, () => {
    void socket.join('wheel');
    return { state: wheelState() };
  });

  handle(
    socket,
    'wheel:bet',
    z.object({ bets: z.array(betSchema).min(1).max(4) }),
    async ({ bets }) => {
      if (table.phase !== 'betting' || table.endsAt - Date.now() < 300) throw new UserError('Einsätze sind geschlossen.');
      const total = bets.reduce((s, b) => s + b.amount, 0);
      await placeBet(user.id, total, 'wheel');
      if (table.phase !== 'betting') {
        // The spin started while we were debiting; give the stake back.
        await cancelBet(user.id, total, 'wheel');
        throw new UserError('Einsätze sind geschlossen.');
      }
      const player: Player = table.players.get(user.id) ?? { username: user.username, bets: [] };
      player.bets.push(...bets);
      table.players.set(user.id, player);
      io.to('wheel').emit('wheel:state', wheelState());
    },
    { play: true },
  );
};

/** Shutdown: bets of a round that has not been settled yet go back. */
export async function refundWheel() {
  if (table.phase === 'result') return; // settlement already paying out
  const players = [...table.players];
  table.players.clear();
  for (const [userId, p] of players) await cancelBet(userId, p.bets.reduce((s, b) => s + b.amount, 0), 'wheel').catch(console.error);
}
