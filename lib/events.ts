import { randomInt } from 'node:crypto';

import { shuffle } from '../game/rng';
import { broadcast, db, hub, notify, type ChatMessage, type GlobalEvent } from './hub';
import { applyLedger, payout } from './wallet';

// Global events, rain, maintenance and announcements. Called from game code
// and from admin server actions; all state lives on `hub`.

export const EVENT_TYPES: Record<GlobalEvent['type'], Omit<GlobalEvent, 'endsAt' | 'type'>> = {
  CASHBACK: { label: 'Cashback-Mania', description: '10 % Cashback auf verlorene Crash- und Coinflip-Einsätze.' },
  BOOST: { label: 'Multiplier-Boost', description: '1,2× Auszahlung auf Crash- und Coinflip-Gewinne.' },
  RAIN: { label: 'Rain-Event', description: 'Alle Online-Spieler bekommen regelmäßig NVC-Drops.' },
};

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

export function startEvent(type: GlobalEvent['type'], minutes = 5 + randomInt(6)) {
  if (hub.event) return false;
  hub.event = { type, ...EVENT_TYPES[type], endsAt: Date.now() + minutes * 60_000 };
  broadcast('event', hub.event);
  systemMessage(`${hub.event.label}: ${hub.event.description} (${minutes} Min.)`);
  timers.eventEnd = setTimeout(stopEvent, minutes * 60_000);
  if (type === 'RAIN') timers.rainDrops = setInterval(() => void rainDrop().catch(console.error), 45_000);
  return true;
}

export function stopEvent() {
  if (!hub.event) return false;
  systemMessage(`${hub.event.label} ist vorbei.`);
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
      startEvent((['CASHBACK', 'BOOST', 'RAIN'] as const)[randomInt(3)]);
      next();
    }, (60 + randomInt(61)) * 60_000);
  };
  next();
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
