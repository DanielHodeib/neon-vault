'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';

interface PokerPlayer {
  socketId: string;
  username: string;
  ready: boolean;
  folded: boolean;
  hand: string[];
  actionText: string;
  isWinner: boolean;
}

interface PokerState {
  roomId: string;
  started: boolean;
  stage: string;
  board: string[];
  players: PokerPlayer[];
  winnerLabel: string;
}

const OTHER_SEAT_SLOTS = [
  'top-6 left-1/2 -translate-x-1/2',
  'top-20 left-8',
  'top-20 right-8',
  'bottom-28 left-8',
  'bottom-28 right-8',
];

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

export default function PokerFriendsGame({ username }: { username: string }) {
  const [pokerRoomId, setPokerRoomId] = useState('global');
  const [selfSocketId, setSelfSocketId] = useState<string | null>(null);
  const [state, setState] = useState<PokerState>({
    roomId: 'global',
    started: false,
    stage: 'waiting',
    board: [],
    players: [],
    winnerLabel: '',
  });
  const [notice, setNotice] = useState('Global poker table. Round starts automatically with 2 players.');

  const socketRef = useRef<Socket | null>(null);

  const me = useMemo(() => {
    if (selfSocketId) {
      const bySocket = state.players.find((player) => player.socketId === selfSocketId);
      if (bySocket) {
        return bySocket;
      }
    }

    return state.players.find((player) => player.username === username) ?? null;
  }, [state.players, selfSocketId, username]);

  const others = useMemo(() => {
    const ownSocketId = me?.socketId ?? selfSocketId;
    const ownUsername = me?.username ?? username;

    return state.players.filter((player) => {
      if (ownSocketId && player.socketId === ownSocketId) {
        return false;
      }

      if (ownUsername && player.username === ownUsername) {
        return false;
      }

      return true;
    });
  }, [state.players, selfSocketId, username, me]);

  useEffect(() => {
    const socketUrl = getSocketUrl();
    const forcePolling = shouldForcePolling(socketUrl);
    const socket = io(socketUrl, {
      path: '/socket.io',
      transports: forcePolling ? ['polling'] : ['websocket', 'polling'],
      upgrade: !forcePolling,
      query: { username, pokerRoomId: 'global' },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setSelfSocketId(socket.id ?? null);
    });

    socket.on('poker_room_joined', (payload: { ok: boolean; roomId?: string }) => {
      if (payload.ok && payload.roomId) {
        setPokerRoomId(payload.roomId);
      }
    });

    socket.on('poker_state', (payload: PokerState) => {
      setState(payload);
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
      socket.disconnect();
      socketRef.current = null;
    };
  }, [username]);

  const action = (nextAction: 'check' | 'call' | 'fold') => {
    socketRef.current?.emit('poker_action', { action: nextAction }, (response: { ok: boolean; error?: string }) => {
      if (!response.ok) {
        setNotice(response.error ?? 'Action failed.');
      }
    });
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-slate-900">
      <div className="px-5 py-3 border-b border-slate-800 bg-slate-950 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black tracking-wide text-slate-100 uppercase">Texas Hold&apos;em Friends</h2>
          <p className="text-xs text-slate-400">Global table with live seats and auto-start.</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase text-slate-500">Players Active</p>
          <p className="font-mono text-sm text-cyan-300">{state.players.length}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-4">
        <div className="h-full min-h-0 rounded-xl border border-slate-800 bg-[radial-gradient(ellipse_at_center,_rgba(22,163,74,0.28),_rgba(7,18,17,1)_65%)] relative overflow-hidden">
          <div className="absolute inset-[14%_9%_18%_9%] rounded-[999px] border border-emerald-500/25 bg-[radial-gradient(ellipse_at_center,_rgba(34,197,94,0.3),_rgba(5,14,13,0.94)_68%)] shadow-[inset_0_0_70px_rgba(0,0,0,0.55)]" />

          <div className="absolute top-[44%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-full max-w-[560px] px-4">
            <div className="text-center text-xs uppercase tracking-[0.26em] text-slate-400 mb-2">Board</div>
            <div className="flex items-center justify-center gap-2">
              {Array.from({ length: 5 }).map((_, index) => {
                const card = state.board[index];
                return <CardView key={card ?? `board-${index}`} card={card ?? '??'} hidden={!card} />;
              })}
            </div>
            <p className="mt-3 text-center text-sm text-slate-300">Stage: {state.stage}</p>
            <p className="mt-1 text-center text-xs text-slate-400">Room: Global</p>
            {state.winnerLabel ? <p className="mt-1 text-center text-sm font-semibold text-emerald-400">{state.winnerLabel}</p> : null}
            <p className="mt-1 text-center text-xs text-slate-400">{notice}</p>
          </div>

          {others.slice(0, OTHER_SEAT_SLOTS.length).map((player, index) => (
            <div key={player.socketId} className={`absolute z-30 ${OTHER_SEAT_SLOTS[index]}`}>
              <SeatView player={player} isSelf={false} />
            </div>
          ))}

          <div className="absolute z-30 bottom-4 left-1/2 -translate-x-1/2">
            <SeatView player={me ?? null} isSelf />
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800 bg-slate-950 p-4">
        <div className="flex flex-wrap gap-2 justify-end">
          <button onClick={() => action('check')} className="h-11 px-4 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-sm font-semibold uppercase">
            Check
          </button>
          <button onClick={() => action('call')} className="h-11 px-4 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-sm font-semibold uppercase">
            Call
          </button>
          <button onClick={() => action('fold')} className="h-11 px-4 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold uppercase">
            Fold
          </button>
        </div>
      </div>
    </div>
  );
}

function SeatView({ player, isSelf }: { player: PokerPlayer | null; isSelf: boolean }) {
  if (!player) {
    return (
      <div className={`rounded-xl border px-3 py-2 min-w-[148px] backdrop-blur-sm ${isSelf ? 'border-cyan-500/50 bg-cyan-950/35' : 'border-slate-700 bg-slate-900/90'}`}>
        <div className="text-xs uppercase text-slate-500">Waiting for seat...</div>
      </div>
    );
  }

  const actionTone =
    player.isWinner
      ? 'text-emerald-400'
      : player.folded
        ? 'text-red-400'
        : player.actionText.includes('call') || player.actionText.includes('check')
          ? 'text-slate-400'
          : 'text-amber-300';

  return (
    <div className={`rounded-xl border px-3 py-2 min-w-[148px] backdrop-blur-sm ${isSelf ? 'border-cyan-500/50 bg-cyan-950/35' : 'border-slate-700 bg-slate-900/90'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-slate-200">{player.username}</span>
        <div className="text-right">
          <p className={`text-[11px] uppercase font-semibold ${player.ready ? 'text-emerald-400' : 'text-slate-500'}`}>
            {player.ready ? 'Ready' : 'Not ready'}
          </p>
          <p className={`text-[11px] uppercase font-semibold ${actionTone}`}>{player.actionText}</p>
        </div>
      </div>
      <div className="mt-2 flex gap-1.5">
        {(player.hand.length > 0 ? player.hand : ['??', '??']).map((card, index) => (
          <CardView key={`${card}-${index}`} card={card} hidden={card === '??'} compact />
        ))}
      </div>
      {player.isWinner ? <p className="mt-1 text-[11px] text-emerald-400 font-semibold">Winner</p> : null}
    </div>
  );
}

function CardView({ card, hidden = false, compact = false }: { card: string; hidden?: boolean; compact?: boolean }) {
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
    <div className={`rounded-md border border-slate-700 bg-slate-950 p-1 flex flex-col justify-between ${sizeClass}`}>
      <span className={`text-[10px] leading-none ${cardTone(card)}`}>{symbol.rank}</span>
      <span className={`text-center text-sm leading-none ${cardTone(card)}`}>{symbol.suit}</span>
      <span className={`text-[10px] leading-none self-end ${cardTone(card)}`}>{symbol.rank}</span>
    </div>
  );
}
