import { removeFriend, respondFriend, sendFriendRequest, sendMoney, setBlocked } from '@/app/actions/social';
import { FormButton } from '@/components/FormButton';
import { ActionForm, SubmitButton, UserLink } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { coins, timeAgo } from '@/lib/format';
import { db, hub } from '@/lib/hub';

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
  const names = new Map((await db.user.findMany({ where: { id: { in: transfers.map((t) => t.counterpartyId!) } }, select: { id: true, username: true } })).map((u) => [u.id, u.username]));

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <ActionForm action={sendFriendRequest} className="card flex gap-2">
          <input className="input" name="username" placeholder="Benutzername hinzufügen" required />
          <SubmitButton>Anfragen</SubmitButton>
        </ActionForm>

        {incoming.length > 0 && (
          <div className="card">
            <h2 className="mb-2 font-bold">Anfragen an dich</h2>
            {incoming.map((u) => (
              <div key={u.id} className="flex items-center justify-between py-1">
                <UserLink name={u.username} />
                <div className="flex gap-2">
                  <FormButton action={respondFriend.bind(null, u.id, true)} className="btn-primary">Annehmen</FormButton>
                  <FormButton action={respondFriend.bind(null, u.id, false)}>Ablehnen</FormButton>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="card">
          <h2 className="mb-2 font-bold">Freunde ({friends.length})</h2>
          {friends.length === 0 && <p className="text-sm text-muted">Noch keine Freunde.</p>}
          {friends.map((u) => {
            const online = hub.online.get(u.id);
            return (
              <div key={u.id} className="flex items-center justify-between border-b border-line py-2 last:border-0">
                <span className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <UserLink name={u.username} />
                  {online && <span className="text-xs text-muted">{online.activity}</span>}
                </span>
                <div className="flex gap-2">
                  <FormButton action={removeFriend.bind(null, u.id)} confirm={`${u.username} entfernen?`}>Entfernen</FormButton>
                  <FormButton action={setBlocked.bind(null, u.id, true)} confirm={`${u.username} blockieren?`}>Blockieren</FormButton>
                </div>
              </div>
            );
          })}
          {outgoing.length > 0 && <p className="mt-3 text-xs text-muted">Ausstehend: {outgoing.map((u) => u.username).join(', ')}</p>}
        </div>

        {blocks.length > 0 && (
          <div className="card">
            <h2 className="mb-2 font-bold">Blockiert</h2>
            {blocks.map((b) => (
              <div key={b.toId} className="flex items-center justify-between py-1">
                <span>{b.to.username}</span>
                <FormButton action={setBlocked.bind(null, b.toId, false)}>Entsperren</FormButton>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <ActionForm action={sendMoney} className="card space-y-3">
          <h2 className="font-bold">Geld an Freunde senden</h2>
          <select className="input" name="username" required>
            {friends.map((f) => <option key={f.id}>{f.username}</option>)}
          </select>
          <input className="input font-mono" name="amount" type="number" min={1} placeholder="Betrag" required />
          <input className="input" name="message" maxLength={120} placeholder="Nachricht (optional)" />
          <SubmitButton>Senden</SubmitButton>
        </ActionForm>

        <div className="card">
          <h2 className="mb-2 font-bold">Verlauf</h2>
          {transfers.length === 0 && <p className="text-sm text-muted">Noch keine Überweisungen.</p>}
          {transfers.map((t) => (
            <div key={t.id} className="flex justify-between py-1 text-sm">
              <span>
                {t.amount > 0 ? 'von' : 'an'} <b>{names.get(t.counterpartyId!) ?? 'gelöscht'}</b>
                {t.note && <span className="text-muted"> – „{t.note}“</span>}
                <span className="text-xs text-muted"> · {timeAgo(t.createdAt)}</span>
              </span>
              <span className={`font-mono ${t.amount > 0 ? 'text-emerald-300' : 'text-red-300'}`}>{t.amount > 0 ? '+' : ''}{coins(t.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
