'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { useCrashSocket } from '@/hooks/useCrashSocket';
import { useCasinoStore } from '@/store/useCasinoStore';

const MIN_BET = 1;

function formatPhase(phase: 'waiting' | 'running' | 'crashed') {
  if (phase === 'waiting') return 'ARMED';
  if (phase === 'running') return 'IN FLIGHT';
  return 'CRASHED';
}

function burstOffset(index: number) {
  const angle = (index / 18) * Math.PI * 2;
  const radius = 6 + (index % 5) * 2.8;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

export default function CyberAviator() {
  const { balance, username, placeBet, addWin } = useCasinoStore();
  const [betInput, setBetInput] = useState('100');
  const [isPlacingBet, setIsPlacingBet] = useState(false);
  const [isCashingOut, setIsCashingOut] = useState(false);
  const [localError, setLocalError] = useState('');

  const effectiveUsername = useMemo(() => String(username ?? '').trim() || 'Guest', [username]);

  const {
    phase,
    multiplier,
    history,
    hasActiveBet,
    myPlayer,
    roundStartAt,
    lastCashout,
    clearCashout,
    placeBet: sendPlaceBet,
    cashOut,
    error,
  } = useCrashSocket(effectiveUsername, {
    defaultRoomId: 'global',
    balance,
  });

  useEffect(() => {
    if (!lastCashout?.ok) {
      return;
    }

    addWin(lastCashout.payout, {
      source: 'crash',
      multiplier: lastCashout.multiplier,
    });
    clearCashout();
  }, [addWin, clearCashout, lastCashout]);

  const numericBalance = Math.max(0, Math.floor(Number(balance) || 0));
  const betAmount = Math.max(MIN_BET, Math.floor(Number(betInput) || MIN_BET));
  const activeStake = Number(myPlayer?.amount ?? 0);
  const potential = hasActiveBet ? activeStake * multiplier : betAmount * multiplier;

  const flightProgress = Math.min(1, Math.log10(Math.max(1, multiplier)) / Math.log10(50));
  const planeX = Math.min(86, 8 + flightProgress * 78);
  const planeY = Math.max(10, 78 - flightProgress * 60);

  const speedFactor = Math.max(0.8, Math.min(10, multiplier));
  const farDuration = Math.max(6, 28 / speedFactor);
  const cloudDuration = Math.max(3, 18 / speedFactor);
  const linesDuration = Math.max(0.8, 7 / speedFactor);

  const altitudeMeters = Math.floor(multiplier * 100);
  const speedMach = multiplier.toFixed(2);

  const handlePlaceBet = async () => {
    if (phase !== 'waiting' || hasActiveBet || isPlacingBet) {
      return;
    }

    if (betAmount < MIN_BET) {
      setLocalError(`Min bet is ${MIN_BET}`);
      return;
    }

    if (betAmount > numericBalance) {
      setLocalError('Insufficient balance');
      return;
    }

    setIsPlacingBet(true);
    setLocalError('');

    const debited = placeBet(betAmount);
    if (!debited) {
      setIsPlacingBet(false);
      setLocalError('Balance sync failed');
      return;
    }

    const response = await sendPlaceBet(betAmount, 0);
    if (!response.ok) {
      addWin(betAmount);
      setLocalError(response.error ?? 'Bet rejected');
    }

    setIsPlacingBet(false);
  };

  const handleCashOut = async () => {
    if (phase !== 'running' || !hasActiveBet || isCashingOut) {
      return;
    }

    setIsCashingOut(true);
    const response = await cashOut();
    if (!response.ok) {
      setLocalError(response.error ?? 'Cashout failed');
    }
    setIsCashingOut(false);
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-slate-950 overflow-hidden">
      <div className="relative flex-1 min-h-0 border-b border-slate-800 overflow-hidden">
        <motion.div
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(56,189,248,0.15),_rgba(2,6,23,1)_68%)]"
          animate={{ opacity: phase === 'crashed' ? [1, 0.85, 1] : 1 }}
          transition={{ duration: 0.4 }}
        />

        <div className="absolute inset-0 overflow-hidden opacity-45">
          <motion.div
            className="absolute inset-y-0 left-0 flex w-[200%]"
            animate={{ x: ['0%', '-50%'] }}
            transition={{ duration: farDuration, ease: 'linear', repeat: Infinity }}
          >
            {[0, 1].map((index) => (
              <div key={`far-track-${index}`} className="relative h-full w-1/2">
                <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,rgba(2,132,199,0.15)_55%,rgba(15,23,42,0.95)_100%)]" />
                <div className="absolute bottom-0 left-0 right-0 h-36 bg-[repeating-linear-gradient(90deg,rgba(30,41,59,0.9)_0_14px,rgba(51,65,85,0.85)_14px_18px)]" />
              </div>
            ))}
          </motion.div>
        </div>

        <div className="absolute inset-0 overflow-hidden opacity-55">
          <motion.div
            className="absolute inset-y-0 left-0 flex w-[200%]"
            animate={{ x: ['0%', '-50%'], y: [0, 14, 0] }}
            transition={{ duration: cloudDuration, ease: 'linear', repeat: Infinity }}
          >
            {[0, 1].map((index) => (
              <div key={`cloud-track-${index}`} className="relative h-full w-1/2">
                <div className="absolute top-8 left-10 h-20 w-64 rounded-full bg-cyan-500/10 blur-2xl" />
                <div className="absolute top-24 right-24 h-16 w-52 rounded-full bg-blue-500/10 blur-2xl" />
                <div className="absolute top-40 left-1/3 h-14 w-40 rounded-full bg-sky-400/10 blur-2xl" />
              </div>
            ))}
          </motion.div>
        </div>

        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute inset-y-0 left-0 flex w-[200%]"
            animate={{ x: ['0%', '-50%'] }}
            transition={{ duration: linesDuration, ease: 'linear', repeat: Infinity }}
          >
            {[0, 1].map((index) => (
              <div
                key={`line-track-${index}`}
                className="h-full w-1/2 bg-[repeating-linear-gradient(110deg,transparent_0_18px,rgba(56,189,248,0.2)_18px_19px,transparent_19px_46px)]"
              />
            ))}
          </motion.div>
        </div>

        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between">
          <div className="px-3 py-1 rounded-md border border-slate-700 bg-slate-950/75 text-xs uppercase tracking-wide text-slate-300">
            Mode: Cyber Aviator
          </div>
          <div className={`px-3 py-1 rounded-md border text-xs uppercase tracking-wide ${phase === 'crashed' ? 'border-rose-500/50 text-rose-300 bg-rose-500/10' : 'border-cyan-500/40 text-cyan-300 bg-cyan-500/10'}`}>
            {formatPhase(phase)}
          </div>
        </div>

        <motion.div
          className="absolute z-30"
          style={{ left: `${planeX}%`, top: `${planeY}%` }}
          animate={phase === 'running' ? { x: [-2, 2, -1, 1, 0], y: [-1, 1, -2, 1, 0], rotate: [-1, 1, -1, 1, 0] } : { x: 0, y: 0, rotate: phase === 'crashed' ? -18 : 0 }}
          transition={phase === 'running' ? { duration: 0.45, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.25 }}
        >
          <motion.div
            className={`relative h-14 w-24 ${phase === 'crashed' ? 'text-rose-300' : 'text-cyan-300'}`}
            animate={phase === 'crashed' ? { filter: ['drop-shadow(0 0 8px rgba(251,113,133,0.75))', 'drop-shadow(0 0 24px rgba(251,113,133,1))', 'drop-shadow(0 0 8px rgba(251,113,133,0.75))'] } : { filter: 'drop-shadow(0 0 14px rgba(34,211,238,0.8))' }}
            transition={{ duration: 0.5 }}
          >
            <svg viewBox="0 0 200 120" className="h-full w-full" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 68 L76 44 L142 44 L184 60 L142 76 L76 76 Z" />
              <path d="M64 44 L84 24 L132 24 L116 44 Z" />
              <path d="M66 76 L104 96 L84 76 Z" />
              <path d="M126 76 L152 102 L138 76 Z" />
              <circle cx="122" cy="60" r="9" className="text-slate-950" fill="currentColor" />
            </svg>
            <motion.div
              className="absolute -left-5 top-1/2 h-4 w-10 -translate-y-1/2 rounded-full bg-cyan-400/60 blur-md"
              animate={{ scaleX: phase === 'running' ? [0.8, 1.2, 0.9] : 0.7, opacity: phase === 'crashed' ? 0 : [0.45, 0.85, 0.45] }}
              transition={{ duration: 0.28, repeat: Infinity }}
            />
          </motion.div>
        </motion.div>

        <AnimatePresence>
          {phase === 'crashed' ? (
            <>
              {Array.from({ length: 18 }).map((_, index) => {
                const offset = burstOffset(index);
                const nextLeft = Math.max(0, Math.min(100, planeX + offset.x));
                const nextTop = Math.max(0, Math.min(100, planeY + offset.y));

                return (
                  <motion.span
                    key={`burst-${index}`}
                    className="absolute z-40 h-1.5 w-1.5 rounded-full bg-rose-400"
                    initial={{ left: `${planeX}%`, top: `${planeY}%`, opacity: 1, scale: 1 }}
                    animate={{
                      left: `${nextLeft}%`,
                      top: `${nextTop}%`,
                      opacity: 0,
                      scale: 0,
                    }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.7, ease: 'easeOut' }}
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
              <p className="text-slate-500">Current Speed</p>
              <p className="font-mono text-cyan-300 text-lg normal-case">{speedMach}x Mach</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
              <p className="text-slate-500">Potential</p>
              <p className="font-mono text-emerald-300 text-lg normal-case">{potential.toFixed(2)} NVC</p>
            </div>
          </div>
        </div>
      </div>

      <div className="shrink-0 p-4 bg-slate-900 border-t border-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3">
          <input
            type="number"
            value={betInput}
            min={MIN_BET}
            onChange={(event) => setBetInput(event.target.value)}
            disabled={phase !== 'waiting' || hasActiveBet || isPlacingBet}
            className="h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-cyan-500 disabled:opacity-60"
          />
          <button
            onClick={handlePlaceBet}
            disabled={phase !== 'waiting' || hasActiveBet || isPlacingBet}
            className="h-11 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {hasActiveBet ? 'Bet Active' : isPlacingBet ? 'Syncing...' : 'Place Bet'}
          </button>
          <button
            onClick={handleCashOut}
            disabled={phase !== 'running' || !hasActiveBet || isCashingOut}
            className="h-11 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isCashingOut ? 'Syncing...' : hasActiveBet ? `Cash Out ${(activeStake * multiplier).toFixed(2)}` : 'Cash Out'}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span>Status: {formatPhase(phase)}</span>
          <span>Round Start: {roundStartAt ? new Date(roundStartAt).toLocaleTimeString() : '--:--:--'}</span>
          <span>Balance: {numericBalance} NVC</span>
          {error ? <span className="text-rose-400">{error}</span> : null}
          {localError ? <span className="text-rose-400">{localError}</span> : null}
        </div>

        <div className="mt-3 flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">History</span>
          {history.length > 0 ? (
            history.slice(0, 12).map((value, index) => {
              const crashedLow = value < 2;
              return (
                <span
                  key={`crash-history-${index}-${value}`}
                  className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-mono ${crashedLow ? 'border-rose-500/40 bg-rose-500/10 text-rose-300' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'}`}
                >
                  {value.toFixed(2)}x
                </span>
              );
            })
          ) : (
            <span className="text-[11px] text-slate-500">No rounds yet</span>
          )}
        </div>
      </div>
    </div>
  );
}
