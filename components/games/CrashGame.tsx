'use client';

import React, { useState, useEffect } from 'react';
import { useCasinoStore } from '../../store/useCasinoStore';

export default function CrashGame() {
  const { placeBet, addWin } = useCasinoStore();
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'crashed'>('idle');
  const [multiplier, setMultiplier] = useState(1.00);
  const [betAmount, setBetAmount] = useState(100);
  const [hasBet, setHasBet] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (gameState === 'playing') {
      const crashPoint = Math.max(1.00, Math.random() * 10);
      interval = setInterval(() => {
        setMultiplier((prev) => {
          const next = prev + 0.01 * (prev * 1.2);
          if (next >= crashPoint) {
            setGameState('crashed');
            if (hasBet) setHasBet(false);
            return crashPoint;
          }
          return next;
        });
      }, 50);
    }
    return () => clearInterval(interval);
  }, [gameState, hasBet]);

  const handleBet = () => {
    if (betAmount <= 0) return;
    if (placeBet(betAmount)) {
      setGameState('playing');
      setHasBet(true);
      setMultiplier(1.00);
      setErrorMsg('');
    } else {
      setErrorMsg('Not enough funds');
      setTimeout(() => setErrorMsg(''), 3000);
    }
  };

  const handleCashOut = () => {
    if (gameState === 'playing' && hasBet) {
      addWin(betAmount * multiplier);
      setHasBet(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* MASSIVE GRAPH AREA */}
      <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden">
        <div className={`text-[120px] md:text-[160px] font-black font-mono leading-none tracking-tighter transition-colors ${
          gameState === 'crashed' ? 'text-red-500' : 'text-white'
        }`}>
          {multiplier.toFixed(2)}x
        </div>
        <div className="mt-4 text-slate-400 font-medium uppercase tracking-widest text-lg">
          {gameState === 'crashed' ? 'Crashed' : gameState === 'playing' ? 'Flying...' : 'Waiting for next round'}
        </div>
      </div>

      {/* CONTROLS */}
      <div className="bg-slate-950 border-t border-slate-800 p-6 flex items-center gap-6">
        <div className="w-1/3">
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Bet Amount</label>
          <div className="flex bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
            <input 
              type="number" value={betAmount} onChange={(e) => setBetAmount(Number(e.target.value))}
              disabled={gameState === 'playing'}
              className="w-full bg-transparent p-4 outline-none font-mono text-white"
            />
          </div>
          {errorMsg && <p className="text-red-500 text-xs mt-2 font-medium">{errorMsg}</p>}
        </div>

        <div className="flex-1">
          {gameState === 'idle' || gameState === 'crashed' ? (
            <button onClick={gameState === 'crashed' ? () => { setGameState('idle'); setMultiplier(1.0); } : handleBet}
              className="w-full py-5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg uppercase transition-colors"
            >
              {gameState === 'crashed' ? 'Next Round' : 'Place Bet'}
            </button>
          ) : (
            <button onClick={handleCashOut} disabled={!hasBet}
              className={`w-full py-5 rounded-lg font-bold text-lg uppercase transition-colors ${
                !hasBet ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
              }`}
            >
              {hasBet ? `Cash Out ${(betAmount * multiplier).toFixed(2)}` : 'Spectating'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}