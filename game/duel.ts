import { z } from 'zod';

import { DUEL_EXPIRE_MS, DUEL_FEE, DUEL_GAMES, DUEL_MAX_OPEN, DUEL_ROUNDS, duelTotal, type DuelGame, type DuelPublic, type DuelResult, type DuelRound } from '@/lib/duel';
import { systemMessage } from '@/lib/events';
import { db, notify, UserError } from '@/lib/hub';
import { MACHINES } from '@/lib/slots';
import { PLINKO, PLINKO_ROWS, type PlinkoRisk } from '@/lib/solo';
import { cancelBet, payout, placeBet } from '@/lib/wallet';
import { limboResult } from './arcade';
import { id as newId, randInt } from './rng';
import { spin } from './slots';
import { amount, empty, handle, type Register } from './socket';

const open = new Map<string, DuelPublic>();
const creating = new Map<string, number>(); // userId -> duels whose stake is being debited
let recent: DuelResult[] = [];

/** One round of a duel game: a score (higher is better) and a short text for the replay. */
export function playRound(game: DuelGame, setting: string): DuelRound {
  if (game === 'slots') {
    const machine = MACHINES[setting] ?? MACHINES.classic;
    const r = spin(machine);
    const row = r.steps[0].grid.map((col) => col[Math.floor(col.length / 2)]).join('');
    return { score: Math.round(r.multiplier * 100) / 100, detail: row };
  }
  if (game === 'plinko') {
    const slot = Array.from({ length: PLINKO_ROWS }, () => randInt(2)).reduce((a, b) => a + b, 0);
    const m = PLINKO[(setting in PLINKO ? setting : 'medium') as PlinkoRisk][slot];
    return { score: m, detail: `${m}×` };
  }
  if (game === 'dice') {
    const roll = randInt(10_001) / 100;
    return { score: roll, detail: roll.toFixed(2) };
  }
  const r = Math.min(100, limboResult());
  return { score: r, detail: `${r.toFixed(2)}×` };
}

const lobby = () => [...open.values()].sort((a, b) => b.createdAt - a.createdAt);

export const registerDuel: Register = (io, socket) => {
  const { user } = socket.data;
  const emit = () => io.to('arena').emit('duel:lobby', { open: lobby(), recent });

  handle(socket, 'duel:join', empty, () => {
    void socket.join('arena');
    return { open: lobby(), recent };
  });

  handle(
    socket,
    'duel:create',
    z.object({
      game: z.enum(['slots', 'plinko', 'dice', 'limbo']),
      setting: z.string().max(20),
      rounds: z.number().int().refine((n) => (DUEL_ROUNDS as readonly number[]).includes(n)),
      stake: amount,
      to: z.string().trim().max(20).optional(),
    }),
    async ({ game, setting, rounds, stake, to }) => {
      if (game === 'slots' && !Object.hasOwn(MACHINES, setting)) throw new UserError('Unbekannter Automat.');
      if (game === 'plinko' && !Object.hasOwn(PLINKO, setting)) throw new UserError('Unbekanntes Risiko.');
      let target: { id: string; name: string } | null = null;
      if (to) {
        const other = await db.user.findUnique({ where: { username: to.replace(/^@/, '') }, select: { id: true, username: true } });
        if (!other) throw new UserError('Spieler nicht gefunden.');
        if (other.id === user.id) throw new UserError('Du kannst dich nicht selbst herausfordern.');
        target = { id: other.id, name: other.username };
      }
      const pending = creating.get(user.id) ?? 0;
      if (lobby().filter((d) => d.from.id === user.id).length + pending >= DUEL_MAX_OPEN) throw new UserError(`Maximal ${DUEL_MAX_OPEN} offene Duelle.`);
      creating.set(user.id, pending + 1);
      try {
        await placeBet(user.id, stake, 'duel');
      } finally {
        const left = (creating.get(user.id) ?? 1) - 1;
        if (left > 0) creating.set(user.id, left);
        else creating.delete(user.id);
      }
      const duel: DuelPublic = { id: newId(), game, setting: game === 'slots' || game === 'plinko' ? setting : '', rounds, stake, from: { id: user.id, name: user.username }, to: target, createdAt: Date.now() };
      open.set(duel.id, duel);
      // Nobody accepted: the stake goes back.
      setTimeout(() => {
        if (open.delete(duel.id)) {
          void cancelBet(user.id, stake, 'duel').catch(console.error);
          emit();
        }
      }, DUEL_EXPIRE_MS).unref();
      if (target) await notify(target.id, 'Duell-Herausforderung', `${user.username} fordert dich zu ${DUEL_GAMES[game].name} heraus: ${rounds} Runden um ${stake.toLocaleString('de-DE')} NVC.`, { link: '/arena' });
      emit();
      return { id: duel.id };
    },
    { play: true },
  );

  handle(socket, 'duel:cancel', z.object({ id: z.string() }), async ({ id }) => {
    const duel = open.get(id);
    if (!duel || duel.from.id !== user.id) throw new UserError('Duell nicht gefunden.');
    open.delete(id); // before the await so it can't be refunded twice
    emit();
    await cancelBet(user.id, duel.stake, 'duel');
  });

  handle(
    socket,
    'duel:accept',
    z.object({ id: z.string() }),
    async ({ id }) => {
      const duel = open.get(id);
      if (!duel) throw new UserError('Das Duell ist schon weg.');
      if (duel.from.id === user.id) throw new UserError('Du kannst nicht gegen dich selbst spielen.');
      if (duel.to && duel.to.id !== user.id) throw new UserError('Dieses Duell ist für jemand anderen.');
      open.delete(id); // claim it before the await
      try {
        await placeBet(user.id, duel.stake, 'duel');
      } catch (err) {
        open.set(id, duel);
        throw err;
      }
      const a = Array.from({ length: duel.rounds }, () => playRound(duel.game, duel.setting));
      const b = Array.from({ length: duel.rounds }, () => playRound(duel.game, duel.setting));
      const [ta, tb] = [duelTotal(a), duelTotal(b)];
      const winner = ta === tb ? null : ta > tb ? duel.from.id : user.id;
      const prize = winner ? Math.floor(duel.stake * 2 * (1 - DUEL_FEE)) : 0;
      if (winner) await payout(winner, prize, 'duel');
      else {
        await cancelBet(duel.from.id, duel.stake, 'duel');
        await cancelBet(user.id, duel.stake, 'duel');
      }
      const result: DuelResult = { ...duel, opponent: { id: user.id, name: user.username }, a, b, winner, prize, at: Date.now() };
      recent = [result, ...recent].slice(0, 12);
      io.to('arena').emit('duel:result', result);
      emit();
      if (prize >= 50_000) systemMessage(`${winner === duel.from.id ? duel.from.name : user.username} gewinnt ein Duell um ${prize.toLocaleString('de-DE')} NVC!`);
      return { result };
    },
    { play: true },
  );
};

/** Shutdown: open duels give their stake back. */
export async function refundDuels() {
  const list = [...open.values()];
  open.clear();
  for (const d of list) await cancelBet(d.from.id, d.stake, 'duel').catch(console.error);
}

