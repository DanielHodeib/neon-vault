import type { User } from '@prisma/client';
import Link from 'next/link';
import { adjustUser, banUser, deleteUser, giftUser, muteUser, resetUser, setRole, unbanUser } from '@/app/actions/admin';
import { FormButton } from '@/components/FormButton';
import { ActionForm, Avatar, Empty, RoleBadge, Section, SubmitButton } from '@/components/ui';
import { coins, compact, gameName, timeAgo } from '@/lib/format';
import { db, hub, isMuted } from '@/lib/hub';
import { levelOf } from '@/lib/ranks';
import { atLeast, canEditSelf, canManage, ROLES } from '@/lib/roles';
import { isBanned } from '@/lib/session';
import { KIND_LABEL, PlayerSearch, findUsers } from './shared';

export async function PlayersTab({ actor, q, selectedId }: { actor: User; q: string; selectedId?: string }) {
  const [users, selected] = await Promise.all([findUsers(q), selectedId ? db.user.findUnique({ where: { id: selectedId } }) : null]);
  const isAdmin = atLeast(actor.role, 'ADMIN');
  const manageable = !!selected && canManage(actor.role, selected.role);
  const selfEdit = selected?.id === actor.id && canEditSelf(actor.role);
  const history = selected ? await db.ledgerEntry.findMany({ where: { userId: selected.id }, orderBy: { createdAt: 'desc' }, take: 15 }) : [];
  const mutedUntil = selected ? (hub.muted.get(selected.id) ?? 0) : 0;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
      {selected && (
        <div className="space-y-4 lg:col-start-2">
          <Section title={<span className="flex items-center gap-2">{selected.username} <RoleBadge role={selected.role} /></span>} pad>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar url={selected.avatarUrl} name={selected.username} size={48} frame={selected.frame} />
                <div className="text-sm">
                  <p>Level {levelOf(selected.xp)} · <span className="num text-gold">{coins(selected.balance)}</span> NVC</p>
                  <p className="text-xs text-faint">
                    {hub.online.get(selected.id)?.activity ?? 'offline'} · seit {selected.createdAt.toLocaleDateString('de-DE')}
                  </p>
                </div>
                <Link href={`/profile/${selected.username}`} className="btn-ghost ml-auto h-8 text-xs">Profil</Link>
              </div>
              {isBanned(selected) && (
                <p className="rounded-lg bg-loss/10 px-3 py-2 text-sm text-loss">
                  Gesperrt bis {selected.bannedUntil!.toLocaleString('de-DE')}{selected.banReason && ` – ${selected.banReason}`}
                </p>
              )}
              {!manageable && !selfEdit ? (
                <p className="text-sm text-faint">Keine Berechtigung für diesen Spieler.</p>
              ) : (
                <>
                  {isAdmin && (
                    <div>
                      <p className="label">Schnell-Geschenk</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[1_000, 10_000, 100_000].map((a) => (
                          <FormButton key={a} action={giftUser.bind(null, selected.id, a)} className="btn-secondary h-9 text-xs">+{compact(a)}</FormButton>
                        ))}
                      </div>
                    </div>
                  )}
                  {manageable && (
                    <div>
                      <p className="label">Chat stummschalten{selected && isMuted(selected.id) && <span className="text-gold"> · aktiv bis {new Date(mutedUntil).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>}</p>
                      <div className="grid grid-cols-4 gap-2">
                        {[5, 30, 120, 0].map((m) => (
                          <FormButton key={m} action={muteUser.bind(null, selected.id, m)} className={`h-9 text-xs ${m ? 'btn-secondary' : 'btn-ghost border border-line'}`}>{m ? `${m} Min` : 'Aufheben'}</FormButton>
                        ))}
                      </div>
                    </div>
                  )}
                  {manageable &&
                    (isBanned(selected) ? (
                      <FormButton action={unbanUser.bind(null, selected.id)} className="btn-secondary w-full">Entsperren</FormButton>
                    ) : (
                      <ActionForm action={banUser} className="space-y-2">
                        <input type="hidden" name="userId" value={selected.id} />
                        <p className="label">Sperren</p>
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
                        <p className="label">Guthaben / XP anpassen</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input className="input num" name="setBalance" type="number" min={0} placeholder="Guthaben setzen auf …" aria-label="Guthaben setzen auf" />
                          <input className="input num" name="balance" type="number" placeholder="oder ± NVC" defaultValue={0} aria-label="Guthaben ändern um" />
                          <input className="input num col-span-2" name="xp" type="number" placeholder="± XP" defaultValue={0} />
                        </div>
                        <p className="text-xs text-faint">Ein gesetzter Wert gilt genau so, „± NVC“ wird dann ignoriert.</p>
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
          <Section title="Letzte Buchungen">
            {history.length === 0 && <Empty>Noch keine.</Empty>}
            <ul className="divide-y divide-line text-sm">
              {history.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="min-w-0 truncate text-xs text-muted">
                    {KIND_LABEL[e.kind] ?? e.kind}{e.game && ` · ${gameName(e.game)}`} · {timeAgo(e.createdAt)}
                  </span>
                  <span className={`num shrink-0 ${e.amount >= 0n ? 'text-win' : 'text-loss'}`}>{e.amount >= 0n ? '+' : ''}{coins(e.amount)}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}
      <div className="lg:col-start-1 lg:row-start-1">
        <PlayerSearch tab="players" q={q} selectedId={selectedId} users={users} />
      </div>
    </div>
  );
}
