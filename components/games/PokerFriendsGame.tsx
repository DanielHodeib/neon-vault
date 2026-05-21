'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';

import { copyToClipboard } from '@/lib/copyToClipboard';

type PokerCard = string | { hidden?: boolean } | null;

interface PokerPlayer {
  socketId: string;
  userId?: string;
  username: string;
  ready: boolean;
  folded: boolean;
  seated?: boolean;
  buyIn?: number;
  roundBet?: number;
  hand: PokerCard[];
  actionText: string;
  isWinner: boolean;
}

interface PokerState {
  roomId: string;
  started: boolean;
  stage: string;
  board: string[];
  pot?: number;
  currentBet?: number;
  currentTableBet?: number;
  currentTurnUserId?: string | null;
  minRaise?: number;
  activePlayerSocketId?: string | null;
  turnDeadlineAt?: number;
  players: PokerPlayer[];
  winnerLabel: string;
}

const DEFAULT_POKER_STATE: PokerState = {
  roomId: 'global',
  started: false,
  stage: 'waiting',
  board: [],
  pot: 0,
  currentBet: 0,
  currentTableBet: 0,
  currentTurnUserId: null,
  minRaise: 0,
  activePlayerSocketId: null,
  turnDeadlineAt: 0,
  players: [],
  winnerLabel: '',
};

const OTHER_SEAT_SLOTS = [
  'top-6 left-1/2 -translate-x-1/2',
  'top-[22%] right-[7%]',
  'bottom-[24%] right-[6%]',
  'bottom-[24%] left-[6%]',
  'top-[22%] left-[7%]',
];
const OTHER_ROLE_LABELS = ['BTN', 'SB', 'BB', 'UTG', 'CO'];

function getSocketUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SOCKET_URL ?? process.env.NEXT_PUBLIC_GAME_SERVER_URL;

  if (typeof window === 'undefined') {
    return fromEnv ?? 'http://localhost:5000';
  }

  if (fromEnv === 'same-origin' || !fromEnv) {
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

function cardTone(card: string) {
  const suit = card.slice(-1);
  return suit === 'H' || suit === 'D' ? 'text-red-400' : 'text-slate-200';
}

function cardSymbol(card: string) {
  if (card === '??') {
    return { rank: '?', suit: '?' };
  }

  const rankRaw = card.slice(0, -1);
  const suitRaw = card.slice(-1);
  const rank = rankRaw === 'T' ? '10' : rankRaw;
  const suitMap: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
  return { rank, suit: suitMap[suitRaw] ?? '?' };
}

function isHiddenCard(card: PokerCard) {
  if (!card) {
    return true;
  }

  if (typeof card === 'object') {
    return card.hidden === true;
  }

  return card === '??';
}

function normalizeCardValue(card: PokerCard) {
  if (!card || typeof card !== 'string') {
    return '??';
  }

  return card;
}

function normalizePokerPlayer(payload: unknown): PokerPlayer | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const source = payload as Partial<PokerPlayer>;
  const username = typeof source.username === 'string' && source.username.trim() ? source.username : 'Player';
  const socketId = typeof source.socketId === 'string' && source.socketId.trim() ? source.socketId : `socket:${username.toLowerCase()}`;

  return {
    socketId,
    userId: typeof source.userId === 'string' ? source.userId : undefined,
    username,
    ready: Boolean(source.ready),
    folded: Boolean(source.folded),
    seated: Boolean(source.seated),
    buyIn: Number.isFinite(Number(source.buyIn)) ? Number(source.buyIn) : 0,
    roundBet: Number.isFinite(Number(source.roundBet)) ? Number(source.roundBet) : 0,
    hand: Array.isArray(source.hand) ? source.hand : [],
    actionText: typeof source.actionText === 'string' ? source.actionText : 'waiting buy-in',
    isWinner: Boolean(source.isWinner),
  };
}

function normalizePokerState(payload: unknown, fallbackRoomId: string): PokerState {
  if (!payload || typeof payload !== 'object') {
    return { ...DEFAULT_POKER_STATE, roomId: fallbackRoomId || 'global' };
  }

  const source = payload as Partial<PokerState>;
  return {
    roomId: typeof source.roomId === 'string' && source.roomId.trim() ? source.roomId : fallbackRoomId || 'global',
    started: Boolean(source.started),
    stage: typeof source.stage === 'string' && source.stage.trim() ? source.stage : 'waiting',
    board: Array.isArray(source.board) ? source.board.filter((card): card is string => typeof card === 'string') : [],
    pot: Number.isFinite(Number(source.pot)) ? Number(source.pot) : 0,
    currentBet: Number.isFinite(Number(source.currentBet)) ? Number(source.currentBet) : 0,
    currentTableBet: Number.isFinite(Number(source.currentTableBet)) ? Number(source.currentTableBet) : Number(source.currentBet || 0),
    currentTurnUserId: typeof source.currentTurnUserId === 'string' ? source.currentTurnUserId : null,
    minRaise: Number.isFinite(Number(source.minRaise)) ? Number(source.minRaise) : 0,
    activePlayerSocketId: typeof source.activePlayerSocketId === 'string' ? source.activePlayerSocketId : null,
    turnDeadlineAt: Number.isFinite(Number(source.turnDeadlineAt)) ? Number(source.turnDeadlineAt) : 0,
    players: Array.isArray(source.players)
      ? source.players
          .map((player) => normalizePokerPlayer(player))
          .filter((player): player is PokerPlayer => Boolean(player))
      : [],
    winnerLabel: typeof source.winnerLabel === 'string' ? source.winnerLabel : '',
  };
}

export default function PokerFriendsGame({ username }: { username: string }) {
  const [pokerRoomId, setPokerRoomId] = useState('global');
  const [pokerRoomInput, setPokerRoomInput] = useState('global');
  const [switchingRoom, setSwitchingRoom] = useState(false);
  const [selfSocketId, setSelfSocketId] = useState<string | null>(null);
  const [state, setState] = useState<PokerState>({
    roomId: 'global',
    started: false,
    stage: 'waiting',
    board: [],
    pot: 0,
    currentBet: 0,
    minRaise: 0,
    activePlayerSocketId: null,
    turnDeadlineAt: 0,
    players: [],
    winnerLabel: '',
  });
  const [notice, setNotice] = useState('Global poker table. Round starts automatically with 2 players.');
  const [buyInAmount, setBuyInAmount] = useState('100');
  const [raiseAmount, setRaiseAmount] = useState('20');

  const socketRef = useRef<Socket | null>(null);
  const pokerRoomIdRef = useRef('global');

  useEffect(() => {
    pokerRoomIdRef.current = pokerRoomId;
  }, [pokerRoomId]);

  const uniqueSeatedPlayers = useMemo(
    () =>
      Array.from(
        new Map(
          state.players.map((player) => [
            (player.userId && player.userId.trim()) || player.socketId,
            player,
          ])
        ).values()
      ),
    [state.players]
  );

  const uniquePlayers = useMemo(() => {
    if (!selfSocketId) {
      return uniqueSeatedPlayers;
    }

    return uniqueSeatedPlayers.map((player) => {
      const normalizedPlayerUserId = typeof player.userId === 'string' ? player.userId.trim() : '';
      if (!normalizedPlayerUserId) {
        return player;
      }

      const ownBySocket = state.players.find((entry) => entry.socketId === selfSocketId);
      const ownUserId = typeof ownBySocket?.userId === 'string' ? ownBySocket.userId.trim() : '';
      if (ownUserId && ownUserId === normalizedPlayerUserId && ownBySocket) {
        return ownBySocket;
      }

      return player;
    });
  }, [uniqueSeatedPlayers, selfSocketId, state.players]);

  const me = useMemo(() => {
    if (selfSocketId) {
      const bySocket = uniquePlayers.find((player) => player.socketId === selfSocketId);
      if (bySocket) {
        return bySocket;
      }
    }

    return uniquePlayers.find((player) => player.username === username) ?? null;
  }, [uniquePlayers, selfSocketId, username]);

  const others = useMemo(() => {
    const ownSocketId = me?.socketId ?? selfSocketId;
    const ownUsername = me?.username ?? username;

    return uniquePlayers.filter((player) => {
      if (ownSocketId && player.socketId === ownSocketId) {
        return false;
      }

      if (ownUsername && player.username === ownUsername) {
        return false;
      }

      return true;
    });
  }, [uniquePlayers, selfSocketId, username, me]);

  useEffect(() => {
    const socketUrl = getSocketUrl();
    const forcePolling = shouldForcePolling(socketUrl);
    const socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      secure: typeof window !== 'undefined' ? window.location.protocol === 'https:' : true,
      upgrade: !forcePolling,
      query: { username, userId: username, pokerRoomId: 'global' },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setSelfSocketId(socket.id ?? null);
      const roomId = pokerRoomIdRef.current || 'global';
      socket.emit('join_poker_room', { roomId });
    });

    socket.on('poker_room_joined', (payload: { ok: boolean; roomId?: string }) => {
      if (payload.ok && payload.roomId) {
        setPokerRoomId(payload.roomId);
        setPokerRoomInput(payload.roomId);
        setSwitchingRoom(false);
      }
    });

    socket.on('poker_created', (payload: { roomId?: string }) => {
      if (!payload?.roomId) {
        return;
      }

      const nextRoomId = payload.roomId;

      setPokerRoomId(nextRoomId);
      setPokerRoomInput(nextRoomId);
      setSwitchingRoom(false);
      setState((current) => ({ ...current, roomId: nextRoomId }));
      setNotice(`Private room ${nextRoomId} ready.`);
    });

    socket.on('poker_state', (payload: PokerState) => {
      setState((current) => normalizePokerState(payload, current.roomId || pokerRoomIdRef.current || 'global'));
    });

    socket.on('poker_table_win', (payload: { roomId: string; username: string }) => {
      if (!payload?.username || payload.username === username) {
        return;
      }
      toast.success(`${payload.username} hat den Poker-Tisch gewonnen!`, {
        id: `poker-win-${payload.roomId}`,
      });
    });

    return () => {
      setSelfSocketId(null);
      socket.off('poker_created');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [username]);

  const joinPokerRoom = () => {
    const roomId = pokerRoomInput.trim().toLowerCase();
    console.log('Button clicked: poker_join_room', { roomId });
    if (!roomId) {
      setNotice('Please enter a room id.');
      return;
    }

    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      setNotice('Socket disconnected.');
      return;
    }

    setSwitchingRoom(true);
    setNotice('Switching room...');
    socket.emit('join_poker_room', { roomId }, (response: { ok: boolean; roomId?: string; error?: string }) => {
      if (!response.ok) {
        setSwitchingRoom(false);
        setNotice(response.error ?? 'Could not join room.');
        return;
      }

      setNotice(`Joined room ${response.roomId ?? roomId}.`);
      socket.emit('join_poker_room', { roomId: response.roomId ?? roomId });
    });
  };

  const createPokerRoom = () => {
    console.log('Button clicked: poker_create');
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      setNotice('Socket disconnected.');
      return;
    }

    setSwitchingRoom(true);
    setNotice('Creating private room...');
    socket.emit('poker_create', {}, (response: { ok: boolean; roomId?: string; error?: string }) => {
      if (!response.ok) {
        setSwitchingRoom(false);
        setNotice(response.error ?? 'Could not create room.');
        return;
      }

      const roomId = response.roomId ?? 'global';
      setPokerRoomInput(roomId);
      setNotice(`Private room ${roomId} created.`);
      socket.emit('join_poker_room', { roomId });
    });
  };

  const copyInvite = async () => {
    const roomCode = state.roomId || pokerRoomId;
    const copied = await copyToClipboard(roomCode);
    setNotice(copied ? 'Invite copied.' : `Room code: ${roomCode}`);
  };

  const action = (nextAction: 'check' | 'call' | 'fold' | 'raise') => {
    const payload: { action: 'check' | 'call' | 'fold' | 'raise'; amount?: number } = { action: nextAction };
    if (nextAction === 'raise') {
      const value = Math.floor(Number(raiseAmount));
      payload.amount = Number.isFinite(value) ? value : 0;
    }

    socketRef.current?.emit('poker_action', payload, (response: { ok: boolean; error?: string }) => {
      if (!response.ok) {
        setNotice(response.error ?? 'Action failed.');
      }
    });
  };

  const submitBuyIn = () => {
    const amount = parseInt(buyInAmount, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice('Enter a valid buy-in amount.');
      return;
    }

    socketRef.current?.emit('poker_buy_in', { amount }, (response: { ok: boolean; amount?: number; error?: string }) => {
      if (!response.ok) {
        setNotice(response.error ?? 'Buy-in failed.');
        return;
      }

      setNotice(`Seated with buy-in ${response.amount ?? amount}.`);
      const roomId = pokerRoomIdRef.current || state.roomId || 'global';
      socketRef.current?.emit('join_poker_room', { roomId });
    });
  };

  const hasSeat = Boolean(me?.seated) && Number(me?.buyIn || 0) > 0;
  const isMyTurn = Boolean(me?.socketId) && me?.socketId === state.activePlayerSocketId;
  const canAct = hasSeat && isMyTurn && state.started && state.stage !== 'waiting' && state.stage !== 'showdown' && !Boolean(me?.folded);
  const tableBet = Number(state.currentTableBet ?? state.currentBet ?? 0);
  const myRoundBet = Number(me?.roundBet || 0);
  const callAmount = Math.max(0, tableBet - myRoundBet);
  const canCheck = callAmount === 0;
  const minimumRaise = Math.max(tableBet + Math.max(Number(state.minRaise || 0), 100), Number(state.minRaise || 0) || 100);

  return (
    <div className="poker-solo-root h-full min-h-0 w-full flex flex-col bg-slate-900">
      <div className="px-5 py-3 border-b border-slate-800 bg-slate-950 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-wide text-slate-100 uppercase">Texas Hold&apos;em Friends</h2>
          <p className="text-xs text-slate-400">Create private rooms or join by invite code.</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase text-slate-500">Players Active</p>
          <p className="font-mono text-sm text-cyan-300">{uniquePlayers.length}</p>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-slate-800 bg-slate-950 grid gap-2 md:grid-cols-[1fr_auto_auto_auto] items-center">
        <input
          value={pokerRoomInput}
          onChange={(event) => setPokerRoomInput(event.target.value)}
          className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-cyan-500"
          placeholder="room id"
        />
        <button
          onClick={joinPokerRoom}
          disabled={switchingRoom}
          className="h-10 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {switchingRoom ? 'Switching...' : 'Join Room'}
        </button>
        <button onClick={createPokerRoom} className="h-10 px-4 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-sm font-semibold">
          Create Private Room
        </button>
        <button onClick={copyInvite} className="h-10 px-4 rounded-lg border border-cyan-700/60 bg-cyan-600/10 hover:bg-cyan-600/20 text-cyan-300 text-sm font-semibold">
          Copy Invite
        </button>
      </div>

      <div className="poker-table-stage flex-1 min-h-0 p-4 md:p-5">
        <div className="poker-table-frame mx-auto w-full max-w-3xl aspect-[2/1] rounded-[100px] md:rounded-[200px] shrink-0">
          <div className="poker-table-felt h-full min-h-0 rounded-[100px] md:rounded-[200px] border border-slate-800 bg-[radial-gradient(ellipse_at_center,_rgba(34,197,94,0.2),_rgba(5,15,13,1)_68%)] relative overflow-hidden shrink-0">
          <div className="absolute inset-[12%_7%_16%_7%] rounded-[999px] border border-emerald-500/30 bg-[radial-gradient(ellipse_at_center,_rgba(34,197,94,0.26),_rgba(5,14,13,0.96)_68%)] shadow-[inset_0_0_85px_rgba(0,0,0,0.58)]" />

          <div className="absolute top-[44%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-full max-w-[560px] px-4">
            <div className="text-center text-xs uppercase tracking-[0.26em] text-slate-400 mb-2">Board</div>
            <div className="mb-2 flex justify-center">
              <div className="px-5 py-2 rounded-full border border-amber-500/40 bg-amber-500/15 shadow-lg text-center">
                <p className="text-[10px] uppercase tracking-[0.26em] text-amber-200">Pot</p>
                <p className="text-lg font-mono font-bold text-amber-300">{Number(state.pot || 0).toFixed(0)}</p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2">
              {Array.from({ length: 5 }).map((_, index) => {
                const card = state.board[index];
                return <CardView key={card ?? `board-${index}`} card={card ?? '??'} hidden={!card} />;
              })}
            </div>
            <p className="mt-3 text-center text-xs text-slate-400">{state.stage === 'waiting' ? 'Waiting for players' : `Stage: ${state.stage}`}</p>
            <p className="mt-1 text-center text-xs text-slate-500">{state.roomId || pokerRoomId} | Bet {tableBet}</p>
            {state.winnerLabel ? <p className="mt-1 text-center text-sm font-semibold text-emerald-400">{state.winnerLabel}</p> : null}
          </div>

          {others.slice(0, OTHER_SEAT_SLOTS.length).map((player, index) => (
            <div key={player.socketId} className={`absolute z-30 ${OTHER_SEAT_SLOTS[index]}`}>
              <SeatView player={player} isSelf={false} stage={state.stage} isActive={player.socketId === state.activePlayerSocketId} roleLabel={OTHER_ROLE_LABELS[index] ?? 'Seat'} />
            </div>
          ))}

          <div className="absolute z-30 bottom-5 left-1/2 -translate-x-1/2">
            <SeatView player={me ?? null} isSelf stage={state.stage} isActive={Boolean(me?.socketId) && me?.socketId === state.activePlayerSocketId} roleLabel="YOU" />
          </div>
        </div>
        </div>
      </div>

      <div className="poker-action-bar sticky bottom-0 z-40 border-t border-slate-800 bg-slate-950/95 backdrop-blur p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            {canAct ? 'Your turn to act' : isMyTurn ? 'Seat not ready. Buy in to play.' : 'Waiting for turn'}
          </p>
          <p className="text-xs text-slate-500 truncate">{notice}</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[180px_180px_1fr] gap-3 items-end">
          <div>
            <label className="block text-xs uppercase text-slate-500 mb-1">Buy-in</label>
            <input
              type="number"
              min={1}
              value={buyInAmount}
              onChange={(event) => setBuyInAmount(event.target.value)}
              className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-cyan-500"
              placeholder="Buy-in"
            />
          </div>
          <div>
            <label className="block text-xs uppercase text-slate-500 mb-1">Raise</label>
            <input
              type="number"
              min={minimumRaise}
              value={raiseAmount}
              onChange={(event) => setRaiseAmount(event.target.value)}
              className="h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-cyan-500"
              placeholder="Raise"
            />
          </div>
          <div className="mt-4 flex w-full flex-col items-center gap-2 md:flex-row md:flex-wrap md:justify-end">
            <button onClick={submitBuyIn} className="h-11 min-h-[44px] min-w-[44px] px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-semibold uppercase">
              Sit Down
            </button>
            <button
              onClick={() => action('check')}
              disabled={!canAct || !canCheck}
              className={`h-11 min-h-[44px] min-w-[44px] px-4 rounded-lg border text-sm font-semibold uppercase ${
                canAct && canCheck
                  ? 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200'
                  : 'border-slate-800 bg-slate-900/50 text-slate-600 cursor-not-allowed'
              }`}
            >
              Check
            </button>
            <button
              onClick={() => action('call')}
              disabled={!canAct || canCheck}
              className={`h-11 min-h-[44px] min-w-[44px] px-4 rounded-lg border text-sm font-semibold uppercase ${
                canAct && !canCheck
                  ? 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200'
                  : 'border-slate-800 bg-slate-900/50 text-slate-600 cursor-not-allowed'
              }`}
            >
              {canCheck ? 'Check' : `Call ${callAmount}`}
            </button>
            <button
              onClick={() => action('fold')}
              disabled={!canAct}
              className={`h-11 min-h-[44px] min-w-[44px] px-4 rounded-lg text-sm font-semibold uppercase ${
                canAct ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              Fold
            </button>
            <button
              onClick={() => action('raise')}
              disabled={!canAct}
              className={`h-11 min-h-[44px] min-w-[44px] px-4 rounded-lg text-sm font-semibold uppercase ${
                canAct ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              Raise
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const SeatView = React.memo(function SeatView({ player, isSelf, stage, isActive, roleLabel }: { player: PokerPlayer | null; isSelf: boolean; stage: string; isActive: boolean; roleLabel: string }) {
  if (!player) {
    return (
      <div className={`rounded-xl border px-3 py-2 min-w-[164px] backdrop-blur-sm ${isSelf ? 'border-cyan-500/50 bg-cyan-950/35' : 'border-slate-700 bg-slate-900/90'} ${isActive ? 'ring-2 ring-amber-300/80 shadow-[0_0_16px_rgba(252,211,77,0.55)]' : ''}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs uppercase text-slate-500">Waiting for seat...</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 bg-slate-950 text-slate-300 font-bold">{roleLabel}</span>
        </div>
      </div>
    );
  }

  const statusLabel =
    !player.ready || Number(player.buyIn || 0) <= 0
      ? 'NOT READY'
      : !player.folded && (player.actionText === 'in hand' || player.actionText === 'check' || player.actionText === 'call') && stage !== 'waiting'
        ? 'IN HAND'
        : 'READY';

  const actionTone =
    player.isWinner
      ? 'text-emerald-400'
      : player.folded
        ? 'text-red-400'
        : player.actionText.includes('call') || player.actionText.includes('check')
          ? 'text-slate-400'
          : 'text-amber-300';

  return (
    <div className={`rounded-xl border px-3 py-2 min-w-[164px] backdrop-blur-sm ${isSelf ? 'border-cyan-500/50 bg-cyan-950/35' : 'border-slate-700 bg-slate-900/90'} ${isActive ? 'ring-2 ring-vault-neon-cyan ring-cyan-400 animate-pulse shadow-[0_0_16px_rgba(34,211,238,0.45)]' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-200">{player.username}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-700 bg-slate-950 text-slate-300 font-bold">{roleLabel}</span>
        </div>
        <div className="text-right">
          <p className={`text-[11px] uppercase font-semibold ${statusLabel === 'IN HAND' ? 'text-cyan-300' : player.ready ? 'text-emerald-400' : 'text-slate-500'}`}>
            {statusLabel}
          </p>
          <p className={`text-[11px] uppercase font-semibold ${actionTone}`}>{player.actionText}</p>
        </div>
      </div>
      <div className="mt-2 flex gap-1.5">
        {(player.hand.length > 0 ? player.hand : [{ hidden: true }, { hidden: true }]).map((card, index) => (
          <CardView key={`${JSON.stringify(card)}-${index}`} card={normalizeCardValue(card)} hidden={isHiddenCard(card)} compact />
        ))}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">Round Bet: {Number(player.roundBet || 0)}</p>
      {player.isWinner ? <p className="mt-1 text-[11px] text-emerald-400 font-semibold">Winner</p> : null}
    </div>
  );
});

const CardView = React.memo(function CardView({ card, hidden = false, compact = false }: { card: string; hidden?: boolean; compact?: boolean }) {
  const sizeClass = compact ? 'h-12 w-8' : 'h-16 w-11';

  if (hidden) {
    return (
      <div className={`rounded-md border border-blue-500/40 bg-gradient-to-br from-blue-900/80 to-slate-900 text-blue-300 flex items-center justify-center text-[10px] font-bold ${sizeClass}`}>
        NV
      </div>
    );
  }

  const symbol = cardSymbol(card);

  return (
    <div className={`rounded-md border border-slate-700 bg-slate-950 p-1 flex flex-col justify-between shadow-[0_6px_16px_rgba(2,6,23,0.45)] ${sizeClass}`}>
      <span className={`text-[10px] leading-none ${cardTone(card)}`}>{symbol.rank}</span>
      <span className={`text-center text-sm leading-none ${cardTone(card)}`}>{symbol.suit}</span>
      <span className={`text-[10px] leading-none self-end ${cardTone(card)}`}>{symbol.rank}</span>
    </div>
  );
});
