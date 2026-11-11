import Link from 'next/link';

import { adjustUser, announceAction, banUser, deleteUser, eventAction, rainAction, resetUser, setMaintenanceAction, setRole, unbanUser } from '@/app/actions/admin';
import { FormButton } from '@/components/FormButton';
import { ActionForm, Coins, RoleBadge, SubmitButton } from '@/components/ui';
import { requireRole } from '@/lib/auth';
import { coins } from '@/lib/format';
import { db, hub } from '@/lib/hub';
import { levelOf } from '@/lib/ranks';
import { atLeast, canManage, ROLES } from '@/lib/roles';
import { isBanned } from '@/lib/session';
import { startOfDay } from '@/lib/wallet';

export default async function AdminPage({ searchParams }: PageProps<'/admin'>) {
  const actor = await requireRole('SUPPORT');
  const { q = '', user: selectedId } = (await searchParams) as { q?: string; user?: string };
  const isAdmin = atLeast(actor.role, 'ADMIN');

  const [userCount, openTickets, totals, betsToday, users, selected] = await Promise.all([
    db.user.count(),
    db.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    db.user.aggregate({ _sum: { balance: true } }),
    db.ledgerEntry.count({ where: { kind: 'BET', createdAt: { gte: startOfDay() } } }),
    db.user.findMany({ where: q ? { username: { contains: q } } : {}, orderBy: { createdAt: 'desc' }, take: 30 }),
    selectedId ? db.user.findUnique({ where: { id: selectedId } }) : null,
  ]);
  const manageable = selected && canManage(actor.role, selected.role);

  const stat = (label: string, value: string | number) => (
    <div className="card"><p className="label">{label}</p><p className="text-2xl font-black">{value}</p></div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stat('Spieler', userCount)}
        {stat('Online', hub.online.size)}
        {stat('Offene Tickets', openTickets)}
        {stat('Einsätze heute', betsToday)}
        {stat('NVC im Umlauf', coins(totals._sum.balance ?? 0))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="card">
          <form className="mb-3 flex gap-2">
            <input className="input" name="q" defaultValue={q} placeholder="Spieler suchen …" />
            <button className="btn-ghost">Suchen</button>
          </form>
          <ul className="divide-y divide-line text-sm">
            {users.map((u) => (
              <li key={u.id}>
                <Link href={`?q=${q}&user=${u.id}`} className={`flex items-center justify-between py-2 hover:text-accent ${u.id === selectedId ? 'text-accent' : ''}`}>
                  <span className="flex items-center gap-2">
                    {u.username} <RoleBadge role={u.role} />
                    {isBanned(u) && <span className="text-xs text-red-300">gesperrt</span>}
                    {hub.online.has(u.id) && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
                  </span>
                  <span className="font-mono text-xs text-muted">{coins(u.balance)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-4">
          {selected ? (
            <div className="card space-y-3">
              <div>
                <h2 className="text-lg font-bold">{selected.username} <RoleBadge role={selected.role} /></h2>
                <p className="text-sm text-muted">Level {levelOf(selected.xp)} · <Coins value={Number(selected.balance)} /></p>
                {isBanned(selected) && <p className="text-sm text-red-300">Gesperrt bis {selected.bannedUntil!.toLocaleString('de-DE')} {selected.banReason && `– ${selected.banReason}`}</p>}
              </div>
              {!manageable ? (
                <p className="text-sm text-muted">Keine Berechtigung für diesen Spieler.</p>
              ) : (
                <>
                  {isBanned(selected) ? (
                    <FormButton action={unbanUser.bind(null, selected.id)}>Entsperren</FormButton>
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
                      <input className="input" name="reason" placeholder="Grund" />
                    </ActionForm>
                  )}
                  {isAdmin && (
                    <>
                      <div className="flex flex-wrap gap-1">
                        {ROLES.filter((r) => r !== selected.role && canManage(actor.role, r)).map((r) => (
                          <FormButton key={r} action={setRole.bind(null, selected.id, r)}>→ {r}</FormButton>
                        ))}
                      </div>
                      <ActionForm action={adjustUser} className="space-y-2">
                        <input type="hidden" name="userId" value={selected.id} />
                        <div className="grid grid-cols-2 gap-2">
                          <input className="input" name="balance" type="number" placeholder="± NVC" defaultValue={0} />
                          <input className="input" name="xp" type="number" placeholder="± XP" defaultValue={0} />
                        </div>
                        <input className="input" name="password" type="password" placeholder="Neues Passwort (optional)" />
                        <SubmitButton>Übernehmen</SubmitButton>
                      </ActionForm>
                      <div className="flex flex-wrap gap-2">
                        <FormButton action={resetUser.bind(null, selected.id, 'quests')}>Quests zurücksetzen</FormButton>
                        <FormButton action={resetUser.bind(null, selected.id, 'social')} confirm="Alle Freunde und Blocks löschen?">Freunde zurücksetzen</FormButton>
                        <FormButton action={deleteUser.bind(null, selected.id)} className="btn-danger" confirm={`${selected.username} endgültig löschen?`}>Löschen</FormButton>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="card text-sm text-muted">Spieler links auswählen.</div>
          )}

          {atLeast(actor.role, 'MODERATOR') && (
            <ActionForm action={announceAction} className="card space-y-2">
              <h2 className="font-bold">Ankündigung</h2>
              <textarea className="input" name="message" rows={2} maxLength={300} required />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="persist" /> Auch als Benachrichtigung speichern</label>
              <SubmitButton>Senden</SubmitButton>
            </ActionForm>
          )}

          {isAdmin && (
            <>
              <ActionForm action={eventAction} className="card space-y-2">
                <h2 className="font-bold">Globales Event {hub.event && <span className="text-sm text-accent-2">· läuft: {hub.event.label}</span>}</h2>
                <div className="flex gap-2">
                  <select className="input" name="type">
                    <option value="CASHBACK">Cashback-Mania</option>
                    <option value="BOOST">Multiplier-Boost</option>
                    <option value="RAIN">Rain-Event</option>
                    <option value="STOP">Event stoppen</option>
                  </select>
                  <input className="input w-24" name="minutes" type="number" defaultValue={10} min={1} max={180} title="Minuten" />
                </div>
                <SubmitButton>Ausführen</SubmitButton>
              </ActionForm>

              <ActionForm action={rainAction} className="card space-y-2">
                <h2 className="font-bold">Rain starten</h2>
                <div className="grid grid-cols-3 gap-2">
                  <input className="input" name="amount" type="number" defaultValue={10_000} title="NVC" />
                  <input className="input" name="seconds" type="number" defaultValue={60} title="Sekunden" />
                  <input className="input" name="players" type="number" defaultValue={10} title="Spieler" />
                </div>
                <p className="text-xs text-muted">NVC · Sekunden · max. Gewinner (aktive Chatter)</p>
                <SubmitButton>Regnen lassen</SubmitButton>
              </ActionForm>

              <ActionForm action={setMaintenanceAction} className="card space-y-2">
                <h2 className="font-bold">Wartungsmodus {hub.maintenance.on && <span className="text-sm text-red-300">· aktiv</span>}</h2>
                <input type="hidden" name="on" value={String(!hub.maintenance.on)} />
                {!hub.maintenance.on && <input className="input" name="minutes" type="number" placeholder="Dauer in Minuten (optional)" />}
                <SubmitButton className={hub.maintenance.on ? 'btn-primary' : 'btn-danger'}>{hub.maintenance.on ? 'Beenden' : 'Aktivieren'}</SubmitButton>
              </ActionForm>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
