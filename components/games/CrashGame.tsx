'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useCasinoStore } from '../../store/useCasinoStore';

const MIN_BET = 1;

interface CrashPlayer {
  username: string;
  amount: number;
  cashedOut: boolean;
  cashedAt: number | null;
}

interface CrashStatePayload {
  roomId: string;
  phase: 'waiting' | 'running' | 'crashed';
  multiplier: number;
  crashPoint: number | null;
  history: number[];
  players: CrashPlayer[];
  roundStartAt: number;
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
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    const isPrivateIp = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
    if (isLocalHost || isPrivateIp) {
      return `${window.location.protocol}//${window.location.hostname}:4001`;
    }
    return window.location.origin;
  }
}

export default function CrashGame() {
  const { balance, username, placeBet, addWin } = useCasinoStore();
  const [phase, setPhase] = useState<'waiting' | 'running' | 'crashed'>('waiting');
  const [multiplier, setMultiplier] = useState(1.0);
  const [betInput, setBetInput] = useState('100');
  const [players, setPlayers] = useState<CrashPlayer[]>([]);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [isSyncingCashOut, setIsSyncingCashOut] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const processedCashoutRef = useRef<string | null>(null);

  const safeBalance = Math.max(0, Math.floor(balance));
  const effectiveUsername = useMemo(() => (username ?? '').trim() || 'Guest', [username]);
  const activePlayer = useMemo(
    () => players.find((player) => player.username === effectiveUsername && !player.cashedOut) ?? null,
    [effectiveUsername, players]
  );
  const hasBet = Boolean(activePlayer);
  const canEditBet = phase !== 'running' && !isPlacingBet && !hasBet;
  const roundBet = activePlayer?.amount ?? 0;

  const showError = (message: string) => {
    setErrorMsg(message);
    window.setTimeout(() => setErrorMsg(''), 3000);
  };

  const normalizeBet = (value: number) => {
    const numeric = Number.isFinite(value) ? Math.floor(value) : 0;
    return Math.max(0, numeric);
  };

  useEffect(() => {
    const socket = io(getSocketUrl(), {
      path: '/socket.io',
      transports: ['websocket'],
      query: { username: effectiveUsername, crashRoomId: 'global' },
    });

    socketRef.current = socket;

    socket.on('crash_state', (payload: CrashStatePayload) => {
      setPhase(payload.phase);
      setMultiplier(payload.multiplier);
      setPlayers(payload.players ?? []);
      if (payload.phase !== 'running') {
        setIsSyncingCashOut(false);
      }
    });

    socket.on('crash_tick', (payload: { multiplier: number; players: CrashPlayer[] }) => {
      setPhase('running');
      setMultiplier(payload.multiplier);
      setPlayers(payload.players ?? []);
    });

    socket.on('crash_players', (payload: CrashPlayer[]) => {
      setPlayers(payload ?? []);
    });

    socket.on('crash_crashed', () => {
      setPhase('crashed');
      setIsSyncingCashOut(false);
    });

    socket.on('crash_cashout_result', async (payload: { ok: boolean; payout?: number; multiplier?: number; error?: string }) => {
      if (!payload.ok || typeof payload.payout !== 'number') {
        showError(payload.error ?? 'Cashout failed');
        setIsSyncingCashOut(false);
        return;
      }

      const payout = Math.floor(payload.payout);
      const signature = `${payout}:${payload.multiplier ?? 0}`;
      if (processedCashoutRef.current === signature) {
        return;
      }
      processedCashoutRef.current = signature;

      addWin(payout);

      setIsSyncingCashOut(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [addWin, effectiveUsername]);

  const handleBet = async () => {
    if (phase === 'running' || isPlacingBet || hasBet) {
      return;
    }

    const safeBet = normalizeBet(Number(betInput || 0));
    if (safeBet < MIN_BET) {
      showError('Bet must be at least 1');
      return;
    }

    if (safeBet > safeBalance) {
      showError('Not enough funds');
      return;
    }

    if (!placeBet(safeBet)) {
      showError('Not enough funds');
      return;
    }

    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      addWin(safeBet);
      showError('Socket not connected');
      return;
    }

    setIsPlacingBet(true);

    socket.emit('crash_place_bet', { amount: safeBet, autoCashOut: 0 }, async (response: { ok: boolean; error?: string }) => {
      if (!response.ok) {
        addWin(safeBet);
        showError(response.error ?? 'Could not place crash bet');
        setIsPlacingBet(false);
        return;
      }

      setBetInput(String(safeBet));
      setErrorMsg('');
      setIsPlacingBet(false);
    });
  };

  const handleCashOut = async () => {
    if (phase !== 'running' || !hasBet || isSyncingCashOut) {
      return;
    }

    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      showError('Socket not connected');
      return;
    }

    setIsSyncingCashOut(true);
    socket.emit('crash_cashout', {}, (response: { ok: boolean; error?: string }) => {
      if (!response.ok) {
        showError(response.error ?? 'Cashout failed');
        setIsSyncingCashOut(false);
      }
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* MASSIVE GRAPH AREA */}
      <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden">
        <div className={`text-[120px] md:text-[160px] font-black font-mono leading-none tracking-tighter transition-colors ${
          phase === 'crashed' ? 'text-red-500' : 'text-white'
        }`}>
          {multiplier.toFixed(2)}x
        </div>
        <div className="mt-4 text-slate-400 font-medium uppercase tracking-widest text-lg">
          {phase === 'crashed' ? 'Crashed' : phase === 'running' ? 'Flying...' : 'Waiting for next round'}
        </div>
      </div>

      {/* CONTROLS */}
      <div className="bg-slate-950 border-t border-slate-800 p-6 flex items-center gap-6">
        <div className="w-1/3">
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Bet Amount</label>
          <div className="flex bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <input 
              type="number" value={betInput || ''} min={0} onChange={(e) => setBetInput(e.target.value.replace(/[^0-9]/g, ''))}
              disabled={!canEditBet}
              className="w-full bg-transparent p-4 outline-none font-mono text-white"
            />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <button
              onClick={() => {
                const normalized = normalizeBet(Number(betInput || 0));
                if (normalized <= MIN_BET) {
                  setBetInput(String(MIN_BET));
                  return;
                }
                setBetInput(String(Math.max(MIN_BET, Math.floor(normalized / 2))));
              }}
              disabled={!canEditBet}
              className="h-9 rounded-md border border-slate-800 bg-slate-900 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              1/2
            </button>
            <button
              onClick={() => {
                const normalized = normalizeBet(Number(betInput || 0));
                const doubled = normalized <= 0 ? 2 : normalized * 2;
                setBetInput(String(Math.min(safeBalance, Math.max(MIN_BET, doubled))));
              }}
              disabled={!canEditBet}
              className="h-9 rounded-md border border-slate-800 bg-slate-900 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              2x
            </button>
            <button
              onClick={() => setBetInput(String(Math.max(MIN_BET, safeBalance)))}
              disabled={!canEditBet}
              className="h-9 rounded-md border border-slate-800 bg-slate-900 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              MAX
            </button>
          </div>
          {errorMsg && <p className="text-red-500 text-xs mt-2 font-medium">{errorMsg}</p>}
        </div>

        <div className="flex-1">
          {phase !== 'running' ? (
            <button onClick={() => void handleBet()}
              disabled={isPlacingBet || hasBet}
              className="w-full py-5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg uppercase transition-colors"
            >
              {isPlacingBet ? 'Syncing Bet...' : 'Place Bet'}
            </button>
          ) : (
            <button onClick={() => void handleCashOut()} disabled={!hasBet || isSyncingCashOut}
              className={`w-full py-5 rounded-lg font-bold text-lg uppercase transition-colors ${
                !hasBet || isSyncingCashOut ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
              }`}
            >
              {hasBet ? `Cash Out ${(roundBet * multiplier).toFixed(2)}` : isSyncingCashOut ? 'Syncing Win...' : 'Spectating'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}