'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';

import { parse, run, type ActionState } from '@/lib/action';
import { requireUser } from '@/lib/auth';
import { CLAN_COST, CLAN_GOALS, CLAN_MIN_OWN_VOLUME, CLAN_NAME, CLAN_TAG, goalReward, perksOf } from '@/lib/clans';
import { clanLevelOf, weekKey, weekStakes } from '@/lib/clanStats';
import { db, notify, UserError } from '@/lib/hub';
import { dropClanHistory, leaveClanRoom } from '@/game/clanChat';
import { applyLedger } from '@/lib/wallet';

const checkbox = z.literal('on').optional().transform(Boolean);

/** Puts a player into a clan (and copies the tag next to their name); fails when full or already in one. */
async function addMember(clan: { id: string; tag: string }, userId: string) {
  const { level } = await clanLevelOf(clan.id); // outside the transaction: it runs on its own connection
  await db.$transaction(async (tx) => {
    if ((await tx.user.count({ where: { clanId: clan.id } })) >= perksOf(level).maxMembers) throw new UserError('Der Clan ist voll.');
    const { count } = await tx.user.updateMany({ where: { id: userId, clanId: null }, data: { clanId: clan.id, clanTag: clan.tag } });
    if (!count) throw new UserError('Du bist schon in einem Clan.');
    await tx.clanRequest.deleteMany({ where: { userId } });
  });
}

const leaderOf = async (clanId: string, userId: string) => {
  const clan = await db.clan.findUnique({ where: { id: clanId } });
  if (!clan || clan.leaderId !== userId) throw new UserError('Nur die Clan-Leitung darf das.');
  return clan;
};

export async function createClan(_: ActionState, form: FormData) {
  return run(async () => {
    const me = await requireUser();
    const { name, tag, description, open } = parse(
      z.object({
        name: z.string().trim().regex(CLAN_NAME, 'Name: 3–20 Zeichen (Buchstaben, Zahlen, Leerzeichen).'),
        tag: z.string().trim().toUpperCase().regex(CLAN_TAG, 'Tag: 2–5 Buchstaben oder Zahlen.'),
        description: z.string().trim().max(120),
        open: checkbox,
      }),
      form,
    );
    if (me.clanId) throw new UserError('Du bist schon in einem Clan.');
    const taken = (await db.clan.findMany({ select: { name: true, tag: true } })).some((c) => c.tag === tag || c.name.toLowerCase() === name.toLowerCase());
    if (taken) throw new UserError('Name oder Tag ist schon vergeben.');
    await applyLedger([{ userId: me.id, amount: -CLAN_COST, kind: 'SHOP', note: 'Clan gründen' }]);
    try {
      await db.$transaction(async (tx) => {
        const clan = await tx.clan.create({ data: { name, tag, description, open, leaderId: me.id } });
        const { count } = await tx.user.updateMany({ where: { id: me.id, clanId: null }, data: { clanId: clan.id, clanTag: tag } });
        if (!count) throw new UserError('Du bist schon in einem Clan.');
      });
    } catch (err) {
      await applyLedger([{ userId: me.id, amount: CLAN_COST, kind: 'SHOP', note: 'Clan gründen (zurück)' }]);
      throw err instanceof UserError ? err : new UserError('Name oder Tag ist schon vergeben.');
    }
    refresh();
    return `Clan [${tag}] gegründet.`;
  });
}

/** Open clans take you right away; closed ones get a request the leader answers. */
export async function joinClan(clanId: string) {
  return run(async () => {
    const me = await requireUser();
    if (me.clanId) throw new UserError('Du bist schon in einem Clan.');
    const clan = await db.clan.findUnique({ where: { id: clanId } });
    if (!clan) throw new UserError('Clan nicht gefunden.');
    if (clan.open) {
      await addMember(clan, me.id);
      await notify(clan.leaderId, 'Neues Clan-Mitglied', `${me.username} ist deinem Clan [${clan.tag}] beigetreten.`, { link: '/clans' }).catch(console.error);
      refresh();
      return `Willkommen bei [${clan.tag}]!`;
    }
    await db.clanRequest.upsert({ where: { clanId_userId: { clanId, userId: me.id } }, create: { clanId, userId: me.id }, update: {} });
    await notify(clan.leaderId, 'Clan-Anfrage', `${me.username} möchte in deinen Clan [${clan.tag}].`, { link: '/clans' }).catch(console.error);
    refresh();
    return 'Anfrage gesendet.';
  });
}

export async function cancelRequest(clanId: string) {
  return run(async () => {
    const me = await requireUser();
    await db.clanRequest.deleteMany({ where: { clanId, userId: me.id } });
    refresh();
    return 'Anfrage zurückgezogen.';
  });
}

export async function answerRequest(clanId: string, userId: string, accept: boolean) {
  return run(async () => {
    const me = await requireUser();
    const clan = await leaderOf(clanId, me.id);
    const { count } = await db.clanRequest.deleteMany({ where: { clanId, userId } });
    if (!count) throw new UserError('Anfrage nicht gefunden.');
    if (accept) {
      await addMember(clan, userId);
      await notify(userId, 'Clan-Anfrage angenommen', `Du bist jetzt in [${clan.tag}] ${clan.name}.`, { link: '/clans' }).catch(console.error);
    }
    refresh();
    return accept ? 'Aufgenommen.' : 'Abgelehnt.';
  });
}

export async function leaveClan() {
  return run(async () => {
    const me = await requireUser();
    if (!me.clanId) throw new UserError('Du bist in keinem Clan.');
    const clan = await db.clan.findUnique({ where: { id: me.clanId }, include: { _count: { select: { members: true } } } });
    if (clan?.leaderId === me.id) {
      if (clan._count.members > 1) throw new UserError('Übergib erst die Leitung an jemanden – oder löse den Clan auf.');
      await db.clan.delete({ where: { id: clan.id } });
      dropClanHistory(clan.id);
    }
    await db.user.update({ where: { id: me.id }, data: { clanId: null, clanTag: null } });
    leaveClanRoom(me.id, clan?.id ?? me.clanId);
    refresh();
    return 'Du hast den Clan verlassen.';
  });
}

export async function kickMember(clanId: string, userId: string) {
  return run(async () => {
    const me = await requireUser();
    const clan = await leaderOf(clanId, me.id);
    if (userId === me.id) throw new UserError('Dich selbst kannst du nicht rauswerfen.');
    const { count } = await db.user.updateMany({ where: { id: userId, clanId }, data: { clanId: null, clanTag: null } });
    if (!count) throw new UserError('Spieler nicht gefunden.');
    leaveClanRoom(userId, clanId);
    await notify(userId, 'Aus dem Clan entfernt', `Du wurdest aus [${clan.tag}] ${clan.name} entfernt.`).catch(console.error);
    refresh();
    return 'Entfernt.';
  });
}

export async function transferLeader(clanId: string, userId: string) {
  return run(async () => {
    const me = await requireUser();
    const clan = await leaderOf(clanId, me.id);
    if (!(await db.user.count({ where: { id: userId, clanId } }))) throw new UserError('Spieler nicht gefunden.');
    await db.clan.update({ where: { id: clanId }, data: { leaderId: userId } });
    await notify(userId, 'Du leitest jetzt einen Clan', `Du bist jetzt Leitung von [${clan.tag}] ${clan.name}.`, { link: '/clans' }).catch(console.error);
    refresh();
    return 'Leitung übergeben.';
  });
}

export async function updateClan(clanId: string, _: ActionState, form: FormData) {
  return run(async () => {
    const me = await requireUser();
    await leaderOf(clanId, me.id);
    const { description, open } = parse(z.object({ description: z.string().trim().max(120), open: checkbox }), form);
    await db.clan.update({ where: { id: clanId }, data: { description, open } });
    refresh();
    return 'Gespeichert.';
  });
}

export async function disbandClan(clanId: string) {
  return run(async () => {
    const me = await requireUser();
    await leaderOf(clanId, me.id);
    const members = await db.user.findMany({ where: { clanId }, select: { id: true } });
    await db.user.updateMany({ where: { clanId }, data: { clanTag: null } }); // clanId itself is cleared by the relation
    await db.clan.delete({ where: { id: clanId } });
    for (const m of members) leaveClanRoom(m.id, clanId);
    dropClanHistory(clanId);
    refresh();
    return 'Clan aufgelöst.';
  });
}

/** Pays a reached weekly goal to one member, once per week and tier; needs some play of their own. */
export async function claimClanGoal(tier: number) {
  return run(async () => {
    const me = await requireUser();
    const goal = CLAN_GOALS.find((g) => g.tier === tier);
    if (!goal || !me.clanId) throw new UserError('Ziel nicht verfügbar.');
    const members = (await db.user.findMany({ where: { clanId: me.clanId }, select: { id: true } })).map((m) => m.id);
    const [clanVolume, own, { level }] = await Promise.all([weekStakes(members), weekStakes([me.id]), clanLevelOf(me.clanId)]);
    if (clanVolume < goal.volume) throw new UserError('Das Ziel ist noch nicht erreicht.');
    if (own < CLAN_MIN_OWN_VOLUME) throw new UserError('Spiel selbst mit – ab 1.000 NVC Einsatz diese Woche bekommst du die Belohnung.');
    const week = weekKey();
    try {
      await db.clanClaim.create({ data: { userId: me.id, week, tier } }); // the primary key stops a second claim
    } catch {
      throw new UserError('Die hast du diese Woche schon abgeholt.');
    }
    const reward = goalReward(tier, level);
    try {
      await applyLedger([{ userId: me.id, amount: reward, kind: 'BONUS', note: `Clan-Ziel ${tier}` }]);
    } catch (err) {
      await db.clanClaim.delete({ where: { userId_week_tier: { userId: me.id, week, tier } } });
      throw err;
    }
    refresh();
    return `+${reward.toLocaleString('de-DE')} NVC vom Clan-Ziel!`;
  });
}
