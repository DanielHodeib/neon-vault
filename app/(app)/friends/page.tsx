import { removeFriend, respondFriend, sendFriendRequest, sendMoney, setBlocked } from '@/app/actions/social';
import { FormButton } from '@/components/FormButton';
import { ActionForm, Empty, PageHeader, Section, SubmitButton, UserLink } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { coins, timeAgo } from '@/lib/format';
import { db, hub } from '@/lib/hub';

export const metadata = { title: 'Freunde' };

export default async function FriendsPage() {
  const me = await requireUser();
  const [links, blocks, transfers] = await Promise.all([
    db.friendship.findMany({
      where: { OR: [{ fromId: me.id }, { toId: me.id }] },
      include: { from: { select: { username: true } }, to: { select: { username: true } } },
    }),
    db.block.findMany({ where: { fromId: me.id }, include: { to: { select: { username: true } } } }),
    db.ledgerEntry.findMany({ where: { userId: me.id, kind: 'TRANSFER' }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);

  const other = (l: (typeof links)[number]) => (l.fromId === me.id ? { id: l.toId, ...l.to } : { id: l.fromId, ...l.from });
  const friends = links.filter((l) => l.accepted).map(other);
  const incoming = links.filter((l) => !l.accepted && l.toId === me.id).map(other);
  const outgoing = links.filter((l) => !l.accepted && l.fromId === me.id).map(other);
  const names = new Map(
    (await db.user.findMany({ where: { id: { in: transfers.map((t) => t.counterpartyId!) } }, select: { id: true, username: true } })).map((u) => [u.id, u.username]),
  );

  return (
    <>
      <PageHeader title="Freunde" subtitle="Freunde sehen, wer online ist, und können sich gegenseitig NVC schicken." />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <ActionForm action={sendFriendRequest} className="flex gap-2">
            <input className="input" name="username" placeholder="Benutzername" required autoCapitalize="off" />
            <SubmitButton>Hinzufügen</SubmitButton>
          </ActionForm>

          {incoming.length > 0 && (
            <Section title={`Anfragen · ${incoming.length}`}>
              <ul className="divide-y divide-line">
                {incoming.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
                    <UserLink name={u.username} />
                    <div className="flex gap-2">
                      <FormButton action={respondFriend.bind(null, u.id, false)} className="btn-ghost h-8">Ablehnen</FormButton>
                      <FormButton action={respondFriend.bind(null, u.id, true)} className="btn-primary h-8">Annehmen</FormButton>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title={`Freunde · ${friends.length}`}>
            {friends.length === 0 && <Empty>Noch keine Freunde – füge oben jemanden hinzu.</Empty>}
            <ul className="divide-y divide-line">
              {friends.map((u) => {
                const online = hub.online.get(u.id);
                return (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-win' : 'bg-line-strong'}`} />
                      <UserLink name={u.username} />
                      <span className="truncate text-xs text-faint">{online ? online.activity : 'offline'}</span>
                    </span>
                    <div className="flex gap-1">
                      <FormButton action={removeFriend.bind(null, u.id)} confirm={`${u.username} entfernen?`} className="btn-ghost h-8 text-xs">Entfernen</FormButton>
                      <FormButton action={setBlocked.bind(null, u.id, true)} confirm={`${u.username} blockieren?`} className="btn-ghost h-8 text-xs">Blockieren</FormButton>
                    </div>
                  </li>
                );
              })}
            </ul>
            {outgoing.length > 0 && <p className="border-t border-line px-4 py-3 text-xs text-faint">Ausstehend: {outgoing.map((u) => u.username).join(', ')}</p>}
          </Section>

          {blocks.length > 0 && (
            <Section title="Blockiert">
              <ul className="divide-y divide-line">
                {blocks.map((b) => (
                  <li key={b.toId} className="flex items-center justify-between px-4 py-3 text-sm">
                    <span className="text-muted">{b.to.username}</span>
                    <FormButton action={setBlocked.bind(null, b.toId, false)} className="btn-ghost h-8 text-xs">Entsperren</FormButton>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        <div className="space-y-4">
          <Section title="NVC senden" pad>
            {friends.length === 0 ? (
              <p className="text-sm text-faint">Geld kannst du nur an Freunde schicken.</p>
            ) : (
              <ActionForm action={sendMoney} className="space-y-3">
                <select className="input" name="username" required>
                  {friends.map((f) => <option key={f.id}>{f.username}</option>)}
                </select>
                <input className="input num" name="amount" type="number" inputMode="numeric" min={1} placeholder="Betrag" required />
                <input className="input" name="message" maxLength={120} placeholder="Nachricht (optional)" />
                <SubmitButton className="btn-primary w-full">Senden</SubmitButton>
              </ActionForm>
            )}
          </Section>

          <Section title="Verlauf">
            {transfers.length === 0 && <Empty>Noch keine Überweisungen.</Empty>}
            <ul className="divide-y divide-line">
              {transfers.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block">{t.amount > 0 ? 'Von' : 'An'} <span className="font-medium">{names.get(t.counterpartyId!) ?? 'gelöschtes Konto'}</span></span>
                    {t.note && <span className="block truncate text-xs text-muted">„{t.note}“</span>}
                    <span className="text-[11px] text-faint">{timeAgo(t.createdAt)}</span>
                  </span>
                  <span className={`num shrink-0 ${t.amount > 0 ? 'text-win' : 'text-loss'}`}>{t.amount > 0 ? '+' : ''}{coins(t.amount)}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}
