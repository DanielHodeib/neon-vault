'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';

import type { Mood } from '@/lib/fx';
import { sound, soundPref } from './games/sound';

/** Particles spread evenly but irregular-looking, without Math.random in render. */
const particles = (n: number, className: string, seconds: number) =>
  Array.from({ length: n }, (_, i) => (
    <i
      key={i}
      className={className}
      style={{
        left: `${(i * 61.8) % 100}%`,
        animationDuration: `${seconds * (0.75 + ((i * 13) % 50) / 100)}s`,
        animationDelay: `${-(((i * 37) % 100) / 100) * seconds}s`,
      }}
    />
  ));

/** Atmosphere preset the admin set (Admin → Spaß): an overlay plus background sound until it ends. */
export function MoodLayer({ mood }: { mood: Mood | null }) {
  const [expired, setExpired] = useState<Mood | null>(null);
  const muted = useSyncExternalStore(soundPref.subscribe, soundPref.muted, soundPref.server);
  const ref = useRef<HTMLDivElement>(null);
  const active = mood && mood !== expired ? mood : null;
  const name = active?.name;
  const level = active?.level ?? 1;

  useEffect(() => {
    if (!mood) return;
    const t = setTimeout(() => setExpired(mood), Math.max(0, mood.endsAt - Date.now()));
    return () => clearTimeout(t);
  }, [mood]);

  useEffect(() => {
    if (!name || muted) return;
    return sound.ambience(name, level);
  }, [name, level, muted]);

  // Lightning: flash the screen, thunder follows a moment later.
  useEffect(() => {
    if (name !== 'storm') return;
    let timer: ReturnType<typeof setTimeout>;
    const strike = () => {
      const el = ref.current;
      el?.classList.add('mood-flash');
      setTimeout(() => el?.classList.remove('mood-flash'), 700);
      setTimeout(() => sound.thunder(level), 250 + Math.random() * 900);
      timer = setTimeout(strike, (12 - level * 2.5) * 1000 * (0.6 + Math.random() * 0.8));
    };
    timer = setTimeout(strike, 2500);
    return () => clearTimeout(timer);
  }, [name, level]);

  if (!active) return null;
  return (
    <div ref={ref} aria-hidden className={`mood-layer mood-${active.name}`} style={{ '--mi': level } as CSSProperties}>
      <div className="mood-tint" />
      {active.name === 'dramatic' && (
        <>
          <div className="mood-bar mood-bar-top" />
          <div className="mood-bar mood-bar-bottom" />
        </>
      )}
      {active.name === 'rain' && (
        <>
          {particles(30 * level, 'mood-drop', 0.9)}
          {particles(4 * level, 'mood-drip', 9)}
        </>
      )}
      {active.name === 'storm' && (
        <>
          {particles(50 * level, 'mood-drop', 0.6)}
          <div className="mood-bolt" />
        </>
      )}
      {active.name === 'snow' && particles(25 * level, 'mood-flake', 12)}
      {active.name === 'golden' && particles(12 * level, 'mood-dust', 14)}
    </div>
  );
}
