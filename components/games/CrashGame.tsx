'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
  history?: number[];
  players: CrashPlayer[];
}

interface CrashCrashedPayload {
  crashPoint?: number;
  multiplier?: number;
  history?: number[];
}

function burstOffset(index: number) {
  const angle = (index / 16) * Math.PI * 2;
  const radius = 8 + (index % 5) * 2.4;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function multiplierToYPercent(value: number) {
  const progress = Math.min(1, Math.log10(Math.max(1, value)) / Math.log10(45));
  // Keep the rocket inside the visible flight corridor (away from top badges and bottom HUD).
  return Math.max(18, 68 - progress * 50);
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
  const [history, setHistory] = useState<number[]>([]);
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [isSyncingCashOut, setIsSyncingCashOut] = useState(false);
  const [autoCashOutEnabled, setAutoCashOutEnabled] = useState(false);
  const [autoCashOutInput, setAutoCashOutInput] = useState('2.00');
  const [errorMsg, setErrorMsg] = useState('');
  const [launchPulse, setLaunchPulse] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  
  const socketRef = useRef<Socket | null>(null);
  const previousPhaseRef = useRef<'waiting' | 'running' | 'crashed'>('waiting');
  const audioContextRef = useRef<AudioContext | null>(null);

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
  const activeStake = Number(serverMe?.amount ?? 0);
  const potential = hasBetOnServer ? activeStake * multiplier : Number(betInput || 0) * multiplier;
  const rocketX = 50;
  const rocketY = multiplierToYPercent(multiplier);
  const speedFactor = Math.max(0.8, Math.min(9, multiplier));
  const trailDuration = Math.max(0.45, 4.5 / speedFactor);
  const scanDuration = Math.max(2, 18 / speedFactor);
  const altitudeMeters = Math.floor(multiplier * 100);
  const scaleMarks = useMemo(() => [1, 1.25, 1.5, 2, 3, 5, 8, 12, 20, 35], []);
  const autoCashOutValue = useMemo(() => {
    const parsed = Number(autoCashOutInput);
    if (!Number.isFinite(parsed)) {
      return 2;
    }
    return Math.max(1.05, Math.min(100, parsed));
  }, [autoCashOutInput]);
  const flameTier = multiplier >= 10 ? 3 : multiplier >= 5 ? 2 : multiplier >= 2 ? 1 : 0;

  const playTone = useCallback((frequency: number, durationMs: number, type: OscillatorType = 'sine', gain = 0.045) => {
    if (!soundEnabled || typeof window === 'undefined') {
      return;
    }

    try {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) {
        return;
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new Ctx();
      }

      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
      gainNode.gain.setValueAtTime(gain, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + durationMs / 1000);
    } catch {
      // no-op when audio is unavailable
    }
  }, [soundEnabled]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch('/api/settings', { cache: 'no-store' });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { settings?: { soundEnabled?: boolean } };
        if (!cancelled && typeof payload.settings?.soundEnabled === 'boolean') {
          setSoundEnabled(payload.settings.soundEnabled);
        }
      } catch {
        // keep default
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const previousPhase = previousPhaseRef.current;

    if (phase === 'running' && previousPhase !== 'running') {
      setLaunchPulse((current) => current + 1);
      playTone(520, 160, 'triangle', 0.05);
      window.setTimeout(() => playTone(760, 120, 'triangle', 0.04), 90);
    }

    if (phase === 'crashed' && previousPhase !== 'crashed') {
      playTone(180, 240, 'sawtooth', 0.06);
      window.setTimeout(() => playTone(120, 260, 'sawtooth', 0.045), 70);
    }

    previousPhaseRef.current = phase;
  }, [phase, playTone]);

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
      setHistory(Array.isArray(payload.history) ? payload.history : []);
      setPlayers(payload.players || []);
      if (payload.phase !== 'running') setIsSyncingCashOut(false);
    });

    socket.on('crash_tick', (payload: { roomId?: string; multiplier: number; players: CrashPlayer[] }) => {
      setMultiplier(payload.multiplier);
      setPlayers(payload.players || []);
      setPhase('running');
    });

    socket.on('crash_crashed', (data: CrashCrashedPayload) => {
      setPhase('crashed');
      const crashValue = Number(data?.crashPoint ?? data?.multiplier ?? multiplier);
      setMultiplier(Number.isFinite(crashValue) ? crashValue : multiplier);
      if (Array.isArray(data?.history)) {
        setHistory(data.history);
      } else if (Number.isFinite(crashValue)) {
        setHistory((current) => [crashValue, ...current].slice(0, 16));
      }
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
    if (autoCashOutEnabled && autoCashOutValue <= 1) {
      return showError('Auto cashout must be above 1.00x');
    }
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

    socket.emit(
      'crash_place_bet',
      {
        amount: safeBet,
        roomId: GLOBAL_CRASH_ROOM_ID,
        autoCashOut: autoCashOutEnabled ? autoCashOutValue : 0,
      },
      (res: { ok: boolean; error?: string }) => {
      if (!res.ok) {
        // 3. Rollback bei Fehler
        addWin(safeBet);
        showError(res.error || "Bet rejected by server");
      }

      // On success, active-bet UI flips when server state includes this player.
      setIsPlacingBet(false);
      }
    );
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
      } else {
        playTone(900, 140, 'sine', 0.05);
      }
      // Erfolg wird über das Socket-Event 'crash_cashout_success' oder den nächsten Tick verarbeitet
    });
  };

  const handleParallaxMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - target.left) / target.width - 0.5) * 2;
    const y = ((event.clientY - target.top) / target.height - 0.5) * 2;
    setParallax({ x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) });
  };

  const resetParallax = () => {
    setParallax({ x: 0, y: 0 });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      <div className="relative flex-1 min-h-0 border-b border-slate-800 overflow-hidden" onMouseMove={handleParallaxMove} onMouseLeave={resetParallax}>
        <motion.div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.22),_rgba(2,6,23,1)_64%)]"
          animate={{ opacity: phase === 'crashed' ? [1, 0.88, 1] : 1 }}
          transition={{ duration: 0.42 }}
        />

        <div className="absolute left-3 top-14 bottom-28 z-20 w-20 pointer-events-none">
          <div className="absolute left-2 top-0 bottom-0 w-px bg-cyan-500/30" />
          {scaleMarks.map((mark) => {
            const y = multiplierToYPercent(mark);
            return (
              <div
                key={`scale-${mark}`}
                className="absolute left-0 right-0"
                style={{ top: `${y}%`, transform: 'translateY(-50%)' }}
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-px bg-cyan-400/55" />
                  <span className="text-[10px] font-mono text-cyan-300/90">{mark.toFixed(mark < 2 ? 2 : 0)}x</span>
                </div>
              </div>
            );
          })}
        </div>

        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{ x: parallax.x * -8, y: parallax.y * -6 }}
          transition={{ type: 'spring', stiffness: 80, damping: 18, mass: 0.5 }}
        >
          <div className="absolute top-8 left-10 h-24 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="absolute top-24 right-16 h-20 w-56 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute top-48 left-1/3 h-16 w-44 rounded-full bg-sky-400/10 blur-3xl" />
        </motion.div>

        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{ x: parallax.x * 6, y: parallax.y * 4 }}
          transition={{ type: 'spring', stiffness: 85, damping: 20, mass: 0.45 }}
        >
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-[linear-gradient(180deg,transparent_0%,rgba(8,47,73,0.35)_56%,rgba(2,6,23,0.95)_100%)]" />
        </motion.div>

        <motion.div
          className="absolute inset-x-0 bottom-0 h-36 pointer-events-none"
          animate={phase === 'running' ? { opacity: [0.45, 0.8, 0.5], y: [0, -4, 0] } : { opacity: phase === 'crashed' ? [0.7, 0.95, 0.75] : 0.35, y: 0 }}
          transition={{ duration: 0.65, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_92%,rgba(248,113,113,0.42)_0%,rgba(248,113,113,0.2)_22%,rgba(239,68,68,0.11)_38%,transparent_72%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_8%,rgba(244,63,94,0.12)_72%,rgba(190,24,93,0.2)_100%)]" />
        </motion.div>

        <motion.div
          className="absolute inset-0 opacity-45"
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: scanDuration, ease: 'linear', repeat: Infinity }}
        >
          <div className="absolute inset-y-0 left-0 flex w-[200%]">
            {[0, 1].map((index) => (
              <div
                key={`scan-${index}`}
                className="h-full w-1/2 bg-[repeating-linear-gradient(105deg,transparent_0_28px,rgba(56,189,248,0.16)_28px_29px,transparent_29px_64px)]"
              />
            ))}
          </div>
        </motion.div>

        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
          <div className="px-3 py-1 rounded-md border border-slate-700 bg-slate-950/75 text-xs uppercase tracking-wide text-slate-300">
            Mode: Neon Rocket
          </div>
          <div className="px-3 py-1 rounded-md border border-slate-700 bg-slate-950/75 text-xs uppercase tracking-wide text-slate-300">
            {autoCashOutEnabled ? `Auto ${autoCashOutValue.toFixed(2)}x` : 'Auto Off'}
          </div>
          <div className={`px-3 py-1 rounded-md border text-xs uppercase tracking-wide ${phase === 'crashed' ? 'border-rose-500/50 text-rose-300 bg-rose-500/10' : 'border-cyan-500/40 text-cyan-300 bg-cyan-500/10'}`}>
            {phase === 'waiting' ? 'Armed' : phase === 'running' ? 'In Flight' : 'Crashed'}
          </div>
        </div>

        <motion.div
          className="absolute z-30 -translate-x-1/2 transform-gpu will-change-transform"
          initial={false}
          animate={phase === 'running'
            ? {
                left: `${rocketX}%`,
                top: `${rocketY}%`,
                x: [-0.5, 0.5, -0.5, 0.5, 0],
                y: [-1, 1, -1, 1, 0],
                rotate: [-0.4, 0.4, -0.4, 0.4, 0],
              }
            : {
                left: `${rocketX}%`,
                top: `${rocketY}%`,
                x: 0,
                y: 0,
                rotate: phase === 'crashed' ? -12 : 0,
              }}
          transition={phase === 'running'
            ? { left: { duration: 0.16, ease: 'linear' }, top: { duration: 0.16, ease: 'linear' }, duration: 0.42, repeat: Infinity, ease: 'easeInOut' }
            : { left: { duration: 0.2, ease: 'easeOut' }, top: { duration: 0.2, ease: 'easeOut' }, duration: 0.24 }}
        >
          <motion.div
            className={`relative h-28 w-20 ${phase === 'crashed' ? 'text-rose-300' : 'text-cyan-300'}`}
            animate={phase === 'crashed' ? { filter: ['drop-shadow(0 0 9px rgba(251,113,133,0.72))', 'drop-shadow(0 0 24px rgba(251,113,133,1))', 'drop-shadow(0 0 9px rgba(251,113,133,0.72))'] } : { filter: 'drop-shadow(0 0 15px rgba(34,211,238,0.86))' }}
            transition={{ duration: 0.55 }}
          >
            <svg viewBox="0 0 120 220" className="h-full w-full" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M60 14 L78 46 L78 140 L42 140 L42 46 Z" />
              <path d="M42 46 L60 14 L78 46 Z" />
              <path d="M42 120 L22 148 L42 140 Z" />
              <path d="M78 120 L98 148 L78 140 Z" />
              <path d="M42 140 L60 178 L78 140 Z" />
              <circle cx="60" cy="86" r="10" className="text-slate-950" fill="currentColor" />
            </svg>
            <motion.div
              className="absolute left-1/2 -bottom-8 h-10 w-4 -translate-x-1/2 rounded-full bg-rose-500/70 blur-md"
              animate={{
                scaleY: phase === 'running' ? [0.8 + flameTier * 0.06, 1.45 + flameTier * 0.24, 0.86 + flameTier * 0.08] : 0.55,
                opacity: phase === 'crashed' ? 0 : [0.45, 1, 0.45],
              }}
              transition={{ duration: trailDuration, repeat: Infinity, ease: 'linear' }}
            />
            <motion.div
              className="absolute left-1/2 -bottom-11 h-8 w-8 -translate-x-1/2 rounded-full bg-orange-400/40 blur-lg"
              animate={{
                scale: phase === 'running' ? [0.88 + flameTier * 0.06, 1.24 + flameTier * 0.14, 0.92 + flameTier * 0.08] : 0.72,
                opacity: phase === 'crashed' ? 0 : [0.35, 0.9, 0.35],
              }}
              transition={{ duration: 0.36, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute left-1/2 -bottom-14 h-10 w-10 -translate-x-1/2 rounded-full bg-red-500/35 blur-xl"
              animate={{
                scale: phase === 'running' ? [0.9 + flameTier * 0.08, 1.16 + flameTier * 0.18, 0.95 + flameTier * 0.1] : 0.78,
                opacity: phase === 'crashed' ? 0 : [0.2, 0.62, 0.22],
              }}
              transition={{ duration: 0.44, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        </motion.div>

        <AnimatePresence>
          {launchPulse > 0 && phase === 'running' ? (
            <motion.div
              key={`launch-pulse-${launchPulse}`}
              className="absolute inset-0 z-25 pointer-events-none"
              initial={{ opacity: 0.4, scale: 0.98 }}
              animate={{ opacity: 0, scale: 1.08 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_80%,rgba(34,211,238,0.32)_0%,rgba(34,211,238,0.08)_24%,transparent_60%)]" />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {phase === 'crashed' ? (
            <>
              {Array.from({ length: 16 }).map((_, index) => {
                const offset = burstOffset(index);
                const nextLeft = Math.max(0, Math.min(100, rocketX + offset.x));
                const nextTop = Math.max(0, Math.min(100, rocketY + offset.y));

                return (
                  <motion.span
                    key={`rocket-burst-${index}`}
                    className="absolute z-40 h-1.5 w-1.5 rounded-full bg-rose-400"
                    initial={{ left: `${rocketX}%`, top: `${rocketY}%`, opacity: 1, scale: 1 }}
                    animate={{ left: `${nextLeft}%`, top: `${nextTop}%`, opacity: 0, scale: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.72, ease: 'easeOut' }}
                  />
                );
              })}
            </>
          ) : null}
        </AnimatePresence>

        <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-slate-800 bg-slate-950/80 backdrop-blur p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs uppercase tracking-wide">
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
              <p className="text-slate-500">Multiplier</p>
              <p className="font-mono text-cyan-300 text-lg normal-case">{multiplier.toFixed(2)}x</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
              <p className="text-slate-500">Altitude</p>
              <p className="font-mono text-cyan-300 text-lg normal-case">{altitudeMeters}m</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
              <p className="text-slate-500">Speed</p>
              <p className="font-mono text-cyan-300 text-lg normal-case">{multiplier.toFixed(2)}x Mach</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
              <p className="text-slate-500">Potential</p>
              <p className="font-mono text-emerald-300 text-lg normal-case">{potential.toFixed(2)} NVC</p>
            </div>
          </div>
        </div>

        {errorMsg ? (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-40 bg-red-500 text-white px-6 py-3 rounded-lg font-bold shadow-2xl">
            {errorMsg}
          </div>
        ) : null}
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

          <div className="flex-1 md:max-w-[260px]">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Auto Cashout</p>
              <button
                type="button"
                onClick={() => setAutoCashOutEnabled((current) => !current)}
                disabled={phase === 'running' && hasBetOnServer}
                className={`mb-2 w-full h-9 rounded-lg border text-xs font-bold uppercase transition-colors ${
                  autoCashOutEnabled
                    ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                    : 'border-slate-700 bg-slate-900 text-slate-400'
                } ${(phase === 'running' && hasBetOnServer) ? 'opacity-60 cursor-not-allowed' : 'hover:border-cyan-400 hover:text-cyan-200'}`}
              >
                {autoCashOutEnabled ? 'On' : 'Off'}
              </button>
              <input
                type="number"
                min={1.05}
                step={0.05}
                value={autoCashOutInput}
                onChange={(event) => setAutoCashOutInput(event.target.value)}
                disabled={(phase === 'running' && hasBetOnServer) || !autoCashOutEnabled}
                className="w-full h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 font-mono text-slate-100 outline-none focus:border-cyan-500 disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        <div className="max-w-4xl mx-auto mt-4 rounded-xl border border-slate-800 bg-slate-950 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">History</p>
          <div className="flex flex-wrap gap-1.5">
            {history.length === 0 ? <span className="text-xs text-slate-500">No rounds yet</span> : null}
            {history.slice(0, 14).map((entry, index) => (
              <span
                key={`crash-history-${entry}-${index}`}
                className={`px-2 py-1 rounded-md border text-[11px] font-mono ${entry >= 3 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : entry >= 1.8 ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' : 'bg-rose-500/10 text-rose-400 border-rose-500/30'}`}
              >
                {entry.toFixed(2)}x
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}