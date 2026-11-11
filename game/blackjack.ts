import type { Server } from 'socket.io';
import { z } from 'zod';

import { UserError } from '@/lib/hub';
import { cancelBet, payout, placeBet } from '@/lib/wallet';
import { bjTotal, isBlackjack, newDeck, rankValue } from './cards';
import { id as newId, randInt } from './rng';
import { amount, empty, handle, type Register } from './socket';

const MAX_SEATS = 5;
const BET_WINDOW_MS = 10_000;
const TURN_MS = 20_000;
const RESULT_MS = 5_000;
const INSURANCE_MS = 6_000;
const BOT_NAMES = ['Nova', 'Vex', 'Rook', 'Juno'];

type Hand = { cards: string[]; bet: number; done: boolean; result?: 'blackjack' | 'win' | 'push' | 'lose'; won?: number };
// `pending`: a stake is being debited right now; it is not dealt, refunded or settled until it lands.
type Seat = { userId: string | null; name: string; bet: number; hands: Hand[]; insurance: number; net: number | null; pending?: boolean };
type Table = {
  id: string;
  isPrivate: boolean;
  phase: 'betting' | 'insurance' | 'playing' | 'result';
  seats: Seat[];
  dealer: string[];
  deck: string[];
  turn: { seat: number; hand: number } | null;
  deadline: number;
  timer?: NodeJS.Timeout;
};

const tables = new Map<string, Table>();
const tableOf = new Map<string, string>(); // userId -> tableId

const publicView = (t: Table) => ({
  id: t.id,
  isPrivate: t.isPrivate,
  phase: t.phase,
  deadline: t.deadline,
  turn: t.turn,
  seats: t.seats.map((s) => ({ ...s, isBot: !s.userId, hands: s.hands.map((h) => ({ ...h, total: bjTotal(h.cards), soft: isSoft(h.cards) })) })),
  dealer: hidden(t) ? [t.dealer[0], '??'] : t.dealer,
  dealerTotal: t.dealer.length ? bjTotal(hidden(t) ? [t.dealer[0]] : t.dealer) : null,
});

const hidden = (t: Table) => t.phase === 'playing' || t.phase === 'insurance';
/** An ace still counts as 11 (e.g. "Soft 17"). */
const isSoft = (cards: string[]) => cards.some((c) => c[0] === 'A') && bjTotal(cards) !== cards.reduce((s, c) => s + Math.min(rankValue(c) === 14 ? 1 : rankValue(c), 10), 0);
/** Humans still sitting at this table (left players keep their seat until the round ends). */
const seated = (t: Table) => t.seats.filter((s) => s.userId && tableOf.get(s.userId) === t.id);

const blackjackLobby = () =>
  [...tables.values()].filter((t) => !t.isPrivate).map((t) => ({ id: t.id, players: t.seats.filter((s) => s.userId).length, seats: t.seats.length }));

export function registerBlackjack(io: Server): Register {
  const emit = (t: Table) => io.to(`bj:${t.id}`).emit('bj:state', publicView(t));
  const draw = (t: Table) => (t.deck.length < 20 ? (t.deck = newDeck(6)) : t.deck).pop()!;

  const schedule = (t: Table, ms: number, fn: () => void) => {
    clearTimeout(t.timer);
    t.deadline = Date.now() + ms;
    t.timer = setTimeout(fn, ms);
  };

  const resetRound = (t: Table) => {
    Object.assign(t, { phase: 'betting', dealer: [], turn: null, deadline: 0 });
    t.seats = t.seats.filter((s) => !s.userId || tableOf.get(s.userId) === t.id); // drop players who left
    for (const s of t.seats) Object.assign(s, { bet: 0, hands: [], insurance: 0, net: null });
    clearTimeout(t.timer);
    emit(t);
  };

  const deal = (t: Table) => {
    for (const s of t.seats) if (!s.userId) s.bet = 50 * (1 + randInt(10)); // bots always play
    const playing = t.seats.filter((s) => s.bet > 0 && !s.pending);
    if (!playing.some((s) => s.userId)) return resetRound(t);
    t.phase = 'playing';
    for (const s of playing) s.hands = [{ cards: [draw(t), draw(t)], bet: s.bet, done: false }];
    t.dealer = [draw(t), draw(t)];
    for (const s of playing) if (isBlackjack(s.hands[0].cards)) s.hands[0].done = true;
    if (t.dealer[0][0] === 'A' && playing.some((s) => s.userId)) {
      // Dealer shows an ace: humans may insure before the dealer peeks.
      t.phase = 'insurance';
      schedule(t, INSURANCE_MS, () => peek(t));
      return emit(t);
    }
    peek(t);
  };

  /** Dealer checks the hole card: a dealer blackjack ends the round before anyone doubles or splits. */
  const peek = (t: Table) => {
    t.phase = 'playing';
    if (isBlackjack(t.dealer)) return settle(t);
    nextTurn(t);
  };

  const nextTurn = (t: Table) => {
    for (const [si, s] of t.seats.entries()) {
      const hi = s.hands.findIndex((h) => !h.done);
      if (hi >= 0) {
        t.turn = { seat: si, hand: hi };
        if (!s.userId) return schedule(t, 900, () => botMove(t));
        schedule(t, TURN_MS, () => void act(t, si, 'stand').catch(console.error));
        return emit(t);
      }
    }
    dealerPlay(t);
  };

  const botMove = (t: Table) => {
    const { seat } = t.turn!;
    void act(t, seat, bjTotal(t.seats[seat].hands[t.turn!.hand].cards) < 17 ? 'hit' : 'stand').catch(console.error);
  };

  const dealerPlay = (t: Table) => {
    t.turn = null;
    const anyAlive = t.seats.some((s) => s.hands.some((h) => bjTotal(h.cards) <= 21));
    while (anyAlive && bjTotal(t.dealer) < 17) t.dealer.push(draw(t));
    settle(t);
  };

  const settle = (t: Table) => {
    t.phase = 'result';
    const dealer = bjTotal(t.dealer);
    const dealerBj = isBlackjack(t.dealer);
    for (const s of t.seats) {
      for (const h of s.hands) {
        const total = bjTotal(h.cards);
        const natural = isBlackjack(h.cards) && s.hands.length === 1;
        h.result =
          total > 21 ? 'lose'
          : natural && !dealerBj ? 'blackjack'
          : dealerBj && !natural ? 'lose'
          : dealer > 21 || total > dealer ? 'win'
          : total === dealer ? 'push'
          : 'lose';
        h.won = h.bet * { blackjack: 2.5, win: 2, push: 1, lose: 0 }[h.result];
      }
      const won = s.hands.reduce((sum, h) => sum + (h.won ?? 0), 0) + (dealerBj ? s.insurance * 3 : 0);
      s.net = s.hands.length ? won - s.hands.reduce((sum, h) => sum + h.bet, 0) - s.insurance : null;
      if (s.userId) void payout(s.userId, won, 'blackjack').catch(console.error);
    }
    emit(t);
    schedule(t, RESULT_MS, () => resetRound(t));
  };

  const act = async (t: Table, seatIndex: number, action: 'hit' | 'stand' | 'double' | 'split') => {
    if (t.phase !== 'playing' || t.turn?.seat !== seatIndex) throw new UserError('Du bist nicht dran.');
    const seat = t.seats[seatIndex];
    const hand = seat.hands[t.turn.hand];
    const firstMove = hand.cards.length === 2;

    if (action === 'double' || action === 'split') {
      if (!firstMove) throw new UserError('Nur mit zwei Karten möglich.');
      if (action === 'split' && (seat.hands.length > 1 || Math.min(rankValue(hand.cards[0]), 10) !== Math.min(rankValue(hand.cards[1]), 10))) {
        throw new UserError('Split nur mit zwei gleichwertigen Karten.');
      }
      if (seat.userId) await placeBet(seat.userId, hand.bet, 'blackjack');
      if (t.turn?.seat !== seatIndex) return; // timed out while the bet was being placed
    }

    if (action === 'split') {
      // Split aces get exactly one card each.
      const aces = hand.cards[0][0] === 'A';
      seat.hands = hand.cards.map((c) => ({ cards: [c, draw(t)], bet: hand.bet, done: aces }));
    } else if (action === 'double') {
      hand.bet *= 2;
      hand.cards.push(draw(t));
      hand.done = true;
    } else if (action === 'hit') {
      hand.cards.push(draw(t));
      hand.done = bjTotal(hand.cards) >= 21;
    } else hand.done = true;
    nextTurn(t);
  };

  const leave = (userId: string) => {
    const t = tables.get(tableOf.get(userId) ?? '');
    tableOf.delete(userId);
    if (!t) return;
    io.in(`user:${userId}`).socketsLeave(`bj:${t.id}`); // otherwise the tab jumps back to the table
    const seat = t.seats.find((s) => s.userId === userId);
    if (seat) {
      for (const h of seat.hands) h.done = true; // dealt hands stand and still get paid
      if (t.phase === 'betting') {
        t.seats.splice(t.seats.indexOf(seat), 1);
        if (seat.bet && !seat.pending) void cancelBet(userId, seat.bet, 'blackjack').catch(console.error);
      }
    }
    if (!seated(t).length) {
      clearTimeout(t.timer);
      tables.delete(t.id);
    } else emit(t);
  };

  const join = (socket: Parameters<Register>[1], t: Table) => {
    const { user } = socket.data;
    if (tableOf.get(user.id) !== t.id) leave(user.id);
    if (!t.seats.some((s) => s.userId === user.id)) {
      if (t.seats.length >= MAX_SEATS) throw new UserError('Tisch ist voll.');
      t.seats.push({ userId: user.id, name: user.username, bet: 0, hands: [], insurance: 0, net: null });
    }
    tableOf.set(user.id, t.id);
    void socket.join(`bj:${t.id}`);
    emit(t);
    return { state: publicView(t) };
  };

  return (_io, socket) => {
    const { user } = socket.data;
    const myTable = () => {
      const t = tables.get(tableOf.get(user.id) ?? '');
      if (!t) throw new UserError('Du sitzt an keinem Tisch.');
      return t;
    };

    handle(socket, 'bj:lobby', empty, () => ({ tables: blackjackLobby() }));

    handle(socket, 'bj:create', z.object({ bots: z.number().int().min(0).max(3), isPrivate: z.boolean() }), ({ bots, isPrivate }) => {
      const t: Table = { id: newId(), isPrivate, phase: 'betting', seats: [], dealer: [], deck: newDeck(6), turn: null, deadline: 0 };
      for (let i = 0; i < bots; i++) t.seats.push({ userId: null, name: BOT_NAMES[i], bet: 0, hands: [], insurance: 0, net: null });
      tables.set(t.id, t);
      return join(socket, t);
    });

    handle(socket, 'bj:join', z.object({ id: z.string() }), ({ id }) => {
      const t = tables.get(id.trim().toLowerCase());
      if (!t) throw new UserError('Tisch nicht gefunden.');
      return join(socket, t);
    });

    handle(socket, 'bj:leave', empty, () => leave(user.id));

    handle(
      socket,
      'bj:bet',
      z.object({ amount }),
      async ({ amount }) => {
        const t = myTable();
        const seat = t.seats.find((s) => s.userId === user.id)!;
        if (t.phase !== 'betting' || seat.bet) throw new UserError('Einsatz gerade nicht möglich.');
        Object.assign(seat, { bet: amount, pending: true }); // reserve so a second bet is rejected
        try {
          await placeBet(user.id, amount, 'blackjack');
        } catch (err) {
          seat.bet = 0;
          throw err;
        } finally {
          seat.pending = false;
        }
        // Left the table or missed the deal while the debit ran: hand the stake back.
        if (t.phase !== 'betting' || !t.seats.includes(seat)) {
          seat.bet = 0;
          await cancelBet(user.id, amount, 'blackjack');
          throw new UserError('Die Runde hat schon begonnen – Einsatz zurückgebucht.');
        }
        if (seated(t).every((s) => s.bet)) deal(t);
        else {
          if (!t.deadline) schedule(t, BET_WINDOW_MS, () => deal(t));
          emit(t);
        }
      },
      { play: true },
    );

    handle(socket, 'bj:action', z.object({ action: z.enum(['hit', 'stand', 'double', 'split']) }), ({ action }) => {
      const t = myTable();
      return act(t, t.seats.findIndex((s) => s.userId === user.id), action);
    });

    handle(socket, 'bj:insurance', empty, async () => {
      const t = myTable();
      const seat = t.seats.find((s) => s.userId === user.id);
      if (t.phase !== 'insurance' || !seat?.hands.length || seat.insurance || seat.pending) throw new UserError('Versicherung gerade nicht möglich.');
      const cost = Math.floor(seat.hands[0].bet / 2);
      seat.pending = true;
      try {
        await placeBet(user.id, cost, 'blackjack');
      } finally {
        seat.pending = false;
      }
      // Only count the insurance once it is paid and the window is still open.
      if (t.phase !== 'insurance') {
        await cancelBet(user.id, cost, 'blackjack');
        throw new UserError('Zu spät – Versicherung zurückgebucht.');
      }
      seat.insurance = cost;
      emit(t);
    });

    socket.on('disconnect', () => {
      // Only leave once the user's last socket is gone (multiple tabs).
      setTimeout(() => {
        if (!io.sockets.adapter.rooms.get(`user:${user.id}`)?.size) leave(user.id);
      }, 5_000);
    });
  };
}

/** Shutdown: unsettled stakes (bets, doubles, splits, insurance) go back. */
export async function refundBlackjack() {
  for (const t of tables.values()) {
    clearTimeout(t.timer);
    if (t.phase === 'result') continue;
    for (const s of t.seats) {
      const staked = (s.hands.length ? s.hands.reduce((sum, h) => sum + h.bet, 0) : s.bet) + s.insurance;
      if (s.userId && staked > 0) await cancelBet(s.userId, staked, 'blackjack').catch(console.error);
    }
  }
  tables.clear();
}
