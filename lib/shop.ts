// Cosmetics shop: pure catalog shared by server actions and UI. Prices in NVC.
// Class names are written out in full so Tailwind picks them up.
export type ShopSlot = 'frame' | 'title' | 'nameEffect' | 'bubble';
export const SHOP_SLOTS: ShopSlot[] = ['frame', 'title', 'nameEffect', 'bubble'];

// frame: ring gradient (className may animate it) · nameEffect/bubble: className on the name or the chat message
type Item = { id: string; slot: ShopSlot; name: string; price: number; description: string; className?: string; frame?: string };

export const SHOP_ITEMS: Item[] = [
  { id: 'frame-gold', slot: 'frame', name: 'Goldrahmen', price: 25_000, description: 'Klassischer Goldring um dein Profilbild.', frame: 'linear-gradient(135deg,#fde68a,#b8912f)' },
  { id: 'frame-neon', slot: 'frame', name: 'Neon-Puls', price: 50_000, description: 'Leuchtet in deiner Akzentfarbe.', frame: 'linear-gradient(135deg,var(--accent),#22d3ee)' },
  { id: 'frame-fire', slot: 'frame', name: 'Feuerring', price: 100_000, description: 'Für alle, die gerade heiß laufen.', frame: 'conic-gradient(#f97316,#ef4444,#facc15,#f97316)' },
  { id: 'frame-diamond', slot: 'frame', name: 'Diamant', price: 250_000, description: 'Kühl, klar, unbezahlbar – fast.', frame: 'conic-gradient(#a5f3fc,#e0e7ff,#60a5fa,#f0abfc,#a5f3fc)' },
  { id: 'frame-ice', slot: 'frame', name: 'Eiskristall', price: 40_000, description: 'Frostig kühl, wie deine Nerven beim Cashout.', frame: 'conic-gradient(#e0f2fe,#7dd3fc,#c4b5fd,#e0f2fe)' },
  { id: 'frame-toxic', slot: 'frame', name: 'Giftgrün', price: 60_000, description: 'Radioaktiv gute Laune.', frame: 'conic-gradient(#bef264,#22c55e,#a3e635,#bef264)' },
  { id: 'frame-royal', slot: 'frame', name: 'Königlich', price: 150_000, description: 'Purpur und Gold für Hoheiten.', frame: 'conic-gradient(#7c3aed,#facc15,#a855f7,#facc15,#7c3aed)' },
  { id: 'frame-rainbow', slot: 'frame', name: 'Regenbogen-Wirbel', price: 300_000, description: 'Dreht sich ständig – animiert.', frame: 'conic-gradient(#f87171,#facc15,#4ade80,#38bdf8,#a78bfa,#f472b6,#f87171)', className: 'frame-spin' },
  { id: 'frame-galaxy', slot: 'frame', name: 'Galaxie', price: 400_000, description: 'Ein Wirbel aus Sternenstaub – animiert.', frame: 'conic-gradient(#1e1b4b,#7c3aed,#ec4899,#22d3ee,#1e1b4b)', className: 'frame-spin' },

  { id: 'title-lucky', slot: 'title', name: 'Glückspilz', price: 15_000, description: 'Titel neben deinem Namen im Chat.' },
  { id: 'title-shark', slot: 'title', name: 'Kartenhai', price: 30_000, description: 'Für Poker- und Blackjack-Profis.' },
  { id: 'title-highroller', slot: 'title', name: 'High Roller', price: 75_000, description: 'Große Einsätze, großer Auftritt.' },
  { id: 'title-legend', slot: 'title', name: 'Legende', price: 500_000, description: 'Nur für die ganz Großen.' },
  { id: 'title-gambler', slot: 'title', name: 'Zocker', price: 10_000, description: 'Ehrlich ist am längsten.' },
  { id: 'title-nightowl', slot: 'title', name: 'Nachteule', price: 20_000, description: 'Spielt, wenn alle schlafen.' },
  { id: 'title-knight', slot: 'title', name: 'Glücksritter', price: 35_000, description: 'Zieht für Fortuna in die Schlacht.' },
  { id: 'title-champion', slot: 'title', name: 'Arena-Champion', price: 90_000, description: 'Für die Könige der Duelle.' },
  { id: 'title-oracle', slot: 'title', name: 'Orakel', price: 120_000, description: 'Sieht jede Wette kommen.' },
  { id: 'title-vaultbreaker', slot: 'title', name: 'Tresorknacker', price: 200_000, description: 'Kein Tresor ist sicher.' },
  { id: 'title-vip', slot: 'title', name: 'VIP', price: 1_000_000, description: 'Der teuerste Titel im Haus.' },

  { id: 'name-glow', slot: 'nameEffect', name: 'Leuchtender Name', price: 40_000, description: 'Dein Name glüht im Chat.', className: 'drop-shadow-[0_0_6px_currentColor]' },
  { id: 'name-rainbow', slot: 'nameEffect', name: 'Regenbogen-Name', price: 60_000, description: 'Alle Farben auf einmal.', className: 'bg-gradient-to-r from-red-400 via-yellow-300 to-sky-400 bg-clip-text text-transparent' },
  { id: 'name-gold', slot: 'nameEffect', name: 'Goldener Name', price: 120_000, description: 'Glänzt wie ein Jackpot.', className: 'bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-600 bg-clip-text text-transparent' },
  { id: 'name-ice', slot: 'nameEffect', name: 'Eisiger Name', price: 50_000, description: 'Cool bleiben.', className: 'bg-gradient-to-r from-cyan-200 via-white to-sky-400 bg-clip-text text-transparent' },
  { id: 'name-fire', slot: 'nameEffect', name: 'Feuer-Name', price: 80_000, description: 'Heiß wie eine Glückssträhne.', className: 'bg-gradient-to-r from-yellow-300 via-orange-500 to-red-500 bg-clip-text text-transparent' },
  { id: 'name-shimmer', slot: 'nameEffect', name: 'Schimmer', price: 150_000, description: 'Ein Glanz wandert durch deinen Namen – animiert.', className: 'name-shimmer' },
  { id: 'name-pulse', slot: 'nameEffect', name: 'Neon-Puls', price: 200_000, description: 'Pulsiert in deiner Akzentfarbe – animiert.', className: 'name-pulse' },

  { id: 'bubble-glass', slot: 'bubble', name: 'Glas', price: 20_000, description: 'Deine Nachrichten in mattem Glas.', className: 'rounded-lg bg-white/5 px-2 py-1 ring-1 ring-white/10' },
  { id: 'bubble-neon', slot: 'bubble', name: 'Neon-Rand', price: 45_000, description: 'Ein leuchtender Rahmen in deiner Akzentfarbe.', className: 'rounded-lg bg-accent/10 px-2 py-1 ring-1 ring-accent/60' },
  { id: 'bubble-love', slot: 'bubble', name: 'Herzblatt', price: 60_000, description: 'Rosa, für die Charmeure.', className: 'rounded-lg bg-gradient-to-r from-pink-500/20 to-rose-400/10 px-2 py-1 ring-1 ring-pink-400/40' },
  { id: 'bubble-gold', slot: 'bubble', name: 'Goldbarren', price: 90_000, description: 'Jede Nachricht ein kleiner Schatz.', className: 'rounded-lg bg-gradient-to-r from-amber-500/20 to-yellow-300/10 px-2 py-1 ring-1 ring-amber-300/40' },
  { id: 'bubble-matrix', slot: 'bubble', name: 'Matrix', price: 120_000, description: 'Grüner Code auf Schwarz.', className: 'rounded-lg bg-black/60 px-2 py-1 font-mono text-green-400 ring-1 ring-green-500/40' },
  { id: 'bubble-galaxy', slot: 'bubble', name: 'Galaxie', price: 250_000, description: 'Ein Stück Weltall um jede Zeile.', className: 'rounded-lg bg-gradient-to-r from-indigo-900/70 via-purple-800/50 to-fuchsia-800/40 px-2 py-1 ring-1 ring-fuchsia-400/30' },
];

export const SLOT_LABEL: Record<ShopSlot, string> = { frame: 'Profilrahmen', title: 'Titel', nameEffect: 'Namenseffekt', bubble: 'Chat-Blase' };
export const shopItem = (id: string | null | undefined) => SHOP_ITEMS.find((i) => i.id === id);
