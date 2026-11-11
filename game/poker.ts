import type { Server } from 'socket.io';
import { z } from 'zod';

import { systemMessage } from '@/lib/events';
import { UserError } from '@/lib/hub';
import { applyLedger, assertAmount, assertWithinLimit } from '@/lib/wallet';
import { bestHand, describeHand, handName, newDeck, rankValue } from './cards';
import { id as newId, rand } from './rng';
import { empty, handle, type Register } from './socket';

const MAX_SEATS = 6;
const SMALL_BLIND = 50;
const BIG_BLIND = 100;
const BOT_STACK = 10_000;
const TURN_MS = 20_000;
const NEXT_HAND_MS = 5_000;
const BOT_NAMES = ['Ace', 'Blitz', 'Cobra', 'Dice', 'Echo'];
const LOG_SIZE = 8;

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
  lastAction: string; // shown on the seat, cleared each street
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
  log: string[];
  timer?: NodeJS.Timeout;
};

const tables = new Map<string, Table>();
const tableOf = new Map<string, string>();
const seating = new Set<string>(); // users whose buy-in is in flight

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
  log: t.log,
  seats: t.seats.map((s) => ({
    name: s.name,
    isBot: !s.userId,
    isMe: !!viewerId && s.userId === viewerId && !s.away,
    stack: s.stack,
    bet: s.bet,
    folded: s.folded,
    allIn: s.allIn,
    lastAction: s.lastAction,
    // Only the viewer gets their own hand strength; at showdown everyone sees the live hands.
    hand: s.cards.length && (s.userId === viewerId || (t.phase === 'showdown' && inHand(s))) ? describeHand([...s.cards, ...t.board]) : null,
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

  const say = (t: Table, s: Seat | null, text: string) => {
    if (s) s.lastAction = text;
    t.log = [...t.log, s ? `${s.name}: ${text}` : text].slice(-LOG_SIZE);
  };

  const commit = (t: Table, s: Seat, chips: number) => {
    const put = Math.min(chips, s.stack);
    s.stack -= put;
    s.bet += put;
    s.total += put;
    if (s.stack === 0) s.allIn = true;
  };

  const maybeStart = (t: Table, delay = 2_000) => {
    if (t.phase !== 'waiting') return;
    for (const s of t.seats) if (!s.userId && s.stack < BIG_BLIND) s.stack = BOT_STACK; // bots rebuy
    const ready = t.seats.filter((s) => s.stack > 0 && !s.away);
    if (ready.length >= 2 && ready.some((s) => s.userId)) schedule(t, delay, () => startHand(t));
  };

  const startHand = (t: Table) => {
    if (t.phase !== 'waiting') return;
    const players = t.seats.filter((s) => s.stack > 0 && !s.away);
    if (players.length < 2) return;
    t.deck = newDeck();
    t.board = [];
    t.results = [];
    for (const s of t.seats) {
      Object.assign(s, { bet: 0, total: 0, acted: false, allIn: false, folded: s.stack === 0 || s.away, lastAction: '' });
      s.cards = s.folded ? [] : [t.deck.pop()!, t.deck.pop()!];
    }
    t.button = nextSeat(t, t.button, inHand);
    // Heads-up: the button posts the small blind.
    const sb = players.length === 2 ? t.button : nextSeat(t, t.button, inHand);
    const bb = nextSeat(t, sb, inHand);
    say(t, null, '— Neue Hand —');
    commit(t, t.seats[sb], SMALL_BLIND);
    say(t, t.seats[sb], `Small Blind ${SMALL_BLIND}`);
    commit(t, t.seats[bb], BIG_BLIND);
    say(t, t.seats[bb], `Big Blind ${BIG_BLIND}`);
    Object.assign(t, { phase: 'preflop', currentBet: BIG_BLIND, minRaise: BIG_BLIND, toAct: bb });
    const first = nextSeat(t, bb, canAct);
    if (first < 0) return advance(t); // the blinds put everyone all-in
    prompt(t, first);
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

    if (action.type === 'fold') {
      s.folded = true;
      say(t, s, 'Fold');
    } else if (action.type === 'check') {
      if (toCall > 0) throw new UserError('Check nicht möglich – du musst callen.');
      say(t, s, 'Check');
    } else if (action.type === 'call') {
      commit(t, s, toCall);
      say(t, s, s.allIn ? `All-in (${s.bet})` : toCall > 0 ? `Call ${toCall}` : 'Check');
    } else {
      const to = 'to' in action ? action.to : s.bet + s.stack;
      const isFullRaise = to - t.currentBet >= t.minRaise;
      if (to <= t.currentBet && action.type === 'raise') throw new UserError('Raise muss höher als der aktuelle Einsatz sein.');
      if (action.type === 'raise' && (!isFullRaise || to > s.bet + s.stack)) throw new UserError(`Raise mindestens auf ${t.currentBet + t.minRaise}.`);
      commit(t, s, to - s.bet);
      say(t, s, s.allIn ? `All-in (${s.bet})` : `Raise auf ${s.bet}`);
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
    for (const s of t.seats) if (!s.folded) s.lastAction = '';
    say(t, null, `— ${{ flop: 'Flop', turn: 'Turn', river: 'River' }[t.phase as 'flop' | 'turn' | 'river']} —`);
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
    for (const r of t.results) say(t, null, `${r.name} gewinnt ${r.won.toLocaleString('de-DE')}${r.hand ? ` mit ${r.hand}` : ''}`);
    const big = t.results.find((r) => r.won >= 50_000);
    if (big) systemMessage(`${big.name} gewinnt einen ${big.won.toLocaleString('de-DE')} NVC Pot beim Poker!`);
    void emit(t);
    schedule(t, NEXT_HAND_MS, () => endHand(t));
  };

  /** Clears the finished hand; `delay` until the next one starts. */
  const endHand = (t: Table, delay?: number) => {
    if (t.phase !== 'showdown') return;
    for (const s of t.seats.filter((x) => x.away)) void cashOut(t, s).catch(console.error);
    t.phase = 'waiting';
    void emit(t);
    maybeStart(t, delay);
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
    const index = t.seats.indexOf(s);
    if (index < 0) return;
    t.seats.splice(index, 1);
    const chips = s.stack;
    s.stack = 0; // zero before the await so nothing can pay it twice
    if (s.userId && chips > 0) await applyLedger([{ userId: s.userId, amount: chips, kind: 'CASHOUT', game: 'poker' }]);
  };

  const leave = async (userId: string) => {
    const t = tables.get(tableOf.get(userId) ?? '');
    tableOf.delete(userId);
    if (!t) return;
    const index = t.seats.findIndex((s) => s.userId === userId);
    if (index < 0) return;
    const seat = t.seats[index];
    // Stop this user's browser tabs from receiving the table, or they would jump back in.
    io.in(`user:${userId}`).socketsLeave(`poker:${t.id}`);
    if (t.phase === 'waiting') await cashOut(t, seat);
    else {
      // The seat stays until the hand ends (removing it would shift every index), but it folds now
      // and everything not already in the pot is paid out right away.
      seat.away = true;
      if (t.toAct === index && canAct(seat)) await act(t, index, { type: 'fold' });
      else if (inHand(seat)) {
        seat.folded = true;
        say(t, seat, 'Fold (aufgestanden)');
        if (t.phase !== 'showdown' && t.seats.filter(inHand).length === 1) finish(t);
      }
      const chips = seat.stack;
      seat.stack = 0;
      if (chips > 0) await applyLedger([{ userId, amount: chips, kind: 'CASHOUT', game: 'poker' }]);
    }

    if (!t.seats.some((s) => s.userId && !s.away)) {
      clearTimeout(t.timer);
      for (const s of t.seats.filter((x) => x.userId)) await cashOut(t, s);
      tables.delete(t.id);
    } else void emit(t);
  };

  return (_io, socket) => {
    const { user } = socket.data;

    const sit = async (t: Table, buyIn: number) => {
      // Lock before any await: two parallel joins must not give one user two seats.
      if (seating.has(user.id)) throw new UserError('Einen Moment …');
      seating.add(user.id);
      try {
        if (tableOf.get(user.id) !== t.id) await leave(user.id);
        if (t.seats.some((s) => s.userId === user.id)) throw new UserError('Du sitzt schon hier.');
        if (t.seats.length >= MAX_SEATS) throw new UserError('Tisch ist voll.');
        assertAmount(buyIn, BIG_BLIND * 10);
        await assertWithinLimit(user.id, buyIn);
        await applyLedger([{ userId: user.id, amount: -buyIn, kind: 'BUYIN', game: 'poker' }]);
        t.seats.push({ userId: user.id, name: user.username, stack: buyIn, cards: [], bet: 0, total: 0, folded: true, allIn: false, acted: false, away: false, lastAction: '' });
        tableOf.set(user.id, t.id);
      } finally {
        seating.delete(user.id);
      }
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
        const t: Table = { id: newId(), isPrivate, phase: 'waiting', seats: [], board: [], deck: [], button: 0, toAct: -1, currentBet: 0, minRaise: BIG_BLIND, deadline: 0, results: [], log: [] };
        for (let i = 0; i < bots; i++) {
          t.seats.push({ userId: null, name: BOT_NAMES[i], stack: BOT_STACK, cards: [], bet: 0, total: 0, folded: true, allIn: false, acted: false, away: false, lastAction: '' });
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

    const myTable = () => {
      const t = tables.get(tableOf.get(user.id) ?? '');
      if (!t) throw new UserError('Du sitzt an keinem Tisch.');
      return t;
    };

    handle(socket, 'poker:next', empty, () => {
      const t = myTable();
      if (!['showdown', 'waiting'].includes(t.phase)) throw new UserError('Die Hand läuft noch.');
      if (t.seats.filter((s) => (s.stack > 0 || !s.userId) && !s.away).length < 2) throw new UserError('Mindestens zwei Spieler mit Chips nötig.');
      if (t.phase === 'showdown') endHand(t, 300);
      else maybeStart(t, 300);
    });

    handle(
      socket,
      'poker:rebuy',
      z.object({ buyIn }),
      async ({ buyIn }) => {
        const t = myTable();
        const seat = t.seats.find((s) => s.userId === user.id)!;
        if (['preflop', 'flop', 'turn', 'river'].includes(t.phase) && inHand(seat)) throw new UserError('Nachkaufen geht erst nach der Hand.');
        if (seating.has(user.id)) throw new UserError('Einen Moment …');
        seating.add(user.id);
        try {
          assertAmount(buyIn, BIG_BLIND * 10);
          await assertWithinLimit(user.id, buyIn);
          await applyLedger([{ userId: user.id, amount: -buyIn, kind: 'BUYIN', game: 'poker' }]);
          seat.stack += buyIn;
          say(t, seat, `kauft ${buyIn.toLocaleString('de-DE')} nach`);
        } finally {
          seating.delete(user.id);
        }
        maybeStart(t);
        void emit(t);
      },
      { play: true },
    );

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

/** Shutdown: returns every stack plus chips in an unfinished pot to its owner. */
export async function refundPoker() {
  for (const t of tables.values()) {
    clearTimeout(t.timer);
    const handOpen = t.phase !== 'waiting' && t.phase !== 'showdown';
    for (const s of t.seats) {
      const chips = s.stack + (handOpen ? s.total : 0);
      s.stack = s.total = 0;
      if (s.userId && chips > 0) await applyLedger([{ userId: s.userId, amount: chips, kind: 'CASHOUT', game: 'poker' }]).catch(console.error);
    }
  }
  tables.clear();
}
