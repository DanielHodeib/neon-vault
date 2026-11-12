const full = new Intl.NumberFormat('de-DE');
const short = new Intl.NumberFormat('de-DE', { notation: 'compact', maximumFractionDigits: 1 });

export const coins = (n: number | bigint) => full.format(n);
export const compact = (n: number | bigint) => short.format(n);

export const timeAgo = (date: Date | string | number) => {
  const s = Math.round((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  return new Date(date).toLocaleDateString('de-DE');
};

export const GAME_NAMES: Record<string, string> = {
  crash: 'Crash',
  slots: 'Slots',
  blackjack: 'Blackjack',
  roulette: 'Roulette',
  poker: 'Poker',
  coinflip: 'Coinflip',
  mines: 'Mines',
  dice: 'Dice',
  plinko: 'Plinko',
  hilo: 'Hi-Lo',
  wheel: 'Glücksrad',
  jackpot: 'Jackpot',
  race: 'Pferderennen',
  scratch: 'Rubbellos',
  tower: 'Tower',
  keno: 'Keno',
  vpoker: 'Video Poker',
  limbo: 'Limbo',
  baccarat: 'Baccarat',
};

export const THEMES = ['neon', 'ocean', 'violet', 'rose', 'sunset', 'gold', 'matrix', 'steel'] as const;
export type Theme = (typeof THEMES)[number];
/** Display name and swatch colour per theme (colours themselves live in app/globals.css). */
export const THEME_INFO: Record<Theme, { name: string; color: string }> = {
  neon: { name: 'Mint', color: '#3ddc97' },
  ocean: { name: 'Ozean', color: '#4cc2ff' },
  violet: { name: 'Violett', color: '#a78bfa' },
  rose: { name: 'Rosé', color: '#fb7185' },
  sunset: { name: 'Sunset', color: '#ff8a4c' },
  gold: { name: 'Gold', color: '#e4c06a' },
  matrix: { name: 'Matrix', color: '#b4f04a' },
  steel: { name: 'Stahl', color: '#a5b4c8' },
};
export const TICKET_CATEGORIES = ['Allgemein', 'Konto', 'Zahlungen', 'Bug', 'Bann-Einspruch'];
export const TICKET_STATUS: Record<string, string> = { OPEN: 'Offen', IN_PROGRESS: 'In Bearbeitung', ANSWERED: 'Beantwortet', CLOSED: 'Geschlossen' };

/** Text colour that stays readable on an accent colour (#rrggbb): dark on light colours, white on dark ones. */
export function accentFg(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.45 ? '#0a0b0d' : '#ffffff';
}
export const ACCENT_RE = /^#[0-9a-fA-F]{6}$/;
/** Inline CSS variables for a custom accent, or nothing for the theme's own. */
export const accentStyle = (accent: string | null | undefined) =>
  accent && ACCENT_RE.test(accent) ? ({ '--accent': accent, '--accent-fg': accentFg(accent) } as Record<string, string>) : undefined;
