'use client';

import toast from 'react-hot-toast';

import type { FxName } from '@/lib/fx';
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
      bodyClass('fx-disco', 15_000);
      sound.feature();
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
