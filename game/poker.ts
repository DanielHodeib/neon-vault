import type { Server } from 'socket.io';
import { z } from 'zod';

import { systemMessage } from '@/lib/events';
import { UserError } from '@/lib/hub';
import { payout, placeBet } from '@/lib/wallet';
import { bestHand, handName, newDeck, rankValue } from './cards';
import { id as newId, rand } from './rng';
import { empty, handle, type Register } from './socket';

const MAX_SEATS = 6;
const SMALL_BLIND = 50;
const BIG_BLIND = 100;
const BOT_STACK = 10_000;
const TURN_MS = 20_000;
const NEXT_HAND_MS = 5_000;
const BOT_NAMES = ['Ace', 'Blitz', 'Cobra', 'Dice', 'Echo'];

type Seat = {
  userId: string | null; // null = bot
  name: string;
  stack: number;
  cards: string[];
  bet: number; // this street
  total: number; // this hand
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  away: boolean; // left mid-hand, cashed out after it
};

type Table = {
  id: string;
  isPrivate: boolean;
  phase: 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
  seats: Seat[];
  board: string[];
  deck: string[];
  button: number;
  toAct: number;
  currentBet: number;
  minRaise: number;
  deadline: number;
  results: { name: string; won: number; hand?: string }[];
  timer?: NodeJS.Timeout;
};

const tables = new Map<string, Table>();
const tableOf = new Map<string, string>();

const inHand = (s: Seat) => !s.folded && s.cards.length > 0;
const canAct = (s: Seat) => inHand(s) && !s.allIn;

/** Splits the pot into side pots by contribution level; returns chips won per seat index. */
export function splitPots(seats: { total: number; folded: boolean; score: number }[]) {
  const won = seats.map(() => 0);
  const levels = [...new Set(seats.map((s) => s.total).filter((t) => t > 0))].sort((a, b) => a - b);
  let prev = 0;
  for (const level of levels) {
    const pot = seats.reduce((sum, s) => sum + Math.max(0, Math.min(s.total, level) - prev), 0);
    const eligible = seats.map((s, i) => ({ ...s, i })).filter((s) => !s.folded && s.total >= level);
    // A level only folded players reached (can't normally happen) goes to the best live hand.
    const contenders = eligible.length ? eligible : seats.map((s, i) => ({ ...s, i })).filter((s) => !s.folded);
    const best = Math.max(...contenders.map((s) => s.score));
    const winners = contenders.filter((s) => s.score === best);
    winners.forEach((w, k) => (won[w.i] += Math.floor(pot / winners.length) + (k < pot % winners.length ? 1 : 0)));
    prev = level;
  }
  return won;
}

const publicView = (t: Table, viewerId: string | null) => ({
  id: t.id,
  isPrivate: t.isPrivate,
  phase: t.phase,
  board: t.board,
  button: t.button,
  toAct: t.phase === 'waiting' || t.phase === 'showdown' ? -1 : t.toAct,
  currentBet: t.currentBet,
  minRaise: t.minRaise,
  deadline: t.deadline,
  pot: t.seats.reduce((s, x) => s + x.total, 0),
  results: t.results,
  seats: t.seats.map((s) => ({
    name: s.name,
    isBot: !s.userId,
    isMe: !!viewerId && s.userId === viewerId,
    stack: s.stack,
    bet: s.bet,
    folded: s.folded,
    allIn: s.allIn,
    cards: s.userId === viewerId || (t.phase === 'showdown' && inHand(s)) ? s.cards : s.cards.map(() => '??'),
  })),
});

export function registerPoker(io: Server): Register {
  const emit = async (t: Table) => {
    for (const socket of await io.in(`poker:${t.id}`).fetchSockets()) socket.emit('poker:state', publicView(t, socket.data.user.id));
  };

  const schedule = (t: Table, ms: number, fn: () => void) => {
    clearTimeout(t.timer);
    t.deadline = Date.now() + ms;
    t.timer = setTimeout(fn, ms);
  };

  const nextSeat = (t: Table, from: number, ok: (s: Seat) => boolean) => {
    for (let k = 1; k <= t.seats.length; k++) {
      const i = (from + k) % t.seats.length;
      if (ok(t.seats[i])) return i;
    }
    return -1;
  };

  const commit = (t: Table, s: Seat, chips: number) => {
    const put = Math.min(chips, s.stack);
    s.stack -= put;
    s.bet += put;
    s.total += put;
    if (s.stack === 0) s.allIn = true;
  };

  const maybeStart = (t: Table) => {
    if (t.phase !== 'waiting') return;
    for (const s of t.seats) if (!s.userId && s.stack < BIG_BLIND) s.stack = BOT_STACK; // bots rebuy
    const ready = t.seats.filter((s) => s.stack > 0 && !s.away);
    if (ready.length >= 2 && ready.some((s) => s.userId)) schedule(t, 2_000, () => startHand(t));
  };

  const startHand = (t: Table) => {
    if (t.phase !== 'waiting') return;
    const players = t.seats.filter((s) => s.stack > 0 && !s.away);
    if (players.length < 2) return;
    t.deck = newDeck();
    t.board = [];
    t.results = [];
    for (const s of t.seats) {
      Object.assign(s, { bet: 0, total: 0, acted: false, allIn: false, folded: s.stack === 0 || s.away });
      s.cards = s.folded ? [] : [t.deck.pop()!, t.deck.pop()!];
    }
    t.button = nextSeat(t, t.button, inHand);
    // Heads-up: the button posts the small blind.
    const sb = players.length === 2 ? t.button : nextSeat(t, t.button, inHand);
    const bb = nextSeat(t, sb, inHand);
    commit(t, t.seats[sb], SMALL_BLIND);
    commit(t, t.seats[bb], BIG_BLIND);
    Object.assign(t, { phase: 'preflop', currentBet: BIG_BLIND, minRaise: BIG_BLIND });
    prompt(t, nextSeat(t, bb, canAct));
  };

  const prompt = (t: Table, seatIndex: number) => {
    t.toAct = seatIndex;
    const seat = t.seats[seatIndex];
    if (!seat.userId) schedule(t, 800 + rand() * 900, () => void act(t, seatIndex, botDecision(t, seat)).catch(console.error));
    else schedule(t, TURN_MS, () => void act(t, seatIndex, { type: seat.bet >= t.currentBet ? 'check' : 'fold' }).catch(console.error));
    void emit(t);
  };

  type Action = { type: 'fold' | 'check' | 'call' | 'allin' } | { type: 'raise'; to: number };

  const act = async (t: Table, seatIndex: number, action: Action) => {
    if (t.toAct !== seatIndex || !['preflop', 'flop', 'turn', 'river'].includes(t.phase)) throw new UserError('Du bist nicht dran.');
    const s = t.seats[seatIndex];
    const toCall = t.currentBet - s.bet;

    if (action.type === 'fold') s.folded = true;
    else if (action.type === 'check') {
      if (toCall > 0) throw new UserError('Check nicht möglich – du musst callen.');
    } else if (action.type === 'call') commit(t, s, toCall);
    else {
      const to = 'to' in action ? action.to : s.bet + s.stack;
      const isFullRaise = to - t.currentBet >= t.minRaise;
      if (to <= t.currentBet && action.type === 'raise') throw new UserError('Raise muss höher als der aktuelle Einsatz sein.');
      if (action.type === 'raise' && (!isFullRaise || to > s.bet + s.stack)) throw new UserError(`Raise mindestens auf ${t.currentBet + t.minRaise}.`);
      commit(t, s, to - s.bet);
      if (s.bet > t.currentBet) {
        if (isFullRaise) {
          t.minRaise = s.bet - t.currentBet;
          for (const o of t.seats) o.acted = false; // everyone must respond to a full raise
        }
        t.currentBet = s.bet;
      }
    }
    s.acted = true;
    advance(t);
  };

  const advance = (t: Table) => {
    const live = t.seats.filter(inHand);
    if (live.length === 1) return finish(t);
    const pending = nextSeat(t, t.toAct, (s) => canAct(s) && (!s.acted || s.bet < t.currentBet));
    if (pending >= 0) return prompt(t, pending);

    // Street over.
    for (const s of t.seats) Object.assign(s, { bet: 0, acted: false });
    t.currentBet = 0;
    t.minRaise = BIG_BLIND;
    const order = ['preflop', 'flop', 'turn', 'river'] as const;
    const next = order.indexOf(t.phase as (typeof order)[number]) + 1;
    if (next === order.length) return finish(t);
    t.phase = order[next];
    t.board.push(...t.deck.splice(-(t.phase === 'flop' ? 3 : 1)));
    // With at most one player able to bet, just run the board out.
    if (t.seats.filter(canAct).length < 2) return advance(t);
    prompt(t, nextSeat(t, t.button, canAct));
  };

  const finish = (t: Table) => {
    while (t.board.length < 5 && t.seats.filter(inHand).length > 1) t.board.push(t.deck.pop()!);
    const scored = t.seats.map((s) => ({ total: s.total, folded: !inHand(s), score: inHand(s) ? bestHand([...s.cards, ...t.board]) : -1 }));
    const won = splitPots(scored);
    const showdown = t.seats.filter(inHand).length > 1;
    t.results = t.seats
      .map((s, i) => ({ name: s.name, won: won[i], hand: showdown && inHand(s) ? handName(scored[i].score) : undefined }))
      .filter((r) => r.won > 0);
    t.seats.forEach((s, i) => (s.stack += won[i]));
    t.phase = 'showdown';
    const big = t.results.find((r) => r.won >= 50_000);
    if (big) systemMessage(`${big.name} gewinnt einen ${big.won.toLocaleString('de-DE')} NVC Pot beim Poker!`);
    void emit(t);
    schedule(t, NEXT_HAND_MS, () => {
      for (const s of t.seats.filter((x) => x.away)) void cashOut(t, s);
      t.phase = 'waiting';
      void emit(t);
      maybeStart(t);
    });
  };

  const botDecision = (t: Table, s: Seat): Action => {
    const toCall = t.currentBet - s.bet;
    const strength = t.board.length
      ? Math.floor(bestHand([...s.cards, ...t.board]) / 16 ** 5) / 4 // pair = 0.25, two pair = 0.5 …
      : (Math.max(...s.cards.map(rankValue)) - 2) / 24 + (s.cards[0][0] === s.cards[1][0] ? 0.4 : 0);
    const r = strength + rand() * 0.3;
    if (r > 0.75 && s.stack > toCall + t.minRaise) return { type: 'raise', to: t.currentBet + t.minRaise };
    if (toCall === 0) return { type: 'check' };
    if (r > 0.35 || toCall <= BIG_BLIND) return { type: 'call' };
    return { type: 'fold' };
  };

  const cashOut = async (t: Table, s: Seat) => {
    t.seats.splice(t.seats.indexOf(s), 1);
    if (s.userId) await payout(s.userId, s.stack, 'poker');
  };

  const leave = async (userId: string) => {
    const t = tables.get(tableOf.get(userId) ?? '');
    tableOf.delete(userId);
    if (!t) return;
    const index = t.seats.findIndex((s) => s.userId === userId);
    if (index < 0) return;
    const seat = t.seats[index];
    if (t.phase === 'waiting') await cashOut(t, seat);
    else {
      // Removing a seat mid-hand would shift every index, so fold and cash out after the hand.
      seat.away = true;
      if (t.toAct === index && canAct(seat)) await act(t, index, { type: 'fold' });
      else seat.folded = true;
    }

    if (!t.seats.some((s) => s.userId && !s.away)) {
      clearTimeout(t.timer);
      for (const s of t.seats) if (s.userId) await cashOut(t, s);
      tables.delete(t.id);
    } else void emit(t);
  };

  return (_io, socket) => {
    const { user } = socket.data;

    const sit = async (t: Table, buyIn: number) => {
      if (tableOf.get(user.id) !== t.id) await leave(user.id);
      if (t.seats.some((s) => s.userId === user.id)) throw new UserError('Du sitzt schon hier.');
      if (t.seats.length >= MAX_SEATS) throw new UserError('Tisch ist voll.');
      await placeBet(user.id, buyIn, 'poker', BIG_BLIND * 10);
      t.seats.push({ userId: user.id, name: user.username, stack: buyIn, cards: [], bet: 0, total: 0, folded: true, allIn: false, acted: false, away: false });
      tableOf.set(user.id, t.id);
      void socket.join(`poker:${t.id}`);
      maybeStart(t);
      void emit(t);
      return { id: t.id };
    };

    const buyIn = z.number().int().min(BIG_BLIND * 10).max(1_000_000);

    handle(socket, 'poker:lobby', empty, () => ({
      tables: [...tables.values()].filter((t) => !t.isPrivate).map((t) => ({ id: t.id, players: t.seats.filter((s) => s.userId).length, seats: t.seats.length })),
    }));

    handle(
      socket,
      'poker:create',
      z.object({ bots: z.number().int().min(0).max(5), isPrivate: z.boolean(), buyIn }),
      ({ bots, isPrivate, buyIn }) => {
        const t: Table = { id: newId(), isPrivate, phase: 'waiting', seats: [], board: [], deck: [], button: 0, toAct: -1, currentBet: 0, minRaise: BIG_BLIND, deadline: 0, results: [] };
        for (let i = 0; i < bots; i++) {
          t.seats.push({ userId: null, name: `🤖 ${BOT_NAMES[i]}`, stack: BOT_STACK, cards: [], bet: 0, total: 0, folded: true, allIn: false, acted: false, away: false });
        }
        tables.set(t.id, t);
        return sit(t, buyIn);
      },
      { play: true },
    );

    handle(
      socket,
      'poker:join',
      z.object({ id: z.string(), buyIn }),
      ({ id, buyIn }) => {
        const t = tables.get(id.trim().toLowerCase());
        if (!t) throw new UserError('Tisch nicht gefunden.');
        return sit(t, buyIn);
      },
      { play: true },
    );

    handle(socket, 'poker:watch', empty, () => {
      const t = tables.get(tableOf.get(user.id) ?? '');
      if (t) void socket.join(`poker:${t.id}`);
      return { state: t ? publicView(t, user.id) : null };
    });

    handle(socket, 'poker:leave', empty, () => leave(user.id));

    handle(
      socket,
      'poker:action',
      z.union([z.object({ type: z.enum(['fold', 'check', 'call', 'allin']) }), z.object({ type: z.literal('raise'), to: z.number().int().positive() })]),
      (action) => {
        const t = tables.get(tableOf.get(user.id) ?? '');
        if (!t) throw new UserError('Du sitzt an keinem Tisch.');
        return act(t, t.seats.findIndex((s) => s.userId === user.id), action);
      },
    );

    socket.on('disconnect', () => {
      setTimeout(() => {
        if (!io.sockets.adapter.rooms.get(`user:${user.id}`)?.size) void leave(user.id).catch(console.error);
      }, 30_000);
    });
  };
}

/** Returns every seated stack to its owner; called on shutdown. */
export async function refundPokerStacks() {
  for (const t of tables.values()) for (const s of t.seats) if (s.userId && s.stack > 0) await payout(s.userId, s.stack, 'poker', 'REFUND');
}
