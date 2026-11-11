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
