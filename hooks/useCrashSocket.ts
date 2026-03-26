'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

export type CrashPhase = 'waiting' | 'running' | 'crashed';

export interface CrashPlayer {
  username: string;
  amount: number;
  cashedOut: boolean;
  cashedAt: number | null;
}

const ACK_TIMEOUT_MS = 12000;

interface CrashStatePayload {
  roomId?: string;
  phase: CrashPhase;
  multiplier: number;
  history?: number[];
  players: CrashPlayer[];
  roundStartAt?: number;
}

interface CrashTickPayload {
  roomId?: string;
  multiplier: number;
  players: CrashPlayer[];
}

interface CrashCrashedPayload {
  roomId?: string;
  crashPoint?: number;
  history?: number[];
  players?: CrashPlayer[];
}

interface CrashCashoutResult {
  ok: boolean;
  payout: number;
  multiplier: number;
  mode: 'auto' | 'manual';
  roomId?: string;
}

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
    return new URL(fromEnv).toString().replace(/\/$/, '');
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

export function useCrashSocket(username: string, opts?: { defaultRoomId?: string; balance?: string | number; xp?: number }) {
  const defaultRoomId = opts?.defaultRoomId ?? 'global';
  const initialBalanceRef = useRef(String(opts?.balance ?? Number.MAX_SAFE_INTEGER));
  const initialXpRef = useRef(String(opts?.xp ?? 0));
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState(defaultRoomId);
  const [phase, setPhase] = useState<CrashPhase>('waiting');
  const [multiplier, setMultiplier] = useState(1);
  const [history, setHistory] = useState<number[]>([]);
  const [players, setPlayers] = useState<CrashPlayer[]>([]);
  const [roundStartAt, setRoundStartAt] = useState(0);
  const [lastCashout, setLastCashout] = useState<CrashCashoutResult | null>(null);
  const [error, setError] = useState('');

  const socketRef = useRef<Socket | null>(null);

  const normalizedUsername = useMemo(() => String(username ?? '').trim() || 'Guest', [username]);
  const myPlayer = useMemo(
    () => players.find((player) => String(player.username ?? '').trim().toLowerCase() === normalizedUsername.toLowerCase()),
    [players, normalizedUsername]
  );
  const hasActiveBet = Boolean(myPlayer && !myPlayer.cashedOut);

  useEffect(() => {
    const socketUrl = getSocketUrl();
    const forcePolling = shouldForcePolling(socketUrl);
    const socket = io(socketUrl, {
      path: '/socket.io',
      transports: forcePolling ? ['polling'] : ['websocket', 'polling'],
      upgrade: !forcePolling,
      query: {
        username: normalizedUsername,
        crashRoomId: defaultRoomId,
        xp: initialXpRef.current,
        balance: initialBalanceRef.current,
      },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setError('');
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('crash_room_joined', (payload: { ok?: boolean; roomId?: string }) => {
      if (payload?.ok && payload.roomId) {
        setRoomId(payload.roomId);
      }
    });

    socket.on('crash_state', (payload: CrashStatePayload) => {
      if (payload?.roomId) {
        setRoomId(payload.roomId);
      }
      setPhase(payload.phase);
      setMultiplier(payload.multiplier);
      setHistory(Array.isArray(payload.history) ? payload.history : []);
      setPlayers(payload.players ?? []);
      setRoundStartAt(Number(payload.roundStartAt ?? 0));
    });

    socket.on('crash_tick', (payload: CrashTickPayload) => {
      if (payload?.roomId) {
        setRoomId(payload.roomId);
      }
      setPhase('running');
      setMultiplier(payload.multiplier);
      setPlayers(payload.players ?? []);
    });

    socket.on('crash_players', (payload: CrashPlayer[]) => {
      setPlayers(payload ?? []);
    });

    socket.on('crash_crashed', (payload: CrashCrashedPayload) => {
      setPhase('crashed');
      setMultiplier((current) => Number(payload?.crashPoint ?? current));
      if (Array.isArray(payload?.history)) {
        setHistory(payload.history);
      } else if (Number.isFinite(payload?.crashPoint)) {
        setHistory((current) => [Number(payload.crashPoint), ...current].slice(0, 16));
      }
      if (Array.isArray(payload?.players)) {
        setPlayers(payload.players);
      }
    });

    socket.on('crash_cashout_result', (payload: CrashCashoutResult) => {
      if (payload?.ok) {
        setLastCashout(payload);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [defaultRoomId, normalizedUsername]);

  const placeBet = useCallback(
    (amount: number, autoCashOut: number = 0) =>
      new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) {
          resolve({ ok: false, error: 'Socket offline.' });
          return;
        }

        let settled = false;
        const timeout = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          setError('Bet sync timeout. Please try again.');
          resolve({ ok: false, error: 'Bet sync timeout.' });
        }, ACK_TIMEOUT_MS);

        socket.emit('crash_place_bet', { roomId, amount, autoCashOut }, (response: { ok: boolean; error?: string }) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          if (!response.ok) {
            setError(response.error ?? 'Bet rejected.');
          } else {
            setError('');
          }
          resolve(response);
        });
      }),
    [roomId]
  );

  const cashOut = useCallback(
    () =>
      new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const socket = socketRef.current;
        if (!socket || !socket.connected) {
          resolve({ ok: false, error: 'Socket offline.' });
          return;
        }

        let settled = false;
        const timeout = window.setTimeout(() => {
          if (settled) return;
          settled = true;
          setError('Cashout sync timeout. Please try again.');
          resolve({ ok: false, error: 'Cashout sync timeout.' });
        }, ACK_TIMEOUT_MS);

        socket.emit('crash_cashout', {}, (response: { ok: boolean; error?: string }) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          if (!response.ok) {
            setError(response.error ?? 'Cashout failed.');
          } else {
            setError('');
          }
          resolve(response);
        });
      }),
    []
  );

  const joinRoom = useCallback((nextRoomId: string) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      return;
    }

    socket.emit('join_crash_room', { roomId: nextRoomId });
  }, []);

  const clearCashout = useCallback(() => {
    setLastCashout(null);
  }, []);

  return {
    connected,
    roomId,
    phase,
    multiplier,
    history,
    players,
    myPlayer,
    hasActiveBet,
    roundStartAt,
    lastCashout,
    error,
    placeBet,
    cashOut,
    joinRoom,
    clearCashout,
  };
}
