'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useCasinoStore } from '../../store/useCasinoStore';

type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
type Stage = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'result';
type SeatAction = 'idle' | 'check' | 'call' | 'raise' | 'fold' | 'all-in' | 'winner' | 'lost';
type BlindRole = 'D' | 'SB' | 'BB' | null;
type BotId = 'bot-1' | 'bot-2' | 'bot-3' | 'bot-4' | 'bot-5';
type SeatId = 'player' | BotId;
type PlayerAction = 'check' | 'call' | 'raise' | 'all-in' | 'fold';

interface Card {
  id: string;
  rank: string;
  value: number;
  suit: Suit;
}

interface Seat {
  id: SeatId;
  name: string;
  isBot: boolean;
  hand: Card[];
  folded: boolean;
  action: SeatAction;
  actionText: string;
  blindRole: BlindRole;
  positionLabel: string;
}

interface RankedHand {
  category: number;
  values: number[];
  label: string;
}

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS = [
  { rank: '2', value: 2 },
  { rank: '3', value: 3 },
  { rank: '4', value: 4 },
  { rank: '5', value: 5 },
  { rank: '6', value: 6 },
  { rank: '7', value: 7 },
  { rank: '8', value: 8 },
  { rank: '9', value: 9 },
  { rank: '10', value: 10 },
  { rank: 'J', value: 11 },
  { rank: 'Q', value: 12 },
  { rank: 'K', value: 13 },
  { rank: 'A', value: 14 },
];

const BOT_NAMES = ['RiverWolf', 'TankPro', 'NitroAce', 'BlueShark', 'StoneFace'];
const TABLE_ORDER: SeatId[] = ['player', 'bot-4', 'bot-5', 'bot-1', 'bot-2', 'bot-3'];
const BETTING_STAGES: Stage[] = ['preflop', 'flop', 'turn', 'river'];

const SEAT_LAYOUT: Array<{ id: SeatId; cls: string }> = [
  { id: 'bot-1', cls: 'top-4 left-1/2 -translate-x-1/2' },
  { id: 'bot-2', cls: 'top-16 right-12' },
  { id: 'bot-3', cls: 'bottom-28 right-8' },
  { id: 'bot-4', cls: 'bottom-28 left-8' },
  { id: 'bot-5', cls: 'top-16 left-12' },
  { id: 'player', cls: 'bottom-4 left-1/2 -translate-x-1/2' },
];

function emptyNumberMap(): Record<SeatId, number> {
  return {
    player: 0,
    'bot-1': 0,
    'bot-2': 0,
    'bot-3': 0,
    'bot-4': 0,
    'bot-5': 0,
  };
}

function emptyBoolMap(): Record<SeatId, boolean> {
  return {
    player: false,
    'bot-1': false,
    'bot-2': false,
    'bot-3': false,
    'bot-4': false,
    'bot-5': false,
  };
}

function stageLabel(stage: Stage) {
  switch (stage) {
    case 'preflop':
      return 'Pre-Flop';
    case 'flop':
      return 'Flop';
    case 'turn':
      return 'Turn';
    case 'river':
      return 'River';
    case 'showdown':
      return 'Showdown';
    case 'result':
      return 'Hand Complete';
    case 'idle':
    default:
      return 'Waiting';
  }
}

function buildPositionLabels(dealerSeatId: SeatId): Record<SeatId, string> {
  const dealerIndex = TABLE_ORDER.findIndex((id) => id === dealerSeatId);
  const labels = ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'];
  const map = {} as Record<SeatId, string>;

  TABLE_ORDER.forEach((id, index) => {
    const relative = (index - dealerIndex + TABLE_ORDER.length) % TABLE_ORDER.length;
    map[id] = labels[relative];
  });

  return map;
}

function seatById(seats: Seat[], id: SeatId) {
  return seats.find((seat) => seat.id === id);
}

function activeSeatIds(seats: Seat[]) {
  return TABLE_ORDER.filter((id) => {
    const seat = seatById(seats, id);
    return !!seat && !seat.folded;
  });
}

function nextActiveSeat(seats: Seat[], fromSeatId: SeatId) {
  const ids = activeSeatIds(seats);
  if (ids.length <= 1) {
    return null;
  }

  const startIndex = TABLE_ORDER.findIndex((id) => id === fromSeatId);
  for (let step = 1; step <= TABLE_ORDER.length; step += 1) {
    const candidate = TABLE_ORDER[(startIndex + step) % TABLE_ORDER.length];
    if (ids.includes(candidate)) {
      return candidate;
    }
  }

  return null;
}

function firstToActPreflop(seats: Seat[], bbSeatId: SeatId) {
  return nextActiveSeat(seats, bbSeatId);
}

function firstToActPostflop(seats: Seat[], dealerSeatId: SeatId) {
  return nextActiveSeat(seats, dealerSeatId);
}

function createDeck(): Card[] {
  const deck = SUITS.flatMap((suit) =>
    RANKS.map(({ rank, value }) => ({
      id: `${rank}-${suit}-${Math.random().toString(36).slice(2, 7)}`,
      rank,
      value,
      suit,
    }))
  );

  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function drawCard(deck: Card[]) {
  const card = deck.pop();
  if (!card) {
    throw new Error('Deck exhausted');
  }
  return card;
}

function getSuitSymbol(suit: Suit) {
  switch (suit) {
    case 'spades':
      return '♠';
    case 'hearts':
      return '♥';
    case 'diamonds':
      return '♦';
    case 'clubs':
    default:
      return '♣';
  }
}

function getSuitTone(suit: Suit) {
  return suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-slate-100';
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) {
    return [[]];
  }
  if (items.length < k) {
    return [];
  }
  if (items.length === k) {
    return [items];
  }

  const [head, ...tail] = items;
  return [
    ...combinations(tail, k - 1).map((combo) => [head, ...combo]),
    ...combinations(tail, k),
  ];
}

function getStraightHigh(values: number[]) {
  const unique = Array.from(new Set(values)).sort((a, b) => b - a);
  if (unique.includes(14)) {
    unique.push(1);
  }

  let streak = 1;
  for (let i = 1; i < unique.length; i += 1) {
    if (unique[i - 1] - unique[i] === 1) {
      streak += 1;
      if (streak >= 5) {
        return unique[i - 4];
      }
    } else {
      streak = 1;
    }
  }

  return null;
}

function evaluateFive(cards: Card[]): RankedHand {
  const values = cards.map((card) => card.value).sort((a, b) => b - a);
  const counts = new Map<number, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));

  const grouped = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) {
      return b[1] - a[1];
    }
    return b[0] - a[0];
  });

  const flush = cards.every((card) => card.suit === cards[0].suit);
  const straightHigh = getStraightHigh(values);

  if (flush && straightHigh) {
    return {
      category: 8,
      values: [straightHigh],
      label: straightHigh === 14 ? 'Royal Flush' : 'Straight Flush',
    };
  }

  if (grouped[0][1] === 4) {
    return {
      category: 7,
      values: [grouped[0][0], grouped.find((group) => group[1] === 1)?.[0] ?? 0],
      label: 'Four of a Kind',
    };
  }

  if (grouped[0][1] === 3 && grouped[1]?.[1] === 2) {
    return {
      category: 6,
      values: [grouped[0][0], grouped[1][0]],
      label: 'Full House',
    };
  }

  if (flush) {
    return {
      category: 5,
      values,
      label: 'Flush',
    };
  }

  if (straightHigh) {
    return {
      category: 4,
      values: [straightHigh],
      label: 'Straight',
    };
  }

  if (grouped[0][1] === 3) {
    return {
      category: 3,
      values: [grouped[0][0], ...grouped.filter((group) => group[1] === 1).map((group) => group[0])],
      label: 'Three of a Kind',
    };
  }

  if (grouped[0][1] === 2 && grouped[1]?.[1] === 2) {
    const pairs = grouped.filter((group) => group[1] === 2).map((group) => group[0]);
    return {
      category: 2,
      values: [Math.max(...pairs), Math.min(...pairs), grouped.find((group) => group[1] === 1)?.[0] ?? 0],
      label: 'Two Pair',
    };
  }

  if (grouped[0][1] === 2) {
    return {
      category: 1,
      values: [grouped[0][0], ...grouped.filter((group) => group[1] === 1).map((group) => group[0])],
      label: 'One Pair',
    };
  }

  return {
    category: 0,
    values,
    label: 'High Card',
  };
}

function compareHands(left: RankedHand, right: RankedHand) {
  if (left.category !== right.category) {
    return left.category - right.category;
  }

  const maxLen = Math.max(left.values.length, right.values.length);
  for (let i = 0; i < maxLen; i += 1) {
    const lv = left.values[i] ?? 0;
    const rv = right.values[i] ?? 0;
    if (lv !== rv) {
      return lv - rv;
    }
  }

  return 0;
}

function bestHand(cards: Card[]): RankedHand {
  return combinations(cards, 5).reduce<RankedHand | null>((best, combo) => {
    const current = evaluateFive(combo);
    if (!best || compareHands(current, best) > 0) {
      return current;
    }
    return best;
  }, null) ?? { category: 0, values: [0], label: 'High Card' };
}

function estimatePreflop(cards: Card[]) {
  const [a, b] = cards;
  const high = Math.max(a.value, b.value);
  const low = Math.min(a.value, b.value);

  let score = (high + low) / 30;
  if (a.value === b.value) {
    score += 0.24;
  }
  if (a.suit === b.suit) {
    score += 0.08;
  }
  if (Math.abs(a.value - b.value) <= 2) {
    score += 0.06;
  }

  return Math.min(1, score);
}

function estimatePostflop(hand: Card[], board: Card[]) {
  const ranked = bestHand([...hand, ...board]);
  const main = ranked.category / 8;
  const kicker = (ranked.values[0] ?? 0) / 14;
  return Math.min(1, main * 0.84 + kicker * 0.16 + 0.06);
}

function holeCardsLabel(cards: Card[]) {
  if (cards.length < 2) {
    return 'No cards';
  }

  const [a, b] = cards;
  if (a.value === b.value) {
    return `Pocket ${a.rank}s`;
  }

  const high = a.value >= b.value ? a : b;
  const low = a.value >= b.value ? b : a;
  const suited = a.suit === b.suit ? ' suited' : '';
  return `${high.rank}-${low.rank}${suited}`;
}

export default function PokerGame() {
  const { balance, placeBet, addWin } = useCasinoStore();
  const pendingBetSyncRef = useRef(0);
  const pendingWinSyncRef = useRef(0);

  const [stage, setStage] = useState<Stage>('idle');
  const [tableSeats, setTableSeats] = useState<Seat[]>([]);
  const [deck, setDeck] = useState<Card[]>([]);
  const [board, setBoard] = useState<Card[]>([]);
  const [pot, setPot] = useState(0);
  const [bigBlindInput, setBigBlindInput] = useState(100);
  const [smallBlind, setSmallBlind] = useState(50);
  const [bigBlind, setBigBlind] = useState(100);
  const [currentBet, setCurrentBet] = useState(0);
  const [streetContrib, setStreetContrib] = useState<Record<SeatId, number>>(emptyNumberMap());
  const [actedThisStreet, setActedThisStreet] = useState<Record<SeatId, boolean>>(emptyBoolMap());
  const [raiseBy, setRaiseBy] = useState(120);
  const [currentTurn, setCurrentTurn] = useState<SeatId | null>(null);
  const [status, setStatus] = useState('Click New Hand to deal cards.');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [dealerIndex, setDealerIndex] = useState(0);
  const [showdownLabels, setShowdownLabels] = useState<Record<string, string>>({});

  const player = seatById(tableSeats, 'player');
  const toCall = Math.max(0, currentBet - streetContrib.player);

  const canAct =
    BETTING_STAGES.includes(stage) &&
    currentTurn === 'player' &&
    !!player &&
    !player.folded;

  const dealerSeatId = TABLE_ORDER[dealerIndex % TABLE_ORDER.length];
  const sbSeatId = TABLE_ORDER[(dealerIndex + 1) % TABLE_ORDER.length];
  const bbSeatId = TABLE_ORDER[(dealerIndex + 2) % TABLE_ORDER.length];

  const playerRead = useMemo(() => {
    if (!player) {
      return 'No hand';
    }

    if (board.length >= 3) {
      return bestHand([...player.hand, ...board]).label;
    }

    return holeCardsLabel(player.hand);
  }, [player, board]);

  const clearErrorSoon = () => {
    window.setTimeout(() => setError(''), 2200);
  };

  const syncWalletForHand = useCallback(async () => {
    pendingBetSyncRef.current = 0;
    pendingWinSyncRef.current = 0;
  }, []);

  const applyPlayerBet = useCallback((amount: number) => {
    const safeAmount = Math.max(0, Math.floor(amount));
    if (safeAmount <= 0) {
      return true;
    }

    if (!placeBet(safeAmount)) {
      return false;
    }

    pendingBetSyncRef.current += safeAmount;
    return true;
  }, [placeBet]);

  const applyPlayerWin = useCallback((amount: number) => {
    const safeAmount = Math.max(0, Math.floor(amount));
    if (safeAmount <= 0) {
      return;
    }

    addWin(safeAmount);
    pendingWinSyncRef.current += safeAmount;
  }, [addWin]);

  const startHand = () => {
    const bb = Math.max(40, Math.floor(bigBlindInput));
    const sb = Math.max(20, Math.floor(bb / 2));
    const playerForcedBlind = sbSeatId === 'player' ? sb : bbSeatId === 'player' ? bb : 0;

    pendingBetSyncRef.current = 0;
    pendingWinSyncRef.current = 0;

    if (playerForcedBlind > 0 && !applyPlayerBet(playerForcedBlind)) {
      setError('Not enough funds to post blind.');
      clearErrorSoon();
      return;
    }

    const nextDeck = createDeck();
    const positionMap = buildPositionLabels(dealerSeatId);

    const baseSeats: Seat[] = [
      {
        id: 'player',
        name: 'You',
        isBot: false,
        hand: [drawCard(nextDeck), drawCard(nextDeck)],
        folded: false,
        action: 'idle',
        actionText: 'waiting',
        blindRole: null,
        positionLabel: positionMap.player,
      },
      ...BOT_NAMES.map<Seat>((name, index) => {
        const botId = `bot-${index + 1}` as BotId;
        return {
          id: botId,
          name,
          isBot: true,
          hand: [drawCard(nextDeck), drawCard(nextDeck)],
          folded: false,
          action: 'idle',
          actionText: 'waiting',
          blindRole: null,
          positionLabel: positionMap[botId],
        };
      }),
    ];

    const seats: Seat[] = baseSeats.map((seat): Seat => {
      let blindRole: BlindRole = null;
      if (seat.id === dealerSeatId) {
        blindRole = 'D';
      }
      if (seat.id === sbSeatId) {
        blindRole = 'SB';
      }
      if (seat.id === bbSeatId) {
        blindRole = 'BB';
      }

      return {
        ...seat,
        blindRole,
        actionText:
          blindRole === 'SB'
            ? `posts ${sb}`
            : blindRole === 'BB'
              ? `posts ${bb}`
              : 'waiting',
      };
    });

    const contrib = emptyNumberMap();
    contrib[sbSeatId] = sb;
    contrib[bbSeatId] = bb;

    const acted = emptyBoolMap();
    const firstActor = firstToActPreflop(seats, bbSeatId);

    if (firstActor === 'player') {
      const playerSeat = seatById(seats, 'player');
      if (playerSeat) {
        playerSeat.actionText = 'to act';
      }
    }

    setDeck(nextDeck);
    setTableSeats(seats);
    setBoard([]);
    setStage('preflop');
    setSmallBlind(sb);
    setBigBlind(bb);
    setPot(sb + bb);
    setCurrentBet(bb);
    setStreetContrib(contrib);
    setActedThisStreet(acted);
    setRaiseBy(Math.max(80, bb));
    setCurrentTurn(firstActor);
    setShowdownLabels({});
    setStatus(`Dealer: ${seatById(seats, dealerSeatId)?.name ?? 'Seat'} | ${firstActor ? `${seatById(seats, firstActor)?.name ?? 'Seat'} to act` : 'Waiting'}`);
    setResult('');
    setError('');
    setDealerIndex((current) => (current + 1) % TABLE_ORDER.length);
  };

  const resolveShowdown = useCallback((
    seatsAtShowdown: Seat[],
    boardAtShowdown: Card[],
    potAtShowdown: number,
    deckAtShowdown: Card[],
    contribAtShowdown: Record<SeatId, number>,
    actedAtShowdown: Record<SeatId, boolean>,
    currentBetAtShowdown: number
  ) => {
    const contenders = seatsAtShowdown.filter((seat) => !seat.folded);

    const ranked = contenders.map((seat) => ({
      seat,
      rankedHand: bestHand([...seat.hand, ...boardAtShowdown]),
    }));

    let best = ranked[0];
    let winners = ranked[0] ? [ranked[0]] : [];

    ranked.slice(1).forEach((entry) => {
      const cmp = compareHands(entry.rankedHand, best.rankedHand);
      if (cmp > 0) {
        best = entry;
        winners = [entry];
      } else if (cmp === 0) {
        winners.push(entry);
      }
    });

    const labels: Record<string, string> = {};
    ranked.forEach((entry) => {
      labels[entry.seat.id] = entry.rankedHand.label;
    });

    const winnerIds = new Set(winners.map((entry) => entry.seat.id));
    const playerWins = winnerIds.has('player');
    const playerShare = playerWins ? Math.floor(potAtShowdown / winners.length) : 0;

    if (playerShare > 0) {
      applyPlayerWin(playerShare);
    }

    const nextSeats = seatsAtShowdown.map((seat): Seat => {
      if (winnerIds.has(seat.id)) {
        return {
          ...seat,
          action: 'winner',
          actionText: winners.length > 1 ? 'split pot' : 'winner',
        };
      }

      return {
        ...seat,
        action: seat.folded ? 'fold' : 'lost',
        actionText: seat.folded ? 'folded' : 'lost',
      };
    });

    setShowdownLabels(labels);
    setTableSeats(nextSeats);
    setBoard(boardAtShowdown);
    setDeck(deckAtShowdown);
    setPot(potAtShowdown);
    setStreetContrib(contribAtShowdown);
    setActedThisStreet(actedAtShowdown);
    setCurrentBet(currentBetAtShowdown);
    setCurrentTurn(null);
    setStage('result');
    setStatus('Showdown complete.');
    setResult(
      playerShare > 0
        ? `Showdown won with ${best.rankedHand.label}. You get ${playerShare.toFixed(2)} NVC.`
        : `${best.seat.name} wins with ${best.rankedHand.label}.`
    );
    void syncWalletForHand();
  }, [applyPlayerWin, syncWalletForHand]);

  const settleAfterAction = useCallback((
    nextSeats: Seat[],
    nextDeck: Card[],
    nextBoard: Card[],
    nextPot: number,
    nextContrib: Record<SeatId, number>,
    nextActed: Record<SeatId, boolean>,
    nextCurrentBet: number,
    actingSeatId: SeatId
  ) => {
    const aliveIds = activeSeatIds(nextSeats);

    if (!aliveIds.includes('player')) {
      setTableSeats(nextSeats);
      setDeck(nextDeck);
      setBoard(nextBoard);
      setPot(nextPot);
      setStreetContrib(nextContrib);
      setActedThisStreet(nextActed);
      setCurrentBet(nextCurrentBet);
      setCurrentTurn(null);
      setStage('result');
      setStatus('You are out of this hand.');
      setResult('Hand lost.');
      void syncWalletForHand();
      return;
    }

    if (aliveIds.length === 1) {
      const winner = aliveIds[0];
      if (winner === 'player') {
        applyPlayerWin(nextPot);
      }

      const finalSeats = nextSeats.map((seat): Seat => {
        if (seat.id === winner) {
          return {
            ...seat,
            action: 'winner',
            actionText: 'wins pot',
          };
        }

        return {
          ...seat,
          action: seat.folded ? 'fold' : 'lost',
          actionText: seat.folded ? 'folded' : 'lost',
        };
      });

      setTableSeats(finalSeats);
      setDeck(nextDeck);
      setBoard(nextBoard);
      setPot(nextPot);
      setStreetContrib(nextContrib);
      setActedThisStreet(nextActed);
      setCurrentBet(nextCurrentBet);
      setCurrentTurn(null);
      setStage('result');
      setStatus('Hand complete.');
      setResult(winner === 'player' ? `All opponents folded. You win ${nextPot.toFixed(2)} NVC.` : `${seatById(finalSeats, winner)?.name ?? 'Opponent'} wins.`);
      void syncWalletForHand();
      return;
    }

    const streetComplete = aliveIds.every((id) => nextActed[id] && nextContrib[id] === nextCurrentBet);

    if (streetComplete) {
      if (stage === 'river') {
        resolveShowdown(nextSeats, nextBoard, nextPot, nextDeck, nextContrib, nextActed, nextCurrentBet);
        return;
      }

      const nextStage: Stage =
        stage === 'preflop'
          ? 'flop'
          : stage === 'flop'
            ? 'turn'
            : 'river';

      const revealCount = nextStage === 'flop' ? 3 : 1;
      const updatedDeck = [...nextDeck];
      const updatedBoard = [...nextBoard];
      for (let i = 0; i < revealCount; i += 1) {
        updatedBoard.push(drawCard(updatedDeck));
      }

      const resetContrib = emptyNumberMap();
      const resetActed = emptyBoolMap();
      const firstActor = firstToActPostflop(nextSeats, dealerSeatId);
      const nextSeatsReset = nextSeats.map((seat): Seat =>
        seat.folded
          ? seat
          : {
              ...seat,
              action: 'idle',
              actionText: firstActor === seat.id ? 'to act' : 'waiting',
            }
      );

      setTableSeats(nextSeatsReset);
      setDeck(updatedDeck);
      setBoard(updatedBoard);
      setPot(nextPot);
      setStage(nextStage);
      setStreetContrib(resetContrib);
      setActedThisStreet(resetActed);
      setCurrentBet(0);
      setCurrentTurn(firstActor);
      setStatus(`${stageLabel(nextStage)} | ${firstActor ? `${seatById(nextSeatsReset, firstActor)?.name ?? 'Seat'} to act` : 'Waiting'}`);
      return;
    }

    const nextTurn = nextActiveSeat(nextSeats, actingSeatId);
    const updatedSeats = nextSeats.map((seat): Seat =>
      seat.folded
        ? seat
        : {
            ...seat,
            actionText: nextTurn === seat.id ? 'to act' : seat.actionText,
          }
    );

    setTableSeats(updatedSeats);
    setDeck(nextDeck);
    setBoard(nextBoard);
    setPot(nextPot);
    setStreetContrib(nextContrib);
    setActedThisStreet(nextActed);
    setCurrentBet(nextCurrentBet);
    setCurrentTurn(nextTurn);
    setStatus(nextTurn ? `${seatById(updatedSeats, nextTurn)?.name ?? 'Seat'} to act` : 'Waiting');
  }, [applyPlayerWin, dealerSeatId, resolveShowdown, stage, syncWalletForHand]);

  const executeAction = useCallback((seatId: SeatId, action: PlayerAction, customRaiseTo?: number) => {
    if (!BETTING_STAGES.includes(stage)) {
      return;
    }
    const actingSeat = seatById(tableSeats, seatId);
    if (!actingSeat || actingSeat.folded) {
      return;
    }

    const nextSeats = [...tableSeats];
    const nextDeck = [...deck];
    const nextBoard = [...board];
    const nextContrib = { ...streetContrib };
    const nextActed = { ...actedThisStreet };
    let nextPot = pot;
    let nextCurrentBet = currentBet;

    const seatIndex = nextSeats.findIndex((seat) => seat.id === seatId);
    if (seatIndex === -1) {
      return;
    }

    const seat = nextSeats[seatIndex];
    const callAmount = Math.max(0, nextCurrentBet - nextContrib[seatId]);

    const setSeatAction = (nextAction: SeatAction, text: string, folded = false) => {
      nextSeats[seatIndex] = {
        ...seat,
        action: nextAction,
        actionText: text,
        folded,
      };
    };

    if (action === 'fold') {
      setSeatAction('fold', 'folded', true);
      nextActed[seatId] = true;
      settleAfterAction(nextSeats, nextDeck, nextBoard, nextPot, nextContrib, nextActed, nextCurrentBet, seatId);
      return;
    }

    if (action === 'check') {
      if (callAmount > 0) {
        if (seatId === 'player') {
          setError('Cannot check. Call, raise or fold.');
          clearErrorSoon();
        }
        return;
      }

      setSeatAction('check', 'check');
      nextActed[seatId] = true;
      settleAfterAction(nextSeats, nextDeck, nextBoard, nextPot, nextContrib, nextActed, nextCurrentBet, seatId);
      return;
    }

    if (action === 'call') {
      const payment = callAmount;

      if (seatId === 'player' && payment > 0 && !applyPlayerBet(payment)) {
        setError('Not enough funds to call.');
        clearErrorSoon();
        return;
      }

      nextPot += payment;
      nextContrib[seatId] += payment;
      setSeatAction('call', payment > 0 ? `call ${payment}` : 'check');
      nextActed[seatId] = true;
      settleAfterAction(nextSeats, nextDeck, nextBoard, nextPot, nextContrib, nextActed, nextCurrentBet, seatId);
      return;
    }

    if (action === 'raise' || action === 'all-in') {
      const minRaise = Math.max(bigBlind, raiseBy);
      const raiseTarget =
        action === 'all-in'
          ? nextCurrentBet + Math.max(minRaise * 3, Math.floor(bigBlind * 6))
          : customRaiseTo ?? (nextCurrentBet + minRaise);

      const targetBet = Math.max(nextCurrentBet + minRaise, raiseTarget);
      const payment = Math.max(0, targetBet - nextContrib[seatId]);

      if (seatId === 'player' && payment > 0 && !applyPlayerBet(payment)) {
        setError(`Not enough funds to ${action}.`);
        clearErrorSoon();
        return;
      }

      nextPot += payment;
      nextContrib[seatId] += payment;
      nextCurrentBet = targetBet;

      const alive = activeSeatIds(nextSeats);
      alive.forEach((id) => {
        nextActed[id] = false;
      });
      nextActed[seatId] = true;

      if (action === 'all-in') {
        setSeatAction('all-in', `all-in ${targetBet}`);
      } else {
        setSeatAction('raise', `raise to ${targetBet}`);
      }

      settleAfterAction(nextSeats, nextDeck, nextBoard, nextPot, nextContrib, nextActed, nextCurrentBet, seatId);
    }
  }, [
    actedThisStreet,
    bigBlind,
    board,
    currentBet,
    deck,
    applyPlayerBet,
    pot,
    raiseBy,
    settleAfterAction,
    stage,
    streetContrib,
    tableSeats,
  ]);

  useEffect(() => {
    if (!BETTING_STAGES.includes(stage)) {
      return;
    }

    if (!currentTurn || currentTurn === 'player') {
      return;
    }

    const bot = seatById(tableSeats, currentTurn);
    if (!bot || bot.folded) {
      return;
    }

    const timer = window.setTimeout(() => {
      const callAmount = Math.max(0, currentBet - streetContrib[currentTurn]);
      const strength =
        stage === 'preflop'
          ? estimatePreflop(bot.hand)
          : estimatePostflop(bot.hand, board);
      const variance = Math.random() * 0.24 - 0.12;
      const weighted = Math.max(0, Math.min(1, strength + variance));

      if (callAmount > 0 && weighted < 0.22) {
        executeAction(currentTurn, 'fold');
        return;
      }

      if (weighted > 0.85 && Math.random() > 0.35) {
        const raiseTarget = currentBet + Math.max(raiseBy, bigBlind);
        executeAction(currentTurn, 'raise', raiseTarget);
        return;
      }

      if (callAmount > 0) {
        executeAction(currentTurn, 'call');
      } else {
        executeAction(currentTurn, 'check');
      }
    }, 620);

    return () => window.clearTimeout(timer);
  }, [
    currentTurn,
    stage,
    tableSeats,
    currentBet,
    streetContrib,
    board,
    raiseBy,
    bigBlind,
    executeAction,
  ]);

  const handleCheck = () => {
    if (!canAct) {
      return;
    }
    executeAction('player', 'check');
  };

  const handleCall = () => {
    if (!canAct) {
      return;
    }
    executeAction('player', 'call');
  };

  const handleRaise = () => {
    if (!canAct) {
      return;
    }
    const target = currentBet + Math.max(raiseBy, bigBlind);
    executeAction('player', 'raise', target);
  };

  const handleAllIn = () => {
    if (!canAct) {
      return;
    }
    executeAction('player', 'all-in');
  };

  const handleFold = () => {
    if (!canAct) {
      return;
    }
    executeAction('player', 'fold');
  };

  const resetTable = () => {
    pendingBetSyncRef.current = 0;
    pendingWinSyncRef.current = 0;
    setStage('idle');
    setTableSeats([]);
    setDeck([]);
    setBoard([]);
    setPot(0);
    setCurrentBet(0);
    setStreetContrib(emptyNumberMap());
    setActedThisStreet(emptyBoolMap());
    setCurrentTurn(null);
    setShowdownLabels({});
    setStatus('Click New Hand to deal cards.');
    setResult('');
    setError('');
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-slate-900">
      <div className="px-5 py-3 border-b border-slate-800 bg-slate-950 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black tracking-wide text-slate-100 uppercase">Texas Hold&apos;em</h2>
          <p className="text-xs text-slate-400">6-max online style table</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-md border border-slate-700 bg-slate-900 text-xs uppercase text-slate-300">
            {stageLabel(stage)}
          </div>
          <div className="px-3 py-1.5 rounded-md border border-blue-600/30 bg-blue-500/10 text-xs font-mono text-blue-300">
            SB {smallBlind} / BB {bigBlind}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-4">
        <div className="h-full min-h-0 rounded-xl border border-slate-800 bg-[radial-gradient(ellipse_at_center,_rgba(22,163,74,0.28),_rgba(7,18,17,1)_65%)] relative overflow-hidden">
          <div className="absolute inset-[14%_9%_18%_9%] rounded-[999px] border border-emerald-500/25 bg-[radial-gradient(ellipse_at_center,_rgba(34,197,94,0.3),_rgba(5,14,13,0.94)_68%)] shadow-[inset_0_0_70px_rgba(0,0,0,0.55)]" />

          <div className="absolute top-[44%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-full max-w-[560px] px-4">
            <div className="text-center text-xs uppercase tracking-[0.26em] text-slate-400 mb-2">Board</div>
            <div className="mb-2 flex justify-center">
              <div className="px-5 py-2 rounded-full border border-amber-500/40 bg-amber-500/15 shadow-lg text-center">
                <p className="text-[10px] uppercase tracking-[0.26em] text-amber-200">Pot</p>
                <p className="text-lg font-mono font-bold text-amber-300">{pot.toFixed(0)}</p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2">
              {Array.from({ length: 5 }).map((_, index) => {
                const card = board[index];
                return <CardView key={card?.id ?? `board-${index}`} card={card} hidden={!card} />;
              })}
            </div>
            <p className="mt-3 text-center text-sm text-slate-300">{status}</p>
            {result ? <p className="mt-1 text-center text-sm font-semibold text-emerald-400">{result}</p> : null}
          </div>

          {SEAT_LAYOUT.map((layout) => {
            const seat = seatById(tableSeats, layout.id);
            if (!seat) {
              return null;
            }

            const revealedLabel = showdownLabels[seat.id];
            const seatHandLabel =
              seat.id === 'player'
                ? playerRead
                : stage === 'result'
                  ? revealedLabel ?? (seat.folded ? 'Folded' : 'Hidden')
                  : null;

            return (
              <div key={seat.id} className={`absolute z-30 ${layout.cls}`}>
                <SeatView
                  seat={seat}
                  revealCards={stage === 'showdown' || stage === 'result' || !seat.isBot}
                  handLabel={seatHandLabel}
                  isTurn={currentTurn === seat.id && BETTING_STAGES.includes(stage)}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-slate-800 bg-slate-950 p-4">
        <div className="grid grid-cols-1 lg:grid-cols-[180px_180px_1fr] gap-3 items-end">
          <div>
            <label className="block text-xs uppercase text-slate-500 mb-1">Big Blind</label>
            <input
              type="number"
              min={40}
              step={10}
              value={bigBlindInput}
              onChange={(event) => setBigBlindInput(Math.max(40, Number(event.target.value) || 40))}
              disabled={stage !== 'idle' && stage !== 'result'}
              className="w-full h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 font-mono text-white outline-none focus:border-blue-600"
            />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <button
                onClick={() => setBigBlindInput((value) => Math.max(40, Math.floor(value / 2) || 40))}
                disabled={stage !== 'idle' && stage !== 'result'}
                className="h-9 rounded-md border border-slate-700 bg-slate-900 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >
                1/2
              </button>
              <button
                onClick={() => setBigBlindInput(Math.max(0, Math.floor(parseFloat(balance))))}
                disabled={stage !== 'idle' && stage !== 'result'}
                className="h-9 rounded-md border border-slate-700 bg-slate-900 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >
                MAX
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase text-slate-500 mb-1">Raise +</label>
            <input
              type="number"
              min={50}
              step={10}
              value={raiseBy}
              onChange={(event) => setRaiseBy(Math.max(50, Number(event.target.value) || 50))}
              disabled={!canAct}
              className="w-full h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 font-mono text-white outline-none focus:border-blue-600"
            />
          </div>

          <div className="flex flex-wrap gap-2 justify-start lg:justify-end">
            {(stage === 'idle' || stage === 'result') && (
              <button
                onClick={startHand}
                className="h-11 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase text-sm"
              >
                New Hand
              </button>
            )}

            {canAct && (
              <>
                <button
                  onClick={handleCheck}
                  className="h-11 px-4 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold text-sm"
                >
                  Check
                </button>
                <button
                  onClick={handleCall}
                  className="h-11 px-4 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold text-sm"
                >
                  Call {toCall > 0 ? toCall : ''}
                </button>
                <button
                  onClick={handleRaise}
                  className="h-11 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-sm"
                >
                  Raise
                </button>
                <button
                  onClick={handleAllIn}
                  className="h-11 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm"
                >
                  All-in
                </button>
                <button
                  onClick={handleFold}
                  className="h-11 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-sm"
                >
                  Fold
                </button>
              </>
            )}

            {stage === 'result' && (
              <button
                onClick={resetTable}
                className="h-11 px-4 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold text-sm"
              >
                Clear Table
              </button>
            )}
          </div>
        </div>

        <p className="mt-2 text-xs text-slate-400">
          Current bet: <span className="font-mono text-slate-300">{currentBet}</span>
          {' | '}
          To call: <span className="font-mono text-slate-300">{toCall}</span>
        </p>

        {error ? (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 text-sm font-semibold text-red-500"
          >
            {error}
          </motion.p>
        ) : null}
      </div>
    </div>
  );
}

function SeatView({
  seat,
  revealCards,
  handLabel,
  isTurn,
}: {
  seat: Seat;
  revealCards: boolean;
  handLabel: string | null;
  isTurn: boolean;
}) {
  const actionTone =
    seat.action === 'winner'
      ? 'text-emerald-400'
      : seat.action === 'fold' || seat.action === 'lost'
        ? 'text-red-400'
        : seat.action === 'raise' || seat.action === 'all-in'
          ? 'text-amber-300'
          : 'text-slate-400';

  return (
    <div
      className={`rounded-xl border px-3 py-2 min-w-[148px] backdrop-blur-sm ${
        seat.isBot ? 'border-slate-700 bg-slate-900/90' : 'border-blue-600/50 bg-blue-950/35'
      } ${isTurn ? 'ring-2 ring-blue-500/70' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-200">{seat.name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 bg-slate-950 text-slate-300 font-bold">
            {seat.positionLabel}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {seat.blindRole ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded border border-blue-500/40 bg-blue-500/10 text-blue-300 font-bold">
              {seat.blindRole}
            </span>
          ) : null}
          <span className={`text-[11px] uppercase font-semibold ${actionTone}`}>{seat.actionText}</span>
        </div>
      </div>
      <div className="mt-2 flex gap-1.5">
        {seat.hand.map((card) => (
          <CardView key={card.id} card={card} hidden={!revealCards} compact />
        ))}
      </div>
      {handLabel ? <p className="mt-1 text-[11px] text-slate-300">{handLabel}</p> : null}
    </div>
  );
}

function CardView({ card, hidden, compact = false }: { card?: Card; hidden?: boolean; compact?: boolean }) {
  const sizeClass = compact ? 'h-12 w-8' : 'h-16 w-11';

  if (!card) {
    return (
      <div className={`rounded-md border border-dashed border-slate-700 bg-slate-900/70 flex items-center justify-center text-slate-500 ${sizeClass}`}>
        ?
      </div>
    );
  }

  if (hidden) {
    return (
      <div className={`rounded-md border border-blue-500/40 bg-gradient-to-br from-blue-900/80 to-slate-900 text-blue-300 flex items-center justify-center text-[10px] font-bold ${sizeClass}`}>
        NV
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-md border border-slate-700 bg-slate-950 p-1 flex flex-col justify-between ${sizeClass}`}
    >
      <span className={`text-[10px] leading-none ${getSuitTone(card.suit)}`}>{card.rank}</span>
      <span className={`text-center text-sm leading-none ${getSuitTone(card.suit)}`}>{getSuitSymbol(card.suit)}</span>
      <span className={`text-[10px] leading-none self-end ${getSuitTone(card.suit)}`}>{card.rank}</span>
    </motion.div>
  );
}
