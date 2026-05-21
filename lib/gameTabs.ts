export const HUB_GAME_TABS = new Set([
  'crash',
  'crash-aviator',
  'slots',
  'blackjack',
  'roulette',
  'poker',
  'coinflip',
]);

export function isHubGameTab(tab: string) {
  return HUB_GAME_TABS.has(tab);
}
