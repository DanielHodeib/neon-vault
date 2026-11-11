// Fun screen effects the admin can send (handled in components/fx.ts).
export const FX = {
  confetti: { label: 'Konfetti', emoji: '🎉' },
  shake: { label: 'Erdbeben', emoji: '🫨' },
  flip: { label: 'Kopfstand (20 s)', emoji: '🙃' },
  disco: { label: 'Disco (15 s)', emoji: '🪩' },
  airhorn: { label: 'Airhorn', emoji: '📯' },
  fakewin: { label: 'Fake-Jackpot', emoji: '💸' },
} as const;
export type FxName = keyof typeof FX;

/** How an uploaded image enters the screen. */
export const IMAGE_STYLES = {
  shoot: 'Reinschießen',
  zoom: 'Reinzoomen',
  drop: 'Von oben fallen',
  spin: 'Reindrehen',
} as const;
export type ImageStyle = keyof typeof IMAGE_STYLES;

/** Payload sent to the browser for an uploaded asset. */
export type FxAssetPayload = { effect: 'asset'; kind: 'sound' | 'image'; url: string; style?: ImageStyle; by: string };

/** Atmosphere presets: stay on screen for a while (components/Mood.tsx). */
export const MOODS = {
  dramatic: { label: 'Dramatisch', emoji: '🎬', hint: 'Kinobalken, dunkle Ränder, tiefer Brummton mit Donnerschlägen.' },
  rain: { label: 'Regen', emoji: '🌧️', hint: 'Regen fällt, Tropfen rinnen übers Glas, leises Rauschen.' },
  storm: { label: 'Gewitter', emoji: '⛈️', hint: 'Starkregen, Blitze und Donner.' },
  gloom: { label: 'Düster', emoji: '🌑', hint: 'Dunkler und farbloser, das Licht flackert.' },
  horror: { label: 'Horror', emoji: '🩸', hint: 'Roter Rand pulsiert im Herzschlag.' },
  snow: { label: 'Schnee', emoji: '❄️', hint: 'Flocken tanzen, kühles Licht, Wind.' },
  golden: { label: 'Goldene Stunde', emoji: '🌅', hint: 'Warmes Licht, schwebender Staub, sanfter Klang.' },
} as const;
export type MoodName = keyof typeof MOODS;
export const MOOD_LEVELS = ['Leicht', 'Mittel', 'Stark'] as const;
/** level 1–3 */
export type Mood = { name: MoodName; level: number; endsAt: number; by: string };
