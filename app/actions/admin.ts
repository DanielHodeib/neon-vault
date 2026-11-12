'use server';

import type { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { refresh } from 'next/cache';
import { z } from 'zod';

import { parse, passwordSchema, run, type ActionState } from '@/lib/action';
import { requireRole } from '@/lib/auth';
import { announce, cancelCountdown, systemMessage, setMaintenance, startCountdown, startEvent, startRain, stopEvent } from '@/lib/events';
import { EVENT_INFO, EVENT_KEYS, type EventType } from '@/lib/eventTypes';
import { backupNow } from '@/lib/backup';
import { FX, IMAGE_STYLES, MOODS, type FxAssetPayload, type Mood, type MoodName } from '@/lib/fx';
import { sniffAudio, sniffImage } from '@/lib/media';
import { broadcast, db, disconnectUser, emitToUser, hub, notify, UserError } from '@/lib/hub';
import { canEditSelf, canManage, ROLES } from '@/lib/roles';
import { applyLedger } from '@/lib/wallet';

const PERMANENT = new Date('9999-12-31');

/** Loads the target and checks the actor may touch them; `self` also allows the owner's own account. */
async function target(min: Role, userId: string, { self = false } = {}) {
  const actor = await requireRole(min);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new UserError('Spieler nicht gefunden.');
  const ownAccount = self && user.id === actor.id && canEditSelf(actor.role);
  if (!ownAccount && !canManage(actor.role, user.role)) throw new UserError('Keine Berechtigung für diesen Spieler.');
  return { actor, user };
}

export async function banUser(_: ActionState, form: FormData) {
  return run(async () => {
    const { userId, hours, reason } = parse(
      z.object({ userId: z.string(), hours: z.coerce.number().int().min(0), reason: z.string().trim().max(200) }),
      form,
    );
    const { actor, user } = await target('MODERATOR', userId);
    const bannedUntil = hours === 0 ? PERMANENT : new Date(Date.now() + hours * 3_600_000);
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { bannedUntil, banReason: reason || null } }),
      db.session.deleteMany({ where: { userId: user.id } }),
    ]);
    disconnectUser(user.id);
    refresh();
    return `${user.username} gesperrt (${hours === 0 ? 'dauerhaft' : `${hours} h`}) von ${actor.username}.`;
  });
}

export async function unbanUser(userId: string) {
  const { user } = await target('MODERATOR', userId);
  await db.user.update({ where: { id: user.id }, data: { bannedUntil: null, banReason: null } });
  refresh();
}

export async function setRole(userId: string, role: Role) {
  return run(async () => {
    const { actor, user } = await target('ADMIN', userId);
    if (!ROLES.includes(role) || !canManage(actor.role, role)) throw new UserError('Diese Rolle darfst du nicht vergeben.');
    await db.user.update({ where: { id: user.id }, data: { role } });
    disconnectUser(user.id); // reconnect picks up the new role
    await notify(user.id, 'Neue Rolle', `Du bist jetzt ${role}.`);
    refresh();
    return `${user.username} ist jetzt ${role}.`;
  });
}

export async function adjustUser(_: ActionState, form: FormData) {
  return run(async () => {
    const { userId, balance, xp, password } = parse(
      z.object({
        userId: z.string(),
        balance: z.coerce.number().int(),
        xp: z.coerce.number().int(),
        password: z.union([z.literal(''), passwordSchema]),
      }),
      form,
    );
    const { actor, user } = await target('ADMIN', userId, { self: true });
    if (password && user.id === actor.id) throw new UserError('Dein eigenes Passwort änderst du in den Einstellungen.');
    if (balance) await applyLedger([{ userId: user.id, amount: balance, kind: 'ADMIN', note: `von ${actor.username}` }]);
    if (xp) await db.user.update({ where: { id: user.id }, data: { xp: Math.max(0, user.xp + xp) } });
    if (password) {
      await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
      await db.session.deleteMany({ where: { userId: user.id } });
      disconnectUser(user.id);
    }
    refresh();
    return 'Gespeichert.';
  });
}

export async function resetUser(userId: string, what: 'quests' | 'social') {
  const { user } = await target('ADMIN', userId, { self: what === 'quests' });
  if (what === 'quests') await db.questClaim.deleteMany({ where: { userId: user.id } });
  else await db.$transaction([db.friendship.deleteMany({ where: { OR: [{ fromId: user.id }, { toId: user.id }] } }), db.block.deleteMany({ where: { OR: [{ fromId: user.id }, { toId: user.id }] } })]);
  refresh();
}

export async function deleteUser(userId: string) {
  const { user } = await target('ADMIN', userId);
  await db.user.delete({ where: { id: user.id } });
  disconnectUser(user.id);
  refresh();
}

export async function setMaintenanceAction(_: ActionState, form: FormData) {
  return run(async () => {
    await requireRole('ADMIN');
    const { on, minutes, delay } = parse(
      z.object({
        on: z.enum(['true', 'false']),
        minutes: z.coerce.number().int().min(0).max(10_080).default(0),
        delay: z.coerce.number().int().min(0).max(120).default(0), // minutes of warning countdown
      }),
      form,
    );
    if (on === 'true' && delay > 0) {
      startCountdown('maintenance', delay * 60, { minutes });
      return `Wartung startet in ${delay} Min. – alle sehen den Countdown.`;
    }
    cancelCountdown();
    await setMaintenance(on === 'true', on === 'true' && minutes ? new Date(Date.now() + minutes * 60_000) : null);
    refresh();
    return on === 'true' ? 'Wartungsmodus aktiv.' : 'Wartungsmodus beendet.';
  });
}

export async function announceAction(_: ActionState, form: FormData) {
  return run(async () => {
    const actor = await requireRole('MODERATOR');
    const { message, persist } = parse(z.object({ message: z.string().trim().min(1).max(300), persist: z.literal('on').optional() }), form);
    await announce(message, actor.username, !!persist);
    return 'Gesendet.';
  });
}

export async function eventAction(_: ActionState, form: FormData) {
  return run(async () => {
    const actor = await requireRole('ADMIN');
    const data = Object.fromEntries(form);
    const num = (key: string) => (data[key] === undefined || data[key] === '' ? undefined : Number(data[key]));
    const type = String(data.type);

    if (type === 'CHAT_RAIN') {
      const { amount, seconds, players } = parse(
        z.object({ amount: z.number().int().min(1).max(10_000_000), seconds: z.number().int().min(5).max(600), players: z.number().int().min(1).max(100) }),
        { amount: num('p_amount'), seconds: num('p_seconds'), players: num('p_players') },
      );
      if (!startRain(amount, seconds, players, actor.username)) throw new UserError('Es regnet schon.');
      return 'Chat-Rain gestartet.';
    }

    if (!(EVENT_KEYS as string[]).includes(type)) throw new UserError('Unbekanntes Event.');
    const key = type as EventType;
    const { minutes } = parse(z.object({ minutes: z.number().int().min(1).max(180) }), { minutes: num('minutes') ?? EVENT_INFO[key].minutes });
    // Each setting is clamped to its own range in startEvent.
    const params = Object.fromEntries(EVENT_INFO[key].params.map((p) => [p.key, num(`p_${p.key}`) ?? p.def]));
    if (!startEvent(key, minutes, params)) throw new UserError('Es läuft schon ein Event – erst stoppen.');
    return `${EVENT_INFO[key].label} gestartet.`;
  });
}

export async function stopEventAction() {
  return run(async () => {
    await requireRole('ADMIN');
    if (!stopEvent()) throw new UserError('Kein Event aktiv.');
    return 'Event gestoppt.';
  });
}

/** Switches the server's random events on or off (until the next restart, then on again). */
export async function toggleAutoEvents() {
  return run(async () => {
    await requireRole('ADMIN');
    hub.autoEvents = !hub.autoEvents;
    refresh();
    return hub.autoEvents ? 'Automatische Events an.' : 'Automatische Events aus.';
  });
}

export async function cancelCountdownAction() {
  return run(async () => {
    await requireRole('ADMIN');
    if (!cancelCountdown()) throw new UserError('Es läuft kein Countdown.');
    return 'Countdown abgesagt.';
  });
}

/** Restarts the app after a countdown. On the server systemd starts it again right away. */
export async function restartAction(seconds: number) {
  return run(async () => {
    await requireRole('OWNER');
    if (![30, 60, 120, 300].includes(seconds)) throw new UserError('Ungültige Zeit.');
    startCountdown('restart', seconds, { onDone: () => process.kill(process.pid, 'SIGINT') });
    return `Neustart in ${seconds} Sekunden angekündigt.`;
  });
}

/** Quick gift from the player panel (fixed amounts only: bound arguments come from the browser). */
export async function giftUser(userId: string, amount: number) {
  return run(async () => {
    if (![1_000, 10_000, 100_000].includes(amount)) throw new UserError('Ungültiger Betrag.');
    const { actor, user } = await target('ADMIN', userId, { self: true });
    await applyLedger([{ userId: user.id, amount, kind: 'ADMIN', note: `Geschenk von ${actor.username}` }]);
    if (user.id !== actor.id) await notify(user.id, 'Geschenk', `${actor.username} schenkt dir ${amount.toLocaleString('de-DE')} NVC.`);
    refresh();
    return `+${amount.toLocaleString('de-DE')} NVC an ${user.username}.`;
  });
}

/** Chat mute for 0 (lift), 5, 30 or 120 minutes. */
export async function muteUser(userId: string, minutes: number) {
  return run(async () => {
    if (![0, 5, 30, 120].includes(minutes)) throw new UserError('Ungültige Dauer.');
    const { user } = await target('MODERATOR', userId);
    if (minutes === 0) hub.muted.delete(user.id);
    else hub.muted.set(user.id, Date.now() + minutes * 60_000);
    emitToUser(user.id, 'toast', minutes ? `Du bist ${minutes} Minuten im Chat stummgeschaltet.` : 'Du darfst wieder im Chat schreiben.');
    refresh();
    return minutes ? `${user.username} ist ${minutes} Min. stumm.` : `${user.username} darf wieder schreiben.`;
  });
}

export async function clearChatAction() {
  return run(async () => {
    const actor = await requireRole('MODERATOR');
    hub.chat = [];
    broadcast('chatClear', null);
    systemMessage(`Chat wurde von ${actor.username} geleert.`);
    return 'Chat geleert.';
  });
}

export async function backupAction() {
  return run(async () => {
    await requireRole('ADMIN');
    await backupNow({ force: true });
    return 'Backup gespeichert.';
  });
}

/** Harmless screen effects for fun – everyone (`userId` null) or one player. */
export async function trollAction(effect: string, userId: string | null) {
  return run(async () => {
    const actor = await requireRole('ADMIN');
    if (!Object.hasOwn(FX, effect)) throw new UserError('Unbekannter Effekt.');
    const payload: { effect: string; by: string; sound?: string } = { effect, by: actor.username };
    if (effect === 'disco') {
      const id = (await db.systemSettings.findUnique({ where: { id: 1 }, select: { discoSoundId: true } }))?.discoSoundId;
      if (id && (await db.fxAsset.count({ where: { id, kind: 'sound' } }))) payload.sound = `/fx/${id}`;
    }
    if (userId) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, username: true } });
      if (!user) throw new UserError('Spieler nicht gefunden.');
      emitToUser(user.id, 'fx', payload);
      return `Effekt an ${user.username} geschickt.`;
    }
    broadcast('fx', payload);
    return 'Effekt an alle geschickt.';
  });
}

const FX_MAX_BYTES = 2_000_000;

/** Adds a sound or image to the fun library; the type comes from the file's bytes. */
export async function uploadFxAsset(_: ActionState, form: FormData) {
  return run(async () => {
    await requireRole('ADMIN');
    const file = form.get('file');
    const name = String(form.get('name') ?? '').trim().slice(0, 40);
    if (!(file instanceof File) || file.size === 0) throw new UserError('Keine Datei.');
    if (file.size > FX_MAX_BYTES) throw new UserError('Datei ist zu groß (max. 2 MB).');
    const data = new Uint8Array(await file.arrayBuffer());
    const image = sniffImage(data);
    const audio = image ? null : sniffAudio(data);
    if (!image && !audio) throw new UserError('Nur Bilder (JPG, PNG, WebP, GIF) oder Sounds (MP3, OGG, WAV, M4A).');
    await db.fxAsset.create({ data: { kind: image ? 'image' : 'sound', name: name || file.name.replace(/\.[^.]+$/, '').slice(0, 40), mime: (image ?? audio)!, data } });
    refresh();
    return image ? 'Bild hinzugefügt.' : 'Sound hinzugefügt.';
  });
}

export async function deleteFxAsset(id: string) {
  return run(async () => {
    await requireRole('ADMIN');
    await db.fxAsset.deleteMany({ where: { id } });
    refresh();
    return 'Gelöscht.';
  });
}

/** Plays an uploaded sound or shows an uploaded image – for everyone (`userId` null) or one player. */
/** Plays an uploaded sound, an uploaded image, or both together, for everyone or one player. */
export async function playFx(soundId: string | null, imageId: string | null, style: string, userId: string | null) {
  return run(async () => {
    const actor = await requireRole('ADMIN');
    if (!soundId && !imageId) throw new UserError('Wähle einen Sound oder ein Bild.');
    if (imageId && !Object.hasOwn(IMAGE_STYLES, style)) throw new UserError('Unbekannter Effekt.');
    const ids = [soundId, imageId].filter((x): x is string => !!x);
    const assets = await db.fxAsset.findMany({ where: { id: { in: ids } }, select: { id: true, kind: true, name: true } });
    const sound = soundId ? assets.find((a) => a.id === soundId && a.kind === 'sound') : undefined;
    const image = imageId ? assets.find((a) => a.id === imageId && a.kind === 'image') : undefined;
    if ((soundId && !sound) || (imageId && !image)) throw new UserError('Nicht gefunden.');
    const payload: FxAssetPayload = {
      effect: 'asset',
      by: actor.username,
      ...(sound ? { sound: `/fx/${sound.id}` } : {}),
      ...(image ? { image: `/fx/${image.id}`, style: style as keyof typeof IMAGE_STYLES } : {}),
    };
    const what = [sound, image].filter(Boolean).map((a) => `„${a!.name}“`).join(' + ');
    if (userId) {
      const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, username: true } });
      if (!user) throw new UserError('Spieler nicht gefunden.');
      emitToUser(user.id, 'fx', payload);
      return `${what} an ${user.username}.`;
    }
    broadcast('fx', payload);
    return `${what} an alle.`;
  });
}

/** Starts an atmosphere preset for everyone (kept for players who join later) or one player. */
export async function moodAction(_: ActionState, form: FormData) {
  return run(async () => {
    const actor = await requireRole('ADMIN');
    const { name, level, minutes, user } = parse(
      z.object({
        name: z.enum(Object.keys(MOODS) as [MoodName, ...MoodName[]]),
        level: z.coerce.number().int().min(1).max(3),
        minutes: z.coerce.number().int().min(1, 'Mindestens 1 Minute.').max(120, 'Höchstens 120 Minuten.'),
        user: z.string().optional(),
      }),
      form,
    );
    const mood: Mood = { name, level, endsAt: Date.now() + minutes * 60_000, by: actor.username };
    if (user) {
      const target = await db.user.findUnique({ where: { id: user }, select: { id: true, username: true } });
      if (!target) throw new UserError('Spieler nicht gefunden.');
      emitToUser(target.id, 'mood', mood);
      return `${MOODS[name].label} bei ${target.username}.`;
    }
    hub.mood = mood;
    broadcast('mood', mood);
    refresh();
    return `${MOODS[name].label} für alle (${minutes} Min.).`;
  });
}

export async function stopMoodAction(userId: string | null) {
  return run(async () => {
    await requireRole('ADMIN');
    if (userId) {
      emitToUser(userId, 'mood', null);
      return 'Stimmung beim Spieler beendet.';
    }
    hub.mood = null;
    broadcast('mood', null);
    refresh();
    return 'Stimmung beendet.';
  });
}

/** Chooses the uploaded sound the disco effect plays (null = built-in beat). */
export async function setDiscoSound(id: string | null) {
  return run(async () => {
    await requireRole('ADMIN');
    if (id && !(await db.fxAsset.count({ where: { id, kind: 'sound' } }))) throw new UserError('Sound nicht gefunden.');
    await db.systemSettings.upsert({ where: { id: 1 }, update: { discoSoundId: id }, create: { id: 1, discoSoundId: id } });
    refresh();
    return id ? 'Disco spielt jetzt deinen Sound.' : 'Disco spielt den eingebauten Beat.';
  });
}
