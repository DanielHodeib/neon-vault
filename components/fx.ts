'use client';

import toast from 'react-hot-toast';

import type { FxAssetPayload, FxName, ImageStyle } from '@/lib/fx';
import { sound, soundPref } from './games/sound';

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

/** Disco: a mirror ball drops in, lasers and spotlights sweep, fog drifts in low from the sides. */
function disco() {
  const ms = 15_000;
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
  sound.disco(ms / 1000);
}

/** Uploaded image flying in, staying a moment and leaving again. */
function showImage(url: string, style: ImageStyle) {
  const el = layer('fx-image-stage', 4200);
  const img = document.createElement('img');
  img.src = url;
  img.alt = '';
  img.className = `fx-image fx-image-${style}`;
  el.appendChild(img);
}

/** Uploaded sound, unless the player muted game sounds. */
function playSound(url: string) {
  if (soundPref.muted()) return;
  const audio = new Audio(url);
  audio.volume = 0.8;
  void audio.play().catch(() => {}); // blocked until the page was clicked once
}

export function runAsset(p: FxAssetPayload) {
  if (p.kind === 'sound') playSound(p.url);
  else showImage(p.url, p.style ?? 'zoom');
}

export function runFx(effect: FxName, by: string) {
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
      disco();
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
