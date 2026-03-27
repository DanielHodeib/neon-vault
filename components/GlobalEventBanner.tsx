'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap } from 'lucide-react';

interface GlobalEvent {
  type: string;
  label: string;
  description: string;
  multiplier: number;
  color: string;
  endTime: number;
}

interface Props {
  event: GlobalEvent | null;
}

function useCountdown(endTime: number) {
  const [remaining, setRemaining] = useState(Math.max(0, endTime - Date.now()));

  useEffect(() => {
    if (!endTime) return;
    const interval = setInterval(() => {
      const ms = Math.max(0, endTime - Date.now());
      setRemaining(ms);
      if (ms === 0) clearInterval(interval);
    }, 500);
    return () => clearInterval(interval);
  }, [endTime]);

  const totalSeconds = Math.ceil(remaining / 1000);
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return { label: `${mm}:${ss}`, done: remaining === 0 };
}

export default function GlobalEventBanner({ event }: Props) {
  const { label: countdown, done } = useCountdown(event?.endTime ?? 0);
  const isGolden = event?.type === 'GOLDEN_HOUR';

  return (
    <AnimatePresence>
      {event && !done ? (
        <motion.div
          key={event.type}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.35 }}
          className="relative z-20 overflow-hidden"
          style={{
            background: isGolden
              ? 'linear-gradient(90deg, #1a1000 0%, #2d1f00 40%, #1a1000 100%)'
              : 'linear-gradient(90deg, #001a1a 0%, #002d2d 40%, #001a1a 100%)',
          }}
        >
          {/* Animated glow line */}
          <div
            className="absolute inset-0 animate-pulse"
            style={{
              boxShadow: `inset 0 0 40px ${event.color}33, 0 0 20px ${event.color}44`,
            }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 h-px"
            style={{ background: `linear-gradient(90deg, transparent, ${event.color}, transparent)` }}
          />

          <div className="relative flex items-center justify-center gap-3 px-4 py-2 text-sm font-bold">
            <Zap size={16} className="shrink-0 animate-pulse" style={{ color: event.color }} />
            <span style={{ color: event.color, textShadow: `0 0 12px ${event.color}` }}>
              {event.label}
            </span>
            <span className="text-slate-300 font-normal hidden sm:inline">{event.description}</span>
            <span
              className="ml-auto font-mono text-xs px-2 py-0.5 rounded border shrink-0"
              style={{ color: event.color, borderColor: `${event.color}66`, background: `${event.color}11` }}
            >
              {countdown}
            </span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
