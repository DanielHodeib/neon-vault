import { randomInt } from 'node:crypto';

import { shuffle } from '../game/rng';
import { cleanParams, describeEvent, EVENT_INFO, EVENT_KEYS, type EventParams, type EventType } from './eventTypes';
import { broadcast, db, hub, notify, type ChatMessage, type Countdown } from './hub';
import { applyLedger, netProfitSince, payout, startOfDay } from './wallet';

// Global events, rain, maintenance and announcements. Called from game code
// and from admin server actions; all state lives on `hub`.

export { EVENT_INFO as EVENT_TYPES } from './eventTypes';

export const eventActive = (type: EventType) => hub.event?.type === type;

/** A setting of the running event, or undefined when that event isn't running. */
export const eventParam = (type: EventType, key: string): number | undefined => (hub.event?.type === type ? hub.event.params[key] : undefined);

const BOOSTED_GAMES = new Set(['crash', 'coinflip']);
const timers = hub.timers;

export const winBoost = (game: string) => (BOOSTED_GAMES.has(game) ? (eventParam('BOOST', 'factor') ?? 1) : 1);

export async function cashback(userId: string, lost: number, game: string) {
  const percent = eventParam('CASHBACK', 'percent');
  if (percent && BOOSTED_GAMES.has(game)) await payout(userId, (lost * percent) / 100, game, 'REFUND');
}

export function systemMessage(text: string) {
  const msg: ChatMessage = { id: `${Date.now()}${randomInt(1e6)}`, userId: null, username: 'SYSTEM', text, at: Date.now() };
  hub.chat = [...hub.chat.slice(-49), msg];
  broadcast('chat', msg);
}

export function startEvent(type: EventType, minutes = EVENT_INFO[type].minutes, raw: Partial<EventParams> = {}) {
  if (hub.event) return false;
  const params = cleanParams(type, raw);
  if (type === 'RAIN' && params.max < params.min) [params.min, params.max] = [params.max, params.min];
  const { label } = EVENT_INFO[type];
  hub.event = { type, label, description: describeEvent(type, params), params, startedAt: Date.now(), endsAt: Date.now() + minutes * 60_000 };
  if (type === 'BOUNTY') hub.bountyPaid = false;
  broadcast('event', hub.event);
  systemMessage(`${hub.event.label}: ${hub.event.description} (${minutes} Min.)`);
  timers.eventEnd = setTimeout(stopEvent, minutes * 60_000);
  if (type === 'RAIN') timers.rainDrops = setInterval(() => void rainDrop().catch(console.error), params.every * 1000);
  return true;
}

export function stopEvent() {
  if (!hub.event) return false;
  systemMessage(`${hub.event.label} ist vorbei.`);
  if (hub.event.type === 'KING') void crownKing(new Date(hub.event.startedAt), hub.event.params.bonus).catch(console.error);
  hub.event = null;
  clearTimeout(timers.eventEnd);
  clearInterval(timers.rainDrops);
  broadcast('event', null);
  return true;
}

/**
 * Starts a random event (default settings) every 60–120 minutes while `hub.autoEvents` is on.
 * Called once by server.ts; a running admin event is never replaced.
 */
export function startEventScheduler() {
  const next = () => {
    const wait = (60 + randomInt(61)) * 60_000;
    hub.nextAutoAt = Date.now() + wait;
    timers.scheduler = setTimeout(() => {
      if (hub.autoEvents) startEvent(EVENT_KEYS[randomInt(EVENT_KEYS.length)]);
      next();
    }, wait);
  };
  next();
}

/** Net profit (wins minus stakes) during the event decides, so a near-certain huge bet can't buy the crown. */
async function crownKing(since: Date, bonus: number) {
  const [king] = await netProfitSince(since, 1);
  if (!king || king.profit <= 0) return systemMessage('King of the Hill vorbei – niemand hat Gewinn gemacht.');
  await applyLedger([{ userId: king.userId, amount: bonus, kind: 'BONUS', note: 'King of the Hill' }]);
  systemMessage(`${king.username} ist King of the Hill (+${king.profit.toLocaleString('de-DE')} NVC Netto-Gewinn) und bekommt ${bonus.toLocaleString('de-DE')} NVC!`);
  await notify(king.userId, 'King of the Hill', `+${bonus.toLocaleString('de-DE')} NVC für den höchsten Netto-Gewinn.`);
}

/** Bounty event: beating today's top player in a coinflip pays a bonus. */
export async function bounty(winnerId: string, loserId: string, winnerName: string) {
  const bonus = eventParam('BOUNTY', 'bonus');
  if (!bonus || hub.bountyPaid) return;
  const [king] = await netProfitSince(startOfDay(), 1);
  if (king?.userId !== loserId || king.profit <= 0 || hub.bountyPaid) return;
  hub.bountyPaid = true; // one bounty per event, otherwise a second account could farm it
  await applyLedger([{ userId: winnerId, amount: bonus, kind: 'BONUS', note: `Bounty auf ${king.username}` }]);
  systemMessage(`${winnerName} hat den King of Today ${king.username} geschlagen: +${bonus.toLocaleString('de-DE')} NVC Bounty!`);
}

async function rainDrop() {
  const users = [...hub.online.keys()];
  if (!users.length) return;
  const { min = 20, max = 100 } = hub.event?.params ?? {};
  const drop = min + randomInt(max - min + 1);
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

const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/**
 * Shows everyone a countdown banner. `restart`: the process is stopped from outside (update
 * script) or by `onDone`. `maintenance`: maintenance switches on when the time is up.
 */
export function startCountdown(kind: Countdown['kind'], seconds: number, { minutes, onDone }: { minutes?: number; onDone?: () => void } = {}) {
  clearTimeout(timers.countdown);
  hub.countdown = { kind, at: Date.now() + seconds * 1000, ...(minutes ? { minutes } : {}) };
  broadcast('countdown', hub.countdown);
  systemMessage(
    kind === 'restart'
      ? `🔄 Der Server startet in ${mmss(seconds)} neu. Laufende Einsätze werden zurückgebucht.`
      : `🛠️ Wartung in ${mmss(seconds)}${minutes ? ` für etwa ${minutes} Minuten` : ''}. Laufende Einsätze werden zurückgebucht.`,
  );
  timers.countdown = setTimeout(() => {
    hub.countdown = null;
    broadcast('countdown', null);
    if (kind === 'maintenance') void setMaintenance(true, minutes ? new Date(Date.now() + minutes * 60_000) : null).catch(console.error);
    onDone?.();
  }, seconds * 1000);
}

export function cancelCountdown() {
  if (!hub.countdown) return false;
  clearTimeout(timers.countdown);
  systemMessage(hub.countdown.kind === 'restart' ? 'Neustart abgesagt.' : 'Geplante Wartung abgesagt.');
  hub.countdown = null;
  broadcast('countdown', null);
  return true;
}
