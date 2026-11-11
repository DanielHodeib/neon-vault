import { shuffle } from './rng';

// A card is rank + suit, e.g. "AS", "TH", "9C".
export const RANKS = '23456789TJQKA';
export const SUITS = 'SHDC';

export const newDeck = (decks = 1) =>
  shuffle(Array.from({ length: decks }, () => [...RANKS].flatMap((r) => [...SUITS].map((s) => r + s))).flat());

export const rankValue = (card: string) => RANKS.indexOf(card[0]) + 2; // 2..14

/** Blackjack total, counting aces as 11 where that doesn't bust. */
export function bjTotal(cards: string[]) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const v = rankValue(c);
    if (v === 14) aces++;
    total += v === 14 ? 11 : Math.min(v, 10);
  }
  while (total > 21 && aces--) total -= 10;
  return total;
}

export const isBlackjack = (cards: string[]) => cards.length === 2 && bjTotal(cards) === 21;

export const HAND_NAMES = ['Höchste Karte', 'Paar', 'Zwei Paare', 'Drilling', 'Straße', 'Flush', 'Full House', 'Vierling', 'Straight Flush'];

/** Score of exactly five cards; higher is better. Category is score >> 20. */
function score5(cards: string[]) {
  const values = cards.map(rankValue).sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const unique = [...new Set(values)];
  let straightHigh = 0;
  if (unique.length === 5 && values[0] - values[4] === 4) straightHigh = values[0];
  if (unique.join() === '14,5,4,3,2') straightHigh = 5; // wheel

  const counts = unique.map((v) => [values.filter((x) => x === v).length, v]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const shape = counts.map((c) => c[0]).join('');
  const kickers = straightHigh ? [straightHigh] : counts.map((c) => c[1]);

  const category =
    straightHigh && flush ? 8
    : shape === '41' ? 7
    : shape === '32' ? 6
    : flush ? 5
    : straightHigh ? 4
    : shape === '311' ? 3
    : shape === '221' ? 2
    : shape === '2111' ? 1
    : 0;
  return kickers.reduce((acc, v, i) => acc + v * 16 ** (4 - i), category * 16 ** 5);
}

/** Best five-card score out of 5–7 cards. */
export function bestHand(cards: string[]) {
  let best = 0;
  const choose = (start: number, picked: string[]) => {
    if (picked.length === 5) return void (best = Math.max(best, score5(picked)));
    for (let i = start; i < cards.length; i++) choose(i + 1, [...picked, cards[i]]);
  };
  choose(0, []);
  return best;
}

export const handName = (score: number) => HAND_NAMES[Math.floor(score / 16 ** 5)];

/** Name of the best hand in 2–7 cards (pre-flop only pairs count). */
export function describeHand(cards: string[]) {
  if (cards.length >= 5) return handName(bestHand(cards));
  const counts = Object.values(cards.reduce<Record<string, number>>((m, c) => ({ ...m, [c[0]]: (m[c[0]] ?? 0) + 1 }), {})).sort((a, b) => b - a);
  return counts[0] === 4 ? 'Vierling' : counts[0] === 3 ? 'Drilling' : counts[0] === 2 && counts[1] === 2 ? 'Zwei Paare' : counts[0] === 2 ? 'Paar' : 'Höchste Karte';
}
