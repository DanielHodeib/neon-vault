// Cosmetics shop: pure catalog shared by server actions and UI. Prices in NVC.
// Class names are written out in full so Tailwind picks them up.
export type ShopSlot = 'frame' | 'title' | 'nameEffect';

type Item = { id: string; slot: ShopSlot; name: string; price: number; description: string; className?: string; frame?: string };

export const SHOP_ITEMS: Item[] = [
  { id: 'frame-gold', slot: 'frame', name: 'Goldrahmen', price: 25_000, description: 'Klassischer Goldring um dein Profilbild.', frame: 'linear-gradient(135deg,#fde68a,#b8912f)' },
  { id: 'frame-neon', slot: 'frame', name: 'Neon-Puls', price: 50_000, description: 'Leuchtet in deiner Akzentfarbe.', frame: 'linear-gradient(135deg,var(--accent),#22d3ee)' },
  { id: 'frame-fire', slot: 'frame', name: 'Feuerring', price: 100_000, description: 'Für alle, die gerade heiß laufen.', frame: 'conic-gradient(#f97316,#ef4444,#facc15,#f97316)' },
  { id: 'frame-diamond', slot: 'frame', name: 'Diamant', price: 250_000, description: 'Kühl, klar, unbezahlbar – fast.', frame: 'conic-gradient(#a5f3fc,#e0e7ff,#60a5fa,#f0abfc,#a5f3fc)' },

  { id: 'title-lucky', slot: 'title', name: 'Glückspilz', price: 15_000, description: 'Titel neben deinem Namen im Chat.' },
  { id: 'title-shark', slot: 'title', name: 'Kartenhai', price: 30_000, description: 'Für Poker- und Blackjack-Profis.' },
  { id: 'title-highroller', slot: 'title', name: 'High Roller', price: 75_000, description: 'Große Einsätze, großer Auftritt.' },
  { id: 'title-legend', slot: 'title', name: 'Legende', price: 500_000, description: 'Nur für die ganz Großen.' },

  { id: 'name-glow', slot: 'nameEffect', name: 'Leuchtender Name', price: 40_000, description: 'Dein Name glüht im Chat.', className: 'drop-shadow-[0_0_6px_currentColor]' },
  { id: 'name-rainbow', slot: 'nameEffect', name: 'Regenbogen-Name', price: 60_000, description: 'Alle Farben auf einmal.', className: 'bg-gradient-to-r from-red-400 via-yellow-300 to-sky-400 bg-clip-text text-transparent' },
  { id: 'name-gold', slot: 'nameEffect', name: 'Goldener Name', price: 120_000, description: 'Glänzt wie ein Jackpot.', className: 'bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-600 bg-clip-text text-transparent' },
];

export const SLOT_LABEL: Record<ShopSlot, string> = { frame: 'Profilrahmen', title: 'Titel', nameEffect: 'Namenseffekt' };
export const shopItem = (id: string | null | undefined) => SHOP_ITEMS.find((i) => i.id === id);
