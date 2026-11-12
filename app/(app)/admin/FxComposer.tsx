'use client';

import { useState, useTransition } from 'react';

import { deleteFxAsset, playFx, setDiscoSound } from '@/app/actions/admin';
import { FormButton } from '@/components/FormButton';
import { runAsset } from '@/components/fx';
import { sound } from '@/components/games/sound';
import { toastAction } from '@/components/ui';
import { IMAGE_STYLES, type ImageStyle } from '@/lib/fx';

type Asset = { id: string; name: string };
type Props = { sounds: Asset[]; images: Asset[]; to: string | null; toName?: string };

const url = (id: string) => `/fx/${id}`;

/** Pick an uploaded sound, an image, or both, and play them together. */
export function FxComposer({ sounds, images, to, toName }: Props) {
  const [picked, setPicked] = useState<{ sound: string | null; image: string | null }>({ sound: null, image: null });
  const [style, setStyle] = useState<ImageStyle>('zoom');
  // A deleted asset drops out of the selection on the next render.
  const soundId = sounds.some((a) => a.id === picked.sound) ? picked.sound : null;
  const imageId = images.some((a) => a.id === picked.image) ? picked.image : null;
  const name = (list: Asset[], id: string | null) => list.find((a) => a.id === id)?.name;
  const summary = [name(sounds, soundId) && `🔊 ${name(sounds, soundId)}`, name(images, imageId) && `🖼️ ${name(images, imageId)} · ${IMAGE_STYLES[style]}`].filter(Boolean).join('  +  ');

  const preview = () =>
    void runAsset({ effect: 'asset', by: '', ...(soundId ? { sound: url(soundId) } : {}), ...(imageId ? { image: url(imageId), style } : {}) });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="label">Sound (optional)</p>
          {sounds.length === 0 ? (
            <p className="text-sm text-faint">Noch keine Sounds – lade unten einen hoch.</p>
          ) : (
            <ul className="space-y-1.5">
              {sounds.map((a) => (
                <li key={a.id} className={`flex items-center gap-1 rounded-lg border px-2 py-1 transition ${soundId === a.id ? 'border-accent bg-accent/10' : 'border-line'}`}>
                  <button
                    type="button"
                    aria-pressed={soundId === a.id}
                    onClick={() => setPicked((p) => ({ ...p, sound: soundId === a.id ? null : a.id }))}
                    className="min-w-0 flex-1 truncate py-1 text-left text-sm"
                  >
                    🔊 {a.name}
                  </button>
                  <button type="button" onClick={() => void sound.load(url(a.id)).then((b) => b && sound.playBuffer(b))} className="btn-ghost h-7 px-2 text-xs" aria-label={`${a.name} probehören`}>
                    ▶
                  </button>
                  <FormButton action={deleteFxAsset.bind(null, a.id)} confirm={`„${a.name}“ löschen?`} className="btn-ghost h-7 px-2 text-xs">✕</FormButton>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="label">Bild (optional)</p>
          {images.length === 0 ? (
            <p className="text-sm text-faint">Noch keine Bilder – lade unten eins hoch.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((a) => (
                <li key={a.id} className="relative">
                  <button
                    type="button"
                    aria-pressed={imageId === a.id}
                    title={a.name}
                    onClick={() => setPicked((p) => ({ ...p, image: imageId === a.id ? null : a.id }))}
                    className={`block w-full overflow-hidden rounded-lg border-2 transition ${imageId === a.id ? 'border-accent' : 'border-transparent hover:border-line-strong'}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- uploaded asset, served from the DB */}
                    <img src={url(a.id)} alt={a.name} className="aspect-square w-full object-cover" />
                  </button>
                  <div className="absolute top-1 right-1">
                    <FormButton action={deleteFxAsset.bind(null, a.id)} confirm={`„${a.name}“ löschen?`} className="h-6 rounded-md bg-black/60 px-1.5 text-[10px] text-white hover:bg-black/80">✕</FormButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {imageId && (
        <div>
          <p className="label">So kommt das Bild rein</p>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(IMAGE_STYLES) as ImageStyle[]).map((s) => (
              <button key={s} type="button" aria-pressed={style === s} onClick={() => setStyle(s)} className={`h-8 text-xs ${style === s ? 'btn-primary' : 'btn-secondary'}`}>
                {IMAGE_STYLES[s]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-bg px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-sm text-muted">{summary || 'Wähle einen Sound, ein Bild oder beides.'}</span>
        <button type="button" onClick={preview} disabled={!soundId && !imageId} className="btn-ghost h-9 text-xs">Vorschau bei mir</button>
        <FormButton action={playFx.bind(null, soundId, imageId, style, to)} disabled={!soundId && !imageId} className="btn-primary h-9">
          {to ? `An ${toName}` : 'An alle'}
        </FormButton>
      </div>
    </div>
  );
}

/** Which uploaded sound the disco effect plays. */
export function DiscoSoundSelect({ sounds, value }: { sounds: Asset[]; value: string | null }) {
  const [pending, start] = useTransition();
  const current = sounds.some((a) => a.id === value) ? value : null;
  return (
    <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">🪩 Disco-Musik</span>
      <select
        className="input h-9 w-auto min-w-48 py-1 text-sm"
        value={current ?? ''}
        disabled={pending}
        onChange={(e) => start(() => toastAction(setDiscoSound(e.target.value || null)))}
      >
        <option value="">Eingebauter Beat</option>
        {sounds.map((a) => (
          <option key={a.id} value={a.id}>
            🔊 {a.name}
          </option>
        ))}
      </select>
    </label>
  );
}
