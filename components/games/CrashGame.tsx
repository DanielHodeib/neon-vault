'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
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

// Hilfsfunktion für die URL (optimiert für Tunnel/Lokale Setups)
function getSocketUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SOCKET_URL ?? process.env.NEXT_PUBLIC_GAME_SERVER_URL;
  const fallbackUrl = 'http://63.179.106.186:5000';
  if (typeof window === 'undefined') return fromEnv ?? fallbackUrl;
  if (fromEnv === 'same-origin') return window.location.origin;
  return fromEnv ?? fallbackUrl;
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
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  
  const socketRef = useRef<Socket | null>(null);
  const previousPhaseRef = useRef<'waiting' | 'running' | 'crashed'>('waiting');
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastCrashTickUpdateRef = useRef(0);
  const pendingCrashTickRef = useRef<{ multiplier: number; players: CrashPlayer[] } | null>(null);
  const crashTickFlushTimerRef = useRef<number | null>(null);
  const graphContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const targetMultiplierRef = useRef(1);
  const renderedMultiplierRef = useRef(1);
  const crashedAtRef = useRef<number | null>(null);

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
  const altitudeMeters = Math.floor(multiplier * 100);
  const autoCashOutValue = useMemo(() => {
    const parsed = Number(autoCashOutInput);
    if (!Number.isFinite(parsed)) {
      return 2;
    }
    return Math.max(1.05, Math.min(100, parsed));
  }, [autoCashOutInput]);

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
      playTone(520, 160, 'triangle', 0.05);
      window.setTimeout(() => playTone(760, 120, 'triangle', 0.04), 90);
    }

    if (phase === 'crashed' && previousPhase !== 'crashed') {
      playTone(180, 240, 'sawtooth', 0.06);
      window.setTimeout(() => playTone(120, 260, 'sawtooth', 0.045), 70);
    }

    previousPhaseRef.current = phase;
  }, [phase, playTone]);

  useEffect(() => {
    targetMultiplierRef.current = Math.max(1, multiplier);

    if (phase === 'waiting') {
      renderedMultiplierRef.current = 1;
      crashedAtRef.current = null;
    }

    if (phase === 'crashed') {
      crashedAtRef.current = Math.max(1, multiplier);
      renderedMultiplierRef.current = Math.max(renderedMultiplierRef.current, multiplier);
    }
  }, [multiplier, phase]);

  useEffect(() => {
    const container = graphContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') {
      return;
    }

    const syncSize = () => {
      const nextWidth = Math.floor(container.clientWidth);
      const nextHeight = Math.floor(container.clientHeight);
      setCanvasSize((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }
        return { width: nextWidth, height: nextHeight };
      });
    };

    syncSize();
    const observer = new ResizeObserver(syncSize);
    resizeObserverRef.current = observer;
    observer.observe(container);

    return () => {
      observer.disconnect();
      resizeObserverRef.current = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || canvasSize.width <= 0 || canvasSize.height <= 0) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const draw = () => {
      const width = canvasSize.width;
      const height = canvasSize.height;
      const dpr = window.devicePixelRatio || 1;
      const backingWidth = Math.floor(width * dpr);
      const backingHeight = Math.floor(height * dpr);

      if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
        canvas.width = backingWidth;
        canvas.height = backingHeight;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const padding = { top: 28, right: 26, bottom: 28, left: 26 };
      const chartWidth = Math.max(1, width - padding.left - padding.right);
      const chartHeight = Math.max(1, height - padding.top - padding.bottom);
      const baseY = padding.top + chartHeight;

      if (phase === 'waiting') {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.95)';
        ctx.font = '600 24px ui-sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Preparing...', width / 2, height / 2);

        animationFrameRef.current = window.requestAnimationFrame(draw);
        return;
      }

      if (phase === 'running') {
        const current = renderedMultiplierRef.current;
        const target = Math.max(1, targetMultiplierRef.current);
        renderedMultiplierRef.current = current + (target - current) * 0.16;
      }

      const currentMultiplier = Math.max(1, renderedMultiplierRef.current);
      const peakMultiplier = phase === 'crashed' ? Math.max(1.25, crashedAtRef.current ?? currentMultiplier) : Math.max(1.25, currentMultiplier);
      const yScaleMax = Math.max(2, peakMultiplier * 1.25);

      const pointsCount = 180;
      const points: Array<{ x: number; y: number }> = [];
      const safeMaxLog = Math.log(yScaleMax);

      for (let i = 0; i < pointsCount; i += 1) {
        const t = i / (pointsCount - 1);
        const value = Math.exp(Math.log(peakMultiplier) * t);
        const normalized = safeMaxLog > 0 ? Math.log(Math.max(1, value)) / safeMaxLog : 0;
        const x = padding.left + chartWidth * t;
        const y = baseY - chartHeight * normalized;
        points.push({ x, y });
      }

      const strokeColor = phase === 'crashed' ? '#ff003c' : '#00f0ff';

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x, points[i].y);
      }

      const areaGradient = ctx.createLinearGradient(0, padding.top, 0, baseY);
      if (phase === 'crashed') {
        areaGradient.addColorStop(0, 'rgba(255, 0, 60, 0.28)');
        areaGradient.addColorStop(1, 'rgba(255, 0, 60, 0)');
      } else {
        areaGradient.addColorStop(0, 'rgba(0, 240, 255, 0.28)');
        areaGradient.addColorStop(1, 'rgba(0, 240, 255, 0)');
      }

      ctx.lineTo(points[points.length - 1].x, baseY);
      ctx.lineTo(points[0].x, baseY);
      ctx.closePath();
      ctx.fillStyle = areaGradient;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 3.4;
      ctx.shadowColor = strokeColor;
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.shadowBlur = 0;

      const tip = points[points.length - 1];
      const tipGlow = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 12);
      tipGlow.addColorStop(0, phase === 'crashed' ? 'rgba(255, 0, 60, 0.95)' : 'rgba(0, 240, 255, 0.95)');
      tipGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = tipGlow;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = phase === 'crashed' ? '#ff8aa3' : '#9befff';
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 4.4, 0, Math.PI * 2);
      ctx.fill();

      if (phase === 'crashed') {
        const crashValue = (crashedAtRef.current ?? targetMultiplierRef.current).toFixed(2);
        ctx.fillStyle = 'rgba(255, 0, 60, 0.95)';
        ctx.font = '700 32px ui-sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Crashed at ${crashValue}x`, width / 2, height / 2);
      }

      animationFrameRef.current = window.requestAnimationFrame(draw);
    };

    animationFrameRef.current = window.requestAnimationFrame(draw);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [phase, canvasSize.width, canvasSize.height]);

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(''), 4000);
  }, []);

  // Socket Connection & Events
  useEffect(() => {
    const url = getSocketUrl();
    const socket = io(url, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
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
      pendingCrashTickRef.current = {
        multiplier: payload.multiplier,
        players: payload.players || [],
      };

      const flush = () => {
        const next = pendingCrashTickRef.current;
        if (!next) {
          return;
        }

        pendingCrashTickRef.current = null;
        lastCrashTickUpdateRef.current = Date.now();
        setMultiplier(next.multiplier);
        setPlayers(next.players);
        setPhase('running');
      };

      const now = Date.now();
      const elapsed = now - lastCrashTickUpdateRef.current;
      const throttleMs = 100;

      if (elapsed >= throttleMs) {
        if (crashTickFlushTimerRef.current) {
          window.clearTimeout(crashTickFlushTimerRef.current);
          crashTickFlushTimerRef.current = null;
        }
        flush();
        return;
      }

      if (crashTickFlushTimerRef.current !== null) {
        return;
      }

      crashTickFlushTimerRef.current = window.setTimeout(() => {
        crashTickFlushTimerRef.current = null;
        flush();
      }, Math.max(0, throttleMs - elapsed));
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
      if (crashTickFlushTimerRef.current !== null) {
        window.clearTimeout(crashTickFlushTimerRef.current);
        crashTickFlushTimerRef.current = null;
      }
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

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-950">
      <div className="relative h-[35vh] max-h-[600px] shrink-0 border-b border-slate-800 overflow-hidden md:h-[50vh]">
        <motion.div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.22),_rgba(2,6,23,1)_64%)]"
          animate={{ opacity: phase === 'crashed' ? [1, 0.88, 1] : 1 }}
          transition={{ duration: 0.42 }}
        />

        <div ref={graphContainerRef} className="absolute inset-0 pb-28">
          <canvas ref={canvasRef} className="h-full w-full" />
        </div>

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