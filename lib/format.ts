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
};
