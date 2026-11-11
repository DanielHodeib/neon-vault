import type { Server } from 'socket.io';
import { z } from 'zod';

import { systemMessage } from '@/lib/events';
import { REDS, WHEEL } from '@/lib/games';
import { UserError } from '@/lib/hub';
import { payout, placeBet } from '@/lib/wallet';
import { randInt } from './rng';
import { amount, empty, handle, type Register } from './socket';

const BET_MS = 15_000;
const SPIN_MS = 6_000;
const RESULT_MS = 4_000;


const betSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('number'), value: z.number().int().min(0).max(36), amount }),
  z.object({ type: z.enum(['dozen', 'column']), value: z.number().int().min(1).max(3), amount }),
  z.object({ type: z.enum(['red', 'black', 'even', 'odd', 'low', 'high']), amount }),
]);
export type RouletteBet = z.infer<typeof betSchema>;

/** Total return multiplier (stake included); 0 = lost. */
export function rouletteMultiplier(bet: { type: string; value?: number }, n: number) {
  const v = bet.value ?? 0;
  if (bet.type === 'number') return n === v ? 36 : 0;
  if (n === 0) return 0;
  const hit = {
    red: REDS.has(n),
    black: !REDS.has(n),
    even: n % 2 === 0,
    odd: n % 2 === 1,
    low: n <= 18,
    high: n >= 19,
    dozen: Math.ceil(n / 12) === v,
    column: ((n - 1) % 3) + 1 === v,
  }[bet.type];
  return hit ? (bet.type === 'dozen' || bet.type === 'column' ? 3 : 2) : 0;
}

type Player = { username: string; bets: RouletteBet[] };

const table = {
  phase: 'betting' as 'betting' | 'spinning' | 'result',
  endsAt: 0,
  result: null as number | null,
  players: new Map<string, Player>(),
  history: [] as number[],
};

export const rouletteState = () => ({
  phase: table.phase,
  endsAt: table.endsAt,
  result: table.phase === 'betting' ? null : table.result,
  history: table.history,
  players: [...table.players].map(([userId, p]) => ({ userId, username: p.username, bets: p.bets })),
});

export function startRoulette(io: Server) {
  const emit = () => io.to('roulette').emit('roulette:state', rouletteState());

  const betting = () => {
    Object.assign(table, { phase: 'betting', endsAt: Date.now() + BET_MS, result: null, players: new Map() });
    emit();
    setTimeout(spin, BET_MS);
  };

  const spin = () => {
    Object.assign(table, { phase: 'spinning', endsAt: Date.now() + SPIN_MS, result: WHEEL[randInt(WHEEL.length)] });
    emit();
    setTimeout(settle, SPIN_MS);
  };

  const settle = async () => {
    const n = table.result!;
    Object.assign(table, { phase: 'result', endsAt: Date.now() + RESULT_MS, history: [n, ...table.history].slice(0, 20) });
    emit();
    for (const [userId, p] of table.players) {
      const win = p.bets.reduce((sum, b) => sum + b.amount * rouletteMultiplier(b, n), 0);
      await payout(userId, win, 'roulette').catch(console.error);
      if (win >= 50_000) systemMessage(`${p.username} gewinnt ${win.toLocaleString('de-DE')} NVC beim Roulette auf ${n}!`);
    }
    setTimeout(betting, RESULT_MS);
  };

  betting();
}

export const registerRoulette: Register = (io, socket) => {
  const { user } = socket.data;

  handle(socket, 'roulette:join', empty, () => {
    void socket.join('roulette');
    return { state: rouletteState() };
  });

  handle(
    socket,
    'roulette:bet',
    z.object({ bets: z.array(betSchema).min(1).max(50) }),
    async ({ bets }) => {
      if (table.phase !== 'betting' || table.endsAt - Date.now() < 300) throw new UserError('Einsätze sind geschlossen.');
      const total = bets.reduce((s, b) => s + b.amount, 0);
      await placeBet(user.id, total, 'roulette');
      if (table.phase !== 'betting') {
        // The spin started while we were debiting; give the stake back.
        await payout(user.id, total, 'roulette', 'REFUND');
        throw new UserError('Einsätze sind geschlossen.');
      }
      const player: Player = table.players.get(user.id) ?? { username: user.username, bets: [] };
      player.bets.push(...bets);
      table.players.set(user.id, player);
      io.to('roulette').emit('roulette:state', rouletteState());
    },
    { play: true },
  );
};
