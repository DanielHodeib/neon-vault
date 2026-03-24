'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useCasinoStore } from '../../store/useCasinoStore';

type SlotMode = 'classic' | 'turbo' | 'highroller' | 'chaos' | 'freespins' | 'bookofra' | 'luxor' | 'treasurehunt';

interface SlotSymbol {
  icon: string;
  name: string;
  baseMulti: number;
  weight: number;
}

interface ModeConfig {
  label: string;
  description: string;
  spinMs: number;
  reelTickMs: number;
  minBet: number;
  reelCount: number;
  pairMulti: number;
  jackpotMulti: number;
  tripleBoost: number;
  streakBonusPerWin: number;
  isMultiReel?: boolean;
  hasExpanding?: boolean;
  hasCascading?: boolean;
}

const SYMBOLS: SlotSymbol[] = [
  { icon: '🍒', name: 'Cherry', baseMulti: 3, weight: 35 },
  { icon: '🍋', name: 'Lemon', baseMulti: 4, weight: 28 },
  { icon: '🍇', name: 'Grapes', baseMulti: 5, weight: 20 },
  { icon: '💎', name: 'Diamond', baseMulti: 8, weight: 12 },
  { icon: '7️⃣', name: 'Seven', baseMulti: 15, weight: 5 },
];

const BOOK_SYMBOLS: SlotSymbol[] = [
  { icon: '🏺', name: 'Vase', baseMulti: 2, weight: 30 },
  { icon: '🦅', name: 'Eagle', baseMulti: 4, weight: 25 },
  { icon: '👑', name: 'Scarab', baseMulti: 6, weight: 20 },
  { icon: '🏛️', name: 'Temple', baseMulti: 10, weight: 15 },
  { icon: '📖', name: 'Book', baseMulti: 25, weight: 10 },
];

const MODE_CONFIG: Record<SlotMode, ModeConfig> = {
  classic: {
    label: 'Classic',
    description: '3-reel balanced slots',
    spinMs: 1400,
    reelTickMs: 95,
    minBet: 10,
    reelCount: 3,
    pairMulti: 2,
    jackpotMulti: 30,
    tripleBoost: 1,
    streakBonusPerWin: 0.15,
  },
  turbo: {
    label: 'Turbo',
    description: 'Fast 3-reel action',
    spinMs: 700,
    reelTickMs: 60,
    minBet: 10,
    reelCount: 3,
    pairMulti: 2,
    jackpotMulti: 30,
    tripleBoost: 1,
    streakBonusPerWin: 0.1,
  },
  highroller: {
    label: 'High Roller',
    description: 'Premium 3-reel payouts',
    spinMs: 1300,
    reelTickMs: 85,
    minBet: 500,
    reelCount: 3,
    pairMulti: 3,
    jackpotMulti: 42,
    tripleBoost: 1.35,
    streakBonusPerWin: 0.2,
  },
  chaos: {
    label: 'Chaos',
    description: '3-reel with random events',
    spinMs: 1100,
    reelTickMs: 75,
    minBet: 25,
    reelCount: 3,
    pairMulti: 2,
    jackpotMulti: 34,
    tripleBoost: 1,
    streakBonusPerWin: 0.12,
  },
  freespins: {
    label: 'Free Spins',
    description: '3-reel bonus hunt',
    spinMs: 1300,
    reelTickMs: 85,
    minBet: 20,
    reelCount: 3,
    pairMulti: 2,
    jackpotMulti: 30,
    tripleBoost: 1,
    streakBonusPerWin: 0.15,
  },
  bookofra: {
    label: 'Book of Ra',
    description: '5-reel expanding symbols',
    spinMs: 1800,
    reelTickMs: 85,
    minBet: 50,
    reelCount: 5,
    pairMulti: 2,
    jackpotMulti: 80,
    tripleBoost: 1.8,
    streakBonusPerWin: 0.25,
    isMultiReel: true,
    hasExpanding: true,
  },
  luxor: {
    label: 'Luxor',
    description: '4-reel cascading wins',
    spinMs: 1600,
    reelTickMs: 80,
    minBet: 40,
    reelCount: 4,
    pairMulti: 2.5,
    jackpotMulti: 60,
    tripleBoost: 1.5,
    streakBonusPerWin: 0.2,
    isMultiReel: true,
    hasCascading: true,
  },
  treasurehunt: {
    label: 'Treasure Hunt',
    description: '5-reel epic bonus',
    spinMs: 2000,
    reelTickMs: 90,
    minBet: 75,
    reelCount: 5,
    pairMulti: 2.2,
    jackpotMulti: 100,
    tripleBoost: 2,
    streakBonusPerWin: 0.3,
    isMultiReel: true,
    hasExpanding: true,
    hasCascading: true,
  },
};

function getWeightedSymbol(mode: SlotMode) {
  const isBookMode = ['bookofra', 'luxor', 'treasurehunt'].includes(mode);
  const symbolSet = isBookMode ? BOOK_SYMBOLS : SYMBOLS;
  const pool: SlotSymbol[] = [];

  symbolSet.forEach((symbol) => {
    let adjustedWeight = symbol.weight;

    if (mode === 'highroller' && symbol.icon === '7️⃣') {
      adjustedWeight += 2;
    }

    if (mode === 'freespins' && symbol.icon === '💎') {
      adjustedWeight += 4;
    }

    if ((mode === 'bookofra' || mode === 'treasurehunt') && symbol.icon === '📖') {
      adjustedWeight += 3;
    }

    for (let i = 0; i < adjustedWeight; i += 1) {
      pool.push(symbol);
    }
  });

  return pool[Math.floor(Math.random() * pool.length)];
}

export default function SlotsGame() {
  const { placeBet, addWin } = useCasinoStore();
  const [mode, setMode] = useState<SlotMode>('classic');
  const config = MODE_CONFIG[mode];
  
  const [reels, setReels] = useState<SlotSymbol[]>(
    Array(config.reelCount).fill(null).map(() => getWeightedSymbol(mode))
  );
  const [expandedReels, setExpandedReels] = useState<Set<number>>(new Set());
  const [isSpinning, setIsSpinning] = useState(false);
  const [isCascading, setIsCascading] = useState(false);
  const [betAmount, setBetAmount] = useState(100);
  const [resultMsg, setResultMsg] = useState('Choose your mode and spin!');
  const [errorMsg, setErrorMsg] = useState('');
  const [lastWin, setLastWin] = useState(0);
  const [winStreak, setWinStreak] = useState(0);
  const [freeSpinsLeft, setFreeSpinsLeft] = useState(0);
  const [totalCascades, setTotalCascades] = useState(0);

  const symbolSet = ['bookofra', 'luxor', 'treasurehunt'].includes(mode) ? BOOK_SYMBOLS : SYMBOLS;

  const paytable = useMemo(() => {
    const isBookTheme = ['bookofra', 'luxor', 'treasurehunt'].includes(mode);
    if (isBookTheme) {
      return [
        { symbol: '📖', text: 'Book (Expanding)', payout: `${(50 * config.tripleBoost).toFixed(0)}x` },
        { symbol: '🏛️', text: '5x Temple', payout: `${(30 * config.tripleBoost).toFixed(0)}x` },
        { symbol: '👑', text: '5x Scarab', payout: `${(20 * config.tripleBoost).toFixed(0)}x` },
        { symbol: '🦅', text: '5x Eagle', payout: `${(12 * config.tripleBoost).toFixed(0)}x` },
        { symbol: '🏺', text: '5x Vase', payout: `${(8 * config.tripleBoost).toFixed(0)}x` },
        { symbol: '✨', text: 'Cascade Win', payout: `+100%` },
      ];
    }
    return [
      { symbol: '7️⃣', text: '777 JACKPOT', payout: `${config.jackpotMulti}x` },
      { symbol: '💎', text: `${config.reelCount}x Diamond`, payout: `${(10 * config.tripleBoost).toFixed(1)}x` },
      { symbol: '🍇', text: `${config.reelCount}x Grapes`, payout: `${(6 * config.tripleBoost).toFixed(1)}x` },
      { symbol: '🍋', text: `${config.reelCount}x Lemon`, payout: `${(5 * config.tripleBoost).toFixed(1)}x` },
      { symbol: '🍒', text: `${config.reelCount}x Cherry`, payout: `${(4 * config.tripleBoost).toFixed(1)}x` },
      { symbol: '🎯', text: 'Any match', payout: `${config.pairMulti}x` },
    ];
  }, [config, mode]);

  useEffect(() => {
    if (!isSpinning && !isCascading) return;

    const interval = setInterval(() => {
      setReels((prev) =>
        prev.map((_, i) => (expandedReels.has(i) ? prev[i] : getWeightedSymbol(mode)))
      );
    }, config.reelTickMs);

    return () => clearInterval(interval);
  }, [isSpinning, isCascading, config.reelTickMs, mode, expandedReels]);

  const selectMode = (nextMode: SlotMode) => {
    if (isSpinning || isCascading) return;

    setMode(nextMode);
    const nextConfig = MODE_CONFIG[nextMode];
    setBetAmount((current) => Math.max(current, nextConfig.minBet));
    setReels(Array(nextConfig.reelCount).fill(null).map(() => getWeightedSymbol(nextMode)));
    setExpandedReels(new Set());
    setTotalCascades(0);
    
    if (nextMode !== 'freespins') {
      setFreeSpinsLeft(0);
    }
  };

  const evaluateWin = (finalReels: SlotSymbol[], wager: number): { payout: number; message: string; willCascade: boolean } => {
    const streakMulti = 1 + Math.min(winStreak * config.streakBonusPerWin, 0.9);
    let payout = 0;
    let message = 'No matches this spin.';
    let willCascade = false;

    // Check for all matching symbols
    const symbolCounts: Record<string, number> = {};
    finalReels.forEach((s) => {
      symbolCounts[s.icon] = (symbolCounts[s.icon] || 0) + 1;
    });

    // Find best match
    let bestMatch: { icon: string; count: number; symbol: SlotSymbol } | null = null;
    for (const [icon, count] of Object.entries(symbolCounts)) {
      if (count >= 3) {
        const symbol = symbolSet.find((s) => s.icon === icon)!;
        if (!bestMatch || count > bestMatch.count || (count === bestMatch.count && symbol.baseMulti > bestMatch.symbol.baseMulti)) {
          bestMatch = { icon, count, symbol };
        }
      }
    }

    let chaosMulti = 1;
    if (mode === 'chaos') {
      chaosMulti = 0.8 + Math.random() * 1.6;
    }

    if (bestMatch) {
      const multiplier = bestMatch.count >= finalReels.length ? config.jackpotMulti : bestMatch.symbol.baseMulti * config.tripleBoost;
      payout = wager * multiplier * streakMulti * chaosMulti;
      message = `${bestMatch.symbol.name.toUpperCase()} ×${bestMatch.count}! +${payout.toFixed(2)}`;
      
      if (config.hasCascading && bestMatch.count === finalReels.length) {
        willCascade = true;
        message += ' - CASCADING!';
      }
    } else {
      // Check for pairs
      for (const [, count] of Object.entries(symbolCounts)) {
        if (count >= 2) {
          payout = wager * config.pairMulti * streakMulti * chaosMulti;
          message = `Match found! +${payout.toFixed(2)}`;
          break;
        }
      }
    }

    if (mode === 'chaos') {
      message += ` | Chaos ×${chaosMulti.toFixed(2)}`;
    }

    return { payout, message, willCascade };
  };

  const spin = () => {
    const safeBet = Math.max(config.minBet, Math.floor(Number.isFinite(betAmount) ? betAmount : config.minBet));
    const usingFreeSpin = mode === 'freespins' && freeSpinsLeft > 0;

    if (!usingFreeSpin && !placeBet(safeBet)) {
      setErrorMsg('Not enough funds');
      setTimeout(() => setErrorMsg(''), 2200);
      return;
    }

    if (usingFreeSpin) {
      setFreeSpinsLeft((current) => Math.max(0, current - 1));
    }

    setIsSpinning(true);
    setResultMsg(usingFreeSpin ? `Bonus spin... (${freeSpinsLeft - 1} left)` : 'Spinning...');
    setErrorMsg('');
    setTotalCascades(0);
    setExpandedReels(new Set());

    setTimeout(() => {
      const newReels = Array(config.reelCount).fill(null).map(() => getWeightedSymbol(mode));
      setReels(newReels);
      setIsSpinning(false);

      const { payout, message, willCascade } = evaluateWin(newReels, safeBet);

      if (config.hasExpanding) {
        const expanded = new Set<number>();
        newReels.forEach((reel, index) => {
          if (reel.icon === '📖') {
            expanded.add(index);
          }
        });
        setExpandedReels(expanded);
      }

      if (payout > 0) {
        addWin(payout);
        setWinStreak((current) => current + 1);
        setLastWin(payout);
        setResultMsg(message);
        
        // Handle cascading for multi-reel modes
        if (willCascade && config.hasCascading) {
          handleCascade(newReels, safeBet);
        }

        // Handle book symbol for expanding modes
        if (config.hasExpanding && newReels.some((r) => r.icon === '📖')) {
          const bookCount = newReels.filter((r) => r.icon === '📖').length;
          const expandBonus = safeBet * (5 * bookCount) * (1 + Math.min(winStreak * config.streakBonusPerWin, 0.9));
          addWin(expandBonus);
          setLastWin(payout + expandBonus);
          setResultMsg(message + ` | BOOK BONUS! +${expandBonus.toFixed(2)}`);
        }
      } else {
        setWinStreak(0);
        setLastWin(0);
        setResultMsg(message);
      }

      setBetAmount(safeBet);
    }, config.spinMs);
  };

  const handleCascade = (initialReels: SlotSymbol[], wager: number) => {
    setIsCascading(true);
    let cascadeCount = 0;

    const doCascade = (sourceReels: SlotSymbol[]) => {
      setTimeout(() => {
        const cascadedReels = sourceReels.map(() => getWeightedSymbol(mode));
        setReels(cascadedReels);

        const { payout, willCascade } = evaluateWin(cascadedReels, wager);
        cascadeCount += 1;
        setTotalCascades(cascadeCount);

        if (payout > 0) {
          addWin(payout);
          setLastWin((prev) => prev + payout);
          setResultMsg(`CASCADE x${cascadeCount}! +${payout.toFixed(2)}`);

          if (willCascade && cascadeCount < 5) {
            doCascade(cascadedReels);
            return;
          }

          setIsCascading(false);
          setResultMsg(`Cascade finished at x${cascadeCount}.`);
        } else {
          setIsCascading(false);
          setResultMsg(cascadeCount > 0 ? `Cascade finished at x${cascadeCount}.` : 'No further cascade.');
        }
      }, 1200);
    };

    doCascade(initialReels);
  };

  return (
    <div className="flex-1 h-full bg-slate-900 min-h-0 p-4">
      <div className="h-full min-h-0 rounded-xl border border-slate-800 bg-slate-950 p-4 md:p-5 grid grid-cols-1 lg:grid-cols-[1.45fr_0.55fr] gap-4 overflow-hidden">
          {/* Main Game Area */}
          <div className="min-h-0 flex flex-col">
            {/* Title & Mode Label */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl md:text-2xl font-black tracking-widest text-blue-400 uppercase">Slots</h2>
              <p className="text-xs md:text-sm px-2.5 py-1 rounded-full bg-slate-900 border border-blue-600 text-blue-300">{config.label}</p>
            </div>

            {/* Mode Selector - Improved Layout */}
            <div className="mb-3 p-3 rounded-lg bg-slate-900 border border-slate-800">
              <p className="text-[11px] font-bold text-slate-500 uppercase mb-2 tracking-wide">Game Mode</p>
              <div className="grid grid-cols-4 gap-1.5">
                {(Object.keys(MODE_CONFIG) as SlotMode[]).map((slotMode) => (
                  <button
                    key={slotMode}
                    onClick={() => selectMode(slotMode)}
                    disabled={isSpinning || isCascading}
                    className={`rounded-md border text-left px-2 py-1.5 transition-all ${
                      mode === slotMode
                        ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/25'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-600'
                    } ${isSpinning || isCascading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <p className="text-[10px] font-bold uppercase leading-tight">{MODE_CONFIG[slotMode].label}</p>
                    <p className={`text-[10px] mt-0.5 leading-tight ${mode === slotMode ? 'text-blue-100' : 'text-slate-400'}`}>
                      {MODE_CONFIG[slotMode].reelCount} reels
                    </p>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">{config.description}</p>
            </div>

            {/* Reel Display - MUCH LARGER */}
            <div className="flex-1 min-h-0 rounded-lg border-2 border-blue-600/30 bg-gradient-to-b from-slate-900 to-slate-950 p-3 md:p-4 flex items-center justify-center mb-3">
              <div className={`grid gap-2.5 w-full ${config.reelCount === 3 ? 'grid-cols-3 max-w-xl' : config.reelCount === 4 ? 'grid-cols-4 max-w-2xl' : 'grid-cols-5 max-w-3xl'}`}>
                {reels.map((symbol, i) => (
                  <motion.div
                    key={i}
                    animate={{
                      scale: (isSpinning || isCascading) ? [1, 0.95, 1] : 1,
                      borderColor: expandedReels.has(i) ? ['#3b82f6', '#0ea5e9', '#3b82f6'] : '#64748b',
                    }}
                    transition={{
                      duration: 0.4,
                      repeat: isSpinning || isCascading ? Infinity : 0,
                    }}
                    className="h-[clamp(112px,20vh,196px)] rounded-xl bg-gradient-to-br from-slate-950 to-slate-900 border-2 flex items-center justify-center overflow-hidden relative shadow-2xl"
                  >
                    <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(59,130,246,0.1),transparent)]" />
                    
                    {/* Reel Symbol */}
                    <motion.div
                      animate={{
                        y: isSpinning || isCascading ? [0, -400, 400, 0] : 0,
                        filter: isSpinning || isCascading ? 'blur(2px)' : 'blur(0px)',
                      }}
                      transition={{
                        duration: 0.12,
                        repeat: isSpinning || isCascading ? Infinity : 0,
                      }}
                      className="text-[44px] md:text-[70px] xl:text-[92px] leading-none select-none drop-shadow-lg"
                    >
                      {isSpinning || isCascading ? '🎰' : symbol.icon}
                    </motion.div>

                    {/* Expanded Highlight */}
                    {expandedReels.has(i) && (
                      <motion.div
                        animate={{ opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="absolute inset-0 bg-blue-500/20 pointer-events-none"
                      />
                    )}
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Result & Stats */}
            <div className="space-y-2">
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 min-h-[48px] flex items-center">
                <motion.p
                  key={resultMsg}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-sm md:text-base font-semibold text-slate-200"
                >
                  {resultMsg}
                </motion.p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs md:text-sm">
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-center">
                  <p className="text-slate-400">Streak</p>
                  <p className="text-base md:text-lg font-mono text-emerald-400">{winStreak}</p>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-center">
                  <p className="text-slate-400">Last Win</p>
                  <p className="text-base md:text-lg font-mono text-emerald-400">{lastWin.toFixed(0)}</p>
                </div>
                <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-center">
                  <p className="text-slate-400">Cascades</p>
                  <p className="text-base md:text-lg font-mono text-blue-400">{totalCascades}</p>
                </div>
              </div>
            </div>

            {errorMsg && <p className="text-sm font-semibold text-red-500 mb-2">{errorMsg}</p>}
          </div>

          {/* Right Sidebar - Paytable */}
          <div className="min-h-0 flex flex-col gap-3">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
              <p className="text-[11px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Bet & Spin</p>
              <input
                type="number"
                value={betAmount}
                min={config.minBet}
                onChange={(e) => setBetAmount(Number(e.target.value))}
                disabled={isSpinning || isCascading}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 mb-2 outline-none font-mono text-white text-sm focus:border-blue-600 focus:ring-1 focus:ring-blue-600/30"
              />
              <div className="grid grid-cols-3 gap-2 mb-2">
                <button
                  onClick={() => setBetAmount((value) => Math.max(config.minBet, Math.floor(value / 2) || config.minBet))}
                  disabled={isSpinning || isCascading}
                  className="h-8 rounded-md border border-slate-800 bg-slate-950 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
                >
                  /2
                </button>
                <button
                  onClick={() => setBetAmount((value) => Math.max(config.minBet, value * 2))}
                  disabled={isSpinning || isCascading}
                  className="h-8 rounded-md border border-slate-800 bg-slate-950 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
                >
                  x2
                </button>
                <button
                  onClick={() => setBetAmount(Math.max(config.minBet, 1000))}
                  disabled={isSpinning || isCascading}
                  className="h-8 rounded-md border border-slate-800 bg-slate-950 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
                >
                  MAX
                </button>
              </div>
              <motion.button
                onClick={spin}
                disabled={isSpinning || isCascading}
                whileHover={{ scale: isSpinning || isCascading ? 1 : 1.01 }}
                whileTap={{ scale: isSpinning || isCascading ? 1 : 0.99 }}
                className={`w-full py-3 rounded-lg font-bold text-sm uppercase transition-all ${
                  isSpinning || isCascading
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white shadow-lg shadow-blue-600/30'
                }`}
              >
                {isCascading ? `Cascading... x${totalCascades}` : isSpinning ? 'Spinning...' : mode === 'freespins' && freeSpinsLeft > 0 ? `Free Spin (${freeSpinsLeft})` : 'SPIN'}
              </motion.button>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
              <p className="text-[11px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Mode Info</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between items-center px-2 py-1.5 rounded bg-slate-950 border border-slate-800/50">
                  <span className="text-slate-400">Reels</span>
                  <span className="font-mono text-blue-400 font-bold">{config.reelCount}</span>
                </div>
                <div className="flex justify-between items-center px-2 py-1.5 rounded bg-slate-950 border border-slate-800/50">
                  <span className="text-slate-400">Min</span>
                  <span className="font-mono text-slate-200 font-bold">{config.minBet}</span>
                </div>
                <div className="flex justify-between items-center px-2 py-1.5 rounded bg-slate-950 border border-slate-800/50">
                  <span className="text-slate-400">Spin</span>
                  <span className="font-mono text-slate-200 font-bold">{(config.spinMs / 1000).toFixed(2)}s</span>
                </div>
                <div className="flex justify-between items-center px-2 py-1.5 rounded bg-slate-950 border border-slate-800/50">
                  <span className="text-slate-400">Free</span>
                  <span className="font-mono text-emerald-400 font-bold">{freeSpinsLeft}</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {config.hasExpanding && <div className="text-[11px] text-blue-400 px-2 py-1 rounded bg-blue-950/30 border border-blue-800/50">Expanding</div>}
                {config.hasCascading && <div className="text-[11px] text-blue-300 px-2 py-1 rounded bg-blue-950/30 border border-blue-800/50">Cascading</div>}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 flex-1 min-h-0">
              <p className="text-[11px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Paytable</p>
              <div className="space-y-1.5">
                {paytable.map((line, idx) => (
                  <motion.div
                    key={line.text}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="flex items-center justify-between border border-slate-800 rounded-md px-2 py-1.5 bg-gradient-to-r from-slate-950 to-slate-900 hover:border-blue-600/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none">{line.symbol}</span>
                      <span className="text-[11px] text-slate-300 font-medium leading-tight">{line.text}</span>
                    </div>
                    <span className="font-mono text-[11px] font-bold text-emerald-400">{line.payout}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}
