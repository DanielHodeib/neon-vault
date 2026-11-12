'use client';

import { RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { accentFg } from '@/lib/format';
import { useT } from './I18n';

const PRESETS = ['#3ddc97', '#4cc2ff', '#a78bfa', '#f472b6', '#fb923c', '#facc15', '#f87171', '#2dd4bf', '#e5e7eb'];

/** Own accent colour for the settings form: presets or any colour, previewed live; empty = theme colour. */
export function AccentPicker({ value }: { value: string | null }) {
  const t = useT();
  const [accent, setAccent] = useState(value ?? '');
  const apply = (hex: string) => {
    setAccent(hex);
    const root = document.documentElement.style;
    if (hex) {
      root.setProperty('--accent', hex);
      root.setProperty('--accent-fg', accentFg(hex));
    } else {
      root.removeProperty('--accent');
      root.removeProperty('--accent-fg');
    }
  };
  return (
    <div>
      <label className="label">{t('Akzentfarbe')}</label>
      <input type="hidden" name="accent" value={accent} />
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => apply(c)}
            aria-label={c}
            aria-pressed={accent === c}
            className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-surface transition hover:scale-110 ${accent === c ? 'ring-2 ring-fg' : ''}`}
            style={{ background: c }}
          />
        ))}
        <label className="relative grid h-7 w-7 cursor-pointer place-items-center overflow-hidden rounded-full border border-dashed border-line-strong text-xs text-muted" title={t('Eigene Farbe')}>
          +
          <input type="color" value={accent || '#3ddc97'} onChange={(e) => apply(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
        {accent && (
          <button type="button" onClick={() => apply('')} className="btn-ghost h-7 gap-1 px-2 text-xs">
            <RotateCcw size={12} /> {t('Theme-Farbe')}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-faint">{t('Vorschau sofort, gespeichert mit „Speichern“.')}</p>
    </div>
  );
}
