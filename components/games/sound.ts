// Tiny synthesized game sounds (no audio files). Muting is a per-browser preference.
const KEY = 'nv-game-sound';
let ctx: AudioContext | null = null;
let muted = (() => {
  if (typeof window === 'undefined') return false; // server render: Node's localStorage only warns
  try {
    return localStorage.getItem(KEY) === 'off';
  } catch {
    return false;
  }
})();
const listeners = new Set<() => void>();

function tone(freq: number, dur: number, { type = 'triangle' as OscillatorType, gain = 0.05, at = 0 } = {}) {
  if (muted) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch {
    // No audio available (old browser, blocked autoplay): play silently.
  }
}

const arpeggio = (notes: number[], step: number, opts?: Parameters<typeof tone>[2]) => notes.forEach((f, i) => tone(f, step * 2, { ...opts, at: i * step }));

export const sound = {
  stop: () => tone(170, 0.07, { gain: 0.09 }),
  tease: () => tone(330, 0.35, { type: 'sawtooth', gain: 0.02 }),
  /** `level` 0–2: small, medium, nice win. */
  win: (level: number) => arpeggio([523, 659, 784, 1047].slice(0, 2 + level), 0.08),
  big: () => arpeggio([523, 659, 784, 1047, 784, 1047, 1319, 1568], 0.11, { type: 'square', gain: 0.03 }),
  feature: () => arpeggio([392, 523, 659, 784, 1047], 0.07, { type: 'sine', gain: 0.06 }),
  flip: () => arpeggio([700, 900, 700, 900, 700, 900], 0.05, { type: 'sine', gain: 0.02 }),
  lose: () => arpeggio([330, 262], 0.12, { type: 'sine', gain: 0.04 }),
  card: () => tone(1200, 0.05, { type: 'square', gain: 0.015 }),
  tick: () => tone(900, 0.03, { type: 'square', gain: 0.012 }),
  gem: () => arpeggio([880, 1320], 0.05, { type: 'sine', gain: 0.05 }),
  bomb: () => arpeggio([160, 110, 70], 0.09, { type: 'sawtooth', gain: 0.07 }),
  start: () => arpeggio([392, 523], 0.07, { type: 'sine', gain: 0.04 }),
  /** Four-on-the-floor beat with a bass line for `seconds`. */
  disco: (seconds: number) => {
    const beat = 0.48;
    for (let i = 0; i < seconds / beat; i++) {
      tone(65, 0.18, { type: 'sine', gain: 0.12, at: i * beat }); // kick
      if (i % 2) tone(7000, 0.04, { type: 'square', gain: 0.008, at: i * beat }); // hi-hat
      tone([110, 110, 131, 98][Math.floor(i / 4) % 4], 0.2, { type: 'sawtooth', gain: 0.025, at: i * beat + beat / 2 }); // bass
    }
  },
  airhorn: () => [0, 0.32, 0.64].forEach((at) => [415, 440, 466].forEach((f) => tone(f, 0.28, { type: 'sawtooth', gain: 0.05, at }))),
  turn: () => arpeggio([660, 880], 0.08, { type: 'sine', gain: 0.05 }),
};

/** For useSyncExternalStore: muted state shared by every game. */
export const soundPref = {
  subscribe: (fn: () => void) => {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  muted: () => muted,
  server: () => false,
  toggle: () => {
    muted = !muted;
    try {
      localStorage.setItem(KEY, muted ? 'off' : 'on');
    } catch {
      // storage blocked: the choice lasts for this page only
    }
    listeners.forEach((fn) => fn());
  },
};
