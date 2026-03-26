'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

import { copyToClipboard } from '@/lib/copyToClipboard';
import { useCasinoStore } from '../../store/useCasinoStore';

type BlackjackMode = 'solo' | 'friends';
type SoloPhase = 'idle' | 'playing' | 'result';
type SoloSeatId = 'player' | 'bot-1' | 'bot-2' | 'bot-3';

interface SoloSeat {
  id: SoloSeatId;
  name: string;
  isBot: boolean;
  hand: string[];
  status: string;
  stood: boolean;
  busted: boolean;
  resultText: string;
}

interface FriendPlayer {
  socketId: string;
  username: string;
  hand: string[];
  value: number;
  stood: boolean;
  busted: boolean;
  resultText: string;
}

interface FriendsState {
  roomId: string;
  stage: 'waiting' | 'playing' | 'result';
  status?: 'PLAYER_TURN' | 'WAITING' | 'ROUND_OVER';
  message: string;
  dealerCards: string[];
  dealerValue: number;
  players: FriendPlayer[];
}

const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const BOT_NAMES = ['StoneJack', 'LuckyLou', 'ChipQueen'];
const SOLO_TURN_ORDER: SoloSeatId[] = ['player', 'bot-1', 'bot-2', 'bot-3'];

function getSocketUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_GAME_SERVER_URL;

  if (typeof window === 'undefined') {
    return fromEnv ?? 'http://localhost:4001';
  }

  if (fromEnv === 'same-origin') {
    return window.location.origin;
  }

  if (!fromEnv) {
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    const isPrivateIp = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
    if (isLocalHost || isPrivateIp) {
      return `${window.location.protocol}//${window.location.hostname}:4001`;
    }
    return window.location.origin;
  }

  try {
    const parsed = new URL(fromEnv);
    const appHost = window.location.hostname;

    if ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && appHost !== 'localhost' && appHost !== '127.0.0.1') {
      parsed.hostname = appHost;
      return parsed.toString().replace(/\/$/, '');
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    const isPrivateIp = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
    if (isLocalHost || isPrivateIp) {
      return `${window.location.protocol}//${window.location.hostname}:4001`;
    }
    return window.location.origin;
  }
}

function shouldForcePolling(socketUrl: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const parsed = new URL(socketUrl);
    return window.location.protocol === 'https:' && parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

function createDeck() {
  const deck: string[] = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }

  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function calculateHandValue(cards: string[]) {
  let total = 0;
  let aces = 0;

  cards.forEach((card) => {
    const rank = card[0];
    if (rank === 'A') {
      total += 11;
      aces += 1;
      return;
    }

    if (['K', 'Q', 'J', 'T'].includes(rank)) {
      total += 10;
      return;
    }

    total += Number(rank);
  });

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

const handValue = calculateHandValue;

function cardLabel(card: string) {
  if (card === '??') {
    return { rank: '?', suit: '?', isRed: false };
  }

  const rankRaw = card.slice(0, -1);
  const suitRaw = card.slice(-1);
  const suitMap: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const rank = rankRaw === 'T' ? '10' : rankRaw;
  const suit = suitMap[suitRaw] ?? '?';
  const isRed = suit === '♥' || suit === '♦';
  return { rank, suit, isRed };
}

function isPlayerDone(player: FriendPlayer) {
  return player.stood || player.busted;
}

function nextSoloTurnId(seats: SoloSeat[], fromId: SoloSeatId) {
  const startIndex = SOLO_TURN_ORDER.indexOf(fromId);

  for (let offset = 1; offset <= SOLO_TURN_ORDER.length; offset += 1) {
    const candidateId = SOLO_TURN_ORDER[(startIndex + offset) % SOLO_TURN_ORDER.length];
    const candidate = seats.find((seat) => seat.id === candidateId);
    if (candidate && !candidate.stood && !candidate.busted) {
      return candidate.id;
    }
  }

  return null;
}

export default function BlackjackGame({ username = 'You' }: { username?: string }) {
  const { balance, placeBet, addWin } = useCasinoStore();

  const [mode, setMode] = useState<BlackjackMode>('solo');

  const [soloPhase, setSoloPhase] = useState<SoloPhase>('idle');
  const [soloDeck, setSoloDeck] = useState<string[]>([]);
  const [soloSeats, setSoloSeats] = useState<SoloSeat[]>([]);
  const [soloCurrentTurnId, setSoloCurrentTurnId] = useState<SoloSeatId | null>(null);
  const [soloDealerCards, setSoloDealerCards] = useState<string[]>([]);
  const [soloBet, setSoloBet] = useState(0);
  const [soloMessage, setSoloMessage] = useState('Set your bet and deal a new hand.');
  const [soloError, setSoloError] = useState('');
  const [soloOutcome, setSoloOutcome] = useState<{ tone: 'win' | 'lose' | 'push'; text: string } | null>(null);

  const [friendsRoomId, setFriendsRoomId] = useState('global');
  const [friendsRoomInput, setFriendsRoomInput] = useState('global');
  const [friendsBetInput, setFriendsBetInput] = useState(100);
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [friendsNotice, setFriendsNotice] = useState('Create or join a room to play with friends.');
  const [friendsState, setFriendsState] = useState<FriendsState>({
    roomId: 'global',
    stage: 'waiting',
    message: 'Waiting for players',
    dealerCards: [],
    dealerValue: 0,
    players: [],
  });

  const socketRef = useRef<Socket | null>(null);

  const myFriendSeat = useMemo(
    () => friendsState.players.find((player) => player.username === username),
    [friendsState.players, username]
  );

  const myFriendTurnDone = myFriendSeat ? isPlayerDone(myFriendSeat) : true;
  const gameStateStatus = friendsState.status ?? (friendsState.stage === 'playing' && !!myFriendSeat && !myFriendTurnDone ? 'PLAYER_TURN' : friendsState.stage === 'playing' ? 'WAITING' : 'ROUND_OVER');
  const canFriendAct = gameStateStatus === 'PLAYER_TURN';

  useEffect(() => {
    const socketUrl = getSocketUrl();
    const forcePolling = shouldForcePolling(socketUrl);
    const socket = io(socketUrl, {
      path: '/socket.io',
      transports: forcePolling ? ['polling'] : ['websocket', 'polling'],
      upgrade: !forcePolling,
      query: { username, blackjackRoomId: 'global' },
    });

    socketRef.current = socket;

    socket.on('blackjack_room_joined', (payload: { ok: boolean; roomId?: string }) => {
      if (!payload.ok || !payload.roomId) {
        return;
      }

      setFriendsRoomId(payload.roomId);
      setFriendsRoomInput(payload.roomId);
      setJoiningRoom(false);
    });

    socket.on('blackjack_state', (payload: FriendsState) => {
      setFriendsState(payload);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [username]);

  const clearSoloErrorSoon = () => {
    window.setTimeout(() => setSoloError(''), 2200);
  };

  const resolveSoloRound = useCallback(async (seats: SoloSeat[], dealerCards: string[], deck: string[]) => {
    let nextDealer = [...dealerCards];
    const nextDeck = [...deck];

    while (handValue(nextDealer) < 17 && nextDeck.length > 0) {
      const card = nextDeck.pop();
      if (!card) {
        break;
      }
      nextDealer = [...nextDealer, card];
    }

    const dealerValue = handValue(nextDealer);

    const resolvedSeats = seats.map((seat) => {
      const value = handValue(seat.hand);

      if (value > 21) {
        return { ...seat, busted: true, stood: true, status: 'Bust', resultText: 'Lose' };
      }

      if (dealerValue > 21 || value > dealerValue) {
        return { ...seat, stood: true, status: 'Stand', resultText: 'Win' };
      }

      if (value === dealerValue) {
        return { ...seat, stood: true, status: 'Stand', resultText: 'Push' };
      }

      return { ...seat, stood: true, status: 'Stand', resultText: 'Lose' };
    });

    const playerSeat = resolvedSeats.find((seat) => seat.id === 'player');
    if (playerSeat?.resultText === 'Win') {
      addWin(soloBet * 2);
      setSoloOutcome({ tone: 'win', text: `You won +${soloBet.toFixed(2)} NVC` });
      setSoloMessage('You won this hand. Great timing.');
    } else if (playerSeat?.resultText === 'Push') {
      addWin(soloBet);
      setSoloOutcome({ tone: 'push', text: 'Push. Bet returned.' });
      setSoloMessage('Push. Your bet was returned.');
    } else {
      setSoloOutcome({ tone: 'lose', text: 'You lost this hand.' });
      setSoloMessage('Dealer wins this hand.');
    }

    setSoloSeats(resolvedSeats);
    setSoloDealerCards(nextDealer);
    setSoloDeck(nextDeck);
    setSoloCurrentTurnId(null);
    setSoloPhase('result');
  }, [addWin, soloBet]);

  const startSoloRound = async () => {
    const safeBet = Math.max(0, Math.floor(Number.isFinite(soloBet) ? soloBet : 0));
    if (safeBet < 1) {
      setSoloError('Select a bet first.');
      clearSoloErrorSoon();
      return;
    }

    if (!placeBet(safeBet)) {
      setSoloError('Not enough funds for this bet.');
      clearSoloErrorSoon();
      return;
    }

    const deck = createDeck();
    const dealer = [deck.pop(), deck.pop()].filter(Boolean) as string[];
    const seats: SoloSeat[] = [
      {
        id: 'player',
        name: 'You',
        isBot: false,
        hand: [deck.pop(), deck.pop()].filter(Boolean) as string[],
        status: 'Playing',
        stood: false,
        busted: false,
        resultText: '',
      },
      ...BOT_NAMES.map((botName, index) => ({
        id: `bot-${index + 1}` as SoloSeatId,
        name: botName,
        isBot: true,
        hand: [deck.pop(), deck.pop()].filter(Boolean) as string[],
        status: 'Waiting',
        stood: false,
        busted: false,
        resultText: '',
      })),
    ];

    setSoloDeck(deck);
    setSoloSeats(seats);
    setSoloDealerCards(dealer);
    setSoloBet(safeBet);
    setSoloPhase('playing');
    setSoloCurrentTurnId('player');
    setSoloMessage('Your turn: Hit or Stand.');
    setSoloError('');
    setSoloOutcome(null);
  };

  const soloHit = () => {
    if (soloPhase !== 'playing' || soloCurrentTurnId !== 'player') {
      return;
    }

    const playerIndex = soloSeats.findIndex((seat) => seat.id === 'player');
    if (playerIndex === -1 || soloDeck.length === 0) {
      return;
    }

    const nextDeck = [...soloDeck];
    const card = nextDeck.pop();
    if (!card) {
      return;
    }

    const nextSeats = [...soloSeats];
    const nextHand = [...nextSeats[playerIndex].hand, card];
    const busted = handValue(nextHand) > 21;

    nextSeats[playerIndex] = {
      ...nextSeats[playerIndex],
      hand: nextHand,
      status: busted ? 'Bust' : 'Hit',
      busted,
      stood: busted,
    };

    setSoloDeck(nextDeck);
    setSoloSeats(nextSeats);

    if (busted) {
      setSoloMessage('You busted. Bots continue...');
      const nextTurn = nextSoloTurnId(nextSeats, 'player');
      if (!nextTurn) {
        void resolveSoloRound(nextSeats, soloDealerCards, nextDeck);
        return;
      }
      setSoloCurrentTurnId(nextTurn);
    }
  };

  const soloStand = () => {
    if (soloPhase !== 'playing' || soloCurrentTurnId !== 'player') {
      return;
    }

    const playerIndex = soloSeats.findIndex((seat) => seat.id === 'player');
    if (playerIndex === -1) {
      return;
    }

    const nextSeats = [...soloSeats];
    nextSeats[playerIndex] = {
      ...nextSeats[playerIndex],
      stood: true,
      status: 'Stand',
    };

    setSoloSeats(nextSeats);

    const nextTurn = nextSoloTurnId(nextSeats, 'player');
    if (!nextTurn) {
      void resolveSoloRound(nextSeats, soloDealerCards, soloDeck);
      return;
    }

    setSoloCurrentTurnId(nextTurn);
    setSoloMessage('Bots are playing their turns...');
  };

  useEffect(() => {
    if (soloPhase !== 'playing' || !soloCurrentTurnId || soloCurrentTurnId === 'player') {
      return;
    }

    const timer = window.setTimeout(() => {
      const activeBotIndex = soloSeats.findIndex((seat) => seat.id === soloCurrentTurnId);
      if (activeBotIndex === -1) {
        return;
      }

      const bot = soloSeats[activeBotIndex];
      if (!bot.isBot || bot.stood || bot.busted) {
        const nextTurn = nextSoloTurnId(soloSeats, soloCurrentTurnId);
        if (!nextTurn) {
          void resolveSoloRound(soloSeats, soloDealerCards, soloDeck);
          return;
        }
        setSoloCurrentTurnId(nextTurn);
        return;
      }

      const currentValue = handValue(bot.hand);
      if (currentValue < 16 && soloDeck.length > 0) {
        const nextDeck = [...soloDeck];
        const card = nextDeck.pop();
        if (!card) {
          return;
        }

        const nextHand = [...bot.hand, card];
        const busted = handValue(nextHand) > 21;

        const nextSeats = [...soloSeats];
        nextSeats[activeBotIndex] = {
          ...bot,
          hand: nextHand,
          status: busted ? 'Bust' : 'Hit',
          busted,
          stood: busted,
        };

        setSoloSeats(nextSeats);
        setSoloDeck(nextDeck);

        if (busted) {
          const nextTurn = nextSoloTurnId(nextSeats, soloCurrentTurnId);
          if (!nextTurn) {
            void resolveSoloRound(nextSeats, soloDealerCards, nextDeck);
            return;
          }
          setSoloCurrentTurnId(nextTurn);
        }

        return;
      }

      const nextSeats = [...soloSeats];
      nextSeats[activeBotIndex] = {
        ...bot,
        stood: true,
        status: 'Stand',
      };

      setSoloSeats(nextSeats);

      const nextTurn = nextSoloTurnId(nextSeats, soloCurrentTurnId);
      if (!nextTurn) {
        void resolveSoloRound(nextSeats, soloDealerCards, soloDeck);
        return;
      }

      setSoloCurrentTurnId(nextTurn);
    }, 850);

    return () => window.clearTimeout(timer);
  }, [resolveSoloRound, soloCurrentTurnId, soloDealerCards, soloDeck, soloPhase, soloSeats]);

  const joinFriendsRoom = () => {
    const nextRoom = friendsRoomInput.trim().toLowerCase();
    if (!nextRoom) {
      setFriendsNotice('Enter a room id.');
      return;
    }

    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      setFriendsNotice('Socket disconnected.');
      return;
    }

    setJoiningRoom(true);

    socket.emit('joinRoom', { game: 'blackjack', roomId: nextRoom }, (response: { ok: boolean; roomId?: string; error?: string }) => {
      setJoiningRoom(false);
      if (!response.ok) {
        setFriendsNotice(response.error ?? 'Could not join room.');
        return;
      }

      if (response.roomId) {
        setFriendsRoomId(response.roomId);
        setFriendsRoomInput(response.roomId);
      }

      setFriendsNotice('Joined room successfully.');
    });
  };

  const createFriendsRoom = () => {
    const nextRoom = `bj-${Math.random().toString(36).slice(2, 7)}`;
    setFriendsRoomInput(nextRoom);
    setFriendsNotice('Private room created. Share room id with your friends.');

    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      setFriendsNotice('Socket disconnected.');
      return;
    }

    setJoiningRoom(true);

    socket.emit('joinRoom', { game: 'blackjack', roomId: nextRoom }, (response: { ok: boolean; roomId?: string; error?: string }) => {
      setJoiningRoom(false);
      if (!response.ok) {
        setFriendsNotice(response.error ?? 'Could not create room.');
        return;
      }

      if (response.roomId) {
        setFriendsRoomId(response.roomId);
        setFriendsRoomInput(response.roomId);
      }
    });
  };

  const copyFriendsInvite = async () => {
    const roomCode = friendsState.roomId || friendsRoomId;
    const copied = await copyToClipboard(roomCode);
    if (copied) {
      setFriendsNotice('Room code copied.');
    } else {
      setFriendsNotice(`Share this room id: ${roomCode}`);
    }
  };

  const startFriendsRound = () => {
    const amount = Math.floor(Number(friendsBetInput));
    if (!Number.isFinite(amount) || amount < 1) {
      setFriendsNotice('Enter a valid bet amount.');
      return;
    }

    if (!placeBet(amount)) {
      setFriendsNotice('Not enough funds for this bet.');
      return;
    }

    socketRef.current?.emit('blackjack_deal', { amount }, (response: { ok: boolean; error?: string }) => {
      if (!response.ok) {
        addWin(amount);
        setFriendsNotice(response.error ?? 'Could not start round.');
      }
    });
  };

  const friendHit = () => {
    socketRef.current?.emit('blackjack_action', { action: 'hit' }, (response: { ok: boolean; error?: string }) => {
      if (!response.ok) {
        setFriendsNotice(response.error ?? 'Hit failed.');
      }
    });
  };

  const friendStand = () => {
    socketRef.current?.emit('blackjack_action', { action: 'stand' }, (response: { ok: boolean; error?: string }) => {
      if (!response.ok) {
        setFriendsNotice(response.error ?? 'Stand failed.');
      }
    });
  };

  const soloPlayerSeat = useMemo(() => soloSeats.find((seat) => seat.id === 'player') ?? null, [soloSeats]);
  const soloBots = useMemo(() => soloSeats.filter((seat) => seat.isBot), [soloSeats]);
  const canPlayerAct = soloPhase === 'playing' && soloCurrentTurnId === 'player';
  const soloDealerVisible = soloPhase === 'result' ? soloDealerCards : soloDealerCards.map((card, index) => (index === 1 ? '??' : card));
  const canDealSolo = (soloPhase === 'idle' || soloPhase === 'result') && soloBet >= 1 && soloBet <= Number(balance);
  const soloPlayerValue = handValue(soloPlayerSeat?.hand ?? []);
  const soloDealerKnownValue = handValue(soloDealerVisible.filter((card) => card !== '??'));
  const myFriendValue = handValue(myFriendSeat?.hand ?? []);
  const friendsOtherPlayers = friendsState.players.filter((player) => player.username !== username);

  const soloTurnLabel =
    soloCurrentTurnId === 'player'
      ? 'Your turn'
      : soloCurrentTurnId
        ? `${soloSeats.find((seat) => seat.id === soloCurrentTurnId)?.name ?? 'Bot'} is acting`
        : 'Round finished';

  return (
    <div className="h-full min-h-0 flex flex-col bg-slate-900">
      <div className="h-14 shrink-0 px-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Blackjack Mode</p>
          <p className="text-sm text-slate-300">Solo gegen Bots oder Friends-Room</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMode('solo')}
            className={`h-9 px-3 rounded-lg border text-xs font-bold uppercase ${
              mode === 'solo'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800'
            }`}
          >
            Solo + Bots
          </button>
          <button
            onClick={() => setMode('friends')}
            className={`h-9 px-3 rounded-lg border text-xs font-bold uppercase ${
              mode === 'friends'
                ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                : 'border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800'
            }`}
          >
            Friends Room
          </button>
        </div>
      </div>

      {mode === 'solo' ? (
        <>
          <div className="flex-1 min-h-0 p-4">
            <div className="h-full min-h-0 rounded-xl border border-slate-800 bg-[radial-gradient(ellipse_at_center,_rgba(22,163,74,0.28),_rgba(7,18,17,1)_65%)] relative overflow-hidden">
              <div className="absolute inset-[14%_9%_18%_9%] rounded-[999px] border border-emerald-500/25 bg-[radial-gradient(ellipse_at_center,_rgba(34,197,94,0.3),_rgba(5,14,13,0.94)_68%)] shadow-[inset_0_0_70px_rgba(0,0,0,0.55)]" />

              <SeatBox
                title="Dealer"
                subtitle={`Value ${handValue(soloDealerVisible.filter((card) => card !== '??'))}${soloPhase !== 'result' && soloDealerVisible.length > 1 ? ' + ?' : ''}`}
                cards={soloDealerVisible}
                className="top-6 left-1/2 -translate-x-1/2"
              />

              {soloBots.map((bot, index) => {
                const slots = ['top-24 left-8', 'top-24 right-8', 'bottom-24 right-14'];
                return (
                  <SeatBox
                    key={bot.id}
                    title={bot.name}
                    subtitle={`${bot.status} · ${handValue(bot.hand)}${soloCurrentTurnId === bot.id ? ' · Turn' : ''}`}
                    cards={bot.hand}
                    className={slots[index] ?? 'bottom-24 left-14'}
                  />
                );
              })}

              <SeatBox
                title="You"
                subtitle={`Value ${handValue(soloPlayerSeat?.hand ?? [])}${soloCurrentTurnId === 'player' ? ' · Turn' : ''}`}
                cards={soloPlayerSeat?.hand ?? []}
                className="bottom-5 left-1/2 -translate-x-1/2"
                highlighted
              />

              <div className="absolute top-[47%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 text-center">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Table</p>
                <p className="text-lg font-semibold text-slate-200 mt-1">{soloMessage}</p>
                <p className="text-sm font-semibold text-cyan-300 mt-1">Dealer: {soloDealerKnownValue}{soloPhase !== 'result' && soloDealerVisible.length > 1 ? ' + ?' : ''} | You: {soloPlayerValue}</p>
                <p className="text-xs uppercase tracking-wide text-slate-400 mt-1">{soloTurnLabel}</p>
                {soloError ? <p className="text-sm font-semibold text-red-400 mt-1">{soloError}</p> : null}
              </div>

              {soloOutcome ? (
                <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-30 rounded-lg border px-4 py-2 text-sm font-bold ${
                  soloOutcome.tone === 'win'
                    ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                    : soloOutcome.tone === 'push'
                      ? 'border-amber-500/50 bg-amber-500/20 text-amber-300'
                      : 'border-red-500/50 bg-red-500/20 text-red-300'
                }`}>
                  {soloOutcome.text}
                </div>
              ) : null}
            </div>
          </div>

          <div className="border-t border-slate-800 bg-slate-950 p-4 grid gap-3 lg:grid-cols-[220px_1fr] items-end">
            <div>
              <label className="block text-xs uppercase text-slate-500 mb-1">Bet Amount</label>
              <input
                type="number"
                min={1}
                value={soloBet}
                onChange={(event) => setSoloBet(Math.max(0, parseInt(event.target.value, 10) || 0))}
                disabled={soloPhase === 'playing'}
                className="w-full h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 font-mono text-white outline-none focus:border-blue-600"
              />
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button
                  onClick={() => setSoloBet((value) => Math.max(0, Math.floor(value / 2) || 0))}
                  disabled={soloPhase === 'playing'}
                  className="h-9 rounded-md border border-slate-700 bg-slate-900 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
                >
                  1/2
                </button>
                <button
                  onClick={() => setSoloBet(Math.max(0, Math.floor(parseFloat(balance))))}
                  disabled={soloPhase === 'playing'}
                  className="h-9 rounded-md border border-slate-700 bg-slate-900 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
                >
                  MAX
                </button>
              </div>
            </div>

            <div className="flex gap-2 justify-end flex-wrap">
              {(soloPhase === 'idle' || soloPhase === 'result') && (
                <button onClick={startSoloRound} disabled={!canDealSolo} className="h-11 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm uppercase disabled:opacity-50 disabled:cursor-not-allowed">
                  Deal Hand
                </button>
              )}
              {soloPhase === 'playing' && (
                <>
                  <button onClick={soloHit} disabled={!canPlayerAct} className="h-11 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm uppercase disabled:opacity-50 disabled:cursor-not-allowed">
                    Hit
                  </button>
                  <button onClick={soloStand} disabled={!canPlayerAct} className="h-11 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-sm uppercase disabled:opacity-50 disabled:cursor-not-allowed">
                    Stand
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="p-4 border-b border-slate-800 bg-slate-950 grid gap-3 lg:grid-cols-[1fr_auto_auto_auto] items-center">
            <input
              value={friendsRoomInput}
              onChange={(event) => setFriendsRoomInput(event.target.value)}
              className="h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-cyan-500"
              placeholder="room id"
            />
            <input
              type="number"
              min={1}
              value={friendsBetInput}
              onChange={(event) => setFriendsBetInput(Math.max(0, parseInt(event.target.value, 10) || 0))}
              className="h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-cyan-500"
              placeholder="bet amount"
            />
            <button onClick={joinFriendsRoom} disabled={joiningRoom} className="h-11 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm disabled:opacity-60 disabled:cursor-not-allowed">
              {joiningRoom ? 'Joining...' : 'Join Room'}
            </button>
            <button onClick={createFriendsRoom} className="h-11 px-4 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold text-sm">
              Create Private
            </button>
            <button onClick={copyFriendsInvite} className="h-11 px-4 rounded-lg border border-cyan-700/60 bg-cyan-600/10 hover:bg-cyan-600/20 text-cyan-300 font-semibold text-sm">
              Copy Invite
            </button>
          </div>

          <div className="flex-1 min-h-0 p-4">
            <div className="h-full min-h-0 rounded-xl border border-slate-800 bg-[radial-gradient(ellipse_at_center,_rgba(22,163,74,0.28),_rgba(7,18,17,1)_65%)] relative overflow-hidden">
              <div className="absolute inset-[14%_9%_18%_9%] rounded-[999px] border border-emerald-500/25 bg-[radial-gradient(ellipse_at_center,_rgba(34,197,94,0.3),_rgba(5,14,13,0.94)_68%)] shadow-[inset_0_0_70px_rgba(0,0,0,0.55)]" />

              <SeatBox
                title="Dealer"
                subtitle={`Value ${friendsState.dealerValue}`}
                cards={friendsState.dealerCards}
                className="top-6 left-1/2 -translate-x-1/2"
              />

              {friendsOtherPlayers.slice(0, 4).map((player, index) => {
                const slots = ['top-24 left-8', 'top-24 right-8', 'bottom-24 left-8', 'bottom-24 right-8'];
                const value = handValue(player.hand);
                return (
                  <SeatBox
                    key={player.socketId}
                    title={player.username}
                    subtitle={`${player.resultText || (player.stood ? 'Stand' : player.busted ? 'Bust' : 'Playing')} · ${value}`}
                    cards={player.hand}
                    className={slots[index] ?? 'bottom-24 left-8'}
                  />
                );
              })}

              <SeatBox
                title={myFriendSeat?.username ?? 'You'}
                subtitle={myFriendSeat ? `${myFriendSeat.resultText || (myFriendSeat.stood ? 'Stand' : myFriendSeat.busted ? 'Bust' : 'Playing')} · ${myFriendValue}` : 'Not seated'}
                cards={myFriendSeat?.hand ?? []}
                className="bottom-5 left-1/2 -translate-x-1/2"
                highlighted
              />

              <div className="absolute top-[47%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 text-center px-4">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Room {friendsState.roomId}</p>
                <p className="text-lg font-semibold text-slate-200 mt-1">{friendsState.message}</p>
                <p className="text-sm font-semibold text-cyan-300 mt-1">Dealer: {handValue(friendsState.dealerCards)} | {username}: {myFriendValue}</p>
                <p className="text-xs uppercase tracking-wide text-slate-400 mt-1">Status: {gameStateStatus}</p>
                <p className="text-sm text-slate-300 mt-1">{friendsNotice}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 bg-slate-950 p-4 flex gap-2 justify-end flex-wrap">
            {friendsState.stage !== 'playing' ? (
              <button onClick={startFriendsRound} className="h-11 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm uppercase">
                Deal Hand
              </button>
            ) : null}
            <button
              onClick={friendHit}
              disabled={!canFriendAct}
              className="h-11 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm uppercase disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Hit
            </button>
            <button
              onClick={friendStand}
              disabled={!canFriendAct}
              className="h-11 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-sm uppercase disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Stand
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SeatBox({
  title,
  subtitle,
  cards,
  className,
  highlighted = false,
}: {
  title: string;
  subtitle: string;
  cards: string[];
  className: string;
  highlighted?: boolean;
}) {
  return (
    <div className={`absolute z-30 rounded-xl border px-3 py-2 min-w-[160px] backdrop-blur-sm ${highlighted ? 'border-cyan-500/50 bg-cyan-950/35' : 'border-slate-700 bg-slate-900/90'} ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-200">{title}</span>
        <span className="text-[11px] uppercase font-semibold text-slate-400">{subtitle}</span>
      </div>
      <div className="mt-2 flex gap-1.5">
        {cards.length === 0 ? <CardView card="??" hidden /> : null}
        {cards.map((card, index) => (
          <CardView key={`${card}-${index}`} card={card} hidden={card === '??'} />
        ))}
      </div>
    </div>
  );
}

function CardView({ card, hidden = false }: { card: string; hidden?: boolean }) {
  if (hidden) {
    return (
      <div className="h-12 w-8 rounded-md border border-blue-500/40 bg-gradient-to-br from-blue-900/80 to-slate-900 text-blue-300 flex items-center justify-center text-[10px] font-bold">
        NV
      </div>
    );
  }

  const label = cardLabel(card);

  return (
    <div className="h-12 w-8 rounded-md border border-slate-700 bg-slate-950 p-1 flex flex-col justify-between">
      <span className={`text-[10px] leading-none ${label.isRed ? 'text-red-400' : 'text-slate-200'}`}>{label.rank}</span>
      <span className={`text-center text-sm leading-none ${label.isRed ? 'text-red-400' : 'text-slate-200'}`}>{label.suit}</span>
      <span className={`text-[10px] leading-none self-end ${label.isRed ? 'text-red-400' : 'text-slate-200'}`}>{label.rank}</span>
    </div>
  );
}
