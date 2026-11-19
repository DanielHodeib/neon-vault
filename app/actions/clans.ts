'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';

import { parse, run, type ActionState } from '@/lib/action';
import { requireUser } from '@/lib/auth';
import * as clans from '@/lib/clanService';
import { CLAN_NAME, CLAN_TAG } from '@/lib/clans';

// Thin wrappers: who is asking (cookie) and the page refresh live here, the rules in lib/clanService.ts.
const checkbox = z.literal('on').optional().transform(Boolean);

export async function createClan(_: ActionState, form: FormData) {
  return run(async () => {
    const me = await requireUser();
    const data = parse(
      z.object({
        name: z.string().trim().regex(CLAN_NAME, 'Name: 3–20 Zeichen (Buchstaben, Zahlen, Leerzeichen).'),
        tag: z.string().trim().toUpperCase().regex(CLAN_TAG, 'Tag: 2–5 Buchstaben oder Zahlen.'),
        description: z.string().trim().max(120),
        open: checkbox,
      }),
      form,
    );
    await clans.createClan(me, data);
    refresh();
    return `Clan [${data.tag}] gegründet.`;
  });
}

export async function joinClan(clanId: string) {
  return run(async () => {
    const { joined, tag } = await clans.joinClan(await requireUser(), clanId);
    refresh();
    return joined ? `Willkommen bei [${tag}]!` : 'Anfrage gesendet.';
  });
}

export async function cancelRequest(clanId: string) {
  return run(async () => {
    const me = await requireUser();
    await clans.cancelRequest(me.id, clanId);
    refresh();
    return 'Anfrage zurückgezogen.';
  });
}

export async function answerRequest(clanId: string, userId: string, accept: boolean) {
  return run(async () => {
    await clans.answerRequest((await requireUser()).id, clanId, userId, accept);
    refresh();
    return accept ? 'Aufgenommen.' : 'Abgelehnt.';
  });
}

export async function leaveClan() {
  return run(async () => {
    await clans.leaveClan(await requireUser());
    refresh();
    return 'Du hast den Clan verlassen.';
  });
}

export async function kickMember(clanId: string, userId: string) {
  return run(async () => {
    await clans.kickMember((await requireUser()).id, clanId, userId);
    refresh();
    return 'Entfernt.';
  });
}

export async function transferLeader(clanId: string, userId: string) {
  return run(async () => {
    await clans.transferLeader((await requireUser()).id, clanId, userId);
    refresh();
    return 'Leitung übergeben.';
  });
}

export async function updateClan(clanId: string, _: ActionState, form: FormData) {
  return run(async () => {
    const me = await requireUser();
    const data = parse(z.object({ description: z.string().trim().max(120), open: checkbox }), form);
    await clans.updateClan(me.id, clanId, data);
    refresh();
    return 'Gespeichert.';
  });
}

export async function disbandClan(clanId: string) {
  return run(async () => {
    await clans.disbandClan((await requireUser()).id, clanId);
    refresh();
    return 'Clan aufgelöst.';
  });
}

export async function claimClanGoal(tier: number) {
  return run(async () => {
    const reward = await clans.claimClanGoal(await requireUser(), tier);
    refresh();
    return `+${reward.toLocaleString('de-DE')} NVC vom Clan-Ziel!`;
  });
}
