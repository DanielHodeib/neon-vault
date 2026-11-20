import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { useTempDb } from './testdb';

// Who may do what in a clan, against a real (temporary) database.
type Mods = { hub: typeof import('./hub'); clans: typeof import('./clanService'); consts: typeof import('./clans') };
let m: Mods;
let n = 0;

before(async () => {
  useTempDb();
  m = { hub: await import('./hub'), clans: await import('./clanService'), consts: await import('./clans') };
});
after(() => m.hub.db.$disconnect());

const NOT_LEADER = 'Nur die Clan-Leitung darf das.';
const user = async (balance = 100_000) => {
  const u = await m.hub.db.user.create({ data: { username: `p${n++}`, passwordHash: 'x', balance } });
  return { id: u.id, username: u.username, clanId: null as string | null };
};
const fresh = async (u: { id: string }) => {
  const f = await m.hub.db.user.findUniqueOrThrow({ where: { id: u.id } });
  return { id: f.id, username: f.username, clanId: f.clanId, clanTag: f.clanTag, balance: Number(f.balance) };
};
const found = async (open = true) => {
  const leader = await user();
  const tag = `T${n++}`;
  await m.clans.createClan(leader, { name: `Clan ${tag}`, tag, description: '', open });
  const me = await fresh(leader);
  return { leader: me, clanId: me.clanId!, tag };
};
const join = async (clanId: string) => {
  const u = await user();
  await m.clans.joinClan(u, clanId);
  return fresh(u);
};

test('founding costs NVC, names and tags are unique, one clan per player', async () => {
  const a = await user();
  await m.clans.createClan(a, { name: 'Wölfe', tag: 'WLF', description: '', open: true });
  assert.equal((await fresh(a)).balance, 100_000 - m.consts.CLAN_COST);
  assert.equal((await fresh(a)).clanTag, 'WLF');
  const b = await user();
  await assert.rejects(m.clans.createClan(b, { name: 'wölfe', tag: 'XYZ', description: '', open: true }), /vergeben/); // name, any case
  await assert.rejects(m.clans.createClan(b, { name: 'Andere', tag: 'WLF', description: '', open: true }), /vergeben/);
  assert.equal((await fresh(b)).balance, 100_000, 'a rejected founding costs nothing');
  await assert.rejects(m.clans.createClan(await fresh(a), { name: 'Zweiter', tag: 'ZWE', description: '', open: true }), /schon in einem Clan/);
  const poor = await user(100);
  await assert.rejects(m.clans.createClan(poor, { name: 'Arm', tag: 'ARM', description: '', open: true }), /Guthaben/);
});

test('only the leader may kick, hand over, edit, answer requests or disband', async () => {
  const { leader, clanId } = await found(false);
  const member = await join(clanId); // closed clan: this is only a request
  assert.equal(member.clanId, null);
  const outsider = await user();

  for (const who of [member.id, outsider.id]) {
    await assert.rejects(m.clans.kickMember(who, clanId, leader.id), new RegExp(NOT_LEADER));
    await assert.rejects(m.clans.transferLeader(who, clanId, who), new RegExp(NOT_LEADER));
    await assert.rejects(m.clans.updateClan(who, clanId, { description: 'hijack', open: true }), new RegExp(NOT_LEADER));
    await assert.rejects(m.clans.answerRequest(who, clanId, member.id, true), new RegExp(NOT_LEADER));
    await assert.rejects(m.clans.disbandClan(who, clanId), new RegExp(NOT_LEADER));
  }
  assert.equal((await m.hub.db.clan.findUnique({ where: { id: clanId } }))?.description, '', 'nothing changed');
  assert.ok(await m.hub.db.clanRequest.count({ where: { clanId, userId: member.id } }), 'the request is still open');
});

test('a leader has no power over another clan', async () => {
  const a = await found();
  const b = await found();
  const victim = await join(b.clanId);
  await assert.rejects(m.clans.kickMember(a.leader.id, b.clanId, victim.id), new RegExp(NOT_LEADER));
  await assert.rejects(m.clans.disbandClan(a.leader.id, b.clanId), new RegExp(NOT_LEADER));
  assert.equal((await fresh(victim)).clanId, b.clanId);
});

test('closed clan: request, accept gives membership and tag; decline does not', async () => {
  const { leader, clanId, tag } = await found(false);
  const yes = await user();
  const no = await user();
  assert.equal((await m.clans.joinClan(yes, clanId)).joined, false);
  await m.clans.joinClan(no, clanId);
  await m.clans.answerRequest(leader.id, clanId, yes.id, true);
  await m.clans.answerRequest(leader.id, clanId, no.id, false);
  assert.deepEqual([(await fresh(yes)).clanId, (await fresh(yes)).clanTag], [clanId, tag]);
  assert.equal((await fresh(no)).clanId, null);
  await assert.rejects(m.clans.answerRequest(leader.id, clanId, no.id, true), /Anfrage nicht gefunden/);
});

test('kick: leader can, not himself, not someone outside the clan', async () => {
  const { leader, clanId } = await found();
  const member = await join(clanId);
  await assert.rejects(m.clans.kickMember(leader.id, clanId, leader.id), /selbst/);
  await assert.rejects(m.clans.kickMember(leader.id, clanId, (await user()).id), /nicht gefunden/);
  await m.clans.kickMember(leader.id, clanId, member.id);
  assert.deepEqual([(await fresh(member)).clanId, (await fresh(member)).clanTag], [null, null]);
});

test('leaving: a leader with members must hand over first; a lone leader closes the clan', async () => {
  const { leader, clanId } = await found();
  const member = await join(clanId);
  await assert.rejects(m.clans.leaveClan(leader), /Übergib erst die Leitung/);
  await assert.rejects(m.clans.transferLeader(leader.id, clanId, (await user()).id), /nicht gefunden/); // not a member
  await m.clans.transferLeader(leader.id, clanId, member.id);
  await m.clans.leaveClan(await fresh(leader));
  assert.equal((await fresh(leader)).clanId, null);
  await m.clans.leaveClan(await fresh(member)); // now the lone leader
  assert.equal(await m.hub.db.clan.count({ where: { id: clanId } }), 0);
});

test('disband clears everybody’s tag', async () => {
  const { leader, clanId } = await found();
  const member = await join(clanId);
  await m.clans.disbandClan(leader.id, clanId);
  assert.deepEqual([(await fresh(member)).clanId, (await fresh(member)).clanTag, (await fresh(leader)).clanTag], [null, null, null]);
});

test('weekly goal: needs a clan and a reached goal', async () => {
  const lone = await user();
  await assert.rejects(m.clans.claimClanGoal(lone, 1), /nicht verfügbar/);
  const { leader } = await found();
  await assert.rejects(m.clans.claimClanGoal(leader, 99), /nicht verfügbar/);
  await assert.rejects(m.clans.claimClanGoal(leader, 1), /noch nicht erreicht/);
  assert.equal((await fresh(leader)).balance, 100_000 - m.consts.CLAN_COST, 'no reward without the goal');
});

test('syncClanTags repairs a drifted tag copy and leaves correct ones alone', async () => {
  const { leader, clanId, tag } = await found();
  const member = await join(clanId);
  const stray = await user();
  await m.hub.db.user.update({ where: { id: member.id }, data: { clanTag: 'WRONG' } }); // drifted
  await m.hub.db.user.update({ where: { id: stray.id }, data: { clanTag: 'GHOST' } }); // tag without a clan
  await m.hub.db.user.update({ where: { id: leader.id }, data: { clanTag: null } }); // missing
  const fixed = await m.clans.syncClanTags();
  assert.ok(fixed >= 3);
  assert.equal((await fresh(member)).clanTag, tag);
  assert.equal((await fresh(leader)).clanTag, tag);
  assert.equal((await fresh(stray)).clanTag, null);
  assert.equal(await m.clans.syncClanTags(), 0, 'a second run finds nothing to fix');
});
