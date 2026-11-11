'use client';

import { ImageUp, X } from 'lucide-react';
import { useRef, useState } from 'react';
import toast from 'react-hot-toast';

import { uploadImage } from '@/app/actions/media';

const SIZE = { avatar: [256, 256], banner: [1500, 500] } as const;

/** Center-crops and scales the picture to the target size and encodes it as JPEG. */
async function resize(file: File, [w, h]: readonly [number, number]) {
  const img = await createImageBitmap(file);
  const scale = Math.max(w / img.width, h / img.height);
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#111317'; // transparent PNGs get the app background instead of black
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, (w - img.width * scale) / 2, (h - img.height * scale) / 2, img.width * scale, img.height * scale);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.85));
}

/** Avatar/banner picker: upload a file, or paste a direct image URL with live preview. */
export function ImageField({ kind, name, label, initial }: { kind: 'avatar' | 'banner'; name: string; label: string; initial: string | null }) {
  const [url, setUrl] = useState(initial ?? '');
  const [broken, setBroken] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set('file', await resize(file, SIZE[kind]), `${kind}.jpg`);
      const res = await uploadImage(kind, form);
      if (!res.ok) toast.error(res.error);
      else {
        setUrl(res.url);
        setBroken(false);
        toast.success(kind === 'avatar' ? 'Avatar gespeichert.' : 'Banner gespeichert.');
      }
    } catch {
      toast.error('Dieses Bild konnte nicht gelesen werden.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const uploaded = url.startsWith('/media/');
  const preview = url && !broken && (
    // eslint-disable-next-line @next/next/no-img-element -- user-provided URLs can't go through next/image
    <img src={url} alt="" onError={() => setBroken(true)} className={`border border-line object-cover ${kind === 'avatar' ? 'h-16 w-16 rounded-full' : 'aspect-[3/1] w-full rounded-lg'}`} />
  );

  return (
    <div>
      <label className="label">{label}</label>
      <div className={kind === 'avatar' ? 'flex items-center gap-3' : 'space-y-2'}>
        {preview || (
          <div className={`grid place-items-center border border-dashed border-line text-faint ${kind === 'avatar' ? 'h-16 w-16 shrink-0 rounded-full' : 'aspect-[3/1] w-full rounded-lg'}`}>
            <ImageUp size={18} />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
            {busy ? 'Lädt …' : 'Datei wählen'}
          </button>
          <input
            className="input min-w-40 flex-1"
            name={name}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value.trim());
              setBroken(false);
            }}
            placeholder="oder Bild-URL einfügen"
            inputMode="url"
            readOnly={uploaded}
          />
          {url && (
            <button type="button" className="btn-ghost w-10 px-0" aria-label="Bild entfernen" onClick={() => (setUrl(''), setBroken(false))}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
      {broken && (
        <p className="mt-1.5 text-xs text-loss">
          Unter dieser Adresse liegt kein Bild – das ist wohl eine Webseite. Rechtsklick (am Handy: lange drücken) auf das Bild → „Bildadresse kopieren“, oder lade die Datei hoch.
        </p>
      )}
      {uploaded && <p className="mt-1.5 text-xs text-faint">Hochgeladen und gespeichert. Mit ✕ entfernen und danach „Profil speichern“.</p>}
    </div>
  );
}
