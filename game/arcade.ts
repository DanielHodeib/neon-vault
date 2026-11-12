import { z } from 'zod';

import {
  KENO_DRAWN,
  KENO_MAX_PICKS,
  KENO_NUMBERS,
  KENO_PAYS,
  SCRATCH_FIELDS,
  SCRATCH_PRIZES,
  TOWER_DOORS,
  TOWER_FLOORS,
  towerMultiplier,
  VIDEO_POKER_PAYS,
  type TowerRisk,
  type VideoPokerHand,
} from '@/lib/arcade';
import { systemMessage } from '@/lib/events';
import { UserError } from '@/lib/hub';
import { cancelBet, payout, placeBet } from '@/lib/wallet';
import { newDeck, rankValue, score5 } from './cards';
import { rand, randInt, shuffle } from './rng';
import { amount, empty, handle, type Register } from './socket';

const shout = (won: number, text: string) => won >= 50_000 && systemMessage(text);

// ── Rubbellos ────────────────────────────────────────────────────────────────────────────────────

/** The prize is drawn first; the card is then laid out to show exactly that (three of the winning symbol). */
export function scratchCard(r = rand()) {
  let acc = 0;
  const prize = SCRATCH_PRIZES.find((p) => (acc += p.chance) > r) ?? null;
  const others = SCRATCH_PRIZES.map((p) => p.symbol).filter((s) => s !== prize?.symbol);
  // Every non-winning symbol at most twice, so no second line of three can appear.
  const filler = shuffle(others.flatMap((s) => [s, s])).slice(0, prize ? SCRATCH_FIELDS - 3 : SCRATCH_FIELDS);
  const fields = shuffle(prize ? [prize.symbol, prize.symbol, prize.symbol, ...filler] : filler);
  return { fields, multiplier: prize?.multiplier ?? 0, symbol: prize?.symbol ?? null };
}

// ── Keno ────────────────────────────────────────────────────────────────────────────────────────

export function kenoResult(picks: number[], drawn: number[]) {
  const hits = picks.filter((n) => drawn.includes(n)).length;
  return { hits, multiplier: KENO_PAYS[picks.length]?.[hits] ?? 0 };
}

// ── Video Poker ─────────────────────────────────────────────────────────────────────────────────

/** Paying hand of five cards (Jacks or Better), or null. */
export function evaluateVideoPoker(cards: string[]): VideoPokerHand | null {
  const score = score5(cards);
  const category = Math.floor(score / 16 ** 5);
  const top = Math.floor(score / 16 ** 4) % 16; // straight high card, or the value of the biggest group
  if (category === 8) return top === 14 ? 'royal' : 'straightFlush';
  const byCategory: Partial<Record<number, VideoPokerHand>> = { 7: 'quads', 6: 'fullHouse', 5: 'flush', 4: 'straight', 3: 'trips', 2: 'twoPair' };
  if (byCategory[category]) return byCategory[category]!;
  if (category === 1 && top >= rankValue('J')) return 'jacks';
  return null;
}
const VP_MULT = Object.fromEntries(VIDEO_POKER_PAYS.map((p) => [p.key, p.multiplier])) as Record<VideoPokerHand, number>;

// ── State of the games with more than one step ───────────────────────────────────────────────────

// `paid` is false while the stake is still being debited.
type Tower = { bet: number; risk: TowerRisk; floor: number; traps: number[]; picks: number[]; paid: boolean };
type Hand = { bet: number; cards: string[]; deck: string[]; paid: boolean };
const towers = new Map<string, Tower>();
const hands = new Map<string, Hand>();

const towerView = (t: Tower) => ({ bet: t.bet, risk: t.risk, floor: t.floor, picks: t.picks, multiplier: towerMultiplier(t.risk, t.floor), next: towerMultiplier(t.risk, t.floor + 1) });

export const registerArcade: Register = (_io, socket) => {
  const { user } = socket.data;

  handle(
    socket,
    'scratch:buy',
    z.object({ amount }),
    async ({ amount }) => {
      await placeBet(user.id, amount, 'scratch');
      const card = scratchCard();
      const won = Math.floor(amount * card.multiplier);
      await payout(user.id, won, 'scratch');
      shout(won, `${user.username} rubbelt ${won.toLocaleString('de-DE')} NVC frei (${card.multiplier}×)!`);
      return { ...card, payout: won };
    },
    { play: true },
  );

  handle(
    socket,
    'keno:play',
    z.object({ amount, picks: z.array(z.number().int().min(1).max(KENO_NUMBERS)).min(1).max(KENO_MAX_PICKS) }),
    async ({ amount, picks }) => {
      if (new Set(picks).size !== picks.length) throw new UserError('Jede Zahl nur einmal.');
      await placeBet(user.id, amount, 'keno');
      const drawn = shuffle(Array.from({ length: KENO_NUMBERS }, (_, i) => i + 1)).slice(0, KENO_DRAWN);
      const { hits, multiplier } = kenoResult(picks, drawn);
      const won = Math.floor(amount * multiplier);
      await payout(user.id, won, 'keno');
      shout(won, `${user.username} trifft ${hits} von ${picks.length} beim Keno: ${won.toLocaleString('de-DE')} NVC!`);
      return { drawn, hits, multiplier, payout: won };
    },
    { play: true },
  );

  // Tower
  const tower = () => {
    const t = towers.get(user.id);
    if (!t?.paid) throw new UserError('Keine laufende Runde.');
    return t;
  };
  const towerCashout = async (t: Tower) => {
    towers.delete(user.id); // before the await so it can't pay twice
    const multiplier = towerMultiplier(t.risk, t.floor);
    const won = Math.floor(t.bet * multiplier);
    await payout(user.id, won, 'tower');
    shout(won, `${user.username} steigt mit ${won.toLocaleString('de-DE')} NVC vom Tower (${multiplier}×)!`);
    return { multiplier, payout: won, traps: t.traps };
  };

  handle(socket, 'tower:state', empty, () => {
    const t = towers.get(user.id);
    return { round: t?.paid ? towerView(t) : null };
  });

  handle(
    socket,
    'tower:start',
    z.object({ amount, risk: z.enum(['easy', 'medium', 'hard']) }),
    async ({ amount, risk }) => {
      if (towers.has(user.id)) throw new UserError('Du hast schon eine laufende Runde.');
      const t: Tower = { bet: amount, risk, floor: 0, traps: Array.from({ length: TOWER_FLOORS }, () => randInt(TOWER_DOORS[risk])), picks: [], paid: false };
      towers.set(user.id, t); // reserve before the await
      try {
        await placeBet(user.id, amount, 'tower');
      } catch (err) {
        towers.delete(user.id);
        throw err;
      }
      t.paid = true;
      return { round: towerView(t) };
    },
    { play: true },
  );

  handle(socket, 'tower:pick', z.object({ door: z.number().int().min(0).max(3) }), async ({ door }) => {
    const t = tower();
    if (door >= TOWER_DOORS[t.risk]) throw new UserError('Diese Tür gibt es nicht.');
    if (t.traps[t.floor] === door) {
      towers.delete(user.id);
      return { trap: true, door, traps: t.traps, payout: 0 };
    }
    t.picks.push(door);
    t.floor++;
    if (t.floor === TOWER_FLOORS) return { trap: false, done: true, ...(await towerCashout(t)) };
    return { trap: false, round: towerView(t) };
  });

  handle(socket, 'tower:cashout', empty, async () => {
    const t = tower();
    if (!t.floor) throw new UserError('Steig zuerst mindestens ein Stockwerk hoch.');
    return towerCashout(t);
  });

  // Video Poker
  handle(socket, 'vpoker:state', empty, () => {
    const h = hands.get(user.id);
    return { hand: h?.paid ? { bet: h.bet, cards: h.cards } : null };
  });

  handle(
    socket,
    'vpoker:deal',
    z.object({ amount }),
    async ({ amount }) => {
      if (hands.has(user.id)) throw new UserError('Zieh zuerst deine offene Hand.');
      const deck = newDeck();
      const h: Hand = { bet: amount, cards: deck.splice(0, 5), deck, paid: false };
      hands.set(user.id, h); // reserve before the await
      try {
        await placeBet(user.id, amount, 'vpoker');
      } catch (err) {
        hands.delete(user.id);
        throw err;
      }
      h.paid = true;
      return { cards: h.cards, hand: evaluateVideoPoker(h.cards) };
    },
    { play: true },
  );

  handle(socket, 'vpoker:draw', z.object({ hold: z.array(z.boolean()).length(5) }), async ({ hold }) => {
    const h = hands.get(user.id);
    if (!h?.paid) throw new UserError('Keine offene Hand.');
    hands.delete(user.id); // before the await so it can't pay twice
    const cards = h.cards.map((c, i) => (hold[i] ? c : h.deck.shift()!));
    const hand = evaluateVideoPoker(cards);
    const multiplier = hand ? VP_MULT[hand] : 0;
    const won = Math.floor(h.bet * multiplier);
    await payout(user.id, won, 'vpoker');
    shout(won, `${user.username} zieht ${VIDEO_POKER_PAYS.find((p) => p.key === hand)?.name} beim Video Poker: ${won.toLocaleString('de-DE')} NVC!`);
    return { cards, hand, multiplier, payout: won };
  });
};

/** Shutdown: open towers and undrawn poker hands get their stake back. */
export async function refundArcade() {
  const open = [...[...towers.entries()].filter(([, t]) => t.paid).map(([u, t]) => [u, t.bet, 'tower'] as const), ...[...hands.entries()].filter(([, h]) => h.paid).map(([u, h]) => [u, h.bet, 'vpoker'] as const)];
  towers.clear();
  hands.clear();
  for (const [userId, bet, game] of open) await cancelBet(userId, bet, game).catch(console.error);
}
