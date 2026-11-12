'use client';

import { Music2, Volume2, VolumeX } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { music, styleFor } from './games/music';
import { soundPref } from './games/sound';
import { useT } from './I18n';

const STYLE_NAME = { lounge: 'Lounge', tension: 'Spannung', arcade: 'Arcade' } as const;

/** Header button: mute, effect volume and background music volume; also keeps the music in step with the page. */
export function SoundMenu() {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const muted = useSyncExternalStore(soundPref.subscribe, soundPref.muted, soundPref.server);
  const fx = useSyncExternalStore(soundPref.subscribe, soundPref.fxVolume, () => 1);
  const volume = useSyncExternalStore(soundPref.subscribe, soundPref.musicVolume, () => 0);
  const style = styleFor(pathname);

  useEffect(() => music.setStyle(style), [style]);
  // Every change (volume, mute, audio unlocked by the first click) may start or stop the music.
  useEffect(() => {
    const sync = () => music.sync(soundPref.musicVolume());
    sync();
    return soundPref.subscribe(sync);
  }, []);

  const on = !muted && volume > 0;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className={`btn-ghost h-9 w-9 px-0 ${on ? 'text-accent' : ''}`} aria-label={t('Ton und Musik')} aria-expanded={open}>
        {muted ? <VolumeX size={18} /> : on ? <Music2 size={18} /> : <Volume2 size={18} />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="panel absolute top-11 right-0 z-50 w-64 space-y-4 p-4 shadow-2xl shadow-black/50">
            <button onClick={soundPref.toggle} className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm ${muted ? 'border-loss/40 text-loss' : 'border-line text-fg'}`}>
              <span className="flex items-center gap-2">{muted ? <VolumeX size={16} /> : <Volume2 size={16} />} {muted ? t('Alles stumm') : t('Ton an')}</span>
              <span className="text-xs text-muted">{muted ? t('Einschalten') : t('Stumm')}</span>
            </button>
            <Slider label={t('Effekte')} value={fx} disabled={muted} onChange={(v) => soundPref.setVolume('fx', v)} />
            <Slider label={t('Musik')} value={volume} disabled={muted} onChange={(v) => soundPref.setVolume('music', v)} hint={volume > 0 ? t('Stil: {s}', { s: t(STYLE_NAME[style]) }) : t('Aus – Regler hochziehen')} />
            <p className="text-[11px] text-faint">{t('Die Musik wechselt mit dem Spiel: ruhig in der Lobby, spannend bei Live-Runden.')}</p>
          </div>
        </>
      )}
    </div>
  );
}

function Slider({ label, value, onChange, disabled, hint }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean; hint?: string }) {
  return (
    <label className={`block ${disabled ? 'opacity-40' : ''}`}>
      <span className="mb-1 flex justify-between text-xs">
        <span className="font-medium">{label}</span>
        <span className="num text-muted">{Math.round(value * 100)} %</span>
      </span>
      <input type="range" min={0} max={100} value={Math.round(value * 100)} disabled={disabled} onChange={(e) => onChange(Number(e.target.value) / 100)} className="w-full accent-[var(--color-accent)]" />
      {hint && <span className="mt-0.5 block text-[11px] text-faint">{hint}</span>}
    </label>
  );
}
