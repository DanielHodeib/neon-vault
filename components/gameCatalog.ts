import { ArrowUpDown, Bomb, Building2, CircleDot, Cherry, Club, Coins, Dices, FerrisWheel, Flag, Grid3x3, PiggyBank, Rocket, Spade, Sparkles, SquareStack, Triangle, type LucideIcon } from 'lucide-react';

// Every game once: sidebar, games panel, lobby and phone sheet all read this list.
export type GameCategory = 'live' | 'tables' | 'solo';
export type GameEntry = { slug: string; name: string; text: string; icon: LucideIcon; tint: string; category: GameCategory; isNew?: boolean };

export const CATEGORIES: { key: GameCategory; label: string; hint: string }[] = [
  { key: 'live', label: 'Live', hint: 'Alle spielen dieselbe Runde' },
  { key: 'tables', label: 'Tische', hint: 'Mit Freunden oder Bots' },
  { key: 'solo', label: 'Sofort', hint: 'Ergebnis in Sekunden' },
];

export const GAME_LIST: GameEntry[] = [
  { slug: 'crash', name: 'Crash', text: 'Rechtzeitig aussteigen', icon: Rocket, tint: '#3ddc97', category: 'live' },
  { slug: 'roulette', name: 'Roulette', text: 'Europäisch, live', icon: CircleDot, tint: '#ff8a4c', category: 'live' },
  { slug: 'race', name: 'Pferderennen', text: 'Alle wetten, live', icon: Flag, tint: '#fb7185', category: 'live' },
  { slug: 'wheel', name: 'Glücksrad', text: 'Alle drehen gemeinsam', icon: FerrisWheel, tint: '#34d399', category: 'live' },
  { slug: 'jackpot', name: 'Jackpot', text: 'Ein Topf, ein Gewinner', icon: PiggyBank, tint: '#fbbf24', category: 'live' },
  { slug: 'coinflip', name: 'Coinflip', text: 'Solo oder im Duell', icon: Coins, tint: '#4cc2ff', category: 'live' },
  { slug: 'blackjack', name: 'Blackjack', text: 'Solo oder am Tisch', icon: Spade, tint: '#7aa2ff', category: 'tables' },
  { slug: 'poker', name: 'Poker', text: "Texas Hold'em", icon: Club, tint: '#c084fc', category: 'tables' },
  { slug: 'slots', name: 'Slots', text: '8 Automaten', icon: Cherry, tint: '#e4c06a', category: 'solo' },
  { slug: 'mines', name: 'Mines', text: 'Felder aufdecken, Bomben meiden', icon: Bomb, tint: '#f87171', category: 'solo' },
  { slug: 'plinko', name: 'Plinko', text: 'Kugel fallen lassen', icon: Triangle, tint: '#f472b6', category: 'solo' },
  { slug: 'dice', name: 'Dice', text: 'Drüber oder drunter', icon: Dices, tint: '#a5b4c8', category: 'solo' },
  { slug: 'hilo', name: 'Hi-Lo', text: 'Höher oder tiefer?', icon: ArrowUpDown, tint: '#22d3ee', category: 'solo' },
  { slug: 'scratch', name: 'Rubbellos', text: 'Freirubbeln, 3 gleiche gewinnen', icon: Sparkles, tint: '#facc15', category: 'solo', isNew: true },
  { slug: 'tower', name: 'Tower', text: 'Stockwerk für Stockwerk nach oben', icon: Building2, tint: '#818cf8', category: 'solo', isNew: true },
  { slug: 'keno', name: 'Keno', text: '10 Zahlen tippen, 10 werden gezogen', icon: Grid3x3, tint: '#2dd4bf', category: 'solo', isNew: true },
  { slug: 'vpoker', name: 'Video Poker', text: 'Jacks or Better', icon: SquareStack, tint: '#f97316', category: 'solo', isNew: true },
];

export const GAME_BY_SLUG = new Map(GAME_LIST.map((g) => [g.slug, g]));

/** Games for the sidebar shortcut list when the player has no favourites or history yet. */
export const DEFAULT_SHORTCUTS = ['crash', 'slots', 'blackjack', 'roulette', 'mines'];
