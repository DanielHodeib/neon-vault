'use client';

import { musicOutput, noiseFor } from './sound';

// Background music, synthesized live (no audio files): chords, bass, hi-hat and an arpeggio.
// The style follows the page; volume and on/off come from soundPref (music volume 0 = off).

export type MusicStyle = 'lounge' | 'tension' | 'arcade';

type Style = { bpm: number; chords: number[][]; pad: OscillatorType; hat: boolean; arp: boolean; pulse: boolean };
const STYLES: Record<MusicStyle, Style> = {
  // Am7 – Fmaj7 – Dm7 – G7: relaxed lobby
  lounge: { bpm: 78, chords: [[57, 60, 64, 67], [53, 57, 60, 64], [50, 53, 57, 60], [55, 59, 62, 65]], pad: 'sine', hat: false, arp: false, pulse: false },
  // Am – Am(b6) – E – Am: tension for live rounds
  tension: { bpm: 112, chords: [[57, 60, 64], [57, 60, 65], [56, 59, 64], [57, 60, 64]], pad: 'triangle', hat: true, arp: false, pulse: true },
  // Cmaj7 – Am7 – Dm7 – G7: bright arcade
  arcade: { bpm: 120, chords: [[60, 64, 67, 71], [57, 60, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65]], pad: 'triangle', hat: true, arp: true, pulse: false },
};

const freq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const LOOKAHEAD = 1.2; // seconds of notes planned ahead

let style: MusicStyle = 'lounge';
let timer: ReturnType<typeof setInterval> | null = null;
let nextBar = 0;
let bar = 0;

function note(c: AudioContext, out: AudioNode, f: number, at: number, dur: number, gain: number, type: OscillatorType, attack = 0.01) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = f;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(out);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

function hat(c: AudioContext, out: AudioNode, at: number) {
  const src = c.createBufferSource();
  src.buffer = noiseFor(c);
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7000;
  const g = c.createGain();
  g.gain.setValueAtTime(0.012, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  src.connect(f).connect(g).connect(out);
  src.start(at, Math.random());
  src.stop(at + 0.06);
}

function scheduleBar(c: AudioContext, out: AudioNode, at: number) {
  const s = STYLES[style];
  const beat = 60 / s.bpm;
  const chord = s.chords[bar % s.chords.length];
  // pad: the whole chord, soft attack
  for (const m of chord) note(c, out, freq(m), at, beat * 4, 0.018, s.pad, 0.35);
  // bass on beats 1 and 3 (every beat for "tension")
  for (let b = 0; b < 4; b += s.pulse ? 1 : 2) note(c, out, freq(chord[0] - 12), at + b * beat, beat * 0.9, 0.07, 'sine');
  if (s.hat) for (let b = 0; b < 4; b++) hat(c, out, at + (b + 0.5) * beat);
  if (s.arp) for (let i = 0; i < 8; i++) note(c, out, freq(chord[i % chord.length] + 12), at + i * (beat / 2), beat / 2, 0.012, 'triangle');
  bar++;
}

function tick() {
  const o = musicOutput();
  if (!o) return;
  if (nextBar < o.c.currentTime) nextBar = o.c.currentTime + 0.1;
  while (nextBar < o.c.currentTime + LOOKAHEAD) {
    scheduleBar(o.c, o.bus, nextBar);
    nextBar += (60 / STYLES[style].bpm) * 4;
  }
}

export const music = {
  /** Starts or stops the loop to match the current volume (0 = off) and mute state. */
  sync(volume: number) {
    const on = volume > 0 && !!musicOutput();
    if (on && !timer) {
      nextBar = 0;
      tick();
      timer = setInterval(tick, 300);
    } else if (!on && timer) {
      clearInterval(timer);
      timer = null;
    }
  },
  /** Musical style for the page; the change lands at the next bar. */
  setStyle(next: MusicStyle) {
    if (next !== style) bar = 0;
    style = next;
  },
};

/** Which style a page gets. */
export function styleFor(pathname: string): MusicStyle {
  const game = pathname.startsWith('/play/') ? pathname.split('/')[2] : '';
  if (['crash', 'roulette', 'race', 'wheel', 'jackpot', 'coinflip', 'mines', 'tower', 'hilo', 'poker', 'blackjack'].includes(game)) return 'tension';
  if (game) return 'arcade';
  return 'lounge';
}
