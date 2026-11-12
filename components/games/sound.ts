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

/** Reel rattle while slot reels spin: random clicks over a rising hum. Returns a stop function. */
function reelLoop(): () => void {
  if (muted) return () => {};
  let osc: OscillatorNode | null = null;
  let amp: GainNode | null = null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t = ctx.currentTime;
    osc = ctx.createOscillator();
    amp = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.linearRampToValueAtTime(140, t + 1.2);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.012, t + 0.15);
    osc.connect(amp).connect(ctx.destination);
    osc.start(t);
  } catch {
    // no audio: clicks below stay silent as well
  }
  const clicks = setInterval(() => tone(500 + Math.random() * 700, 0.025, { type: 'square', gain: 0.008 }), 55);
  return () => {
    clearInterval(clicks);
    if (!ctx || !osc || !amp) return;
    const t = ctx.currentTime;
    amp.gain.cancelScheduledValues(t);
    amp.gain.setValueAtTime(amp.gain.value, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.stop(t + 0.15);
  };
}

/** Shared audio context, or null when muted or unavailable. */
function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// Browsers keep audio locked until the page gets a click or key press; unlock on the first one,
// so sounds sent later by the server (admin fun, uploaded files) can play.
if (typeof window !== 'undefined') {
  const unlock = () => {
    const c = audio();
    if (c?.state === 'running') ['pointerdown', 'keydown'].forEach((e) => window.removeEventListener(e, unlock, true));
  };
  ['pointerdown', 'keydown'].forEach((e) => window.addEventListener(e, unlock, true));
}

const files = new Map<string, Promise<AudioBuffer>>();

/** Loads an uploaded sound file (Admin → Spaß); null when muted, locked or broken. */
async function load(url: string): Promise<AudioBuffer | null> {
  const c = audio();
  if (!c) return null;
  let buffer = files.get(url);
  if (!buffer) {
    buffer = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((b) => c.decodeAudioData(b));
    files.set(url, buffer);
    buffer.catch(() => files.delete(url));
  }
  return buffer.catch(() => null);
}

function playBuffer(buffer: AudioBuffer, volume = 0.8) {
  const c = audio();
  if (!c || c.state !== 'running') return; // page never clicked: stay silent rather than play late
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain();
  g.gain.value = volume;
  src.connect(g).connect(c.destination);
  src.start();
}

let noiseBuffer: AudioBuffer | null = null;
const noise = (c: AudioContext) => {
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
};

type Voice = { g: GainNode; src: AudioScheduledSourceNode };

/** Gain that fades in over two seconds, wired to the speakers. */
function fadeIn(c: AudioContext, gain: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, c.currentTime);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + 2);
  g.connect(c.destination);
  return g;
}

/** Looping filtered noise: rain, wind, rumble. */
function bed(c: AudioContext, type: BiquadFilterType, freq: number, gain: number, q = 0.7): Voice & { f: BiquadFilterNode } {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = fadeIn(c, gain);
  src.connect(f).connect(g);
  src.start();
  return { g, src, f };
}

function drone(c: AudioContext, freq: number, gain: number, type: OscillatorType = 'sine'): Voice {
  const src = c.createOscillator();
  src.type = type;
  src.frequency.value = freq;
  const g = fadeIn(c, gain);
  src.connect(g);
  src.start();
  return { g, src };
}

/** Background sound for an atmosphere preset (lib/fx.ts MOODS), `level` 1–3. Returns a stop function. */
function ambience(mood: string, level: number): () => void {
  const c = audio();
  if (!c) return () => {};
  const k = level / 2;
  const voices: Voice[] = [];
  const timers: ReturnType<typeof setInterval>[] = [];
  switch (mood) {
    case 'rain':
      voices.push(bed(c, 'lowpass', 2500, 0.03 * k), bed(c, 'highpass', 6000, 0.006 * k));
      break;
    case 'storm':
      voices.push(bed(c, 'lowpass', 1800, 0.05 * k), bed(c, 'lowpass', 200, 0.04 * k));
      break;
    case 'dramatic':
      voices.push(drone(c, 55, 0.05 * k), drone(c, 55.6, 0.05 * k), drone(c, 110, 0.01 * k, 'sawtooth'));
      timers.push(setInterval(() => tone(42, 1.8, { type: 'sine', gain: 0.14 * k }), 8000));
      break;
    case 'gloom':
      voices.push(bed(c, 'bandpass', 300, 0.03 * k, 2), drone(c, 73, 0.02 * k));
      break;
    case 'horror':
      voices.push(drone(c, 46, 0.03 * k, 'triangle'), bed(c, 'bandpass', 900, 0.008 * k, 8));
      timers.push(
        setInterval(() => {
          tone(60, 0.12, { type: 'sine', gain: 0.2 * k });
          tone(55, 0.12, { type: 'sine', gain: 0.15 * k, at: 0.2 });
        }, 1100),
      );
      break;
    case 'snow': {
      const wind = bed(c, 'bandpass', 500, 0.02 * k, 1.5);
      const lfo = c.createOscillator();
      const depth = c.createGain();
      lfo.frequency.value = 0.15;
      depth.gain.value = 250;
      lfo.connect(depth).connect(wind.f.frequency); // wind swells up and down
      lfo.start();
      voices.push(wind, { g: depth, src: lfo });
      break;
    }
    case 'golden':
      voices.push(drone(c, 220, 0.008 * k), drone(c, 277, 0.006 * k), drone(c, 330, 0.006 * k));
      break;
  }
  return () => {
    timers.forEach(clearInterval);
    const t = c.currentTime;
    voices.forEach(({ g, src }) => {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1);
      src.stop(t + 1.1);
    });
  };
}

/** Rolling thunder after a lightning flash. */
function thunder(level: number) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 300;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12 * level, t + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
  src.stop(t + 3);
}

const arpeggio = (notes: number[], step: number, opts?: Parameters<typeof tone>[2]) => notes.forEach((f, i) => tone(f, step * 2, { ...opts, at: i * step }));

export const sound = {
  stop: () => tone(170, 0.07, { gain: 0.09 }),
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
  /** Lever pull: quick rising swoosh. */
  pull: () => arpeggio([180, 260, 380, 560, 820], 0.025, { type: 'sawtooth', gain: 0.025 }),
  reelLoop,
  ambience,
  thunder,
  load,
  playBuffer,
  /** Reel `i` locks in: a thunk plus a click that climbs reel by reel. */
  reelStop: (i: number) => {
    tone(120, 0.09, { type: 'sine', gain: 0.12 });
    tone(520 + i * 110, 0.05, { type: 'square', gain: 0.02 });
  },
  /** Tension drumroll while a bonus may still land. */
  drumroll: (seconds: number) => {
    for (let at = 0; at < seconds; at += 0.06) tone(90 + at * 60, 0.05, { type: 'triangle', gain: 0.03 + at * 0.03, at });
  },
  /** Winning symbols pop away (tumbling machines). */
  pop: () => arpeggio([1200, 1600, 2100], 0.03, { type: 'sine', gain: 0.03 }),
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
