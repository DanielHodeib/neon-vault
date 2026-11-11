import { Search } from 'lucide-react';
import Link from 'next/link';

import { adjustUser, announceAction, banUser, deleteUser, eventAction, rainAction, resetUser, setMaintenanceAction, setRole, unbanUser } from '@/app/actions/admin';
import { FormButton } from '@/components/FormButton';
import { ActionForm, Coins, Empty, PageHeader, RoleBadge, Section, Stat, SubmitButton } from '@/components/ui';
import { adminStats } from '@/lib/adminStats';
import { requireRole } from '@/lib/auth';
import { EVENT_TYPES } from '@/lib/events';
import { coins, compact, GAME_NAMES } from '@/lib/format';
import { db, hub } from '@/lib/hub';
import { levelOf } from '@/lib/ranks';
import { atLeast, canEditSelf, canManage, ROLES } from '@/lib/roles';
import { isBanned } from '@/lib/session';
import { startOfDay } from '@/lib/wallet';

export const metadata = { title: 'Admin' };

export default async function AdminPage({ searchParams }: PageProps<'/admin'>) {
  const actor = await requireRole('SUPPORT');
  const { q = '', user: selectedId } = (await searchParams) as { q?: string; user?: string };
  const isAdmin = atLeast(actor.role, 'ADMIN');

  const [userCount, openTickets, totals, betsToday, users, selected, week] = await Promise.all([
    db.user.count(),
    db.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    db.user.aggregate({ _sum: { balance: true } }),
    db.ledgerEntry.count({ where: { kind: 'BET', createdAt: { gte: startOfDay() } } }),
    db.user.findMany({ where: q ? { username: { contains: q } } : {}, orderBy: { createdAt: 'desc' }, take: 30 }),
    selectedId ? db.user.findUnique({ where: { id: selectedId } }) : null,
    adminStats(7),
  ]);
  const manageable = !!selected && canManage(actor.role, selected.role);
  const selfEdit = selected?.id === actor.id && canEditSelf(actor.role);

  return (
    <>
      <PageHeader title="Admin" subtitle={`Angemeldet als ${actor.role}`} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Spieler"><span className="num">{userCount}</span></Stat>
        <Stat label="Online"><span className="num">{hub.online.size}</span></Stat>
        <Stat label="Offene Tickets"><span className="num">{openTickets}</span></Stat>
        <Stat label="Einsätze heute"><span className="num">{betsToday}</span></Stat>
        <div className="col-span-2 sm:col-span-1"><Stat label="NVC im Umlauf"><span className="num text-gold">{compact(totals._sum.balance ?? 0)}</span></Stat></div>
      </div>

      <Section title="Letzte 7 Tage" className="mb-4">
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-5">
          {[
            ['Aktive Spieler', String(week.activePlayers)],
            ['Neue Spieler', String(week.newUsers)],
            ['Runden', coins(week.rounds)],
            ['Eingesetzt', compact(week.staked)],
            ['Hausergebnis', `${week.house >= 0 ? '+' : ''}${compact(week.house)}`],
          ].map(([label, value]) => (
            <div key={label} className="bg-surface px-4 py-3 last:col-span-2 sm:last:col-span-1">
              <p className="text-[11px] text-muted">{label}</p>
              <p className={`num font-semibold ${label === 'Hausergebnis' ? (week.house >= 0 ? 'text-win' : 'text-loss') : ''}`}>{value}</p>
            </div>
          ))}
        </div>
        {week.games.length === 0 ? (
          <Empty>Diese Woche wurde noch nicht gespielt.</Empty>
        ) : (
          <div className="overflow-x-auto border-t border-line">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="px-3 sm:px-4 py-2 font-medium">Spiel</th>
                  <th className="px-3 sm:px-4 py-2 text-right font-medium">Runden</th>
                  <th className="px-3 sm:px-4 py-2 text-right font-medium">Eingesetzt</th>
                  <th className="px-3 sm:px-4 py-2 text-right font-medium">Haus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {week.games.map((g) => (
                  <tr key={g.game}>
                    <td className="px-3 py-2 sm:px-4">{GAME_NAMES[g.game] ?? g.game}</td>
                    <td className="num px-3 py-2 text-right sm:px-4">{coins(g.rounds)}</td>
                    <td className="num px-3 py-2 text-right sm:px-4">{compact(g.staked)}</td>
                    <td className={`num px-3 py-2 text-right sm:px-4 ${g.house >= 0 ? 'text-win' : 'text-loss'}`}>{compact(g.house)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Phones: selected player → list → tools. Laptops: list left, the rest right. */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {selected && (
          <Section title={<span className="flex items-center gap-2">{selected.username} <RoleBadge role={selected.role} /></span>} pad className="lg:col-start-2">
            <div className="space-y-4">
              <p className="text-sm text-muted">
                Level {levelOf(selected.xp)} · <Coins value={Number(selected.balance)} /> NVC
              </p>
              {isBanned(selected) && (
                <p className="rounded-lg bg-loss/10 px-3 py-2 text-sm text-loss">
                  Gesperrt bis {selected.bannedUntil!.toLocaleString('de-DE')}
                  {selected.banReason && ` – ${selected.banReason}`}
                </p>
              )}
              {!manageable && !selfEdit ? (
                <p className="text-sm text-faint">Keine Berechtigung für diesen Spieler.</p>
              ) : (
                <>
                  {manageable &&
                    (isBanned(selected) ? (
                      <FormButton action={unbanUser.bind(null, selected.id)} className="btn-secondary w-full">Entsperren</FormButton>
                    ) : (
                      <ActionForm action={banUser} className="space-y-2">
                        <input type="hidden" name="userId" value={selected.id} />
                        <div className="flex gap-2">
                          <select className="input" name="hours" defaultValue="24">
                            <option value="1">1 Stunde</option>
                            <option value="24">1 Tag</option>
                            <option value="168">7 Tage</option>
                            <option value="0">Dauerhaft</option>
                          </select>
                          <SubmitButton className="btn-danger">Sperren</SubmitButton>
                        </div>
                        <input className="input" name="reason" placeholder="Grund (optional)" />
                      </ActionForm>
                    ))}
                  {isAdmin && (
                    <>
                      {manageable && (
                        <div>
                          <p className="label">Rolle ändern</p>
                          <div className="flex flex-wrap gap-1.5">
                            {ROLES.filter((r) => r !== selected.role && canManage(actor.role, r)).map((r) => (
                              <FormButton key={r} action={setRole.bind(null, selected.id, r)} className="chip">{r}</FormButton>
                            ))}
                          </div>
                        </div>
                      )}
                      <ActionForm action={adjustUser} className="space-y-2">
                        <input type="hidden" name="userId" value={selected.id} />
                        <p className="label">Guthaben / XP anpassen (±)</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input className="input num" name="balance" type="number" placeholder="± NVC" defaultValue={0} />
                          <input className="input num" name="xp" type="number" placeholder="± XP" defaultValue={0} />
                        </div>
                        {selfEdit ? (
                          <input type="hidden" name="password" value="" />
                        ) : (
                          <input className="input" name="password" type="password" placeholder="Neues Passwort (optional)" autoComplete="new-password" />
                        )}
                        <SubmitButton className="btn-secondary w-full">Übernehmen</SubmitButton>
                      </ActionForm>
                      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                        <FormButton action={resetUser.bind(null, selected.id, 'quests')} className="btn-ghost h-8 text-xs">Quests zurücksetzen</FormButton>
                        {manageable && (
                          <>
                            <FormButton action={resetUser.bind(null, selected.id, 'social')} confirm="Alle Freunde und Blocks löschen?" className="btn-ghost h-8 text-xs">Freunde zurücksetzen</FormButton>
                            <FormButton action={deleteUser.bind(null, selected.id)} className="btn-danger h-8 text-xs" confirm={`${selected.username} endgültig löschen?`}>Konto löschen</FormButton>
                          </>
                        )}
                      </div>
                    </>
                  )}
                  {selfEdit && <p className="text-xs text-faint">Das bist du. Sperren, Rolle und Löschen sind für das eigene Konto gesperrt.</p>}
                </>
              )}
            </div>
          </Section>
        )}

        <Section title="Spieler" className="lg:col-start-1 lg:row-span-3 lg:row-start-1">
          <form className="flex gap-2 border-b border-line p-3">
            <input className="input" name="q" defaultValue={q} placeholder="Name suchen" autoCapitalize="off" />
            <button className="btn-secondary w-10 px-0" aria-label="Suchen"><Search size={16} /></button>
          </form>
          {users.length === 0 && <Empty>Niemand gefunden.</Empty>}
          <ul className="divide-y divide-line text-sm">
            {users.map((u) => (
              <li key={u.id}>
                <Link href={`?q=${encodeURIComponent(q)}&user=${u.id}`} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${u.id === selectedId ? 'bg-raised' : 'hover:bg-raised/50'}`}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${hub.online.has(u.id) ? 'bg-win' : 'bg-line-strong'}`} />
                    <span className="truncate">{u.username}</span>
                    <RoleBadge role={u.role} />
                    {isBanned(u) && <span className="text-[11px] text-loss">gesperrt</span>}
                  </span>
                  <span className="num shrink-0 text-xs text-faint">{coins(u.balance)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <div className="space-y-4 lg:col-start-2">
          {atLeast(actor.role, 'MODERATOR') && (
            <Section title="Ankündigung" pad>
              <ActionForm action={announceAction} className="space-y-3">
                <textarea className="input h-auto py-2" name="message" rows={2} maxLength={300} placeholder="Nachricht an alle" required />
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input type="checkbox" name="persist" className="h-4 w-4 accent-[var(--accent)]" /> Auch als Benachrichtigung speichern
                </label>
                <SubmitButton className="btn-secondary">Senden</SubmitButton>
              </ActionForm>
            </Section>
          )}

          {isAdmin && (
            <>
              <Section title={hub.event ? `Event · läuft: ${hub.event.label}` : 'Globales Event'} pad>
                <ActionForm action={eventAction} className="space-y-3">
                  <div className="grid grid-cols-[1fr_6rem] gap-2">
                    <select className="input" name="type">
                      {Object.entries(EVENT_TYPES).map(([type, e]) => (
                        <option key={type} value={type}>{e.label}</option>
                      ))}
                      <option value="STOP">Event stoppen</option>
                    </select>
                    <input className="input num" name="minutes" type="number" defaultValue={10} min={1} max={180} aria-label="Minuten" />
                  </div>
                  <SubmitButton className="btn-secondary">Ausführen</SubmitButton>
                </ActionForm>
              </Section>

              <Section title="Rain" pad>
                <ActionForm action={rainAction} className="space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {[['amount', 'NVC', 10_000], ['seconds', 'Sekunden', 60], ['players', 'Gewinner', 10]].map(([name, label, value]) => (
                      <div key={name}>
                        <label className="label">{label}</label>
                        <input className="input num" name={String(name)} type="number" defaultValue={value} />
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-faint">Wird unter den Spielern verteilt, die in den letzten 10 Minuten im Chat geschrieben haben.</p>
                  <SubmitButton className="btn-secondary">Regnen lassen</SubmitButton>
                </ActionForm>
              </Section>

              <Section title={hub.maintenance.on ? 'Wartungsmodus · aktiv' : 'Wartungsmodus'} pad>
                <ActionForm action={setMaintenanceAction} className="space-y-3">
                  <input type="hidden" name="on" value={String(!hub.maintenance.on)} />
                  {!hub.maintenance.on && <input className="input num" name="minutes" type="number" placeholder="Dauer in Minuten (optional)" />}
                  <SubmitButton className={hub.maintenance.on ? 'btn-primary' : 'btn-danger'}>{hub.maintenance.on ? 'Wartung beenden' : 'Wartung starten'}</SubmitButton>
                </ActionForm>
              </Section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
