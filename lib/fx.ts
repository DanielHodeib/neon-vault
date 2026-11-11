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
