import { notFound } from 'next/navigation';

import { sendFriendRequest } from '@/app/actions/social';
import { ActionForm, Avatar, Coins, RankTag, RoleBadge, SubmitButton } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { coins, GAME_NAMES, timeAgo } from '@/lib/format';
import { db, hub } from '@/lib/hub';
import { displayRank, levelOf } from '@/lib/ranks';

export default async function ProfilePage({ params }: PageProps<'/profile/[username]'>) {
  const me = await requireUser();
  const user = await db.user.findUnique({ where: { username: decodeURIComponent((await params).username) } });
  if (!user) notFound();
  const isMe = user.id === me.id;

  if (!user.publicProfile && !isMe) {
    return <div className="card mx-auto max-w-xl text-center text-muted">{user.username} hat ein privates Profil.</div>;
  }

  const [favorite, history, friends, ownerFriend] = await Promise.all([
    db.ledgerEntry.groupBy({ by: ['game'], where: { userId: user.id, kind: 'BET' }, _count: true, orderBy: { _count: { game: 'desc' } }, take: 1 }),
    user.showHistory || isMe
      ? db.ledgerEntry.findMany({ where: { userId: user.id, kind: { in: ['BET', 'WIN'] } }, orderBy: { createdAt: 'desc' }, take: 15 })
      : [],
    db.friendship.count({ where: { accepted: true, OR: [{ fromId: user.id }, { toId: user.id }] } }),
    db.friendship.count({ where: { accepted: true, OR: [{ fromId: user.id, to: { role: 'OWNER' } }, { toId: user.id, from: { role: 'OWNER' } }] } }),
  ]);
  const rank = displayRank(user.rankTag, user.xp, Number(user.balance), ownerFriend > 0);
  const online = hub.online.get(user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="card overflow-hidden p-0">
        <div className="h-36 bg-gradient-to-r from-accent/30 to-accent-2/30 bg-cover bg-center" style={user.bannerUrl ? { backgroundImage: `url(${JSON.stringify(user.bannerUrl)})` } : undefined} />
        <div className="flex flex-wrap items-end gap-4 p-5">
          <div className="-mt-14 rounded-full border-4 border-panel">
            <Avatar url={user.avatarUrl} name={user.username} size={88} />
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black">{user.clanTag && <span className="text-muted">[{user.clanTag}] </span>}{user.username}</h1>
              <RoleBadge role={user.role} />
              <RankTag rank={rank} />
            </div>
            <p className="text-sm text-muted">
              Level {levelOf(user.xp)} · {friends} Freunde · dabei seit {user.createdAt.toLocaleDateString('de-DE')} ·{' '}
              {online ? <span className="text-emerald-300">online – {online.activity}</span> : 'offline'}
            </p>
          </div>
          {!isMe && (
            <ActionForm action={sendFriendRequest}>
              <input type="hidden" name="username" value={user.username} />
              <SubmitButton>Als Freund hinzufügen</SubmitButton>
            </ActionForm>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card"><p className="label">Lieblingsspiel</p><p className="font-bold">{GAME_NAMES[favorite[0]?.game ?? ''] ?? '–'}</p></div>
        <div className="card"><p className="label">Guthaben</p>{user.showBalance || isMe ? <Coins value={Number(user.balance)} /> : <p className="text-muted">privat</p>}</div>
        <div className="card"><p className="label">XP</p><p className="font-mono font-bold">{coins(user.xp)}</p></div>
      </div>

      {user.bio && <div className="card whitespace-pre-wrap text-sm">{user.bio}</div>}

      {history.length > 0 && (
        <div className="card">
          <p className="label">Letzte Spiele</p>
          {history.map((h) => (
            <div key={h.id} className="flex justify-between py-0.5 text-sm">
              <span>{GAME_NAMES[h.game ?? ''] ?? h.game} <span className="text-xs text-muted">· {timeAgo(h.createdAt)}</span></span>
              <span className={`font-mono ${h.amount > 0 ? 'text-emerald-300' : 'text-red-300'}`}>{h.amount > 0 ? '+' : ''}{coins(h.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
