'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useCasinoStore } from '../../store/useCasinoStore';

const MIN_BET = 1;
const GLOBAL_CRASH_ROOM_ID = 'global';

interface CrashPlayer {
  username: string;
  amount: number;
  cashedOut: boolean;
  cashedAt: number | null;
}

interface CrashStatePayload {
  roomId?: string;
  phase: 'waiting' | 'running' | 'crashed';
  multiplier: number;
  players: CrashPlayer[];
}

// Hilfsfunktion für die URL (optimiert für Tunnel/Lokale Setups)
function getSocketUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_GAME_SERVER_URL;
  if (typeof window === 'undefined') return fromEnv ?? 'http://localhost:4001';
  if (fromEnv === 'same-origin') return window.location.origin;
  return fromEnv ?? (window.location.hostname === 'localhost' ? 'http://localhost:4001' : window.location.origin);
}

export default function CrashGame() {
  const { balance, username, placeBet, addWin } = useCasinoStore();
  
  // States
  const [phase, setPhase] = useState<'waiting' | 'running' | 'crashed'>('waiting');
  const [multiplier, setMultiplier] = useState(1.0);
  const [betInput, setBetInput] = useState('100');
  const [players, setPlayers] = useState<CrashPlayer[]>([]);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [isSyncingCashOut, setIsSyncingCashOut] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  const socketRef = useRef<Socket | null>(null);

  // Memoized Values
  const effectiveUsername = useMemo(() => (username ?? '').trim() || 'Guest', [username]);
  
  // Findet den aktuellen User in der Spielerliste vom Server
  const serverMe = useMemo(() => 
    players.find(p => p.username === effectiveUsername),
    [players, effectiveUsername]
  );

  const hasBetOnServer = Boolean(serverMe && !serverMe.cashedOut);
  const hasBet = hasBetOnServer;
  const canEditBet = phase === 'waiting' && !isPlacingBet && !hasBetOnServer;
  const activePlayers = useMemo(
    () => Array.from(new Set(players.map((player) => player.username).filter(Boolean))),
    [players]
  );

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 4000);
  }, []);

  // Socket Connection & Events
  useEffect(() => {
    const url = getSocketUrl();
    const socket = io(url, {
      path: '/socket.io',
      transports: ['polling', 'websocket'], // Polling zuerst für stabilere Tunnel-Verbindungen
      query: { username: effectiveUsername, crashRoomId: GLOBAL_CRASH_ROOM_ID },
      reconnectionAttempts: 5,
      timeout: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => console.log('Crash Socket Connected'));

    socket.on('crash_state', (payload: CrashStatePayload) => {
      setPhase(payload.phase);
      setMultiplier(payload.multiplier);
      setPlayers(payload.players || []);
      if (payload.phase !== 'running') setIsSyncingCashOut(false);
    });

    socket.on('crash_tick', (payload: { roomId?: string; multiplier: number; players: CrashPlayer[] }) => {
      setMultiplier(payload.multiplier);
      setPlayers(payload.players || []);
      setPhase('running');
    });

    socket.on('crash_crashed', (data: { multiplier: number }) => {
      setPhase('crashed');
      setMultiplier(data.multiplier);
      setIsSyncingCashOut(false);
      setIsPlacingBet(false);
    });

    // WICHTIG: Wenn der Server uns sagt, wir haben gecashed, Guthaben updaten
    socket.on('crash_cashout_success', (data: { payout: number }) => {
      addWin(Math.floor(data.payout));
      setIsSyncingCashOut(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [effectiveUsername, addWin]);

  // Bet status is driven by server players list (crash_state/crash_tick), not local toggles.
  const handleBet = async () => {
    if (isPlacingBet || hasBetOnServer || phase !== 'waiting') return;

    const safeBet = Math.floor(Number(betInput));
    if (isNaN(safeBet) || safeBet < MIN_BET) return showError(`Min. Bet is ${MIN_BET}`);
    if (safeBet > Number(balance)) return showError("Not enough NVC");
    setIsPlacingBet(true);

    // 1. Geld im Frontend abziehen (Optimistisch)
    if (!placeBet(safeBet)) {
      setIsPlacingBet(false);
      return showError("Failed to deduct balance");
    }

    // 2. Server informieren
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      addWin(safeBet); // Rollback Geld
      setIsPlacingBet(false);
      return showError("Server not reachable");
    }

    socket.emit('crash_place_bet', { amount: safeBet, roomId: GLOBAL_CRASH_ROOM_ID }, (res: { ok: boolean; error?: string }) => {
      if (!res.ok) {
        // 3. Rollback bei Fehler
        addWin(safeBet);
        showError(res.error || "Bet rejected by server");
      }

      // On success, active-bet UI flips when server state includes this player.
      setIsPlacingBet(false);
    });
  };

  // CASHOUT HANDLER
  const handleCashOut = () => {
    if (phase !== 'running' || !hasBetOnServer || isSyncingCashOut) return;

    const socket = socketRef.current;
    if (!socket?.connected) return showError("Connection lost");

    setIsSyncingCashOut(true);
    socket.emit('crash_cashout', {}, (res: { ok: boolean; error?: string }) => {
      if (!res.ok) {
        showError(res.error || "Cashout failed");
        setIsSyncingCashOut(false);
      }
      // Erfolg wird über das Socket-Event 'crash_cashout_success' oder den nächsten Tick verarbeitet
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* GRAPH DISPLAY */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative">
        <div className={`text-8xl md:text-[140px] font-black tabular-nums transition-all duration-75 ${
          phase === 'crashed' ? 'text-red-500 scale-95 opacity-80' : 'text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]'
        }`}>
          {multiplier.toFixed(2)}<span className="text-4xl md:text-6xl">x</span>
        </div>
        
        <div className="mt-8 px-6 py-2 rounded-full bg-slate-900 border border-slate-800 text-slate-400 uppercase tracking-[0.2em] text-sm font-bold animate-pulse">
          {phase === 'waiting' ? 'Accepting Bets...' : phase === 'running' ? 'To the moon!' : 'Crashed!'}
        </div>

        {/* ERROR TOAST INSIDE GAME */}
        {errorMsg && (
          <div className="absolute top-10 bg-red-500 text-white px-6 py-3 rounded-lg font-bold shadow-2xl animate-bounce">
            {errorMsg}
          </div>
        )}
      </div>

      {/* FOOTER CONTROLS */}
      <div className="bg-slate-900/50 border-t border-white/5 p-6 backdrop-blur-md">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row gap-6">
          
          {/* INPUT GROUP */}
          <div className="flex-1">
            <div className="flex justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Bet Amount</span>
              <span className="text-xs font-bold text-slate-400">Balance: {balance.toLocaleString()} NVC</span>
            </div>
            <div className="relative">
              <input 
                type="number" 
                value={betInput}
                onChange={(e) => setBetInput(e.target.value)}
                disabled={!canEditBet}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xl outline-none focus:border-blue-500 transition-all disabled:opacity-50"
              />
              <div className="absolute right-2 top-2 bottom-2 flex gap-1">
                <button onClick={() => setBetInput(String(Math.floor(Number(betInput)/2)))} disabled={!canEditBet} className="px-3 bg-slate-800 rounded-lg text-xs hover:bg-slate-700">1/2</button>
                <button onClick={() => setBetInput(String(Number(betInput)*2))} disabled={!canEditBet} className="px-3 bg-slate-800 rounded-lg text-xs hover:bg-slate-700">2x</button>
              </div>
            </div>
          </div>

          {/* ACTION BUTTON */}
          <div className="flex-1 flex flex-col justify-end">
            {phase !== 'running' ? (
              <button 
                onClick={handleBet}
                disabled={isPlacingBet || hasBetOnServer}
                className={`h-[62px] w-full rounded-xl font-black text-xl uppercase tracking-wider transition-all shadow-lg ${
                  hasBetOnServer 
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-500 text-white active:scale-95 shadow-blue-900/20'
                }`}
              >
                {isPlacingBet ? 'Syncing...' : hasBet ? 'Bet Active' : 'Place Bet'}
              </button>
            ) : (
              <button 
                onClick={handleCashOut}
                disabled={!hasBetOnServer || isSyncingCashOut}
                className={`h-[62px] w-full rounded-xl font-black text-xl uppercase tracking-wider transition-all shadow-lg ${
                  !hasBetOnServer || isSyncingCashOut
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 active:scale-95 shadow-emerald-900/20'
                }`}
              >
                {isSyncingCashOut ? 'Syncing...' : hasBetOnServer ? `Cash Out ${(Number(serverMe?.amount || 0) * multiplier).toFixed(2)}` : 'Waiting...'}
              </button>
            )}
          </div>

          <div className="flex-1 md:max-w-[240px]">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Players Active ({activePlayers.length})</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {activePlayers.length === 0 ? <span className="text-xs text-slate-500">No players yet</span> : null}
                {activePlayers.map((player, index) => (
                  <span key={`${player}-${index}`} className="px-2 py-1 rounded-md border border-slate-700 bg-slate-900 text-[11px] text-slate-200">
                    {player}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}