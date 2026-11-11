import type { User } from '@prisma/client';
import { Activity, Clock, Coins as CoinsIcon, Gauge, MessageSquareOff, Search, TrendingUp, Trophy, UserPlus, Users, Wifi, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import {
  adjustUser,
  announceAction,
  backupAction,
  banUser,
  cancelCountdownAction,
  clearChatAction,
  deleteUser,
  giftUser,
  muteUser,
  resetUser,
  restartAction,
  setMaintenanceAction,
  setRole,
  trollAction,
  unbanUser,
} from '@/app/actions/admin';
import { FormButton } from '@/components/FormButton';
import { EventForm } from './EventForm';
import { ActionForm, Avatar, Empty, RoleBadge, Section, SubmitButton } from '@/components/ui';
import { adminStats } from '@/lib/adminStats';
import { coins, compact, GAME_NAMES, timeAgo } from '@/lib/format';
import { FX } from '@/lib/fx';
import { db, hub, isMuted } from '@/lib/hub';
import { levelOf } from '@/lib/ranks';
import { atLeast, canEditSelf, canManage, ROLES } from '@/lib/roles';
import { secondsUntil, serverInfo } from '@/lib/serverInfo';
import { isBanned } from '@/lib/session';
import { startOfDay } from '@/lib/wallet';

const KIND_LABEL: Record<string, string> = {
  BET: 'Einsatz', WIN: 'Gewinn', CANCEL: 'Storno', REFUND: 'Cashback', BUYIN: 'Buy-in', CASHOUT: 'Cashout', FAUCET: 'Daily',
  QUEST: 'Quest', TRANSFER: 'Überweisung', RAIN: 'Rain', ADMIN: 'Admin', BONUS: 'Bonus', SHOP: 'Shop',
};

// ---------- building blocks ----------

function Kpi({ icon: Icon, label, value, hint, tone }: { icon: LucideIcon; label: string; value: ReactNode; hint?: string; tone?: 'win' | 'loss' | 'gold' }) {
  const color = tone === 'win' ? 'text-win' : tone === 'loss' ? 'text-loss' : tone === 'gold' ? 'text-gold' : '';
  return (
    <div className="card flex items-start gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-raised text-muted"><Icon size={17} /></span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className={`num truncate text-lg font-semibold ${color}`}>{value}</p>
        {hint && <p className="truncate text-[11px] text-faint">{hint}</p>}
      </div>
    </div>
  );
}

/** Online count, event, maintenance and countdown at a glance. */
export function StatusPills() {
  const pill = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium';
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={`${pill} border-win/30 text-win`}><span className="h-1.5 w-1.5 rounded-full bg-win" /> {hub.online.size} online</span>
      {hub.event && <span className={`${pill} border-accent/40 text-accent`}>⚡ {hub.event.label}</span>}
      {hub.maintenance.on && <span className={`${pill} border-loss/40 text-loss`}>Wartung aktiv</span>}
      {hub.countdown && <span className={`${pill} border-gold/40 text-gold`}>{hub.countdown.kind === 'restart' ? 'Neustart' : 'Wartung'} in {secondsUntil(hub.countdown.at)} s</span>}
    </div>
  );
}

function PlayerSearch({ tab, q, selectedId, users }: { tab: string; q: string; selectedId?: string; users: User[] }) {
  return (
    <Section title="Spieler" className="min-w-0">
      <form className="flex gap-2 border-b border-line p-3">
        <input type="hidden" name="tab" value={tab} />
        <input className="input" name="q" defaultValue={q} placeholder="Name suchen" autoCapitalize="off" />
        <button className="btn-secondary w-10 px-0" aria-label="Suchen"><Search size={16} /></button>
      </form>
      {users.length === 0 && <Empty>Niemand gefunden.</Empty>}
      <ul className="max-h-[32rem] divide-y divide-line overflow-y-auto text-sm">
        {users.map((u) => (
          <li key={u.id}>
            <Link
              href={`/admin?tab=${tab}&q=${encodeURIComponent(q)}&user=${u.id}`}
              className={`flex items-center justify-between gap-3 px-4 py-2.5 ${u.id === selectedId ? 'bg-raised' : 'hover:bg-raised/50'}`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar url={u.avatarUrl} name={u.username} size={26} />
                <span className="truncate">{u.username}</span>
                <RoleBadge role={u.role} />
                {hub.online.has(u.id) && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-win" title="online" />}
                {isBanned(u) && <span className="text-[11px] text-loss">gesperrt</span>}
                {isMuted(u.id) && <MessageSquareOff size={13} className="text-gold" />}
              </span>
              <span className="num shrink-0 text-xs text-faint">{coins(u.balance)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

const findUsers = (q: string) => db.user.findMany({ where: q ? { username: { contains: q } } : {}, orderBy: { createdAt: 'desc' }, take: 50 });

// ---------- tabs ----------

export async function OverviewTab() {
  const [userCount, openTickets, totals, betsToday, week, recent, bigWins] = await Promise.all([
    db.user.count(),
    db.ticket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    db.user.aggregate({ _sum: { balance: true } }),
    db.ledgerEntry.count({ where: { kind: 'BET', createdAt: { gte: startOfDay() } } }),
    adminStats(7),
    db.ledgerEntry.findMany({ orderBy: { createdAt: 'desc' }, take: 12, include: { user: { select: { username: true } } } }),
    db.ledgerEntry.findMany({ where: { kind: 'WIN', amount: { gte: 5_000 } }, orderBy: { createdAt: 'desc' }, take: 6, include: { user: { select: { username: true } } } }),
  ]);
  const maxRounds = Math.max(1, ...week.games.map((g) => g.rounds));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Users} label="Spieler" value={coins(userCount)} hint={`${week.newUsers} neu in 7 Tagen`} />
        <Kpi icon={Wifi} label="Online jetzt" value={hub.online.size} hint={`${week.activePlayers} aktiv in 7 Tagen`} tone="win" />
        <Kpi icon={Activity} label="Einsätze heute" value={coins(betsToday)} hint={`${coins(week.rounds)} Runden in 7 Tagen`} />
        <Kpi icon={CoinsIcon} label="NVC im Umlauf" value={compact(totals._sum.balance ?? 0)} tone="gold" hint={`${openTickets} offene Tickets`} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Section
          title="Spiele · letzte 7 Tage"
          action={<span className={`num text-xs font-semibold ${week.house >= 0 ? 'text-win' : 'text-loss'}`}>Haus {week.house >= 0 ? '+' : ''}{compact(week.house)}</span>}
        >
          {week.games.length === 0 ? (
            <Empty>Diese Woche wurde noch nicht gespielt.</Empty>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {week.games.map((g) => (
                <li key={g.game} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{GAME_NAMES[g.game] ?? g.game}</span>
                    <span className="num text-xs text-muted">
                      {coins(g.rounds)} Runden · {compact(g.staked)} gesetzt ·{' '}
                      <span className={g.house >= 0 ? 'text-win' : 'text-loss'}>{g.house >= 0 ? '+' : ''}{compact(g.house)}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
                    <div className="h-full rounded-full bg-accent/70" style={{ width: `${(g.rounds / maxRounds) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="space-y-4">
          <Section title={`Wer spielt was · ${hub.online.size}`}>
            {hub.online.size === 0 && <Empty>Gerade niemand online.</Empty>}
            <ul className="divide-y divide-line text-sm">
              {[...hub.online.values()].map((u) => (
                <li key={u.id} className="flex justify-between gap-3 px-4 py-2">
                  <Link href={`/admin?tab=players&user=${u.id}`} className="truncate hover:underline">{u.username}</Link>
                  <span className="shrink-0 text-xs text-faint">{u.activity}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Große Gewinne">
            {bigWins.length === 0 && <Empty>Noch keine.</Empty>}
            <ul className="divide-y divide-line text-sm">
              {bigWins.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="flex min-w-0 items-center gap-2"><Trophy size={13} className="shrink-0 text-gold" /><span className="truncate">{w.user.username}</span></span>
                  <span className="num shrink-0 text-xs"><span className="text-win">+{compact(w.amount)}</span> <span className="text-faint">{GAME_NAMES[w.game ?? ''] ?? w.game}</span></span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>

      <Section title="Letzte Buchungen">
        <ul className="divide-y divide-line text-sm">
          {recent.map((e) => (
            <li key={e.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-2 sm:grid-cols-[10rem_7rem_minmax(0,1fr)_auto]">
              <span className="truncate font-medium">{e.user.username}</span>
              <span className="num text-right sm:order-last">
                <span className={e.amount >= 0n ? 'text-win' : 'text-loss'}>{e.amount >= 0n ? '+' : ''}{coins(e.amount)}</span>
              </span>
              <span className="text-xs text-muted">{KIND_LABEL[e.kind] ?? e.kind}{e.game && ` · ${GAME_NAMES[e.game] ?? e.game}`}</span>
              <span className="truncate text-xs text-faint">{e.note ?? ''} · {timeAgo(e.createdAt)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

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
          <Section title="Letzte Buchungen">
            {history.length === 0 && <Empty>Noch keine.</Empty>}
            <ul className="divide-y divide-line text-sm">
              {history.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="min-w-0 truncate text-xs text-muted">
                    {KIND_LABEL[e.kind] ?? e.kind}{e.game && ` · ${GAME_NAMES[e.game] ?? e.game}`} · {timeAgo(e.createdAt)}
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

export function LiveTab({ actor }: { actor: User }) {
  const isAdmin = atLeast(actor.role, 'ADMIN');
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Section title="Ankündigung" pad>
        <ActionForm action={announceAction} className="space-y-3">
          <textarea className="input h-auto py-2" name="message" rows={3} maxLength={300} placeholder="Nachricht an alle – erscheint als Einblendung" required />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="persist" className="h-4 w-4 accent-[var(--accent)]" /> Auch als Benachrichtigung speichern
          </label>
          <SubmitButton className="btn-primary">Senden</SubmitButton>
        </ActionForm>
      </Section>

      <Section title="Chat" pad>
        <p className="mb-3 text-sm text-muted">{hub.chat.length} Nachrichten im Verlauf. Einzelne Spieler schaltest du im Tab „Spieler“ stumm.</p>
        <FormButton action={clearChatAction} confirm="Den Chat für alle leeren?" className="btn-secondary">Chat leeren</FormButton>
      </Section>

      {isAdmin && (
        <>
          <Section title="Globales Event" pad className="lg:col-span-2">
            <EventForm
              running={hub.event && { label: hub.event.label, description: hub.event.description, endsAt: hub.event.endsAt }}
              auto={{ on: hub.autoEvents, nextAt: hub.nextAutoAt }}
            />
          </Section>
        </>
      )}
    </div>
  );
}

export function ServerTab({ actor }: { actor: User }) {
  const info = serverInfo();
  const isOwner = actor.role === 'OWNER';
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Clock} label="Läuft seit" value={info.uptime} />
        <Kpi icon={Gauge} label="Arbeitsspeicher" value={`${info.memoryMb} MB`} hint={`Node ${info.node}`} />
        <Kpi icon={TrendingUp} label="Version" value={info.version?.split(' · ')[0] ?? '–'} hint={info.version?.split(' · ')[1]} />
        <Kpi icon={UserPlus} label="Online" value={hub.online.size} tone="win" />
      </div>

      {hub.countdown && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm text-gold">
          <span>{hub.countdown.kind === 'restart' ? 'Neustart' : 'Wartung'} in {secondsUntil(hub.countdown.at)} Sekunden – alle sehen den Countdown.</span>
          <FormButton action={cancelCountdownAction} className="btn-secondary h-8 text-xs">Absagen</FormButton>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Section title={hub.maintenance.on ? 'Wartungsmodus · aktiv' : 'Wartungsmodus'} pad>
          <ActionForm action={setMaintenanceAction} className="space-y-3">
            <input type="hidden" name="on" value={String(!hub.maintenance.on)} />
            {hub.maintenance.on ? (
              <p className="text-sm text-muted">
                Nur das Team kann gerade spielen.{hub.maintenance.endsAt && ` Angezeigtes Ende: ${new Date(hub.maintenance.endsAt).toLocaleString('de-DE')}.`}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label" htmlFor="delay">Vorwarnung</label>
                  <select id="delay" className="input" name="delay" defaultValue="5">
                    <option value="0">Sofort</option>
                    <option value="1">1 Minute</option>
                    <option value="5">5 Minuten</option>
                    <option value="10">10 Minuten</option>
                    <option value="30">30 Minuten</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="minutes">Dauer (Min., optional)</label>
                  <input id="minutes" className="input num" name="minutes" type="number" min={0} placeholder="z. B. 15" />
                </div>
              </div>
            )}
            <SubmitButton className={hub.maintenance.on ? 'btn-primary' : 'btn-danger'}>{hub.maintenance.on ? 'Wartung beenden' : 'Wartung planen'}</SubmitButton>
          </ActionForm>
        </Section>

        <Section title="Neustart & Backup" pad>
          <div className="space-y-4">
            {isOwner && (
              <div>
                <p className="label">Server neu starten (mit Countdown für alle)</p>
                <div className="grid grid-cols-4 gap-2">
                  {[30, 60, 120, 300].map((s) => (
                    <FormButton key={s} action={restartAction.bind(null, s)} confirm={`Server in ${s} Sekunden neu starten?`} className="btn-secondary h-9 text-xs">
                      {s < 60 ? `${s} s` : `${s / 60} Min`}
                    </FormButton>
                  ))}
                </div>
                {!info.production && <p className="mt-1.5 text-xs text-faint">Lokal am Mac startet der Server danach nicht von selbst neu.</p>}
              </div>
            )}
            <div>
              <p className="label">Datenbank sichern</p>
              <FormButton action={backupAction} className="btn-secondary">Backup jetzt</FormButton>
              <p className="mt-1.5 text-xs text-faint">Automatisch täglich, die letzten 14 Tage bleiben.</p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

export async function FunTab({ q, selectedId }: { q: string; selectedId?: string }) {
  const [users, target] = await Promise.all([findUsers(q), selectedId ? db.user.findUnique({ where: { id: selectedId }, select: { id: true, username: true } }) : null]);
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Section
        title={target ? `Effekte für ${target.username}` : 'Effekte für alle'}
        action={target && <Link href="/admin?tab=fun" className="text-xs text-muted hover:text-fg">An alle senden</Link>}
        pad
      >
        <p className="mb-4 text-sm text-muted">Harmloser Spaß: verändert nur kurz, wie die Seite aussieht oder klingt. Rechts einen Spieler wählen, um nur ihn zu trollen.</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(FX).map(([key, fx]) => (
            <FormButton key={key} action={trollAction.bind(null, key, target?.id ?? null)} className="btn-secondary h-auto flex-col gap-1 py-4">
              <span className="text-2xl">{fx.emoji}</span>
              <span className="text-xs">{fx.label}</span>
            </FormButton>
          ))}
        </div>
      </Section>
      <PlayerSearch tab="fun" q={q} selectedId={selectedId} users={users} />
    </div>
  );
}
