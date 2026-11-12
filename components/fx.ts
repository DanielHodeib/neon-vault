'use client';

import toast from 'react-hot-toast';

import type { FxAssetPayload, FxName, ImageStyle } from '@/lib/fx';
import { sound } from './games/sound';

// Admin fun effects. All are temporary and only change how the page looks or sounds.
function bodyClass(name: string, ms: number) {
  document.body.classList.add(name);
  setTimeout(() => document.body.classList.remove(name), ms);
}

function confetti() {
  const colors = ['#3ddc97', '#e4c06a', '#f87171', '#60a5fa', '#c084fc', '#fb923c'];
  const layer = document.createElement('div');
  layer.className = 'fx-confetti';
  for (let i = 0; i < 120; i++) {
    const piece = document.createElement('i');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.8}s`;
    piece.style.animationDuration = `${2 + Math.random() * 1.5}s`;
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 4500);
}

/** Layer on top of the page that removes itself (fades out over the last 600 ms). */
function layer(className: string, ms: number) {
  const el = document.createElement('div');
  el.className = `fx-layer ${className}`;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('fx-out'), ms - 600);
  setTimeout(() => el.remove(), ms);
  return el;
}

const child = (parent: HTMLElement, className: string, style: Partial<CSSStyleDeclaration> = {}) => {
  const el = document.createElement('div');
  el.className = className;
  Object.assign(el.style, style);
  parent.appendChild(el);
  return el;
};

/** Disco: a mirror ball drops in, lasers and spotlights sweep, fog drifts in low from the sides.
 * With an uploaded track (Admin → Spaß → Disco-Musik) the show starts once the music is loaded. */
async function disco(music?: string) {
  const ms = 15_000;
  const track = music ? await sound.load(music) : null;
  const scene = layer('fx-disco-scene', ms);
  const rig = child(scene, 'fx-ball-rig');
  child(rig, 'fx-ball-string');
  child(rig, 'fx-ball');
  const colors = ['#ff2d95', '#22d3ee', '#a3e635', '#facc15', '#a78bfa', '#fb7185'];
  colors.forEach((c, i) => {
    const left = i % 2 === 0;
    child(scene, 'fx-laser', {
      background: `linear-gradient(to bottom, ${c}, transparent 85%)`,
      boxShadow: `0 0 12px ${c}, 0 0 30px ${c}`,
      left: left ? `${4 + i * 3}%` : 'auto',
      right: left ? 'auto' : `${4 + i * 3}%`,
      animationDuration: `${1.6 + i * 0.35}s`,
      animationDirection: left ? 'alternate' : 'alternate-reverse',
    });
  });
  ['#ff2d95', '#22d3ee', '#facc15'].forEach((c, i) => child(scene, 'fx-spot', { background: `radial-gradient(ellipse at top, ${c}55, transparent 65%)`, left: `${15 + i * 30}%`, animationDelay: `${-i * 1.3}s` }));
  child(scene, 'fx-fog fx-fog-left');
  child(scene, 'fx-fog fx-fog-right');
  bodyClass('fx-disco', ms);
  if (track) sound.playBuffer(track, 0.8, ms / 1000);
  else sound.disco(ms / 1000);
}

/** Uploaded image, resolved once loaded so its entrance does not run while it still downloads. */
function loadImage(url: string, style: ImageStyle) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.alt = '';
    img.className = `fx-image fx-image-${style}`;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Uploaded sound and/or image; when both are sent they start together once both are ready. */
export async function runAsset(p: FxAssetPayload) {
  const [img, buffer] = await Promise.all([p.image ? loadImage(p.image, p.style ?? 'zoom') : null, p.sound ? sound.load(p.sound) : null]);
  if (img) layer('fx-image-stage', 4200).appendChild(img);
  if (buffer) sound.playBuffer(buffer);
}

export function runFx(effect: FxName, by: string, music?: string) {
  switch (effect) {
    case 'confetti':
      confetti();
      sound.big();
      break;
    case 'shake':
      bodyClass('fx-shake', 1200);
      sound.bomb();
      break;
    case 'flip':
      bodyClass('fx-flip', 20_000);
      toast(`🙃 ${by} hat die Welt auf den Kopf gestellt`);
      break;
    case 'disco':
      void disco(music);
      break;
    case 'airhorn':
      sound.airhorn();
      toast(`📯 ${by}`);
      break;
    case 'fakewin':
      sound.big();
      toast.success('JACKPOT! +1.000.000 NVC', { duration: 3500, style: { fontSize: '1.1rem', fontWeight: 700 } });
      setTimeout(() => toast(`…nur Spaß 😜 Grüße von ${by}`, { duration: 4000 }), 3600);
      break;
  }
}
