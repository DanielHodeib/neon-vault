import { randomInt } from 'node:crypto';

import { shuffle } from '../game/rng';
import { broadcast, db, hub, notify, type ChatMessage, type GlobalEvent } from './hub';
import { applyLedger, netProfitSince, payout, startOfDay } from './wallet';

// Global events, rain, maintenance and announcements. Called from game code
// and from admin server actions; all state lives on `hub`.

export const KING_BONUS = 25_000;
export const BOUNTY_BONUS = 10_000;

type EventType = GlobalEvent['type'];
export const EVENT_TYPES: Record<EventType, Omit<GlobalEvent, 'endsAt' | 'type'> & { minutes: number }> = {
  CASHBACK: { label: 'Cashback-Mania', description: '10 % Cashback auf verlorene Crash- und Coinflip-Einsätze.', minutes: 10 },
  BOOST: { label: 'Multiplier-Boost', description: '1,2× Auszahlung auf Crash- und Coinflip-Gewinne.', minutes: 10 },
  RAIN: { label: 'Rain-Event', description: 'Alle Online-Spieler bekommen regelmäßig NVC-Drops.', minutes: 10 },
  HAPPY_HOUR: { label: 'Happy Hour', description: 'Extra-XP für jeden Gewinn.', minutes: 60 },
  JACKPOT_RUSH: { label: 'Jackpot-Rush', description: 'Dreifache Jackpot-Chance an allen Slots.', minutes: 10 },
  DUEL: { label: 'Duell-Woche', description: 'Coinflip ohne 5 % Gebühr.', minutes: 30 },
  KING: { label: 'King of the Hill', description: `Der höchste Einzelgewinn bekommt ${KING_BONUS.toLocaleString('de-DE')} NVC Bonus.`, minutes: 30 },
  BOUNTY: { label: 'Bounty', description: `Wer den King of Today im Coinflip schlägt, bekommt ${BOUNTY_BONUS.toLocaleString('de-DE')} NVC.`, minutes: 30 },
};

export const eventActive = (type: EventType) => hub.event?.type === type;

const BOOSTED_GAMES = new Set(['crash', 'coinflip']);
const timers = hub.timers;

export const winBoost = (game: string) => (hub.event?.type === 'BOOST' && BOOSTED_GAMES.has(game) ? 1.2 : 1);

export async function cashback(userId: string, lost: number, game: string) {
  if (hub.event?.type === 'CASHBACK' && BOOSTED_GAMES.has(game)) await payout(userId, lost * 0.1, game, 'REFUND');
}

export function systemMessage(text: string) {
  const msg: ChatMessage = { id: `${Date.now()}${randomInt(1e6)}`, userId: null, username: 'SYSTEM', text, at: Date.now() };
  hub.chat = [...hub.chat.slice(-49), msg];
  broadcast('chat', msg);
}

export function startEvent(type: EventType, minutes = EVENT_TYPES[type].minutes) {
  if (hub.event) return false;
  const { label, description } = EVENT_TYPES[type];
  hub.event = { type, label, description, endsAt: Date.now() + minutes * 60_000 };
  if (type === 'KING') hub.king = null;
  if (type === 'BOUNTY') hub.bountyPaid = false;
  broadcast('event', hub.event);
  systemMessage(`${hub.event.label}: ${hub.event.description} (${minutes} Min.)`);
  timers.eventEnd = setTimeout(stopEvent, minutes * 60_000);
  if (type === 'RAIN') timers.rainDrops = setInterval(() => void rainDrop().catch(console.error), 45_000);
  return true;
}

export function stopEvent() {
  if (!hub.event) return false;
  systemMessage(`${hub.event.label} ist vorbei.`);
  if (hub.event.type === 'KING' && hub.king) void crownKing(hub.king.userId, hub.king.win).catch(console.error);
  hub.event = null;
  clearTimeout(timers.eventEnd);
  clearInterval(timers.rainDrops);
  broadcast('event', null);
  return true;
}

/** Starts a random event every 60–120 minutes. Called once by server.ts. */
export function startEventScheduler() {
  const next = () => {
    timers.scheduler = setTimeout(() => {
      const types = Object.keys(EVENT_TYPES) as EventType[];
      startEvent(types[randomInt(types.length)]);
      next();
    }, (60 + randomInt(61)) * 60_000);
  };
  next();
}

async function crownKing(userId: string, win: number) {
  hub.king = null;
  const user = await db.user.findUnique({ where: { id: userId }, select: { username: true } });
  if (!user) return;
  await applyLedger([{ userId, amount: KING_BONUS, kind: 'BONUS', note: 'King of the Hill' }]);
  systemMessage(`${user.username} ist King of the Hill (${win.toLocaleString('de-DE')} NVC Einzelgewinn) und bekommt ${KING_BONUS.toLocaleString('de-DE')} NVC!`);
  await notify(userId, 'King of the Hill', `+${KING_BONUS.toLocaleString('de-DE')} NVC für den höchsten Einzelgewinn.`);
}

/** Bounty event: beating today's top player in a coinflip pays a bonus. */
export async function bounty(winnerId: string, loserId: string, winnerName: string) {
  if (!eventActive('BOUNTY') || hub.bountyPaid) return;
  const [king] = await netProfitSince(startOfDay(), 1);
  if (king?.userId !== loserId || king.profit <= 0 || hub.bountyPaid) return;
  hub.bountyPaid = true; // one bounty per event, otherwise a second account could farm it
  await applyLedger([{ userId: winnerId, amount: BOUNTY_BONUS, kind: 'BONUS', note: `Bounty auf ${king.username}` }]);
  systemMessage(`${winnerName} hat den King of Today ${king.username} geschlagen: +${BOUNTY_BONUS.toLocaleString('de-DE')} NVC Bounty!`);
}

async function rainDrop() {
  const users = [...hub.online.keys()];
  if (!users.length) return;
  const drop = 20 + randomInt(81);
  await applyLedger(users.map((userId) => ({ userId, amount: drop, kind: 'RAIN' as const, note: 'Rain-Event' })));
  broadcast('toast', `🌧️ Rain-Drop: +${drop} NVC für alle Online-Spieler`);
}

/** Splits `amount` among up to `players` users who chatted in the last 10 minutes. */
export function startRain(amount: number, seconds: number, players: number, by: string) {
  if (hub.rainActive) return false;
  hub.rainActive = true;
  const endsAt = Date.now() + seconds * 1000;
  broadcast('rain', { amount, endsAt, players, by });
  systemMessage(`Rain von ${by}: ${amount} NVC für ${players} aktive Chatter in ${seconds}s!`);
  setTimeout(async () => {
    hub.rainActive = false;
    broadcast('rain', null);
    const since = Date.now() - 10 * 60_000;
    const active = [...hub.chatActive].filter(([, at]) => at >= since).map(([id]) => id);
    // Only accounts that still exist; a deleted user would abort the whole payout.
    const existing = (await db.user.findMany({ where: { id: { in: active } }, select: { id: true } })).map((u) => u.id);
    const winners = shuffle(existing).slice(0, players);
    const share = Math.floor(amount / Math.max(1, winners.length));
    if (!winners.length || share < 1) return systemMessage('Rain vorbei – niemand war im Chat aktiv.');
    await applyLedger(winners.map((userId) => ({ userId, amount: share, kind: 'RAIN' as const, note: `Rain von ${by}` })));
    const names = await db.user.findMany({ where: { id: { in: winners } }, select: { username: true } });
    systemMessage(`Rain vorbei: ${names.map((n) => n.username).join(', ')} bekommen je ${share} NVC.`);
  }, seconds * 1000);
  return true;
}

export async function loadMaintenance() {
  const s = await db.systemSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  hub.maintenance = { on: s.maintenance, endsAt: s.maintenanceEndsAt?.getTime() ?? null };
}

export async function setMaintenance(on: boolean, endsAt: Date | null) {
  await db.systemSettings.upsert({ where: { id: 1 }, update: { maintenance: on, maintenanceEndsAt: endsAt }, create: { id: 1, maintenance: on, maintenanceEndsAt: endsAt } });
  hub.maintenance = { on, endsAt: endsAt?.getTime() ?? null };
  broadcast('maintenance', hub.maintenance);
}

export async function announce(message: string, from: string, persist: boolean) {
  broadcast('announcement', { message, from, at: Date.now() });
  if (!persist) return;
  const users = await db.user.findMany({ select: { id: true } });
  await Promise.all(users.map((u) => notify(u.id, `Ankündigung von ${from}`, message)));
}
