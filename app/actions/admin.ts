'use server';

import type { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { refresh } from 'next/cache';
import { z } from 'zod';

import { parse, passwordSchema, run, type ActionState } from '@/lib/action';
import { requireRole } from '@/lib/auth';
import { announce, EVENT_TYPES, setMaintenance, startEvent, startRain, stopEvent } from '@/lib/events';
import { db, disconnectUser, notify, UserError } from '@/lib/hub';
import { canManage, ROLES } from '@/lib/roles';
import { applyLedger } from '@/lib/wallet';

const PERMANENT = new Date('9999-12-31');

/** Loads the target and checks the actor may touch them at all. */
async function target(min: Role, userId: string) {
  const actor = await requireRole(min);
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new UserError('Spieler nicht gefunden.');
  if (!canManage(actor.role, user.role)) throw new UserError('Keine Berechtigung für diesen Spieler.');
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
    const { actor, user } = await target('ADMIN', userId);
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
  const { user } = await target('ADMIN', userId);
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
    const { on, minutes } = parse(z.object({ on: z.enum(['true', 'false']), minutes: z.coerce.number().int().min(0).max(10_080).default(0) }), form);
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
    await requireRole('ADMIN');
    const { type, minutes } = parse(
      z.object({ type: z.enum(['STOP', ...(Object.keys(EVENT_TYPES) as ['CASHBACK', 'BOOST', 'RAIN'])]), minutes: z.coerce.number().int().min(1).max(180) }),
      form,
    );
    if (type === 'STOP') return stopEvent() ? 'Event gestoppt.' : 'Kein Event aktiv.';
    if (!startEvent(type, minutes)) throw new UserError('Es läuft schon ein Event.');
    return 'Event gestartet.';
  });
}

export async function rainAction(_: ActionState, form: FormData) {
  return run(async () => {
    const actor = await requireRole('ADMIN');
    const { amount, seconds, players } = parse(
      z.object({ amount: z.coerce.number().int().min(1).max(10_000_000), seconds: z.coerce.number().int().min(5).max(600), players: z.coerce.number().int().min(1).max(100) }),
      form,
    );
    if (!startRain(amount, seconds, players, actor.username)) throw new UserError('Es regnet schon.');
    return 'Rain gestartet.';
  });
}

