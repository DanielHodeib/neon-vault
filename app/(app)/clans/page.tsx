import { Crown, DoorOpen, Lock, Shield } from 'lucide-react';
import Link from 'next/link';

import { answerRequest, cancelRequest, createClan, disbandClan, joinClan, kickMember, leaveClan, transferLeader, updateClan } from '@/app/actions/clans';
import { FormButton } from '@/components/FormButton';
import { ActionForm, Avatar, Empty, PageHeader, Section, SubmitButton, UserLink } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { CLAN_COST, CLAN_MAX_MEMBERS } from '@/lib/clans';
import { coins } from '@/lib/format';
import { db, hub } from '@/lib/hub';
import { getT } from '@/lib/i18nServer';
import { levelOf } from '@/lib/ranks';

export async function generateMetadata() {
  return { title: (await getT())('Clans') };
}

export default async function ClansPage({ searchParams }: PageProps<'/clans'>) {
  const t = await getT();
  const me = await requireUser();
  const wanted = (await searchParams).tab;
  const tabs: ('mine' | 'all' | 'found')[] = me.clanId ? ['mine', 'all'] : ['all', 'found'];
  const tab = tabs.find((x) => x === wanted) ?? tabs[0];
  const label = { mine: 'Mein Clan', all: 'Alle Clans', found: 'Gründen' };

  const clans = await db.clan.findMany({ include: { members: { select: { id: true, username: true, xp: true, avatarUrl: true, frame: true }, orderBy: { xp: 'desc' } }, requests: true } });
  const ranked = clans.map((c) => ({ ...c, xp: c.members.reduce((s, m) => s + m.xp, 0) })).sort((a, b) => b.xp - a.xp);
  const mine = ranked.find((c) => c.id === me.clanId);
  const asked = new Set(clans.filter((c) => c.requests.some((r) => r.userId === me.id)).map((c) => c.id));

  return (
    <>
      <PageHeader title="Clans" subtitle="Schließ dich Freunden an – dein Clan-Tag steht dann überall neben deinem Namen." />
      <nav className="no-scrollbar mb-4 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1" aria-label="Clans">
        {tabs.map((x) => (
          <Link key={x} href={`/clans?tab=${x}`} className={`shrink-0 rounded-lg px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition ${x === tab ? 'bg-raised text-fg' : 'text-muted hover:text-fg'}`}>
            {t(label[x])}
          </Link>
        ))}
      </nav>

      {tab === 'all' && (
        <Section title="Rangliste der Clans">
          {ranked.length === 0 && <Empty>Noch keine Clans – gründe den ersten!</Empty>}
          <ul className="stagger divide-y divide-line">
            {ranked.map((c, i) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <span className="num w-6 text-center text-faint">{i + 1}</span>
                <span className="rounded bg-raised px-2 py-1 text-xs font-bold text-accent">[{c.tag}]</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-medium">
                    {c.name} {!c.open && <Lock size={12} className="text-faint" aria-label={t('Nur mit Anfrage')} />}
                  </span>
                  <span className="block truncate text-xs text-muted">{c.description || t('Keine Beschreibung.')}</span>
                </span>
                <span className="num text-xs text-muted">
                  {c.members.length}/{CLAN_MAX_MEMBERS} · {coins(c.xp)} XP
                </span>
                {c.id === me.clanId ? (
                  <span className="chip-active">{t('Dein Clan')}</span>
                ) : me.clanId ? null : asked.has(c.id) ? (
                  <FormButton action={cancelRequest.bind(null, c.id)} className="btn-ghost h-8 text-xs">{t('Angefragt – zurückziehen')}</FormButton>
                ) : (
                  <FormButton action={joinClan.bind(null, c.id)} disabled={c.members.length >= CLAN_MAX_MEMBERS} className="btn-secondary h-8 text-xs">
                    {c.open ? t('Beitreten') : t('Anfragen')}
                  </FormButton>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {tab === 'found' && (
        <Section title="Clan gründen" pad>
          <ActionForm action={createClan} className="max-w-md space-y-4">
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <div>
                <label className="label" htmlFor="c-name">{t('Name')}</label>
                <input id="c-name" className="input" name="name" minLength={3} maxLength={20} required />
              </div>
              <div>
                <label className="label" htmlFor="c-tag">{t('Tag')}</label>
                <input id="c-tag" className="input uppercase" name="tag" minLength={2} maxLength={5} required />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="c-desc">{t('Beschreibung')}</label>
              <input id="c-desc" className="input" name="description" maxLength={120} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="open" defaultChecked /> {t('Jeder darf direkt beitreten')}
            </label>
            <SubmitButton>{t('Gründen')} · {coins(CLAN_COST)} NVC</SubmitButton>
            <p className="text-xs text-faint">{t('Bis zu {n} Mitglieder. Du leitest den Clan und nimmst Anfragen an.', { n: CLAN_MAX_MEMBERS })}</p>
          </ActionForm>
        </Section>
      )}

      {tab === 'mine' && mine && (
        <div className="space-y-4">
          <section className="panel p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent/15 text-accent"><Shield size={24} /></span>
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold">
                  <span className="text-accent">[{mine.tag}]</span> {mine.name}
                </h2>
                <p className="text-sm text-muted">{mine.description || t('Keine Beschreibung.')}</p>
              </div>
              <div className="num text-right text-sm text-muted">
                <p>{mine.members.length}/{CLAN_MAX_MEMBERS} {t('Mitglieder')}</p>
                <p>{coins(mine.xp)} XP</p>
              </div>
            </div>
          </section>

          {mine.leaderId === me.id && mine.requests.length > 0 && (
            <Section title={`${t('Anfragen')} · ${mine.requests.length}`}>
              <ul className="divide-y divide-line">
                {await Promise.all(
                  mine.requests.map(async (r) => {
                    const u = await db.user.findUnique({ where: { id: r.userId }, select: { username: true, xp: true } });
                    return (
                      <li key={r.userId} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <span>{u?.username} <span className="text-xs text-faint">· Level {levelOf(u?.xp ?? 0)}</span></span>
                        <span className="flex gap-1">
                          <FormButton action={answerRequest.bind(null, mine.id, r.userId, true)} className="btn-primary h-8 text-xs">{t('Annehmen')}</FormButton>
                          <FormButton action={answerRequest.bind(null, mine.id, r.userId, false)} className="btn-ghost h-8 text-xs">{t('Ablehnen')}</FormButton>
                        </span>
                      </li>
                    );
                  }),
                )}
              </ul>
            </Section>
          )}

          <Section title={`${t('Mitglieder')} · ${mine.members.length}`}>
            <ul className="stagger divide-y divide-line">
              {mine.members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={`h-2 w-2 rounded-full ${hub.online.has(m.id) ? 'bg-win' : 'bg-line-strong'}`} />
                  <Avatar url={m.avatarUrl} name={m.username} size={28} frame={m.frame} />
                  <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <UserLink name={m.username} />
                    {m.id === mine.leaderId && <Crown size={14} className="text-gold" aria-label={t('Leitung')} />}
                  </span>
                  <span className="num text-xs text-muted">Level {levelOf(m.xp)}</span>
                  {mine.leaderId === me.id && m.id !== me.id && (
                    <span className="flex gap-1">
                      <FormButton action={transferLeader.bind(null, mine.id, m.id)} confirm={t('{name} die Leitung übergeben?', { name: m.username })} className="btn-ghost h-8 text-xs">{t('Leitung')}</FormButton>
                      <FormButton action={kickMember.bind(null, mine.id, m.id)} confirm={t('{name} entfernen?', { name: m.username })} className="btn-ghost h-8 text-xs">{t('Entfernen')}</FormButton>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Section>

          {mine.leaderId === me.id && (
            <Section title="Clan verwalten" pad>
              <ActionForm action={updateClan.bind(null, mine.id)} className="max-w-md space-y-4">
                <div>
                  <label className="label" htmlFor="m-desc">{t('Beschreibung')}</label>
                  <input id="m-desc" className="input" name="description" maxLength={120} defaultValue={mine.description} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="open" defaultChecked={mine.open} /> {t('Jeder darf direkt beitreten')}
                </label>
                <SubmitButton>{t('Speichern')}</SubmitButton>
              </ActionForm>
            </Section>
          )}

          <div className="flex flex-wrap gap-2">
            <FormButton action={leaveClan} confirm={t('Clan wirklich verlassen?')} className="btn-secondary">
              <DoorOpen size={16} /> {t('Clan verlassen')}
            </FormButton>
            {mine.leaderId === me.id && (
              <FormButton action={disbandClan.bind(null, mine.id)} confirm={t('Clan für alle auflösen? Das lässt sich nicht rückgängig machen.')} className="btn-danger">
                {t('Clan auflösen')}
              </FormButton>
            )}
          </div>
        </div>
      )}
    </>
  );
}
